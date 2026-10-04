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
