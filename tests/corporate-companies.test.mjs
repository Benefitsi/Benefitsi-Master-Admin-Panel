import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { loadTypescript } from './helpers/load-typescript.mjs'
const fixture = JSON.parse(readFileSync(new URL('./fixtures/corporate/company-contract.json', import.meta.url)))
const id = fixture.detail.company.company_id
const timestamp = '2026-10-04T12:27:43.572243+02:00'
function database(responses) {
  const calls = []
  const supabase = createClient('https://synthetic.supabase.invalid', 'synthetic-publishable', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      calls.push({ name: new URL(url).pathname.split('/').at(-1), body: JSON.parse(init.body) })
      const response = responses.shift()
      if (response instanceof Error) throw response
      return Response.json(response ?? null)
    } },
  })
  return { supabase, calls }
}
function actions(db, denied = false) {
  const paths = []
  const code = loadTypescript('app/companies/actions.ts', {
    '@/lib/admin': { requireAdmin: async () => { if (denied) throw new Error('admin denied'); return { supabase: db.supabase } } },
    'next/cache': { revalidatePath: path => paths.push(path) },
  }, { FormData })
  return { ...code, paths }
}
function form(changes = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ requestId: id, expectedUpdatedAt: timestamp, seats: '25', startsOn: '2026-10-04', catalogVersion: '2026-10-04.2', ...changes })) data.set(key, value)
  return data
}
test('company creation exists as an independently guarded action', async () => {
  const db = database([]), api = actions(db, true)
  assert.equal(typeof api.createCorporateCompany, 'function')
  await assert.rejects(api.createCorporateCompany(form()), /admin denied/)
  assert.equal(db.calls.length, 0)
})
test('creation uses session RPC, unchanged optimistic timestamp and refreshes the original inquiry list', async () => {
  const db = database([{ status: 'created', company_id: id, replayed: false }]), api = actions(db)
  const result = await api.createCorporateCompany(form({ actorId: 'forged', total_amount_cents: '1' }))
  assert.equal(result.status, 'created'); assert.equal(result.companyId, id)
  assert.deepEqual(db.calls, [{ name: 'admin_create_corporate_company', body: {
    p_request_id: id, p_expected_updated_at: timestamp, p_seats: 25, p_starts_on: '2026-10-04', p_catalog_version: '2026-10-04.2',
  } }])
  assert.deepEqual(api.paths, ['/companies', `/companies/${id}`])
})
test('invalid setup and duplicate fields cannot reach persistence', async () => {
  const db = database([]), api = actions(db)
  for (const changes of [{ seats: '25.1' }, { seats: '0' }, { startsOn: '2026-02-30' }, { catalogVersion: '' }, { expectedUpdatedAt: '2026-02-30T00:00:00Z' }]) {
    assert.equal((await api.createCorporateCompany(form(changes))).status, 'invalid')
  }
  const duplicate = form(); duplicate.append('seats', '1')
  assert.equal((await api.createCorporateCompany(duplicate)).status, 'invalid'); assert.equal(db.calls.length, 0)
})
test('lost creation response can be replayed with the same setup and never claims speculative success', async () => {
  const db = database([new Error('secret transport failure'), { status: 'created', company_id: id, replayed: true }]), api = actions(db)
  const draft = form()
  const failed = await api.createCorporateCompany(draft)
  assert.equal(failed.status, 'error'); assert.equal(api.paths.length, 0)
  assert.doesNotMatch(failed.message, /secret/)
  assert.equal((await api.createCorporateCompany(draft)).status, 'created')
  assert.deepEqual(db.calls[0], db.calls[1])
})
test('catalog changed, stale request and malformed creation responses remain truthful failures', async () => {
  for (const [body, status] of [[{ status: 'catalog_changed' }, 'catalog_changed'], [{ status: 'conflict' }, 'conflict'], [{ status: 'created', company_id: id }, 'error'], [{ status: 'not_found' }, 'not_found']]) {
    const db = database([body]), api = actions(db)
    assert.equal((await api.createCorporateCompany(form())).status, status); assert.equal(api.paths.length, 0)
  }
})
test('executed native SQL catalog, list and two roster pages survive strict live readers', async () => {
  const model = loadTypescript('lib/corporate/companies.ts')
  const db = database([fixture.catalog, fixture.companies, fixture.detail, fixture.next_page])
  const catalog = await model.loadCorporateCatalog(db.supabase)
  assert.equal(model.annualQuote(catalog, 24).totalCents, 59760)
  assert.equal(model.annualQuote(catalog, 25).totalCents, 49750)
  assert.equal(model.annualQuote(null, 25), null)
  const list = await model.loadCorporateCompanies(db.supabase, 0)
  assert.equal(list.status, 'loaded'); assert.equal(list.total, 15)
  const first = await model.loadCorporateCompany(db.supabase, id, 0)
  assert.equal(first.status, 'ok'); assert.equal(first.roster.length, 50)
  assert.equal(first.company.updated_at, fixture.detail.company.updated_at)
  const next = await model.loadCorporateCompany(db.supabase, id, 50)
  assert.equal(next.status, 'ok'); assert.equal(next.roster.length, 3)
  assert.deepEqual(db.calls.slice(-2).map(c => c.body.p_offset), [0, 50])
})
test('live catalog and roster failure fail closed; invalid pagination is rejected before transport', async () => {
  const model = loadTypescript('lib/corporate/companies.ts')
  const db = database([null, { ...fixture.catalog, tiers: [] }, { ...fixture.detail, roster: [{ ...fixture.detail.roster[0], updated_at: 'rounded' }] }])
  assert.equal(await model.loadCorporateCatalog(db.supabase), null)
  assert.equal(await model.loadCorporateCatalog(db.supabase), null)
  assert.equal((await model.loadCorporateCompany(db.supabase, id, 0)).status, 'error')
  assert.equal((await model.loadCorporateCompanies(db.supabase, -1)).status, 'error')
  assert.equal(db.calls.length, 3)
})
test('all company mutations guard admin access including owner grants and roster operations', async () => {
  const db = database([]), api = actions(db, true)
  for (const name of ['updateCorporateCompany', 'issueCorporateInvitation', 'revokeCorporateInvitation', 'removeCorporateMember']) {
    assert.equal(typeof api[name], 'function')
    await assert.rejects(api[name](form()), /admin denied/)
  }
  assert.equal(db.calls.length, 0)
})
test('company edit and role-aware roster mutations preserve precise tokens and bounded payloads', async () => {
  const db = database([{ status: 'updated', updated_at: timestamp }, { status: 'revoked' }, { status: 'removed' }]), api = actions(db)
  assert.equal((await api.updateCorporateCompany(form({ companyId: id, status: 'enrolling', invoiceReference: '  Beleg 42  ' }))).status, 'updated')
  assert.equal((await api.revokeCorporateInvitation(form({ companyId: id, invitationId: id }))).status, 'revoked')
  assert.equal((await api.removeCorporateMember(form({ companyId: id, userId: id, role: 'owner' }))).status, 'removed')
  assert.deepEqual(db.calls[0].body, { p_company_id: id, p_expected_updated_at: timestamp, p_status: 'enrolling', p_invoice_reference: 'Beleg 42' })
  assert.deepEqual(db.calls[1].body, { p_invitation_id: id, p_expected_updated_at: timestamp })
  assert.deepEqual(db.calls[2].body, { p_company_id: id, p_user_id: id, p_role: 'owner', p_expected_updated_at: timestamp })
})
test('invitation is canonicalized and only returns issued identity after confirmed success', async () => {
  const db = database([{ status: 'issued', invitation_id: id, expires_at: timestamp, replayed: true }]), api = actions(db)
  const result = await api.issueCorporateInvitation(form({ companyId: id, invitationId: id, email: '  OWNER@EXAMPLE.TEST ', role: 'owner', token: 'a'.repeat(64) }))
  assert.equal(result.status, 'issued'); assert.equal(result.invitationId, id)
  assert.equal(db.calls[0].body.p_email, 'owner@example.test'); assert.equal(db.calls[0].body.p_token, 'a'.repeat(64))
  assert.equal(Object.hasOwn(result, 'token'), false)
})
test('every expected invitation failure has useful German guidance without success or refresh', async () => {
  for (const status of ['invalid', 'conflict', 'not_found', 'unavailable', 'full', 'already_member', 'already_invited', 'rate_limited']) {
    const db = database([{ status }]), api = actions(db)
    const result = await api.issueCorporateInvitation(form({ companyId: id, invitationId: id, email: 'owner@example.test', role: 'owner', token: 'a'.repeat(64) }))
    assert.equal(result.status, status); assert.ok(result.message.length > 20); assert.equal(api.paths.length, 0)
  }
})
test('the detail page denies non-admins before loading a company even when its owner knows the ID', async () => {
  let reads = 0
  const code = loadTypescript('app/companies/[id]/page.tsx', {
    '@/lib/admin': { requireAdmin: async () => { throw new Error('admin denied') } },
    '@/lib/corporate/companies': { loadCorporateCompany: async () => { reads++; return fixture.detail } },
    '@/app/admin-shell': {}, '@/components/corporate/company-detail': {}, '@/components/corporate/company-invitation': {},
  })
  await assert.rejects(code.default({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }), /admin denied/)
  assert.equal(reads, 0)
})
test('deployed list uses live session catalog and bounded company pagination independently of inquiries', async () => {
  const db = database([fixture.catalog, { ...fixture.companies, offset: 50, companies: [] }, { requests: [] }])
  const code = loadTypescript('app/companies/page.tsx', {
    '@/lib/admin': { requireAdmin: async () => ({ supabase: db.supabase, adminSession: { user: { email: 'admin@example.test' } } }) },
    '@/app/admin-shell': {}, '@/components/corporate/request-workspace': {},
  })
  const result = await code.default({ searchParams: Promise.resolve({ companyOffset: '50', status: 'proposal' }) })
  assert.equal(result.props.children.props.companies.offset, 50)
  assert.equal(result.props.children.props.catalog.version, '2026-10-04.2')
  assert.deepEqual(db.calls.map(c => c.name), ['get_corporate_benefits_catalog', 'admin_list_corporate_companies', 'admin_list_corporate_benefits_requests'])
  assert.equal(db.calls[1].body.p_offset, 50); assert.equal(db.calls[2].body.p_status, 'proposal')
})
test('detail route transmits UUID and page token only through the guarded session client', async () => {
  const db = database([fixture.next_page])
  const code = loadTypescript('app/companies/[id]/page.tsx', {
    '@/lib/admin': { requireAdmin: async () => ({ supabase: db.supabase, adminSession: { user: { email: 'admin@example.test' } } }) },
    '@/app/admin-shell': {}, '@/components/corporate/company-detail': {}, '@/components/corporate/company-invitation': {},
  })
  await code.default({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ offset: '50' }) })
  assert.deepEqual(db.calls, [{ name: 'get_corporate_company', body: { p_company_id: id, p_offset: 50 } }])
  await code.default({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ offset: ['0', '50'] }) })
  assert.equal(db.calls.length, 1)
})
test('invalid invite identity, token, role and email never reach an authenticated RPC', async () => {
  const db = database([]), api = actions(db)
  for (const change of [{ invitationId: 'bad' }, { token: 'A'.repeat(64) }, { token: 'a'.repeat(63) }, { role: 'admin' }, { email: 'invalid' }, { email: `${'a'.repeat(250)}@example.test` }]) {
    const result = await api.issueCorporateInvitation(form({ companyId: id, invitationId: id, email: 'owner@example.test', role: 'owner', token: 'a'.repeat(64), ...change }))
    assert.equal(result.status, 'invalid')
  }
  assert.equal(db.calls.length, 0)
})
