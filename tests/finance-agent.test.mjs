import assert from 'node:assert/strict'
import test from 'node:test'
import { executeFinanceOperation, getFinanceAccess, parseFinanceStatus, parseFinanceRun, financeEndpoint } from '../lib/finance-agent.ts'

const access = { isAdmin: true, financeRead: true }
const run = { schemaVersion: 1, profile: 'benefitsi-finance', runId: 'bbe53155-1dd9-4911-af08-761c75697bdb',
  task: 'setup', status: 'blocked', startedAt: '2026-10-04T18:00:00Z', finishedAt: '2026-10-04T18:00:01Z',
  counts: { documents: 0, payments: 0, issues: 0, duplicateCandidates: 0 },
  tasks: [{ code: 'documents_missing', title: 'Belege fehlen.' }], sources: [], deadlines: [] }

test('finance access is derived from the existing permission RPC and fails closed', async () => {
  const calls = []
  const client = { rpc: async name => { calls.push(name); return { data: { finance_read: true }, error: null } } }
  assert.deepEqual(await getFinanceAccess(client, null), { isAdmin: false, financeRead: false })
  assert.deepEqual(calls, [])
  assert.deepEqual(await getFinanceAccess(client, { isAdmin: true }), access)
  assert.deepEqual(calls, ['get_my_analytics_permissions_v1'])
  assert.deepEqual(await getFinanceAccess({ rpc: async () => ({ data: { finance_read: true }, error: {} }) }, { isAdmin: true }), { isAdmin: true, financeRead: false })
  assert.deepEqual(await getFinanceAccess({ rpc: async () => { throw Error('private provider details') } }, { isAdmin: true }), { isAdmin: true, financeRead: false })
})

test('admin without explicit financeRead cannot call even the status or export bridge', async () => {
  let calls = 0
  for (const denied of [{ isAdmin: false, financeRead: true }, { isAdmin: true, financeRead: false }, { isAdmin: true }]) {
    for (const operation of ['status', 'setup', 'review', 'export']) {
      await assert.rejects(executeFinanceOperation(operation, {}, denied, async () => { calls++; return {} }), /Finanzberechtigung/)
    }
  }
  assert.equal(calls, 0)
})

test('setup passes only the fixed action profile task and request ID', async () => {
  const requests = []
  const result = await executeFinanceOperation('setup', { requestId: run.runId, path: '/etc/passwd', prompt: 'evil' }, access,
    async request => { requests.push(request); return run })
  assert.equal(result.status, 'blocked')
  assert.deepEqual(requests, [{ action: 'finance-run', schemaVersion: 1, profile: 'benefitsi-finance', task: 'setup', requestId: run.runId }])
})

test('missing request IDs invalid run IDs and unknown operations never dispatch', async () => {
  for (const [op, args] of [['setup', {}], ['export', { runId: '../secret', format: 'json' }], ['transfer', {}]]) {
    await assert.rejects(executeFinanceOperation(op, args, access, async () => { throw Error('should not dispatch') }), /Ungültig/)
  }
})

test('normalization preserves a blocked real run and rejects invented status evidence', () => {
  assert.equal(parseFinanceRun({ ...run, secret: 'private' }).status, 'blocked')
  assert.equal(JSON.stringify(parseFinanceRun({ ...run, secret: 'private' })).includes('private'), false)
  for (const bad of [{ ...run, status: 'success' }, { ...run, profile: 'ben' }, { ...run, finishedAt: null },
    { ...run, runId: '../../private' }, { ...run, counts: { ...run.counts, documents: null } }]) {
    assert.throws(() => parseFinanceRun(bad), /Ungültig/)
  }
})

test('status without a run stays startable without inventing a first completion', () => {
  const result = parseFinanceStatus({ schemaVersion: 1, profile: 'benefitsi-finance', service: 'startable',
    observedAt: '2026-10-04T18:00:00Z', lastRun: null, sources: [], rules: [] })
  assert.equal(result.lastRun, null)
  assert.equal(result.service, 'startable')
})

test('finance bridge rejects insecure or credential-bearing endpoints', () => {
  assert.equal(financeEndpoint('https://bridge.example.com').pathname, '/hermes/finance')
  for (const endpoint of ['http://bridge.example.com', 'https://user:pass@bridge.example.com', 'https://bridge.example.com?token=secret', 'file:///tmp/x']) {
    assert.throws(() => financeEndpoint(endpoint), /Bridge/)
  }
})

test('export is bound to requested run and format and raw export contents stay private', async () => {
  const result = await executeFinanceOperation('export', { runId: run.runId, format: 'csv' }, access,
    async () => ({ schemaVersion: 1, profile: 'benefitsi-finance', runId: run.runId, format: 'csv', content: 'id,amount\nr1,100.00\n' }))
  assert.equal(result.content, 'id,amount\nr1,100.00\n')
  await assert.rejects(executeFinanceOperation('export', { runId: run.runId, format: 'csv' }, access,
    async () => ({ schemaVersion: 1, profile: 'benefitsi-finance', runId: 'another-run', format: 'json', content: '{}' })), /Ungültig/)
})
