import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server.js'
import { loadTypescript } from './helpers/load-typescript.mjs'
import { globals, id, contractId, periodId, intent, invoice, transport, provider } from './helpers/corporate-recurring-fixtures.mjs'
const proxySecret = 'synthetic-proxy-secret-32-characters-long'
const workerSecret = 'synthetic-worker-secret-32-characters-long'
function boundary() {
  let sessions = 0, ticks = 0, events = 0
  const proxy = loadTypescript('proxy.ts', {
    './config': { getSupabaseConfig: () => ({ isConfigured: true, url: 'https://synthetic.invalid', publishableKey: 'synthetic' }) },
    '../auth-recovery': loadTypescript('lib/auth-recovery.ts'),
    '@supabase/ssr': { createServerClient: () => { sessions++; return { auth: { getUser: async () => ({ data: { user: null } }) } } } },
  }, globals).proxy
  const t = transport(), p = provider(t)
  const context = { status: 'ok', company_id: id, contract_id: contractId, period_id: periodId, environment: 'test', provider_account_ref: 'acct_synthetic', return_origin: intent.return_origin, customer_ref: intent.customer_ref, invoice_ref: intent.invoice_ref, setup_request_id: id, setup_session_ref: null }
  const ownerDeps = { origin: intent.return_origin, proxySecret, provider: p,
    owner: async jwt => ({ authenticate: async () => jwt === 'owner.jwt' || jwt === 'employee.jwt', rpc: async name => jwt === 'employee.jwt' ? { status: 'unavailable' } : name === 'get_corporate_contract' ? { status: 'ok', company_id: id, contract: { contract_id: contractId }, payment_setup: { state: 'ready', setup_request_id: id } } : name === 'get_corporate_payment_context' ? context : { status: 'requested', operation_id: id, setup_request_id: id } }),
    worker: { run: async () => ({ status: 'recorded', setup_request_id: id }) },
    reconciler: { reconcile: async () => ({ status: 'paid' }), context: async () => ({ intent, contract_review_required: false }) },
  }
  const webhook = { secret: 'whsec_synthetic_corporate', stripe: t.stripe, account: 'acct_synthetic', receive: async () => { events++ } }
  const runtime = { ownerDeps, workerSecret, tick: async () => { ticks++; return { status: 'ok', processed: 1, notifications: 0 } }, webhook }
  async function call(mode, { host = 'admin.benefitsi.de', body, headers = {}, path } = {}) {
    const value = body ?? (mode === 'worker' ? {} : mode === 'setup' ? { companyId: id, contractId, requestId: id, expectedVersion: intent.expected_version } : mode === 'recovery' ? { companyId: id, contractId, periodId } : { companyId: id, contractId, requestId: id })
    const request = new NextRequest(`https://${host}${path ?? '/api/corporate/billing/' + mode}`, { method: 'POST', headers: { Host: host, Origin: intent.return_origin, Authorization: mode === 'worker' ? `Bearer ${workerSecret}` : 'Bearer owner.jwt', 'x-benefitsi-corporate-proxy-secret': proxySecret, 'Content-Type': 'application/json', ...headers }, body: typeof value === 'string' ? value : JSON.stringify(value) })
    assert.equal(request.cookies.getAll().length, 0)
    const outer = await proxy(request)
    if (outer.headers.get('x-middleware-next') !== '1') return outer
    return loadTypescript(`app/api/corporate/billing/${mode}/route.ts`, { '@/lib/corporate/billing-runtime': { corporateRuntime: () => runtime } }, globals).POST(request)
  }
  return { call, webhook, get sessions() { return sessions }, get ticks() { return ticks }, get events() { return events } }
}
test('exact outer proxy and real routes admit owner, worker and signed webhook with no Admin cookie', async () => {
  const h = boundary()
  for (const mode of ['setup', 'status', 'recovery', 'worker']) assert.equal((await h.call(mode)).status, 200, mode)
  const body = JSON.stringify({ id: 'evt_synthetic', object: 'event', type: 'invoice.paid', livemode: false, data: { object: invoice } })
  const signature = h.webhook.stripe.webhooks.generateTestHeaderString({ payload: body, secret: h.webhook.secret })
  assert.equal((await h.call('webhook', { body, headers: { 'stripe-signature': signature } })).status, 200)
  assert.equal(h.sessions, 0); assert.equal(h.ticks, 1); assert.equal(h.events, 1)
})
test('outer boundary retains wrong secret, identity, signature, partner-host and unrelated-path rejection', async () => {
  const h = boundary()
  assert.equal((await h.call('status', { headers: { 'x-benefitsi-corporate-proxy-secret': 'wrong' } })).status, 401)
  assert.equal((await h.call('status', { headers: { Authorization: 'Bearer wrong.jwt' } })).status, 401)
  assert.equal((await h.call('status', { headers: { Authorization: 'Bearer employee.jwt' } })).status, 403)
  assert.equal((await h.call('worker', { headers: { Authorization: 'Bearer wrong' } })).status, 401)
  assert.equal((await h.call('worker', { headers: { Authorization: workerSecret } })).status, 401)
  assert.equal((await h.call('webhook', { body: '{}', headers: { 'stripe-signature': 'wrong' } })).status, 400)
  for (const mode of ['setup', 'status', 'recovery', 'worker', 'webhook']) assert.equal((await h.call(mode, { host: 'partner.benefitsi.de' })).status, 403)
  for (const path of ['/api/corporate/billing/worker/extra', '/api/corporate/other', '/api/unrelated']) assert.equal((await h.call('worker', { path })).status, 401)
  assert.equal(h.ticks, 0); assert.equal(h.events, 0)
})
test('actual native net.http_post request crosses outer proxy and real worker handler', { skip: !process.env.CORPORATE_FINAL_EXPORT_DIR }, async () => {
  const data = JSON.parse(readFileSync(process.env.CORPORATE_FINAL_EXPORT_DIR + '/corporate-dispatch-contract.json'))
  const h = boundary(), request = data.request
  assert.equal(request.url, 'https://admin.benefitsi.de/api/corporate/billing/worker')
  assert.equal((await h.call('worker', { path: new URL(request.url).pathname, body: request.body, headers: request.headers })).status, 200)
  assert.equal(h.ticks, 1)
  for (const change of [{ body: { limit: 20 } }, { body: '[]' }, { headers: { Authorization: 'wrong' } }]) assert.ok([400, 401].includes((await h.call('worker', { body: request.body, headers: request.headers, ...change })).status))
  assert.equal(h.ticks, 1)
})
