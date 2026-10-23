import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { webcrypto } from 'node:crypto'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createClient } from '@supabase/supabase-js'
import { loadTypescript } from './helpers/load-typescript.mjs'
const require = createRequire(import.meta.url)
// Synthetic application-boundary data. Native SQL-exported annual fixtures are
// checked separately once provided; this is deliberately not claimed as SQL proof.
const baseline = JSON.parse(readFileSync(new URL('./fixtures/corporate-premium-contract.json', import.meta.url))).active
const id = baseline.company_id, stamp = baseline.updated_at, extensionId = '11111111-1111-4111-8111-111111111111'
const path = `${id}/22222222-2222-4222-8222-222222222222.pdf`
const document = { bucket_id: 'corporate-invoices', storage_path: path, invoice_reference: baseline.invoice_reference }
const company = { ...baseline, capacity_seats: baseline.seats + 2, available_seats: baseline.available_seats + 2, annual_accepted_at: stamp, annual_accepted_by: extensionId, annual_snapshot: { seats: baseline.seats }, invoice_document: document }
const extension = { extension_id: extensionId, company_id: id, requested_by: extensionId, additional_seats: 2, status: 'requested', net_amount_cents: null, currency: 'EUR', starts_on: null, ends_on: company.ends_on, invoice_reference: '', invoice_document: null, payment_reference: '', accepted_at: null, accepted_by: null, accepted_snapshot: null, activated_at: null, created_at: stamp, updated_at: stamp }
function form(changes = {}) { const result = new FormData(); for (const [key, value] of Object.entries({ companyId: id, extensionId, expectedUpdatedAt: stamp, additionalSeats: '2', netAmountCents: '1800', invoiceReference: 'EXT-42', paymentReference: 'BANK-42', paymentConfirmed: 'true', ...changes })) result.set(key, value); return result }
function api(responses = [], identity = { id: 'admin', is_admin: true }) {
 const calls = [], paths = []
 const client = createClient('https://synthetic.supabase.invalid', 'synthetic-publishable', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (url, init) => {
  calls.push({ url: new URL(url), name: new URL(url).pathname.split('/').at(-1), body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body, method: init.method })
  const body = responses.shift(); if (body instanceof Error) throw body; return body instanceof Response ? body : Response.json(body ?? null)
 } } })
 client.auth.getUser = async () => ({ data: { user: identity && { id: identity.id, email: 'actor@example.test', user_metadata: { is_admin: true } } }, error: null })
 client.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: identity, error: null }) }) }) })
 const admin = loadTypescript('lib/admin.ts', { '@/lib/supabase/server': { createClient: async () => client }, 'next/headers': { headers: async () => new Headers({ host: 'admin.benefitsi.de' }) }, 'next/navigation': { redirect: () => { throw new Error('admin denied') } } })
 const actions = () => loadTypescript('app/companies/actions.ts', { '@/lib/admin': admin, 'next/cache': { revalidatePath: p => paths.push(p), refresh: () => {} } }, { FormData, crypto: webcrypto, Uint8Array })
 return { client, calls, paths, actions }
}
test('paid capacity parses separately from the immutable original yearly seats and amount', async () => {
 const transport = api([{ status: 'ok', company, roster: [], roster_total: 0, offset: 0, page_size: 50 }])
 const model = loadTypescript('lib/corporate/companies.ts')
 const result = await model.loadCorporateCompany(transport.client, id, 0)
 assert.equal(result.status, 'ok'); assert.equal(result.company.capacity_seats, baseline.seats + 2); assert.equal(result.company.seats, baseline.seats); assert.equal(result.company.total_amount_cents, baseline.total_amount_cents)
})
test('all annual server actions authenticate current profile before any RPC or storage operation', async () => {
 for (const identity of [null, { id: 'owner', is_admin: false }, { id: 'forged', is_admin: 'true' }]) {
  const transport = api([], identity), actions = transport.actions()
  for (const [name, args] of [['quoteCorporateExtension', [form()]], ['confirmCorporateExtension', [form()]], ['attachCorporateInvoice', [form()]], ['readCorporateInvoice', [id, null]]]) {
   assert.equal(typeof actions[name], 'function', name)
   await assert.rejects(actions[name](...args), /admin denied/)
  }
  assert.equal(transport.calls.length, 0)
 }
})
test('net quote and evidenced confirmation use exact SQL parameters, never editable period or price on payment', async () => {
 const transport = api([{ status: 'quoted', extension_id: extensionId, updated_at: stamp }, { status: 'activated', extension_id: extensionId, updated_at: stamp, replayed: true }]), actions = transport.actions()
 assert.equal((await actions.quoteCorporateExtension(form())).status, 'quoted')
 assert.deepEqual(transport.calls[0].body, { p_extension_id: extensionId, p_expected_updated_at: stamp, p_additional_seats: 2, p_net_amount_cents: 1800, p_invoice_reference: 'EXT-42' })
 assert.equal((await actions.confirmCorporateExtension(form({ netAmountCents: '1', endsOn: '2099-01-01' }))).status, 'activated')
 assert.deepEqual(transport.calls[1].body, { p_extension_id: extensionId, p_expected_updated_at: stamp, p_payment_reference: 'BANK-42' })
 assert.deepEqual(transport.paths, ['/companies', `/companies/${id}`, '/companies', `/companies/${id}`])
})
test('payment consent, bounded integer quotes, duplicate fields, and malformed success fail closed', async () => {
 const transport = api(), actions = transport.actions()
 for (const changes of [{ paymentConfirmed: 'false' }, { paymentReference: '' }, { paymentReference: 'x'.repeat(161) }, { expectedUpdatedAt: 'rounded' }]) assert.equal((await actions.confirmCorporateExtension(form(changes))).status, 'invalid')
 for (const changes of [{ additionalSeats: '0' }, { additionalSeats: '10001' }, { netAmountCents: '1.5' }, { netAmountCents: '2147483648' }, { invoiceReference: '' }]) assert.equal((await actions.quoteCorporateExtension(form(changes))).status, 'invalid')
 const duplicate = form(); duplicate.append('paymentConfirmed', 'true'); assert.equal((await actions.confirmCorporateExtension(duplicate)).status, 'invalid')
 assert.equal(transport.calls.length, 0)
 for (const response of [{ status: 'conflict' }, { status: 'activated', extension_id: extensionId, updated_at: stamp }, { status: 'activated', extension_id: id, updated_at: stamp, replayed: false }, new Error('private detail')]) {
  const other = api([response]); const result = await other.actions().confirmCorporateExtension(form()); assert.ok(['conflict', 'error'].includes(result.status)); assert.equal(other.paths.length, 0); assert.doesNotMatch(result.message, /private detail/)
 }
})
test('billing read validates company binding, immutable period and invoice paths', async () => {
 const model = loadTypescript('lib/corporate/annual.ts')
 const transport = api([{ status: 'ok', agreement: company, extensions: [extension] }])
 assert.equal((await model.loadCorporateBilling(transport.client, id)).status, 'ok')
 for (const change of [{ company_id: extensionId }, { ends_on: '2099-01-01' }, { invoice_document: { ...document, storage_path: `other/${path}` } }, { status: 'activated' }]) {
  const bad = api([{ status: 'ok', agreement: company, extensions: [{ ...extension, ...change }] }]); assert.equal((await model.loadCorporateBilling(bad.client, id)).status, 'error')
 }
})
function billing(actions = {}) { return loadTypescript('components/corporate/CorporateAnnualBilling.tsx', { '@/app/companies/actions': actions, '@/components/corporate/company-ui': loadTypescript('components/corporate/company-ui.tsx') }, { crypto: webcrypto, FormData, Uint8Array }) }
async function withDom(run) {
 const { JSDOM } = await import('jsdom')
 const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://localhost/companies' })
 const values = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLFormElement: dom.window.HTMLFormElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true }
 const previous = Object.fromEntries(Object.keys(values).map(k => [k, globalThis[k]])); Object.assign(globalThis, values)
 const root = require('react-dom/client').createRoot(globalThis.document.getElementById('root'))
 try { await run(root, dom.window) } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close() }
}
function edit(window, name, value) { const element = globalThis.document.querySelector(`[name="${name}"]`); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new window.Event('input', { bubbles: true })) }
test('real annual billing component separates quote, original amount, paid capacity and common year without deferred programmes', () => {
 const { CorporateAnnualBilling: Billing } = billing()
 const html = renderToStaticMarkup(React.createElement(Billing, { billing: { status: 'ok', agreement: company, extensions: [{ ...extension, status: 'quoted', net_amount_cents: 1800, starts_on: company.starts_on, invoice_reference: 'EXT-42' }] }, adminIdentity: 'admin' }))
 assert.match(html, /Zusätzliche Mitarbeiterplätze/); assert.match(html, /Jahreszeitraum/); assert.match(html, /497,50/); assert.match(html, /18,00/); assert.match(html, /Vom Ansprechpartner angenommen/)
 assert.doesNotMatch(html, /Geburtstagsprogramm|Dienstjubiläum|Geschenkbudget/)
})
test('quote conflict retains draft and original version across refresh, identity change clears it', async () => {
 let calls = 0
 const { CorporateAnnualBilling: Billing } = billing({ quoteCorporateExtension: async () => { calls++; return { status: 'conflict', message: 'Bitte neu laden' } } })
 await withDom(async (root, window) => {
  const props = { billing: { status: 'ok', agreement: company, extensions: [extension] }, adminIdentity: 'admin-a' }
  await act(async () => root.render(React.createElement(Billing, props)))
  await act(async () => { edit(window, 'additionalSeats', '3'); edit(window, 'netAmountCents', '2345'); edit(window, 'invoiceReference', 'DRAFT-1') })
  await act(async () => globalThis.document.querySelector('form[aria-label="Erweiterungsangebot"]').requestSubmit())
  await act(async () => root.render(React.createElement(Billing, { ...props, billing: { ...props.billing, extensions: [{ ...extension, updated_at: '2026-10-23T12:00:01.654321Z' }] } })))
  assert.equal(globalThis.document.querySelector('[name="invoiceReference"]').value, 'DRAFT-1'); assert.equal(globalThis.document.querySelector('button[type="submit"]').disabled, true)
  await act(async () => globalThis.document.querySelector('form[aria-label="Erweiterungsangebot"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); assert.equal(calls, 1)
  await act(async () => root.render(React.createElement(Billing, { ...props, adminIdentity: 'admin-b' }))); assert.equal(globalThis.document.querySelector('[name="invoiceReference"]').value, '')
 })
})
test('accepted extension needs actual invoice and explicit evidence consent before the payment action', async () => {
 let calls = 0
 const { CorporateAnnualBilling: Billing } = billing({ confirmCorporateExtension: async () => { calls++; return { status: 'activated', message: 'Zahlung bestätigt' } } })
 await withDom(async (root, window) => {
  const accepted = { ...extension, status: 'accepted', starts_on: company.starts_on, net_amount_cents: 1800, invoice_reference: 'EXT-42', invoice_document: { ...document, invoice_reference: 'EXT-42' }, accepted_at: stamp }
  await act(async () => root.render(React.createElement(Billing, { billing: { status: 'ok', agreement: company, extensions: [accepted] }, adminIdentity: 'admin' })))
  const payment = () => globalThis.document.querySelector('form[aria-label="Erweiterungszahlung"]')
  assert.equal(payment().querySelector('button').disabled, true)
  await act(async () => edit(window, 'paymentReference', 'BANK-42')); assert.equal(payment().querySelector('button').disabled, true)
  await act(async () => globalThis.document.querySelector('[name="paymentConfirmed"]').click())
  await act(async () => payment().requestSubmit()); assert.equal(calls, 1)
 })
})
function invoiceForm(changes = {}) {
 const result = form({ extensionId: '', invoiceReference: company.invoice_reference, documentId: '22222222-2222-4222-8222-222222222222', ...changes })
 result.set('invoice', new Blob(['%PDF-1.7\nSynthetic test bytes only\n%%EOF'], { type: 'application/pdf' }), 'synthetic.pdf')
 return result
}
test('real storage upload precedes exact immutable attachment; no public URL or upsert', async () => {
 const transport = api([{ status: 'ok', agreement: { ...company, invoice_document: null }, extensions: [] }, { Key: `corporate-invoices/${path}` }, { status: 'attached', document, replayed: false }])
 const result = await transport.actions().attachCorporateInvoice(invoiceForm())
 assert.equal(result.status, 'attached'); assert.equal(result.document.storage_path, path)
 assert.equal(transport.calls[1].url.pathname, `/storage/v1/object/corporate-invoices/${path}`)
 assert.equal(transport.calls[1].method, 'POST')
 assert.deepEqual(transport.calls[2].body, { p_company_id: id, p_extension_id: null, p_invoice_reference: company.invoice_reference, p_storage_path: path })
 assert.doesNotMatch(transport.calls.map(call => call.url.href).join(' '), /public/)
})
test('invoice input, private company binding and existing immutable attachment fail before storage writes', async () => {
 for (const input of [invoiceForm({ companyId: 'bad' }), invoiceForm({ documentId: 'bad' }), invoiceForm({ extensionId: 'bad' })]) {
  const transport = api(); assert.equal((await transport.actions().attachCorporateInvoice(input)).status, 'invalid'); assert.equal(transport.calls.length, 0)
 }
 const corrupt = invoiceForm(); corrupt.set('invoice', new Blob(['not a PDF'], { type: 'application/pdf' }), 'corrupt.pdf')
 const transport = api(); assert.equal((await transport.actions().attachCorporateInvoice(corrupt)).status, 'invalid'); assert.equal(transport.calls.length, 0)
 for (const agreement of [{ ...company, invoice_reference: 'Different', invoice_document: null }, { ...company, invoice_document: { ...document, storage_path: `${id}/33333333-3333-4333-8333-333333333333.pdf` } }]) {
  const other = api([{ status: 'ok', agreement, extensions: [] }]); assert.equal((await other.actions().attachCorporateInvoice(invoiceForm())).status, 'conflict'); assert.equal(other.calls.length, 1)
 }
})
test('lost attachment response reuses same actual stored document without replacing or uploading twice', async () => {
 const transport = api([{ status: 'ok', agreement: company, extensions: [] }, new Response('%PDF-1.7\nSynthetic test bytes only\n%%EOF', { headers: { 'Content-Type': 'application/pdf' } }), { status: 'attached', document, replayed: true }])
 assert.equal((await transport.actions().attachCorporateInvoice(invoiceForm())).status, 'attached')
 assert.deepEqual(transport.calls.map(call => call.name), ['get_corporate_billing', '22222222-2222-4222-8222-222222222222.pdf', 'admin_attach_corporate_invoice'])
})
test('invoice read resolves document from authorized current billing, then creates a short private URL', async () => {
 const transport = api([{ status: 'ok', agreement: company, extensions: [] }, { signedURL: `/object/sign/corporate-invoices/${path}?token=synthetic` }])
 const result = await transport.actions().readCorporateInvoice(id, null)
 assert.match(result.url, /^https:\/\/synthetic.supabase.invalid\/storage\/v1\/object\/sign\/corporate-invoices\//)
 assert.deepEqual(transport.calls[1].body, { expiresIn: 60 })
 for (const response of [{ status: 'unavailable' }, { status: 'ok', agreement: { ...company, invoice_document: { ...document, storage_path: `other/${path}` } }, extensions: [] }]) {
  const bad = api([response]); assert.equal(await bad.actions().readCorporateInvoice(id, null), null); assert.equal(bad.calls.length, 1)
 }
})
test('a retry cannot claim a different selected PDF was attached to the existing immutable document', async () => {
 const transport = api([{ status: 'ok', agreement: company, extensions: [] }, new Response('%PDF-1.7\nSynthetic test bytes only\n%%EOF', { headers: { 'Content-Type': 'application/pdf' } }), { status: 'attached', document, replayed: true }])
 const changed = invoiceForm(); changed.set('invoice', new Blob(['%PDF-1.7\nDifferent actual document\n%%EOF'], { type: 'application/pdf' }), 'other.pdf')
 const result = await transport.actions().attachCorporateInvoice(changed)
 assert.notEqual(result.status, 'attached')
})
test('malformed paid capacity and partial acceptance snapshots cannot masquerade as the current annual agreement', async () => {
 const model = loadTypescript('lib/corporate/companies.ts')
 for (const changes of [{ capacity_seats: null, available_seats: baseline.available_seats }, { capacity_seats: baseline.seats - 1 }, { annual_accepted_by: null }, { annual_snapshot: null }, { annual_accepted_at: null }]) {
  const transport = api([{ status: 'ok', company: { ...company, ...changes }, roster: [], roster_total: 0, offset: 0, page_size: 50 }])
  assert.equal((await model.loadCorporateCompany(transport.client, id, 0)).status, 'error')
 }
})
test('every subsequent action rejects a disappeared current session despite an earlier valid admin result', async () => {
 const transport = api([{ status: 'quoted', extension_id: extensionId, updated_at: stamp }]), actions = transport.actions()
 assert.equal((await actions.quoteCorporateExtension(form())).status, 'quoted')
 transport.client.auth.getUser = async () => ({ data: { user: null }, error: new Error('expired') })
 await assert.rejects(actions.confirmCorporateExtension(form()), /admin denied/)
 assert.equal(transport.calls.length, 1)
})
test('company index displays paid capacity beside original seats after a paid amendment', () => {
 const { CorporateCompanyIndex: Index } = loadTypescript('components/corporate/company-index.tsx')
 const html = renderToStaticMarkup(React.createElement(Index, { result: { status: 'loaded', companies: [company], total: 1, offset: 0, page_size: 50 } }))
 assert.ok(html.includes(`${company.capacity_seats} bezahlte Plätze`)); assert.ok(html.includes(`${company.seats} ursprüngliche Jahresplätze`)); assert.match(html, /497,50/)
})
