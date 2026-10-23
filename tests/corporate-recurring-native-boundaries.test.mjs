import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { moduleAt } from './helpers/corporate-recurring-fixtures.mjs'
const config = { apiKey: 're_synthetic', from: 'Synthetic Benefitsi <billing@example.test>', origin: 'https://example.test' }
test('all four actual native notification claims build/send and reclaim with unchanged issued time, body and fingerprint', { skip: !process.env.CORPORATE_FINAL_EXPORT_DIR }, async () => {
  const input = JSON.parse(readFileSync(process.env.CORPORATE_FINAL_EXPORT_DIR + '/corporate-notifications-contract.json'))
  const m = moduleAt('lib/corporate/notification-email.ts')
  assert.deepEqual(new Set(input.first.map(n => n.kind)), new Set(['contract_confirmation', 'renewal_notice', 'cancellation_confirmation', 'payment_action']))
  for (const n of input.first) {
    const email = m.buildCorporateEmail(n, config)
    const retry = input.reclaimed.find(r => r.notification_id === n.notification_id), repeated = m.buildCorporateEmail(retry, config)
    assert.equal(n.created_at, retry.created_at); assert.notEqual(n.updated_at, retry.updated_at)
    assert.equal(email.fingerprint, repeated.fingerprint); assert.equal(JSON.stringify(email.body), JSON.stringify(repeated.body)); assert.equal(email.idempotencyKey, repeated.idempotencyKey)
    for (const [notice, auth] of [[n, input.authorized.find(a => a.notification_id === n.notification_id)], [retry, input.reclaimed_authorized.find(a => a.notification_id === n.notification_id)]]) {
      const sent = [], results = [], now = () => Date.parse(notice.lease_expires_at) - 100000
      const rpc = async (name, args) => {
        if (name === 'claim_corporate_notifications') return { status: 'ok', notifications: [notice] }
        if (name === 'authorize_corporate_notification') { assert.equal(args.p_lease_token, notice.lease_token); return auth }
        assert.equal(name, 'record_corporate_notification_result'); results.push(args.p_result); return { status: 'recorded' }
      }
      assert.equal(await m.sendCorporateNotification(rpc, config, async (url, init) => { sent.push({ url, init }); return Response.json({ id: 'email_synthetic' }) }, now), 1)
      assert.equal(sent.length, 1); assert.equal(sent[0].init.body, JSON.stringify(email.body)); assert.equal(results[0].type, 'sent')
    }
    for (const [authorization, clock] of [[input.revoked[0], Date.parse(retry.lease_expires_at) - 100000], [input.reclaimed_authorized[0], Date.parse(retry.first_attempt_at) + 23 * 3600000]]) {
      let sends = 0
      const rpc = async name => name === 'claim_corporate_notifications' ? { status: 'ok', notifications: [retry] } : name === 'authorize_corporate_notification' ? authorization : { status: 'recorded' }
      assert.equal(await m.sendCorporateNotification(rpc, config, async () => { sends++; return Response.json({ id: 'unexpected' }) }, () => clock), 0)
      assert.equal(sends, 0)
    }
  }
})
