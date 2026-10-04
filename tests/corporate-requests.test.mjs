import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { loadTypescript } from './helpers/load-typescript.mjs'

const id = 'c26632f0-b279-4bd6-9965-066a0b387738'
const timestamp = '2026-10-04T12:27:43.572243+02:00'
const row = {
  request_id: id, company_name: 'Example Company', contact_name: 'Example Contact',
  email: 'example@example.test', city: 'Annweiler', seats: 100, interests: ['membership'],
  catalog_version: '2026-10-04.1', unit_amount_cents: 1990, total_amount_cents: 199000,
  status: 'new', note: '', created_at: timestamp, updated_at: timestamp,
}
const model = () => loadTypescript('lib/corporate/requests.ts')
function form(changes = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ requestId: id, expectedUpdatedAt: timestamp, status: 'contacted', note: 'Rückruf vereinbart', ...changes })) data.set(key, value)
  return data
}
function database(response, { throws = false } = {}) {
  const calls = []
  const supabase = createClient('https://synthetic.supabase.invalid', 'publishable-synthetic', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      calls.push({ path: new URL(url).pathname, body: JSON.parse(options.body) })
      if (throws) throw new Error('private connection detail')
      return Response.json(response.body, { status: response.status ?? 200 })
    } },
  })
  return { supabase, calls }
}
function action(db, { denied = false } = {}) {
  let refreshed = 0
  const code = loadTypescript('app/companies/actions.ts', {
    '@/lib/admin': { requireAdmin: async () => {
      if (denied) throw new Error('admin denied')
      return { supabase: db.supabase, adminSession: { isAdmin: true } }
    } },
    'next/cache': { revalidatePath: (path) => { assert.equal(path, '/companies'); refreshed++ } },
  })
  return { save: data => code.updateCorporateRequest({}, data), refreshed: () => refreshed }
}

test('valid edits preserve the complete microsecond lock and omit client actor/quote fields', async () => {
  const db = database({ body: { status: 'updated', updated_at: '2026-10-04T12:29:43.572244+02:00' } })
  const save = action(db)
  const result = await save.save(form({ actorId: 'forged-admin', total_amount_cents: '0' }))
  assert.equal(result.status, 'updated')
  assert.equal(save.refreshed(), 1)
  assert.deepEqual(db.calls, [{ path: '/rest/v1/rpc/admin_update_corporate_benefits_request', body: {
    p_request_id: id, p_expected_updated_at: timestamp, p_status: 'contacted', p_note: 'Rückruf vereinbart',
  } }])
})

test('invalid status, note, UUID and calendar timestamp cannot reach persistence', async () => {
  const db = database({ body: { status: 'updated', updated_at: timestamp } })
  const save = action(db)
  for (const bad of [
    { status: 'paid' }, { status: '' }, { note: 'a'.repeat(2001) }, { note: 'bad\0note' },
    { requestId: 'not-a-uuid' }, { expectedUpdatedAt: '' }, { expectedUpdatedAt: '2026-02-30T12:00:00Z' },
    { expectedUpdatedAt: '2026-10-04T25:00:00Z' }, { expectedUpdatedAt: '2026-10-04' },
  ]) {
    const result = await save.save(form(bad))
    assert.equal(result.status, 'invalid', JSON.stringify(bad))
    assert.ok(result.message)
  }
  const duplicate = form(); duplicate.append('status', 'new')
  assert.equal((await save.save(duplicate)).status, 'invalid')
  const missing = form(); missing.delete('note')
  assert.equal((await save.save(missing)).status, 'invalid')
  assert.equal(db.calls.length, 0)
  assert.equal(save.refreshed(), 0)
})

test('an empty note and 2000 Unicode characters are valid without silent trimming', async () => {
  const db = database({ body: { status: 'updated', updated_at: timestamp } })
  const save = action(db)
  for (const note of ['', '  Intern  ', '🙂'.repeat(2000)]) assert.equal((await save.save(form({ note }))).status, 'updated')
  assert.deepEqual(db.calls.map(call => call.body.p_note), ['', '  Intern  ', '🙂'.repeat(2000)])
})

test('authorization rejection prevents all RPC calls and is not swallowed', async () => {
  const db = database({ body: { status: 'updated', updated_at: timestamp } })
  await assert.rejects(action(db, { denied: true }).save(form()), /admin denied/)
  assert.equal(db.calls.length, 0)
})

test('a stale editor receives a visible refresh instruction without reporting success', async () => {
  const db = database({ body: { status: 'conflict' } })
  const save = action(db)
  const result = await save.save(form())
  assert.equal(result.status, 'conflict')
  assert.match(result.message, /neu laden/i)
  assert.equal(save.refreshed(), 0)
})

