import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { loadTypescript } from './helpers/load-typescript.mjs'
const fixture = JSON.parse(readFileSync(new URL('./fixtures/corporate-premium-contract.json', import.meta.url)))
const id = fixture.inactive.company_id
const timestamp = fixture.inactive.updated_at
function form(changes = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ companyId: id, expectedUpdatedAt: timestamp, enabled: 'true', paymentReference: ' PAY-42 ', paymentConfirmed: 'true', ...changes })) data.set(key, value)
  return data
}
function actions(responses, identity = { id: 'admin', is_admin: true }) {
  const calls = [], paths = [], refreshes = []
  const supabase = createClient('https://synthetic.supabase.invalid', 'synthetic-publishable', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      calls.push({ name: new URL(url).pathname.split('/').at(-1), body: JSON.parse(init.body) })
      const response = responses.shift()
      if (response instanceof Error) throw response
      return Response.json(response ?? null)
    } },
  })
  supabase.auth.getUser = async () => ({ data: { user: identity && { id: identity.id, email: 'actor@example.test' } }, error: null })
  supabase.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: identity, error: null }) }) }) })
  const admin = loadTypescript('lib/admin.ts', {
    '@/lib/supabase/server': { createClient: async () => supabase },
    'next/headers': { headers: async () => new Headers({ host: 'admin.benefitsi.de' }) },
    'next/navigation': { redirect: () => { throw new Error('admin denied') } },
  })
  const api = loadTypescript('app/companies/actions.ts', {
    '@/lib/admin': admin,
    'next/cache': { revalidatePath: path => paths.push(path), refresh: () => refreshes.push(true) },
  }, { FormData })
  return { ...api, calls, paths, refreshes, supabase }
}
test('premium action authorizes the actual current admin profile before RPC; owner and signed-out actors cannot mutate', async () => {
  for (const identity of [null, { id: 'owner', is_admin: false }, { id: 'forged', is_admin: 'true' }]) {
    const api = actions([], identity)
    assert.equal(typeof api.setCorporatePremium, 'function')
    await assert.rejects(api.setCorporatePremium(form({ actorId: 'admin' })), /admin denied/)
    assert.equal(api.calls.length, 0)
  }
})
test('payment confirmation requires explicit consent and valid bounded reference before persistence', async () => {
  const api = actions([])
  for (const change of [{ paymentConfirmed: 'false' }, { paymentConfirmed: '' }, { paymentReference: '  ' }, { paymentReference: 'a'.repeat(161) }, { paymentReference: 'a\0b' }, { expectedUpdatedAt: 'rounded' }, { enabled: 'yes' }]) {
    assert.equal((await api.setCorporatePremium(form(change))).status, 'invalid')
  }
  const duplicate = form(); duplicate.append('paymentConfirmed', 'true')
  assert.equal((await api.setCorporatePremium(duplicate)).status, 'invalid')
  const missing = form(); missing.delete('paymentConfirmed')
  assert.equal((await api.setCorporatePremium(missing)).status, 'invalid')
  assert.equal(api.calls.length, 0)
})
test('activation trims reference and sends only exact protected SQL parameters then refreshes both views', async () => {
  const api = actions([{ status: 'updated', updated_at: fixture.active.updated_at }])
  const result = await api.setCorporatePremium(form({ total_amount_cents: '1', starts_on: '1900-01-01', actorId: 'forged' }))
  assert.equal(result.status, 'updated'); assert.equal(result.updatedAt, fixture.active.updated_at)
  assert.deepEqual(api.calls, [{ name: 'admin_set_corporate_premium', body: { p_company_id: id, p_expected_updated_at: timestamp, p_enabled: true, p_payment_reference: 'PAY-42' } }])
  assert.deepEqual(api.paths, ['/companies', `/companies/${id}`]); assert.equal(api.refreshes.length, 1)
})
test('suspension has its own confirmation and sends empty reference preserving the SQL audit record', async () => {
  const api = actions([{ status: 'updated', updated_at: fixture.suspended.updated_at }])
  assert.equal((await api.setCorporatePremium(form({ enabled: 'false', paymentConfirmed: 'true', suspensionConfirmed: 'false', paymentReference: '' }))).status, 'invalid')
  assert.equal((await api.setCorporatePremium(form({ enabled: 'false', suspensionConfirmed: 'true', paymentReference: 'PAY-42' }))).status, 'invalid')
  assert.equal((await api.setCorporatePremium(form({ enabled: 'false', suspensionConfirmed: 'true', paymentReference: '' }))).status, 'updated')
  assert.deepEqual(api.calls[0].body, { p_company_id: id, p_expected_updated_at: timestamp, p_enabled: false, p_payment_reference: '' })
})
test('conflict and uncertain responses never refresh or claim success; transport retry keeps full microseconds', async () => {
  for (const body of [{ status: 'conflict' }, { status: 'not_found' }, { status: 'invalid' }, { status: 'updated', updated_at: 'bad' }, null, new Error('private transport details')]) {
    const api = actions([body])
    const result = await api.setCorporatePremium(form())
    assert.ok(['conflict', 'not_found', 'invalid', 'error'].includes(result.status))
    assert.equal(api.paths.length, 0); assert.equal(api.refreshes.length, 0); assert.doesNotMatch(result.message, /private transport/)
    assert.equal(api.calls[0].body.p_expected_updated_at, timestamp)
  }
})
test('executed five-state DTOs are accepted and malformed premium data fail closed', async () => {
  const model = loadTypescript('lib/corporate/companies.ts')
  for (const key of ['inactive', 'active', 'scheduled', 'suspended', 'expired']) {
    const company = fixture[key]
    const api = actions([{ companies: [company], total: 1, offset: 0, page_size: 50 }])
    const result = await model.loadCorporateCompanies(api.supabase, 0)
    assert.equal(result.status, 'loaded', key); assert.equal(result.companies[0].entitlement_status, company.entitlement_status)
    assert.equal(result.companies[0].premium_payment_reference, company.premium_payment_reference)
  }
  for (const change of [{ premium_enabled: 'true' }, { premium_payment_reference: null }, { entitlement_status: 'unknown' }, { premium_payment_reference: 'a'.repeat(161) }]) {
    const api = actions([{ companies: [{ ...fixture.active, ...change }], total: 1, offset: 0, page_size: 50 }])
    assert.equal((await model.loadCorporateCompanies(api.supabase, 0)).status, 'error')
  }
})

