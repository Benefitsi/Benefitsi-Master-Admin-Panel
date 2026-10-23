import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash, webcrypto } from 'node:crypto'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createClient } from '@supabase/supabase-js'
import { loadTypescript } from './helpers/load-typescript.mjs'

const fixtureUrl = new URL('./fixtures/corporate/annual-contract.json', import.meta.url)
const provenanceUrl = new URL('./fixtures/corporate/annual-contract.provenance.json', import.meta.url)
function nativeFixture() { return JSON.parse(readFileSync(fixtureUrl, 'utf8')) }
function transport(response) {
 const calls = []
 const client = createClient('https://native-fixture.supabase.invalid', 'synthetic-publishable', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (url, init) => { calls.push({ name: new URL(url).pathname.split('/').at(-1), body: JSON.parse(init.body) }); return Response.json(response) } },
 })
 return { client, calls }
}

test('annual native fixture is byte-bound to the final successful SQL source and Cloud artifact', () => {
 const provenance = JSON.parse(readFileSync(provenanceUrl, 'utf8'))
 assert.equal(createHash('sha256').update(readFileSync(fixtureUrl)).digest('hex'), provenance.sha256)
 assert.equal(provenance.sha256, '5b45b9daf0efaf5978ce728eeabb911e38a1f71bf44b7b8fbefdc23b19588127')
 assert.equal(provenance.source_commit, '6335f154f13bc2db78c588d681605878c2a8cac9')
 assert.equal(provenance.run_id, '39980170414'); assert.equal(provenance.job_id, '120505090591')
 assert.equal(provenance.artifact_id, '12512519213'); assert.equal(provenance.native_tests_passed, 89)
})

test('production company parser consumes native paid capacity without rewriting original seats, money or period', () => {
 const fixture = nativeFixture(), { parseCorporateCompany } = loadTypescript('lib/corporate/companies.ts')
 const before = parseCorporateCompany(fixture.before), after = parseCorporateCompany(fixture.after)
 assert.ok(before); assert.ok(after)
 assert.equal(before.capacity_seats, 2); assert.equal(after.capacity_seats, 5)
 assert.equal(after.capacity_seats - before.capacity_seats, fixture.activated.extensions[0].additional_seats)
 for (const field of ['company_id', 'source_request_id', 'seats', 'unit_amount_cents', 'total_amount_cents', 'catalog_version', 'starts_on', 'ends_on']) assert.equal(after[field], before[field], field)
 assert.deepEqual(after.annual_snapshot, before.annual_snapshot)
 assert.equal(after.employee_count + after.reserved_count + after.available_seats, after.capacity_seats)
})

test('real billing client consumes native quoted, accepted and activated DTOs with exact authenticated RPC parameters', async () => {
 const fixture = nativeFixture(), { loadCorporateBilling } = loadTypescript('lib/corporate/annual.ts')
 for (const response of [
  { status: 'ok', agreement: fixture.before, extensions: [fixture.quoted] },
  { status: 'ok', agreement: fixture.before, extensions: [fixture.accepted] },
  fixture.activated,
 ]) {
  const api = transport(response), result = await loadCorporateBilling(api.client, fixture.before.company_id)
  assert.equal(result.status, 'ok')
  assert.equal(result.agreement.total_amount_cents, fixture.before.total_amount_cents)
  assert.equal(result.extensions[0].ends_on, fixture.before.ends_on)
  assert.equal(result.extensions[0].updated_at, response.extensions[0].updated_at, 'native microseconds preserved')
  assert.deepEqual(api.calls, [{ name: 'get_corporate_billing', body: { p_company_id: fixture.before.company_id } }])
 }
})

test('actual annual component renders native original agreement, separate paid amendment and private invoice evidence', () => {
 const fixture = nativeFixture()
 const { CorporateAnnualBilling: Billing } = loadTypescript('components/corporate/CorporateAnnualBilling.tsx', { '@/app/companies/actions': {} }, { crypto: webcrypto })
 const markup = renderToStaticMarkup(React.createElement(Billing, { billing: fixture.activated, adminIdentity: 'synthetic-admin' }))
 const text = markup.replace(/<[^>]*>/g, '')
 assert.match(text, /Ursprüngliche Vereinbarung: 2 Plätze/)
 assert.match(text, /49,80/); assert.match(text, /42,00/)
 assert.match(text, /Bezahlte Kapazität: 5 Plätze/)
 assert.match(text, /3 zusätzliche Plätze/)
 assert.match(text, /Zahlung bestätigt · Plätze freigegeben/)
 assert.match(text, /BANK-EXT/); assert.match(text, /Invoice 42/)
 assert.equal((markup.match(/Privaten Rechnungsbeleg abrufen/g) ?? []).length, 2)
 assert.doesNotMatch(markup, /https?:\/\/[^"\s]*invoice|\/storage\/v1\/object\/public|Geburtstagsprogramm|Dienstjubiläum|Geschenkbudget/)
})
