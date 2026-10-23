import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { CorporateProvider } from '../lib/stripe/corporate-provider.ts'
import { id, intent, invoice, line, payment, pi, charge, transport, moduleAt, now } from './helpers/corporate-recurring-fixtures.mjs'
async function lifecycle(context, clock, creditOnly = false) {
  const i = context.intent, recipient = i.recipient_snapshot, period = moduleAt('lib/stripe/corporate-contracts.ts').periodSeconds(i)
  const metadata = { benefitsi_scope: 'corporate_annual', company_id: i.company_id, contract_id: i.contract_id, period_id: i.period_id, recipient_hash: i.recipient_hash, terms_hash: i.terms_hash }
  const exactInvoice = { ...invoice, id: i.invoice_ref, customer: i.customer_ref, account_name: i.billing_profile.operator_name, metadata, customer_name: recipient.legal_name, customer_address: { line1: recipient.address_line1, line2: recipient.address_line2, postal_code: recipient.postal_code, city: recipient.city, country: recipient.country, state: null }, customer_email: i.billing_contact.email, total: i.net_total_cents, subtotal: i.net_total_cents, total_excluding_tax: i.net_total_cents, subtotal_excluding_tax: i.net_total_cents, amount_due: i.net_total_cents, amount_paid: i.net_total_cents }
  let negative = false, millis = clock
  const t = transport({
    ['/v1/invoices/' + i.invoice_ref]: () => ({ ...exactInvoice, post_payment_credit_notes_amount: negative ? 100 : 0 }),
    ['/v1/invoices/' + i.invoice_ref + '/lines']: { object: 'list', has_more: false, data: [{ ...line, invoice: i.invoice_ref, metadata, quantity: i.quantity, quantity_decimal: String(i.quantity), pricing: { unit_amount_decimal: String(i.unit_net_cents) }, amount: i.net_total_cents, subtotal: i.net_total_cents, period }] },
    '/v1/invoice_payments': { object: 'list', has_more: false, data: [{ ...payment, invoice: i.invoice_ref, amount_paid: i.net_total_cents, amount_requested: i.net_total_cents, status_transitions: { paid_at: Math.floor(clock / 1000) - 5 } }] },
    '/v1/payment_intents/pi_synthetic': { ...pi, customer: i.customer_ref, amount: i.net_total_cents, amount_received: i.net_total_cents },
    '/v1/charges/ch_synthetic': () => ({ ...charge, customer: i.customer_ref, amount: i.net_total_cents, amount_captured: i.net_total_cents, amount_refunded: negative && !creditOnly ? 100 : 0 }),
    '/v1/refunds': () => ({ object: 'list', has_more: false, data: negative && !creditOnly ? [{ id: 're_synthetic', charge: charge.id, payment_intent: pi.id, status: 'succeeded', amount: 100, currency: 'eur' }] : [] }),
  })
  const p = new CorporateProvider(t.stripe, { account: i.provider_account_ref, origin: i.return_origin, now: () => millis })
  const output = [], reconciler = new (moduleAt('lib/stripe/corporate-reconciliation.ts').CorporateReconciler)(p, async (name, args) => {
    if (name === 'get_corporate_reconciliation_context') return args.p_reference === i.invoice_ref ? context : { status: 'unavailable' }
    assert.equal(name, 'apply_corporate_invoice_evidence'); output.push(args); return { status: 'accepted_for_native_consumption' }
  }, null)
  await reconciler.reconcile('invoice', i.invoice_ref, 'evt_clean_paid')
  negative = true; millis += 10
  await reconciler.reconcile('invoice', i.invoice_ref, creditOnly ? 'evt_credit_only' : 'evt_credit_refund')
  millis += 10
  // A stale event supplies only a reference; all financial facts are freshly retrieved.
  await reconciler.webhook({ id: 'evt_old_paid', type: 'invoice.paid', livemode: false, data: { object: { id: i.invoice_ref, object: 'invoice', post_payment_credit_notes_amount: 0 } } })
  assert.equal(output.length, 3)
  assert.equal(output[0].p_evidence.post_payment_credit_cents, 0)
  for (const args of output.slice(1)) { assert.equal(args.p_evidence.post_payment_credit_cents, 100); assert.equal(args.p_evidence.payments[0].refunded_cents, creditOnly ? 0 : 100) }
  await assert.rejects(p.invoice(i), /provider_evidence_mismatch/)
  assert.equal((await reconciler.reconcile('invoice', 'in_unbound', 'evt_unknown')).status, 'unavailable'); assert.equal(output.length, 3)
  return output
}
test('real SDK/reconciler paid → credit-note refund or credit-only → stale paid event emits current negative facts', async () => {
  const input = process.env.CORPORATE_RECONCILIATION_CONTEXT ? JSON.parse(readFileSync(process.env.CORPORATE_RECONCILIATION_CONTEXT)) : { context: { status: 'ok', company_id: id, operation_id: intent.operation_id, period_id: intent.period_id, operation_kind: 'sync_payment', intent, documents: [{ invoice_ref: intent.invoice_ref, format: 'pdf_original' }], document_refs: [id] }, now: new Date(now).toISOString() }
  const output = { synthetic_only: true, source_context: input, refund: await lifecycle(input.context, Date.parse(input.now), false), credit_only: await lifecycle(input.context, Date.parse(input.now), true) }
  if (process.env.CORPORATE_CREDIT_EXPORT) writeFileSync(process.env.CORPORATE_CREDIT_EXPORT, JSON.stringify(output, null, 2) + '\n')
})
test('negative reconciliation keeps foreign invoices, charges and private subscription rejection', async () => {
  for (const change of [{ customer: 'cus_foreign' }, { parent: { subscription_details: { subscription: 'sub_private' } } }, { post_payment_credit_notes_amount: -1 }, { post_payment_credit_notes_amount: 100.5 }]) {
    const t = transport({ '/v1/invoices/in_synthetic': { ...invoice, post_payment_credit_notes_amount: 100, ...change } })
    await assert.rejects(new CorporateProvider(t.stripe, { account: 'acct_synthetic', origin: intent.return_origin, now: () => now }).evidence(intent, [id], 'evt_bad'))
  }
  const t = transport({ '/v1/invoices/in_synthetic': { ...invoice, post_payment_credit_notes_amount: 100 }, '/v1/charges/ch_synthetic': { ...charge, customer: 'cus_foreign' } })
  await assert.rejects(new CorporateProvider(t.stripe, { account: 'acct_synthetic', origin: intent.return_origin, now: () => now }).evidence(intent, [id], 'evt_bad_charge'))
})