test('guarded detail route binds the payment form and all existing draft editors to the current admin identity', async () => {
  const api = actions([{ status: 'ok', company: fixture.active, roster: [], roster_total: 0, offset: 0, page_size: 50 }])
  function Premium() {}
  function Editor() {}
  function Invite() {}
  function Roster() {}
  const page = loadTypescript('app/companies/[id]/page.tsx', {
    '@/lib/admin': { requireAdmin: async () => ({ supabase: api.supabase, adminSession: { user: { id: 'admin-b' }, profile: null } }) },
    '@/app/admin-shell': {},
    '@/components/corporate/company-premium': { CorporateCompanyPremium: Premium },
    '@/components/corporate/company-detail': { CorporateCompanySummary: () => {}, CorporateCompanyEditor: Editor, CorporateRoster: Roster },
    '@/components/corporate/company-invitation': { CorporateCompanyInvitation: Invite },
  })
  const result = await page.default({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })
  function flatten(value) {
    if (Array.isArray(value)) return value.flatMap(flatten)
    return value && typeof value === 'object' ? [value, ...flatten(value.props?.children)] : []
  }
  const elements = flatten(result)
  const premium = elements.find(element => element.type === Premium)
  assert.ok(premium, 'successful guarded read must include payment confirmation')
  assert.equal(premium.props.adminIdentity, 'admin-b')
  assert.equal(premium.props.company.updated_at, fixture.active.updated_at)
  for (const type of [Editor, Invite, Roster]) assert.equal(elements.find(element => element.type === type).key, `admin-b:${id}`)
})
