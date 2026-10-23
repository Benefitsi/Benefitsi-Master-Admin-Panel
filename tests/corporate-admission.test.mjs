import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { webcrypto } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import React, { act } from 'react'
import { loadTypescript } from './helpers/load-typescript.mjs'
import { translateValue } from '../app/admin-language.tsx'
const require = createRequire(import.meta.url)
const company = JSON.parse(readFileSync(new URL('./fixtures/corporate/annual-contract.json', import.meta.url))).after
const id = company.company_id, stamp = company.updated_at
function form(changes = {}) { const data = new FormData(); for (const [key, value] of Object.entries({ companyId: id, expectedUpdatedAt: stamp, employeeAdmissionOpen: 'false', ...changes })) data.set(key, value); return data }
function api(responses = [], identity = { id: 'admin', is_admin: true }) {
 const calls = [], paths = []
 const client = createClient('https://synthetic.supabase.invalid', 'synthetic-publishable', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (url, init) => { calls.push({ name: new URL(url).pathname.split('/').at(-1), body: JSON.parse(init.body) }); const response = responses.shift(); if (response instanceof Error) throw response; return Response.json(response ?? null) } } })
 client.auth.getUser = async () => ({ data: { user: identity && { id: identity.id, user_metadata: { is_admin: true } } }, error: null })
 client.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: identity, error: null }) }) }) })
 const admin = loadTypescript('lib/admin.ts', { '@/lib/supabase/server': { createClient: async () => client }, 'next/headers': { headers: async () => new Headers({ host: 'admin.benefitsi.de' }) }, 'next/navigation': { redirect: () => { throw new Error('admin denied') } } })
 const actions = loadTypescript('app/companies/actions.ts', { '@/lib/admin': admin, 'next/cache': { revalidatePath: p => paths.push(p), refresh: () => {} } }, { FormData })
 return { actions, calls, paths }
}
test('employee intake defaults open for old DTOs and closed intake preserves the native paid agreement', () => {
 const { parseCorporateCompany } = loadTypescript('lib/corporate/companies.ts')
 assert.equal(parseCorporateCompany(company).employee_admission_open, true)
 const closed = parseCorporateCompany({ ...company, employee_admission_open: false })
 assert.equal(closed.employee_admission_open, false)
 for (const key of ['premium_enabled', 'status', 'capacity_seats', 'total_amount_cents', 'ends_on', 'entitlement_status']) assert.equal(closed[key], company[key])
 for (const flag of [null, 0, 'false']) assert.equal(parseCorporateCompany({ ...company, employee_admission_open: flag }), null)
})
test('intake server action rechecks current canonical admin session before every mutation', async () => {
 for (const identity of [null, { id: 'owner', is_admin: false }, { id: 'metadata-only', is_admin: 'true' }]) {
  const transport = api([], identity)
  assert.equal(typeof transport.actions.setCorporateEmployeeAdmission, 'function')
  await assert.rejects(transport.actions.setCorporateEmployeeAdmission(form()), /admin denied/)
  assert.equal(transport.calls.length, 0)
 }
})
test('intake action sends only exact raw versioned RPC fields and accepts an unchanged no-op timestamp', async () => {
 const transport = api([{ status: 'updated', updated_at: stamp, employee_admission_open: false }])
 const result = await transport.actions.setCorporateEmployeeAdmission(form({ premium_enabled: 'false', capacity_seats: '0' }))
 assert.equal(result.status, 'updated'); assert.equal(result.updatedAt, stamp)
 assert.deepEqual(transport.calls, [{ name: 'set_corporate_employee_admission', body: { p_company_id: id, p_expected_updated_at: stamp, p_open: false } }])
 assert.deepEqual(transport.paths, ['/companies', `/companies/${id}`])
 assert.match(result.message, /Premium.*unverändert/)
})
test('invalid fields and duplicate consent cannot reach intake persistence; conflicts and forged success never refresh', async () => {
 const transport = api()
 for (const changes of [{ companyId: 'bad' }, { expectedUpdatedAt: 'rounded' }, { employeeAdmissionOpen: 'yes' }]) assert.equal((await transport.actions.setCorporateEmployeeAdmission(form(changes))).status, 'invalid')
 const duplicate = form(); duplicate.append('employeeAdmissionOpen', 'false'); assert.equal((await transport.actions.setCorporateEmployeeAdmission(duplicate)).status, 'invalid'); assert.equal(transport.calls.length, 0)
 for (const body of [{ status: 'conflict' }, { status: 'not_found' }, { status: 'updated', updated_at: stamp, employee_admission_open: true }, { status: 'updated', updated_at: 'rounded', employee_admission_open: false }, new Error('private detail')]) {
  const other = api([body]), result = await other.actions.setCorporateEmployeeAdmission(form())
  assert.ok(['conflict', 'not_found', 'error'].includes(result.status)); assert.equal(other.paths.length, 0); assert.doesNotMatch(result.message, /private detail/)
 }
})
async function withDom(run) {
 const { JSDOM } = await import('jsdom'), dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
 const values = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true }, previous = Object.fromEntries(Object.keys(values).map(k => [k, globalThis[k]]))
 Object.assign(globalThis, values); const root = require('react-dom/client').createRoot(document.getElementById('root'))
 try { await run(root, dom.window) } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close() }
}
test('intake conflict retains the checkbox draft across refresh and identity changes clear it', async () => {
 const calls = []
 const { CorporateEmployeeAdmission: Admission } = loadTypescript('components/corporate/company-detail.tsx', { '@/app/companies/actions': { setCorporateEmployeeAdmission: async data => { calls.push(Object.fromEntries(data)); return { status: 'conflict', message: 'Bitte neu laden' } } } }, { FormData })
 assert.equal(typeof Admission, 'function')
 await withDom(async root => {
  const props = { company: { ...company, employee_admission_open: true }, adminIdentity: 'admin-a' }
  await act(async () => root.render(React.createElement(Admission, props)))
  await act(async () => document.querySelector('[name="employeeAdmissionOpen"]').click())
  assert.match(document.body.textContent, /Mitarbeiteraufnahme geschlossen/)
  await act(async () => document.querySelector('form').requestSubmit())
  assert.deepEqual(calls[0], { companyId: id, expectedUpdatedAt: stamp, employeeAdmissionOpen: 'false' })
  await act(async () => root.render(React.createElement(Admission, { ...props, company: { ...props.company, updated_at: '2026-10-23T20:01:00.123456Z' } })))
  assert.equal(document.querySelector('input').checked, false); assert.equal(document.querySelector('button').disabled, true)
  assert.match(document.body.textContent, /bezahlte Premium-Freigaben/)
  await act(async () => root.render(React.createElement(Admission, { ...props, adminIdentity: 'admin-b' })))
  assert.equal(document.querySelector('input').checked, true); assert.equal(document.querySelector('button').disabled, false)
 })
})
test('closed employee intake blocks employee issuance even a direct submit but leaves owner invitations available', async () => {
 let issued = 0
 const { CorporateCompanyInvitation: Invite } = loadTypescript('components/corporate/company-invitation.tsx', { '@/app/companies/actions': { issueCorporateInvitation: async data => { issued++; return { status: 'issued', invitationId: data.get('invitationId'), expiresAt: stamp, message: 'Einladung erstellt' } } } }, { crypto: webcrypto, FormData, Uint8Array })
 await withDom(async (root, window) => {
  await act(async () => root.render(React.createElement(Invite, { company: { ...company, employee_admission_open: false } })))
  assert.equal(document.querySelector('button[type="submit"]').disabled, true)
  await act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); assert.equal(issued, 0)
  await act(async () => { const select = document.querySelector('[name="role"]'); select.value = 'owner'; select.dispatchEvent(new window.Event('change', { bubbles: true })); const email = document.querySelector('[name="email"]'); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(email, 'manager@example.test'); email.dispatchEvent(new window.Event('input', { bubbles: true })) })
  assert.equal(document.querySelector('button[type="submit"]').disabled, false)
  await act(async () => document.querySelector('form').requestSubmit()); assert.equal(issued, 1)
 })
})
test('intake-only controls and company suspension labels follow the existing DE/EN translator', () => {
 for (const [de, en] of [['Mitarbeiteraufnahme offen', 'Employee intake open'], ['Mitarbeiteraufnahme geschlossen', 'Employee intake closed'], ['Mitarbeiteraufnahme speichern', 'Save employee intake'], ['Firma unterbrochen (inkl. Firmen-Premium)', 'Company suspended (including company Premium)']]) {
  assert.equal(translateValue(de, 'en'), en); assert.equal(translateValue(en, 'de'), de)
 }
})
