import type Stripe from 'stripe'
import { CorporateProvider } from '@/lib/stripe/corporate-provider'
import { assertMetadata, assertRecipient, ensure, hash, metadata, periodSeconds, providerUrl, recipientAddress, ref, withinWindow, type BillingIntent, type Operation, type Row, type Rpc } from '@/lib/stripe/corporate-contracts'

class Admission extends Error { constructor(readonly result: Row) { super(String(result.status)) } }
/** One claim at a time. Every write uses the same immutable operation and fresh SQL admission. */
export class CorporateWorker {
  constructor(readonly provider: CorporateProvider, readonly rpc: Rpc, readonly reconcile?: (kind: 'invoice' | 'payment' | 'charge', reference: string, event: string) => Promise<Row>) {}
  async run(operationId?: string): Promise<Row> {
    const claimed = await this.rpc('claim_corporate_billing_operations', { p_limit: 1, p_operation_id: operationId ?? null })
    ensure(claimed.status === 'ok' && Array.isArray(claimed.operations) && claimed.operations.length <= 1, 'claim_failed')
    if (!claimed.operations.length) return { status: 'idle' }
    const op = claimed.operations[0] as Operation
    ensure(!operationId || op.operation_id === operationId, 'claim_mismatch')
    this.provider.deadline = Math.min(Date.parse(op.lease_expires_at) - 5000, this.provider.now() + 45000)
    let requestHash: string | null = null, intent = op.intent
    const args = { p_operation_id: op.operation_id, p_lease_token: op.lease_token }
    const authorize = async () => {
      ensure(this.provider.deadline - this.provider.now() > 10000, 'lease_expired')
      const a = await this.rpc('authorize_corporate_billing_step', { ...args, p_expected_version: op.expected_version, p_step: op.kind })
      if (a.status !== 'authorized') throw new Admission(a)
      ensure(typeof a.request_hash === 'string' && /^[a-f0-9]{64}$/.test(a.request_hash) && (!requestHash || requestHash === a.request_hash), 'request_changed')
      requestHash = a.request_hash; intent = a.intent as BillingIntent
      ensure(intent.operation_id === op.operation_id && intent.contract_id === op.contract_id && intent.period_id === op.period_id, 'intent_mismatch')
      return intent
    }
    const record = (result: Row) => this.rpc('record_corporate_provider_result', { ...args, p_request_hash: requestHash, p_result: result })
    const options = (step: string): Stripe.RequestOptions => ({ ...this.provider.options(), idempotencyKey: `corporate-${op.operation_id}-${requestHash}-${step}` })
    const write = async <T,>(step: string, call: (options: Stripe.RequestOptions) => Promise<T>): Promise<T> => {
      await authorize()
      if (['create_invoice', 'finalize_invoice', 'collect_invoice', 'enable_invoice_recovery'].includes(op.kind)) {
        const current = await this.provider.customer(intent)
        ensure(intent.billing_contact && current.email === intent.billing_contact.email, 'billing_contact_mismatch')
        if (intent.invoice_ref) {
          const invoice = await this.provider.stripe.invoices.retrieve(intent.invoice_ref, {}, this.provider.options())
          ensure(invoice.customer_email === intent.billing_contact.email && ref(invoice.customer) === current.id && invoice.livemode === false)
          assertMetadata(invoice.metadata, intent)
        }
        // Reads can wait. Fence the same immutable request again after that wait.
        await authorize()
      }
      return call(options(step))
    }
    const bound = (objectKind: 'customer' | 'setup_session' | 'invoice', objectRef: string, value: unknown, extra: Row = {}) => ({ type: 'provider_bound', environment: 'test', provider_account_ref: intent.provider_account_ref, customer_ref: intent.customer_ref, object_kind: objectKind, object_ref: objectRef, response_hash: hash(value), ...extra })
    const contact = () => { ensure(intent.billing_contact && intent.billing_contact.email && /^[a-f0-9]{64}$/.test(intent.billing_contact.contact_hash), 'billing_contact_invalid'); return intent.billing_contact }
    try {
      await authorize()
      if (!['sync_payment', 'pause_invoice_recovery', 'cancel_invoice'].includes(op.kind) && !withinWindow(op.first_attempt_at, this.provider.now())) return await record({ type: 'requires_review', error_code: 'provider_idempotency_expired' })
      await this.provider.account(intent)
      const s = this.provider.stripe
      // Protective authority intentionally bypasses current contact, recipient/tax and money validation.
      if (op.kind === 'pause_invoice_recovery') {
        ensure(intent.invoice_ref && intent.recovery_blocked)
        const i = await s.invoices.retrieve(intent.invoice_ref, {}, this.provider.options())
        ensure(i.livemode === false && ref(i.customer) === intent.customer_ref); assertMetadata(i.metadata, intent)
        await write('pause', options => s.invoices.update(i.id, { auto_advance: false }, options))
        const current = await s.invoices.retrieve(i.id, {}, this.provider.options())
        ensure(current.id === i.id && current.livemode === false && ref(current.customer) === intent.customer_ref && current.auto_advance === false); assertMetadata(current.metadata, intent)
        return await record({ type: 'recovery_paused', environment: 'test', provider_account_ref: intent.provider_account_ref, customer_ref: intent.customer_ref, object_kind: 'invoice', object_ref: i.id, auto_advance: false, observed_at: new Date(this.provider.now()).toISOString(), response_hash: hash(current) })
      }
      if (op.kind === 'setup_customer') {
        const c = await write('customer', options => s.customers.create({ name: intent.recipient_snapshot.legal_name, address: recipientAddress(intent.recipient_snapshot), email: contact().email, metadata: metadata(intent, false) }, options))
        intent = { ...intent, customer_ref: c.id }
        const current = await this.provider.customer(intent); ensure(current.email === contact().email)
        return await record(bound('customer', current.id, current, { billing_contact: contact(), customer_email: current.email }))
      }
      if (['setup_session', 'verify_setup'].includes(op.kind)) {
        let c = await this.provider.customerBinding(intent)
        let recipientChanged = false
        try { assertRecipient(c.name, c.address, intent) } catch { recipientChanged = true }
        if (recipientChanged) {
          // Stripe drafts follow Customer identity. Never implicitly rewrite a stale draft.
          // A complete empty lookup is required; finalized historical invoices remain frozen.
          const drafts = await this.provider.pages(cursor => s.invoices.list({ customer: c.id, status: 'draft', limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, this.provider.options()), 100)
          ensure(drafts.length === 0, 'recipient_revision_has_draft')
          await write('recipient', options => s.customers.update(c.id, { name: intent.recipient_snapshot.legal_name, address: recipientAddress(intent.recipient_snapshot), email: contact().email }, options))
          c = await this.provider.customer(intent); ensure(c.email === contact().email)
        } else if (c.email !== contact().email) {
          await write('contact', options => s.customers.update(c.id, { email: contact().email }, options))
          c = await this.provider.customer(intent); ensure(c.email === contact().email)
        }
        if (op.kind === 'setup_session') {
          const destination = new URL('/account/company', intent.return_origin)
          destination.searchParams.set('companyId', intent.company_id); destination.searchParams.set('contractId', intent.contract_id); destination.searchParams.set('requestId', op.setup_request_id!)
          destination.searchParams.set('billing', 'return'); const successUrl = destination.href; destination.searchParams.set('billing', 'cancel')
          const session = await write('checkout', options => s.checkout.sessions.create({ mode: 'setup', currency: 'eur', customer: c.id, success_url: successUrl, cancel_url: destination.href, metadata: metadata(intent, false), setup_intent_data: { metadata: metadata(intent, false), description: 'Benefitsi employer annual access: authorized future annual collection' }, custom_text: { submit: { message: 'Zahlungsmittel für die vereinbarten jährlichen Firmenzahlungen speichern. / Save payment method for the agreed annual employer payments.' } }, integration_identifier: `benefitsi_corporate_${op.operation_id.replace(/[^a-f]/g, '').padEnd(8, 'a').slice(0, 8)}` }, options))
          ensure(session.livemode === false && session.mode === 'setup' && session.status === 'open' && ref(session.customer) === c.id && session.expires_at * 1000 > this.provider.now()); assertMetadata(session.metadata, intent, false)
          c = await this.provider.customer(intent); ensure(c.email === contact().email)
          return await record(bound('setup_session', session.id, session, { checkout_url: providerUrl(session.url, 'checkout'), checkout_expires_at: new Date(session.expires_at * 1000).toISOString(), billing_contact: contact(), customer_email: c.email }))
        }
        const session = await this.provider.setupSession(intent)
        if (session.status !== 'complete') return await record({ type: 'retryable_failure', error_code: 'setup_pending', retry_after_seconds: 300 })
        const setupId = ref(session.setup_intent); ensure(setupId)
        const setup = await s.setupIntents.retrieve(setupId, {}, this.provider.options())
        ensure(setup.livemode === false && ref(setup.customer) === c.id && setup.status === 'succeeded' && setup.usage === 'off_session'); assertMetadata(setup.metadata, intent, false)
        const methodId = ref(setup.payment_method); ensure(methodId)
        const method = await s.paymentMethods.retrieve(methodId, {}, this.provider.options()); ensure(method.livemode === false && ref(method.customer) === c.id)
        await write('default-method', options => s.customers.update(c.id, { email: contact().email, invoice_settings: { default_payment_method: method.id } }, options))
        c = await this.provider.customer(intent); ensure(ref(c.invoice_settings.default_payment_method) === method.id && c.email === contact().email)
        await authorize()
        return await record({ type: 'setup_verified', environment: 'test', provider_account_ref: intent.provider_account_ref, customer_ref: c.id, setup_session_ref: session.id, session_status: 'complete', setup_intent_ref: setup.id, payment_method_ref: method.id, payment_method_customer_ref: ref(method.customer), default_payment_method_ref: ref(c.invoice_settings.default_payment_method), status: setup.status, usage: setup.usage, recipient_id: intent.recipient_id, recipient_hash: intent.recipient_hash, recipient_snapshot: intent.recipient_snapshot, billing_contact: contact(), customer_email: c.email, response_hash: hash({ session, setup, method, customer: c }) })
      }
      if (op.kind === 'sync_payment') {
        ensure(intent.invoice_ref && this.reconcile, 'reconciliation_not_configured')
        return await this.reconcile('invoice', intent.invoice_ref, `op_${op.operation_id}`)
      }
      if (op.kind === 'cancel_invoice') {
        ensure(intent.invoice_ref)
        const { invoice } = await this.provider.invoice(intent)
        if (invoice.status === 'draft') await write('delete', options => s.invoices.del(invoice.id, options))
        else if (invoice.status === 'open' || invoice.status === 'uncollectible') await write('void', options => s.invoices.voidInvoice(invoice.id, {}, options))
        else ensure(invoice.status === 'void', 'paid_invoice_requires_review')
        return await record({ type: 'cancelled', reason: 'provider_invoice_cancelled' })
      }
      ensure(intent.billing_profile.invoice_format === 'pdf_original', 'structured_invoice_adapter_not_configured')
      const c = await this.provider.customer(intent); ensure(c.email === contact().email && c.balance === 0 && ref(c.invoice_settings.default_payment_method) === intent.payment_method_ref, 'billing_customer_drift')
      await this.provider.tax(intent)
      if (op.kind === 'create_invoice') {
        let invoiceId = intent.invoice_ref
        if (!invoiceId) {
          const draft = await write('draft', options => s.invoices.create({ customer: c.id, currency: 'eur', collection_method: 'charge_automatically', auto_advance: false, pending_invoice_items_behavior: 'exclude', automatic_tax: { enabled: false }, metadata: metadata(intent) }, options)); invoiceId = draft.id
        }
        const boundIntent = { ...intent, invoice_ref: invoiceId }
        const { invoice, lines } = await this.provider.invoice(boundIntent, true)
        ensure(invoice.status === 'draft' && !invoice.auto_advance)
        if (!lines.length) await write('line', options => s.invoiceItems.create({ customer: c.id, invoice: invoice.id, currency: 'eur', quantity: intent.quantity, unit_amount_decimal: s.Decimal.from(intent.unit_net_cents), period: periodSeconds(intent), discountable: false, description: `Benefitsi Firmenzugang ${intent.starts_on} – ${intent.ends_on}`, metadata: metadata(intent), ...(intent.billing_profile.tax_mode === 'explicit_rate' ? { tax_rates: [intent.tax_profile_ref] } : { tax_rates: [] }) }, options))
        const checked = await this.provider.invoice(boundIntent)
        return await record(bound('invoice', invoice.id, checked))
      }
      const { invoice } = await this.provider.invoice(intent)
      if (op.kind === 'finalize_invoice') {
        ensure(invoice.status === 'draft' || invoice.status === 'open')
        const finalized = invoice.status === 'draft' ? await write('finalize', options => s.invoices.finalizeInvoice(invoice.id, { auto_advance: false }, options)) : invoice
        ensure(finalized.status === 'open' && !finalized.auto_advance)
        return await record(bound('invoice', finalized.id, finalized))
      }
      if (op.kind === 'collect_invoice') {
        let evidence = await this.provider.evidence(intent, [], `collect_${op.operation_id}`)
        if (invoice.status !== 'paid' && evidence.collection_state !== 'processing' && !invoice.attempted) {
          try { await write('initial-pay', options => s.invoices.pay(invoice.id, { off_session: true }, options)) }
          catch (error) { if (!(error && typeof error === 'object' && 'type' in error && error.type === 'StripeCardError')) throw error }
          evidence = await this.provider.evidence(intent, [], `collect_${op.operation_id}`)
        }
        ensure(evidence.collection_state !== 'not_attempted', 'collection_unknown')
        return await record({ type: 'collection_observed', environment: 'test', provider_account_ref: intent.provider_account_ref, customer_ref: c.id, object_kind: 'invoice', object_ref: invoice.id, response_hash: hash(evidence), collection_state: evidence.collection_state })
      }
      ensure(op.kind === 'enable_invoice_recovery' && !intent.recovery_blocked && intent.billing_profile.recovery_enabled === true, 'recovery_not_authorized')
      if (invoice.auto_advance) return await record(bound('invoice', invoice.id, invoice))
      const evidence = await this.provider.evidence(intent, [], `recovery_${op.operation_id}`)
      ensure(invoice.status === 'open' && ['failed', 'requires_action'].includes(evidence.collection_state), 'recovery_not_actionable')
      const enabled = invoice.auto_advance ? invoice : await write('recovery', options => s.invoices.update(invoice.id, { auto_advance: true }, options))
      ensure(enabled.auto_advance === true)
      return await record(bound('invoice', enabled.id, enabled))
    } catch (error) {
      if (error instanceof Admission) return error.result
      if (!requestHash || this.provider.deadline <= this.provider.now()) return { status: 'conflict' }
      const retry = error && typeof error === 'object' && 'type' in error && ['StripeConnectionError', 'StripeAPIError', 'StripeRateLimitError'].includes(String(error.type))
      return await record(retry ? { type: 'retryable_failure', error_code: 'provider_transport_unknown', retry_after_seconds: 300 } : { type: 'requires_review', error_code: 'provider_validation_failed' })
    } finally { this.provider.deadline = Infinity }
  }
}
