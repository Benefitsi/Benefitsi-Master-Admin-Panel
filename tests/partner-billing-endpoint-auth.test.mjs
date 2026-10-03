import assert from 'node:assert/strict'
import test from 'node:test'
import Stripe from 'stripe'
import { loadTypescript } from './helpers/load-typescript.mjs'

test('cookie-independent billing webhook still validates the real Stripe signature and environment', async t => {
  const environment = {
    BENEFITSI_PARTNER_BILLING_ENABLED: 'true',
    BENEFITSI_PARTNER_BILLING_ENVIRONMENT: 'test',
    BENEFITSI_PARTNER_STRIPE_SECRET_KEY: 'sk_test_local_fixture',
    BENEFITSI_PARTNER_BILLING_WEBHOOK_SECRET: 'whsec_local_fixture',
  }
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]))
  Object.assign(process.env, environment)
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
  const billing = loadTypescript('lib/stripe/partner-billing.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => { throw Error('unexpected privileged access') } },
    '@/lib/supabase/server': {},
    '@/lib/stripe/config': {},
    './partner-billing-contracts': {},
    './partner-billing-provider': {},
    './partner-founder': {},
  }, { Error })
  const route = loadTypescript('app/api/stripe/partner-billing/webhook/route.ts', {
    '@/lib/stripe/partner-billing': billing,
  }, { Response, Error })
  const stripe = new Stripe(environment.BENEFITSI_PARTNER_STRIPE_SECRET_KEY)
  const request = (body, signature) => new Request('https://admin.benefitsi.de/api/stripe/partner-billing/webhook', {
    method: 'POST', body, headers: signature ? { 'stripe-signature': signature } : {},
  })
  const payload = JSON.stringify({ id: 'evt_fixture', type: 'unhandled.fixture', livemode: false, data: { object: {} } })
  const signed = body => stripe.webhooks.generateTestHeaderString({ payload: body, secret: environment.BENEFITSI_PARTNER_BILLING_WEBHOOK_SECRET })
  assert.equal((await route.POST(request(payload))).status, 400)
  assert.equal((await route.POST(request(payload, 'forged'))).status, 400)
  assert.equal((await route.POST(request(`${payload} `, signed(payload)))).status, 400)
  const live = JSON.stringify({ id: 'evt_live', type: 'unhandled.fixture', livemode: true, data: { object: {} } })
  assert.equal((await route.POST(request(live, signed(live)))).status, 400)
  const valid = await route.POST(request(payload, signed(payload)))
  assert.equal(valid.status, 200)
  assert.deepEqual(await valid.json(), { ignored: true })
})

test('cookie-independent reconciliation requires the configured bearer secret', async t => {
  const previous = process.env.BENEFITSI_PARTNER_BILLING_RECONCILE_SECRET
  const secret = 'a'.repeat(32)
  process.env.BENEFITSI_PARTNER_BILLING_RECONCILE_SECRET = secret
  t.after(() => { if (previous === undefined) delete process.env.BENEFITSI_PARTNER_BILLING_RECONCILE_SECRET; else process.env.BENEFITSI_PARTNER_BILLING_RECONCILE_SECRET = previous })
  const route = loadTypescript('app/api/stripe/partner-billing/reconcile/route.ts', {
    '@/lib/stripe/partner-billing': { reconcileAllPartnerBilling: async () => ({ checked: 0, failed: 0 }) },
  }, { Response })
  for (const provided of ['', 'wrong', 'é'.repeat(32), secret]) {
    const response = await route.POST(new Request('https://admin.benefitsi.de/api/stripe/partner-billing/reconcile', {
      method: 'POST', headers: { authorization: `Bearer ${provided}` },
    }))
    assert.equal(response.status, provided === secret ? 200 : 401)
  }
})