test('missing, rejected and malformed RPC results remain distinct from success', async () => {
  for (const [body, expected] of [[{ status: 'not_found' }, 'not_found'], [{ status: 'invalid' }, 'invalid'], [null, 'error'], [{ status: 'updated' }, 'error'], [{ status: 'unknown' }, 'error']]) {
    const db = database({ body })
    const save = action(db)
    assert.equal((await save.save(form())).status, expected)
    assert.equal(save.refreshed(), 0)
  }
})

test('RPC failure and denied database access show a safe failure rather than raw details', async () => {
  for (const options of [{ body: { code: '42501', message: 'private SQL detail' }, status: 403 }, { body: null, throws: true }]) {
    const db = database(options, options)
    const result = await action(db).save(form())
    assert.equal(result.status, 'error')
    assert.doesNotMatch(result.message, /private|SQL|connection/)
  }
})

test('the list keeps the stored quote and precise timestamp and sends a bounded status filter', async () => {
  const db = database({ body: { requests: [row] } })
  const result = await model().loadCorporateRequests(db.supabase, 'new')
  assert.equal(result.status, 'loaded')
  assert.equal(result.requests[0].updated_at, timestamp)
  assert.equal(result.requests[0].total_amount_cents, 199000)
  assert.deepEqual(db.calls, [{ path: '/rest/v1/rpc/admin_list_corporate_benefits_requests', body: { p_status: 'new', p_limit: 50 } }])
})

test('a null quote is retained and an empty list is distinct from a query failure', async () => {
  const empty = await model().loadCorporateRequests(database({ body: { requests: [] } }).supabase, null)
  assert.equal(empty.status, 'loaded'); assert.equal(empty.requests.length, 0)
  const noQuote = await model().loadCorporateRequests(database({ body: { requests: [{ ...row, catalog_version: null, unit_amount_cents: null, total_amount_cents: null }] } }).supabase, null)
  assert.equal(noQuote.status, 'loaded'); assert.equal(noQuote.requests[0].total_amount_cents, null)
  for (const body of [null, {}, { requests: [{ ...row, updated_at: null }] }, { requests: [{ ...row, total_amount_cents: null }] }]) {
    const failed = await model().loadCorporateRequests(database({ body }).supabase, null)
    assert.equal(failed.status, 'error')
  }
  const denied = await model().loadCorporateRequests(database({ body: { message: 'secret database detail' }, status: 403 }).supabase, null)
  assert.equal(denied.status, 'error'); assert.doesNotMatch(denied.message, /secret/)
})

test('unknown or repeated query statuses are rejected before requesting a misleading empty queue', () => {
  assert.equal(model().parseCorporateStatusFilter(undefined), null)
  assert.equal(model().parseCorporateStatusFilter(''), null)
  assert.equal(model().parseCorporateStatusFilter('closed'), 'closed')
  assert.equal(model().parseCorporateStatusFilter('paid'), undefined)
  assert.equal(model().parseCorporateStatusFilter(['new', 'closed']), undefined)
})

test('the deployed page authorizes before reading inquiry data', async () => {
  let reads = 0
  const code = loadTypescript('app/companies/page.tsx', {
    '@/lib/admin': { requireAdmin: async () => { throw new Error('page denied') } },
    '@/lib/corporate/requests': { loadCorporateRequests: async () => { reads++; return { status: 'loaded', requests: [] } } },
    '@/app/admin-shell': {}, '@/components/corporate/request-workspace': {},
  })
  await assert.rejects(code.default({ searchParams: Promise.resolve({}) }), /page denied/)
  assert.equal(reads, 0)
})

test('the page queries only the client returned by requireAdmin and rejects invalid filters without RPC', async () => {
  const db = database({ body: { requests: [] } })
  const code = loadTypescript('app/companies/page.tsx', {
    '@/lib/admin': { requireAdmin: async () => ({ supabase: db.supabase, adminSession: { profile: null, user: { email: 'admin@example.test' } } }) },
    '@/app/admin-shell': {}, '@/components/corporate/request-workspace': {},
  })
  await code.default({ searchParams: Promise.resolve({ status: 'closed' }) })
  assert.deepEqual(db.calls, [{ path: '/rest/v1/rpc/admin_list_corporate_benefits_requests', body: { p_status: 'closed', p_limit: 50 } }])
  const invalid = await code.default({ searchParams: Promise.resolve({ status: 'active_membership' }) })
  assert.equal(db.calls.length, 1)
  assert.equal(invalid.props.children.props.result.status, 'error')
})
