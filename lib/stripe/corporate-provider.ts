import type Stripe from 'stripe'
import { assertMetadata, assertProfile, assertRecipient, ensure, hash, metadata, periodSeconds, providerUrl, ref, type BillingIntent, type CollectionState } from '@/lib/stripe/corporate-contracts'

/** Dedicated Corporate namespace, actual installed Stripe 22.3.2 objects. */
export class CorporateProvider {
  constructor(readonly stripe: Stripe, readonly config: { account: string; origin: string; now?: () => number }) {}
  now() { return this.config.now?.() ?? Date.now() }
  options(): Stripe.RequestOptions { return { timeout: 8000, maxNetworkRetries: 0 } }
  async account(intent?: BillingIntent) {
    if (intent) assertProfile(intent, this.config.account, this.config.origin)
    const account = await this.stripe.accounts.retrieve(this.options())
    const balance = await this.stripe.balance.retrieve(this.options())
    ensure(account.id === this.config.account && balance.livemode === false, 'provider_account_mismatch')
  }
  async customer(intent: BillingIntent) {
    ensure(intent.customer_ref)
    const c = await this.stripe.customers.retrieve(intent.customer_ref, this.options())
    ensure(!c.deleted && c.livemode === false && c.id === intent.customer_ref)
    assertMetadata(c.metadata, intent, false); assertRecipient(c.name, c.address, intent)
    return c
  }
  async tax(intent: BillingIntent) {
    if (intent.billing_profile.tax_mode === 'explicit_exempt') return
    const rate = await this.stripe.taxRates.retrieve(intent.tax_profile_ref, this.options())
    ensure(rate.livemode === false && rate.active && !rate.inclusive && rate.country === 'DE' && Math.round(rate.percentage * 100) === intent.billing_profile.tax_basis_points, 'tax_profile_mismatch')
  }
  async pages<T extends { id: string }>(get: (cursor?: string) => Promise<Stripe.ApiList<T>>, max: number) {
    const result: T[] = [], seen = new Set<string>(); let cursor: string | undefined
    for (let page = 0; page < 4; page++) {
      const current = await get(cursor)
      ensure(current.object === 'list' && Array.isArray(current.data) && typeof current.has_more === 'boolean')
      for (const item of current.data) { ensure(item.id && !seen.has(item.id)); seen.add(item.id); result.push(item); ensure(result.length <= max, 'provider_pagination_limit') }
      if (!current.has_more) return result
      ensure(current.data.length > 0, 'provider_pagination_incomplete'); cursor = current.data.at(-1)!.id
    }
    throw Error('provider_pagination_limit')
  }
  lines(invoiceId: string) { return this.pages(cursor => this.stripe.invoices.listLineItems(invoiceId, { limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, this.options()), 100) }
  async invoice(intent: BillingIntent, allowEmpty = false) {
    ensure(intent.invoice_ref)
    const i = await this.stripe.invoices.retrieve(intent.invoice_ref, this.options())
    ensure(i.id === intent.invoice_ref && i.livemode === false && ref(i.customer) === intent.customer_ref && !i.parent?.subscription_details && !i.on_behalf_of && i.issuer.type === 'self' && i.account_name === intent.billing_profile.operator_name)
    assertMetadata(i.metadata, intent); assertRecipient(i.customer_name, i.customer_address, intent)
    ensure(i.currency === 'eur' && i.collection_method === 'charge_automatically' && !i.default_payment_method && !i.default_source && !i.automatic_tax.enabled)
    ensure(!('paid_out_of_band' in i && i.paid_out_of_band) && i.starting_balance === 0 && (i.ending_balance === 0 || i.ending_balance === null) && i.pre_payment_credit_notes_amount === 0 && i.post_payment_credit_notes_amount === 0 && !i.discounts.length && !(i.total_discount_amounts?.length) && !(i.total_pretax_credit_amounts?.length))
    const lines = await this.lines(i.id)
    if (allowEmpty && !lines.length && i.status === 'draft') return { invoice: i, lines }
    ensure(lines.length === 1)
    const l = lines[0], period = periodSeconds(intent), tax = Math.round(intent.net_total_cents * intent.billing_profile.tax_basis_points / 10000), gross = intent.net_total_cents + tax
    ensure(Number.isSafeInteger(intent.quantity) && intent.quantity > 0 && Number.isSafeInteger(intent.unit_net_cents) && intent.unit_net_cents > 0 && intent.net_total_cents === intent.quantity * intent.unit_net_cents)
    assertMetadata(l.metadata, intent)
    ensure(l.invoice === i.id && l.livemode === false && l.currency === 'eur' && l.quantity === intent.quantity && (l.quantity_decimal == null || Number(l.quantity_decimal) === intent.quantity) && Number(l.pricing?.unit_amount_decimal) === intent.unit_net_cents && l.amount === intent.net_total_cents && l.subtotal === intent.net_total_cents && l.period.start === period.start && l.period.end === period.end)
    ensure(l.parent?.type === 'invoice_item_details' && l.parent.invoice_item_details?.proration === false && !l.subscription && !l.discounts.length && !(l.discount_amounts?.length) && !(l.pretax_credit_amounts?.length))
    const taxes = i.total_taxes || [], lineTaxes = l.taxes || []
    ensure(taxes.reduce((sum, t) => sum + t.amount, 0) === tax && lineTaxes.reduce((sum, t) => sum + t.amount, 0) === tax)
    for (const t of [...taxes, ...lineTaxes]) ensure(t.tax_behavior === 'exclusive' && t.tax_rate_details?.tax_rate === intent.tax_profile_ref && t.taxable_amount === intent.net_total_cents)
    ensure((tax === 0 && taxes.length === 0 && lineTaxes.length === 0) || (tax > 0 && taxes.length === 1 && lineTaxes.length === 1))
    ensure(i.total === gross && i.subtotal === intent.net_total_cents && i.total_excluding_tax === intent.net_total_cents && i.amount_due === gross && Number.isSafeInteger(i.amount_paid) && i.amount_paid >= 0 && i.amount_paid <= gross && i.amount_remaining === gross - i.amount_paid)
    return { invoice: i, lines }
  }
  async evidence(intent: BillingIntent, documentRefs: string[], eventRef: string) {
    await this.account(intent); await this.tax(intent)
    const { invoice: i, lines } = await this.invoice(intent)
    const entries = await this.pages(cursor => this.stripe.invoicePayments.list({ invoice: i.id, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, this.options()), 20)
    const payments: { payment_ref: string; charge_ref: string; amount_cents: number; currency: 'EUR'; succeeded: boolean; refunded_cents: number; disputed: boolean }[] = []
    const observations: unknown[] = [], chargeIds = new Set<string>(); let collection: CollectionState = i.attempted ? 'failed' : 'not_attempted'; let paidAt = 0
    for (const entry of entries) {
      ensure(entry.livemode === false && ref(entry.invoice) === i.id && entry.currency === 'eur' && ['open', 'paid', 'canceled'].includes(entry.status) && entry.payment.type !== 'payment_record')
      let chargeId = ref(entry.payment.charge), succeeded = entry.status === 'paid'
      if (entry.payment.type === 'payment_intent') {
        const piId = ref(entry.payment.payment_intent); ensure(piId)
        const pi = await this.stripe.paymentIntents.retrieve(piId, this.options()); observations.push(pi)
        ensure(pi.livemode === false && ref(pi.customer) === intent.customer_ref && pi.currency === 'eur' && pi.amount === entry.amount_requested)
        if (pi.status === 'processing') collection = 'processing'
        else if (pi.status === 'requires_action' && collection !== 'processing') collection = 'requires_action'
        else if (pi.status === 'requires_payment_method' && collection === 'not_attempted') collection = 'failed'
        succeeded = succeeded && pi.status === 'succeeded'
        if (entry.status === 'paid') ensure(succeeded && pi.amount_received === entry.amount_paid)
        chargeId = ref(pi.latest_charge)
      }
      if (!chargeId) { ensure(entry.status !== 'paid'); continue }
      ensure(!chargeIds.has(chargeId)); chargeIds.add(chargeId)
      const charge = await this.stripe.charges.retrieve(chargeId, this.options())
      ensure(charge.id === chargeId && charge.livemode === false && ref(charge.customer) === intent.customer_ref && charge.currency === 'eur' && charge.amount === entry.amount_requested)
      if (entry.payment.type === 'payment_intent') ensure(ref(charge.payment_intent) === ref(entry.payment.payment_intent))
      if (!succeeded) { ensure(entry.status !== 'paid'); observations.push(charge); continue }
      ensure(charge.paid && charge.captured && charge.status === 'succeeded' && charge.amount_captured === entry.amount_paid && Number.isSafeInteger(entry.amount_paid) && Number(entry.amount_paid) > 0)
      const refunds = await this.pages(cursor => this.stripe.refunds.list({ charge: chargeId!, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, this.options()), 100)
      const disputes = await this.pages(cursor => this.stripe.disputes.list({ charge: chargeId!, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, this.options()), 100)
      let refunded = 0, pendingRefund = false
      for (const r of refunds) { ensure(ref(r.charge) === chargeId && r.currency === 'eur' && Number.isSafeInteger(r.amount) && r.amount > 0); if (r.status === 'succeeded') refunded += r.amount; else if (!['failed', 'canceled'].includes(r.status || '')) pendingRefund = true }
      ensure(refunded === charge.amount_refunded && refunded <= Number(entry.amount_paid))
      for (const d of disputes) ensure(d.livemode === false && ref(d.charge) === chargeId && d.currency === 'eur')
      payments.push({ payment_ref: entry.id, charge_ref: chargeId, amount_cents: Number(entry.amount_paid), currency: 'EUR', succeeded: true, refunded_cents: refunded, disputed: charge.disputed || pendingRefund || disputes.some(d => !['won', 'warning_closed'].includes(d.status)) })
      const ts = entry.status_transitions.paid_at; ensure(ts && ts <= this.now() / 1000); paidAt = Math.max(paidAt, ts)
      observations.push(charge, refunds, disputes)
    }
    const paid = payments.reduce((sum, p) => sum + p.amount_cents, 0)
    ensure(paid === i.amount_paid)
    if (i.status === 'paid') { ensure(paid === i.total && paid > 0 && i.amount_remaining === 0 && paidAt > 0); collection = 'succeeded' }
    const snapshotHash = hash({ invoice: i, lines, entries, observations })
    ensure(eventRef.length <= 120 && i.status)
    return { schema_version: 1, environment: 'test', provider_account_ref: intent.provider_account_ref, customer_ref: intent.customer_ref, invoice_ref: i.id, invoice_number: i.number || i.id, period_id: intent.period_id, operation_id: intent.operation_id, event_ref: `${eventRef}:${snapshotHash}`, event_hash: snapshotHash, observed_at: new Date(this.now()).toISOString(), invoice_status: i.status, currency: 'EUR', quantity: intent.quantity, unit_net_cents: intent.unit_net_cents, net_total_cents: intent.net_total_cents, tax_total_cents: i.total - intent.net_total_cents, gross_total_cents: i.total, amount_remaining_cents: i.amount_remaining, service_starts_on: intent.starts_on, service_ends_on: intent.ends_on, paid_out_of_band: false, paid_at: i.status === 'paid' ? new Date(paidAt * 1000).toISOString() : null, collection_state: collection, payments, document_refs: documentRefs, invoice_hash: hash({ invoice: i, lines }), recipient_id: intent.recipient_id, recipient_hash: intent.recipient_hash, recipient_snapshot: intent.recipient_snapshot }
  }
  async setupSession(intent: BillingIntent) {
    ensure(intent.setup_session_ref)
    const s = await this.stripe.checkout.sessions.retrieve(intent.setup_session_ref, this.options())
    ensure(s.id === intent.setup_session_ref && s.livemode === false && s.mode === 'setup' && ref(s.customer) === intent.customer_ref)
    assertMetadata(s.metadata, intent, false)
    if (s.url) providerUrl(s.url, 'checkout')
    return s
  }
  metadata = metadata
}
