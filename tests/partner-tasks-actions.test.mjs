import assert from 'node:assert/strict'
import test from 'node:test'
import { actorId, partnerId, otherPartnerId, participationId, taskId, dealId, token, form, actionHarness, preview, summary, settings, task } from './helpers/partner-tasks-fixtures.mjs'
const plain = value => JSON.parse(JSON.stringify(value))
const tokenForm = overrides => form({ token, participation_id: participationId, ...overrides })

test('save sends exact same-user p_task with trimmed fields, expected revision and UTC instants', async () => {
  const h = actionHarness()
  const result = await h.actions.savePartnerTaskAction({}, form())
  assert.equal(result.ok, true)
  assert.equal(result.actorId, actorId)
  assert.deepEqual(plain(h.calls.find(c => c.name === 'save_partner_task')), { name: 'save_partner_task', params: { p_partner_id: partnerId, p_task: { id: taskId, revision: 1, title: 'Probiertag', description: 'Teilnahme vor Ort bestätigen lassen.', kind: 'partner_confirmed', status: 'active', reward_deal_id: dealId, starts_at: '2035-10-06T12:00:00.000Z', ends_at: '2035-12-01T12:00:00.000Z', max_participants: 10 } } })
  assert.equal(result.task.revision, 2)
  assert.deepEqual(h.revalidated, ['/partner'])
})

test('invalid task form values never reach mutation', async () => {
  for (const invalid of [{ title: ' ' }, { title: 'x'.repeat(121) }, { description: 'x'.repeat(1001) }, { kind: 'follow' }, { status: 'done' }, { revision: '1.5' }, { id: 'not-uuid' }, { starts_at: '2035-10-06T14:00' }, { ends_at: '2030-01-01T00:00:00Z' }, { max_participants: '0' }, { max_participants: '2.5' }, { reward_deal_id: '' }]) {
    const h = actionHarness()
    assert.equal((await h.actions.savePartnerTaskAction({}, form(invalid))).ok, false, JSON.stringify(invalid))
    assert.equal(h.calls.some(c => c.name === 'save_partner_task'), false)
  }
})

test('forged hexadecimal and exponent integer fields cannot mutate task revision or capacity', async () => {
  for (const invalid of [{ revision: '0x1' }, { max_participants: '0x10' }, { max_participants: '1e1' }]) {
    const h = actionHarness()
    assert.equal((await h.actions.savePartnerTaskAction({}, form(invalid))).ok, false, JSON.stringify(invalid))
    assert.equal(h.calls.some(c => c.name === 'save_partner_task'), false)
  }
})

test('forged missing/foreign/anonymous/scanner/Free-admin/changed-actor direct saves deny without mutation', async () => {
  for (const options of [{ session: null }, { session: { user: { id: actorId }, isAdmin: false, partnerIds: [otherPartnerId] } }, { user: { id: actorId, is_anonymous: true } }, { role: 'scanner' }, { role: 'admin', featureEnabled: false }, { user: { id: otherPartnerId } }]) {
    const h = actionHarness(options)
    assert.equal((await h.actions.savePartnerTaskAction({}, form())).ok, false)
    assert.equal(h.calls.some(c => c.name === 'save_partner_task'), false)
    assert.equal(h.revalidated.length, 0)
  }
})

test('missing RPC and stale revision do not revalidate or fabricate a saved task', async () => {
  for (const error of [{ code: 'PGRST202' }, { code: '42883' }, { message: 'task_revision_conflict' }]) {
    const h = actionHarness({ respond: () => ({ error, data: null }) })
    const result = await h.actions.savePartnerTaskAction({}, form())
    assert.equal(result.ok, false)
    assert.equal(result.code, error.message ? 'revision_conflict' : 'backend_missing')
    assert.equal(result.task, undefined)
    assert.deepEqual(h.revalidated, [])
  }
})

test('reload returns the actual server revision without altering the pending client draft', async () => {
  const h = actionHarness({ respond: name => ({ data: name === 'get_partner_task_settings' ? { ...settings, tasks: [{ ...task, revision: 2, title: 'Serveränderung' }] } : null }) })
  const result = await h.actions.reloadPartnerTaskSettings({}, form())
  assert.equal(result.ok, true)
  assert.equal(result.initial.settings.tasks[0].revision, 2)
  assert.equal(result.initial.actorId, actorId)
})

test('token preview never grants; deliberate confirm rechecks trusted identity and re-previews before grant', async () => {
  const h = actionHarness()
  assert.equal((await h.actions.previewPartnerTaskAction({}, tokenForm())).ok, true)
  assert.equal(h.calls.some(c => c.name === 'confirm_partner_task'), false)
  h.calls.length = 0
  assert.equal((await h.actions.confirmPartnerTaskAction({ preview: { ...preview, partner_id: otherPartnerId } }, tokenForm())).ok, true)
  assert.deepEqual(h.calls.map(c => c.name), ['get_partner_entitlements', 'preview_partner_task_confirmation', 'confirm_partner_task'])
  assert.deepEqual(plain(h.calls.at(-1).params), { p_token: token })
})

test('confirmation after downgrade permits trusted management but denies scanner, expired membership and wrong participation before grant', async () => {
  for (const role of ['owner', 'admin', 'benefitsi_admin']) {
    const h = actionHarness({ role, featureEnabled: false })
    assert.equal((await h.actions.confirmPartnerTaskAction({}, tokenForm())).ok, true, role)
  }
  for (const options of [{ role: 'scanner' }, { role: 'suspended' }, { respond: name => name === 'preview_partner_task_confirmation' ? { data: { ...preview, participation_id: taskId } } : { data: summary } }, { respond: name => name === 'preview_partner_task_confirmation' ? { data: { ...preview, partner_id: otherPartnerId } } : { data: summary } }]) {
    const h = actionHarness(options)
    assert.equal((await h.actions.confirmPartnerTaskAction({}, tokenForm())).ok, false)
    assert.equal(h.calls.some(c => c.name === 'confirm_partner_task'), false)
  }
  const expired = actionHarness()
  expired.client.rpc = async name => { expired.calls.push({ name }); return { error: { code: '42501', message: 'partner_access_denied' } } }
  assert.equal((await expired.actions.confirmPartnerTaskAction({}, tokenForm())).ok, false)
  assert.equal(expired.calls.some(c => c.name === 'confirm_partner_task'), false)
})

test('confirmation rejects wrong purpose and expired started tokens but permits a completed retry after token expiry', async () => {
  for (const bad of ['benefitsi-checkout:77777777-7777-4777-8777-777777777777', token + ' ', 'benefitsi-task:not-a-uuid']) {
    const h = actionHarness()
    assert.equal((await h.actions.previewPartnerTaskAction({}, tokenForm({ token: bad }))).ok, false)
    assert.equal(h.calls.length, 0)
  }
  for (const status of ['started', 'completed']) {
    const h = actionHarness({ respond: name => name === 'preview_partner_task_confirmation' ? { data: { ...preview, status, expires_at: '2020-01-01T00:00:00Z' } } : { data: summary } })
    assert.equal((await h.actions.confirmPartnerTaskAction({}, tokenForm())).ok, status === 'completed')
    assert.equal(h.calls.some(c => c.name === 'confirm_partner_task'), status === 'completed')
  }
})
