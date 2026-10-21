import assert from 'node:assert/strict'
import test from 'node:test'
import adminData from '../lib/admin-data.ts'

const { getDashboardData } = adminData

function database({ reply, count = 300 } = {}) {
  const calls = []
  const partners = Array.from({ length: count }, (_, index) => ({
    id: `partner-${index}`, name: `Synthetic business ${index}`, city_id: null,
    owner_id: null, slug: `business-${index}`, status: 'active', is_active: true,
  }))
  const client = {
    from(table) {
      const result = { data: table === 'partners' ? partners : [], error: null }
      return {
        select() { return this }, order() { return this }, limit() { return this }, eq() { return this },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) },
      }
    },
    async rpc(name, args) {
      assert.equal(name, 'get_partner_entitlements')
      calls.push(args.p_partner_id)
      return reply ? reply(args.p_partner_id) : {
        error: null,
        data: { schema_version: 1, partner_id: args.p_partner_id, role: 'benefitsi_admin',
          plan_code: 'pro', features: { 'media.rich': true, 'menu.ai_import': true } },
      }
    },
  }
  return { client, calls }
}

test('listing 300 businesses does not calculate 300 partner entitlements', async () => {
  const db = database()
  const dashboard = await getDashboardData(db.client)
  assert.equal(dashboard.partners.length, 300)
  assert.deepEqual(db.calls, [])
  assert.deepEqual(dashboard.errors, [])
  assert.equal(dashboard.partners[0].media_rich_enabled, undefined)
})

test('opening an editor loads only that partner and leaves other rights unknown', async () => {
  const db = database()
  const dashboard = await getDashboardData(db.client, { entitlementPartnerId: 'partner-42' })
  assert.deepEqual(db.calls, ['partner-42'])
  assert.equal(dashboard.partners[42].media_rich_enabled, true)
  assert.equal(dashboard.partners[42].menu_ai_import_enabled, true)
  assert.equal(dashboard.partners[0].media_rich_enabled, undefined)
})

test('the explicitly requested default editor loads only the first business', async () => {
  const db = database()
  const dashboard = await getDashboardData(db.client, { entitlementPartnerId: null })
  assert.deepEqual(db.calls, ['partner-0'])
  assert.equal(dashboard.partners[0].media_rich_enabled, true)
})

test('an unknown partner never causes a scan of all partner rights', async () => {
  const db = database()
  await getDashboardData(db.client, { entitlementPartnerId: 'not-visible' })
  assert.deepEqual(db.calls, [])
})

test('rights belonging to another partner cannot enable selected business features', async () => {
  const db = database({ reply: () => ({ error: null, data: {
    schema_version: 1, partner_id: 'other', role: 'benefitsi_admin', plan_code: 'pro',
    features: { 'media.rich': true, 'menu.ai_import': true },
  } }) })
  const dashboard = await getDashboardData(db.client, { entitlementPartnerId: 'partner-42' })
  assert.deepEqual(db.calls, ['partner-42'])
  assert.notEqual(dashboard.partners[42].media_rich_enabled, true)
  assert.notEqual(dashboard.partners[42].menu_ai_import_enabled, true)
  assert.equal(dashboard.errors.length, 1)
})

test('a failed rights request retains profiles and reports unavailable rights without retrying every partner', async () => {
  const db = database({ reply: () => { throw new Error('temporary upstream failure') } })
  const dashboard = await getDashboardData(db.client, { entitlementPartnerId: 'partner-42' })
  assert.deepEqual(db.calls, ['partner-42'])
  assert.equal(dashboard.partners.length, 300)
  assert.notEqual(dashboard.partners[42].media_rich_enabled, true)
  assert.equal(dashboard.errors.length, 1)
})

// Exercise the actual preview loader and the same status helper as the client.
import { micrositeOpeningStatus } from '../lib/microsite-opening-hours.ts'
function previewDatabase({ failedTable = '', proof = {} } = {}) {
  const rows = { partners: [{id:'preview-partner', name:'Preview'}], partner_opening_hours: [{partner_id:'preview-partner', weekday:5, opens_at:'09:00', closes_at:'18:00', is_closed:false, ...proof}] }
  return { from(table) {
    const q = { select(){return q}, order(){return q}, limit(){return q}, eq(){return q}, then(resolve,reject){return Promise.resolve({data:table===failedTable?null:rows[table]||[], error:table===failedTable?{message:'schedule read failed'}:null}).then(resolve,reject)} }
    return q
  } }
}
for (const failedTable of ['partner_holidays', 'partner_opening_hours']) test(`preview keeps ${failedTable} failure through to unknown status`, async () => {
  const dashboard = await getDashboardData(previewDatabase({failedTable}), {includeActivity:false})
  const partner = dashboard.partners[0]
  assert.ok(dashboard.errors.includes('schedule read failed'))
  const result = micrositeOpeningStatus(partner.opening_hours, partner.opening_status_unavailable ? null : partner.holidays, new Date('2026-10-16T08:00:00Z'))
  assert.equal(result.state, 'unknown')
  assert.equal(partner.opening_status_unavailable, true)
})
test('preview keeps managed raw hours editable while live status rejects stale proof', async () => {
  const proof = {source_id:'managed-source',verification_status:'VERIFIED',last_verified_at:'2026-01-01T00:00:00Z',freshness_ttl_days:30}
  const dashboard = await getDashboardData(previewDatabase({proof}), {includeActivity:false})
  const partner = dashboard.partners[0]
  assert.equal(partner.opening_hours[0].opens_at, '09:00')
  assert.equal(partner.opening_hours[0].source_id, 'managed-source')
  assert.equal(micrositeOpeningStatus(partner.opening_hours, partner.holidays, new Date('2026-10-16T08:00:00Z')).state, 'unknown')
})

import { publicPartnerOpeningHour } from '../lib/microsite-opening-hours.ts'
test('preview and public freshness projection produce identical states for the same managed rows', async () => {
  const now = new Date('2026-10-16T08:00:00Z')
  const managed = {source_id:'managed-source',last_verified_at:'2026-10-15T08:00:00Z',verification_status:'VERIFIED',freshness_ttl_days:2}
  for (const [proof, expected] of [
    [{}, 'open'], [managed, 'open'], [{...managed, freshness_ttl_days:1}, 'unknown'],
    [{...managed, verification_status:'NEEDS_REVIEW'}, 'unknown'],
    [{...managed, last_verified_at:'2026-01-01T00:00:00Z'}, 'unknown'],
    [{...managed, last_verified_at:null}, 'unknown'],
  ]) {
    const dashboard = await getDashboardData(previewDatabase({proof}), {includeActivity:false})
    const partner = dashboard.partners[0]
    const preview = micrositeOpeningStatus(partner.opening_hours, partner.holidays, now)
    const publicProjection = partner.opening_hours.filter(row => publicPartnerOpeningHour(row, now))
    assert.equal(preview.state, expected)
    assert.deepEqual(preview, micrositeOpeningStatus(publicProjection, partner.holidays, now))
    assert.equal(partner.opening_hours.length, 1, 'editing retains even rejected raw rows')
  }
})
