import assert from 'node:assert/strict'
import test from 'node:test'
import { actorId, partnerId, otherPartnerId, dealId, taskId, participationId, feature, settings, task, rights, offer } from './helpers/partner-tasks-fixtures.mjs'
const client = (response, entitlement = rights()) => ({ auth: { getUser: async () => ({ data: { user: { id: actorId, is_anonymous: false } } }) }, rpc: async name => name === 'get_partner_entitlements' ? { data: entitlement } : response })

test('settings reads the selected partner RPC and accepts nullable original candidate expiry', async () => {
  const api = feature('lib/partners/tasks.ts'), calls = []
  const c = client({ data: settings })
  const rpc = c.rpc
  c.rpc = async (name, params) => { calls.push({ name, params }); return rpc(name, params) }
  const result = await api.readPartnerTaskSettings(c, partnerId)
  assert.equal(result.available, true)
  assert.equal(result.settings.available_deals[0].expires_at, null)
  assert.equal(result.settings.tasks[0].revision, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), { name: 'get_partner_task_settings', params: { p_partner_id: partnerId } })
})

test('existing source reward titles retain their own bounds rather than the task-title limit', async () => {
  const api = feature('lib/partners/tasks.ts')
  const sourceTitle = 'Ein persönlicher bestehender Vorteil '.repeat(6)
  const value = { ...settings, available_deals: [{ ...settings.available_deals[0], title: sourceTitle }], tasks: [{ ...task, reward_offer: { ...offer, title: sourceTitle } }] }
  const result = await api.readPartnerTaskSettings(client({ data: value }), partnerId)
  assert.equal(result.settings.tasks[0].reward_offer.title, sourceTitle)
})

test('missing backend, denied capability and failed load remain distinct with no invented settings', async () => {
  const api = feature('lib/partners/tasks.ts')
  for (const code of ['PGRST202', '42883']) {
    const value = await api.readPartnerTaskSettings(client({ error: { code } }), partnerId)
    assert.equal(value.reason, 'backend_missing')
    assert.equal(value.settings, null)
  }
  const denied = await api.readPartnerTaskSettings(client({ data: settings }, rights('admin', false)), partnerId)
  assert.equal(denied.reason, 'access_denied')
  assert.equal(denied.canConfirm, true)
  await assert.rejects(() => api.readPartnerTaskSettings(client({ error: { code: '08006' } }), partnerId), /geladen/)
})

test('settings rejects malformed/cross-partner Tasks, candidates, dates and invented participation', async () => {
  const api = feature('lib/partners/tasks.ts')
  for (const invalid of [{ ...settings, partner_id: otherPartnerId }, { ...settings, available_deals: [{ ...settings.available_deals[0], id: 'bad' }] }, { ...settings, tasks: [{ ...task, partner_id: otherPartnerId }] }, { ...settings, tasks: [{ ...task, status: 'unknown' }] }, { ...settings, tasks: [{ ...task, starts_at: '2035-10-06T12:00' }] }, { ...settings, tasks: [{ ...task, revision: 0 }] }, { ...settings, tasks: [{ ...task, participation: {} }] }, { ...settings, tasks: [{ ...task, reward_offer: { ...offer, deal_id: otherPartnerId } }] }]) {
    await assert.rejects(() => api.readPartnerTaskSettings(client({ data: invalid }), partnerId), /Daten|geladen/)
  }
})

test('malformed array statuses cannot masquerade as contract enum strings', async () => {
  const api = feature('lib/partners/tasks.ts')
  await assert.rejects(() => api.readPartnerTaskSettings(client({ data: { ...settings, tasks: [{ ...task, status: ['active'] }] } }), partnerId), /Daten|geladen/)
})

test('consumer Task preserves frozen participation offer despite edited current reward id and time window', () => {
  const api = feature('lib/partners/tasks.ts')
  const receipt = { participation_id: participationId, task_id: taskId, partner_id: partnerId, title: 'Alte Zusage', description: 'Alte Anweisung', status: 'started', started_at: '2035-10-06T12:00:00Z', completion_deadline: '2035-11-05T12:00:00Z', reward_offer: offer, reward: null }
  const value = { ...task, title: receipt.title, description: receipt.description, revision: 2, reward_deal_id: otherPartnerId, ends_at: '2035-10-07T12:00:00Z', participation: receipt }
  const parsed = api.normalizePartnerTask(value, partnerId)
  assert.equal(parsed.reward_offer.deal_id, dealId)
  assert.equal(parsed.participation.completion_deadline, '2035-11-05T12:00:00Z')
  assert.throws(() => api.normalizePartnerTask({ ...value, reward_offer: { ...offer, title: 'Ausgetauscht' } }, partnerId), /Daten|geladen/)
})
