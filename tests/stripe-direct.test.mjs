import assert from 'node:assert/strict'
import test from 'node:test'

const base = {
  bookingId: '58f60c40-047f-47c9-b9c4-ab466c1c33ba', reference: 'B-123',
  accountId: 'acct_Merchant123', totalAmount: 4200, currency: 'eur',
  email: 'guest@example.test', expiresAt: '2026-09-22T10:35:00Z',
  successUrl: 'http://localhost:3011/commerce/success',
  cancelUrl: 'http://localhost:3011/commerce/cancelled', idempotencyKey: 'checkout-request-1234',
}
const now = Date.parse('2026-09-22T10:00:00Z')

test('direct checkout charges the merchant with zero platform money routing', async () => {
  const { buildDirectCheckout } = await import('../lib/stripe/direct-contracts.ts')
  const { params, options } = buildDirectCheckout(base, now)
  assert.deepEqual(options, { stripeAccount: 'acct_Merchant123', idempotencyKey: 'checkout-request-1234' })
  assert.equal(params.line_items[0].price_data.unit_amount, 4200)
  assert.equal(params.expires_at, 1790073300)
  assert.equal(params.metadata.benefitsi_commerce_booking_id, base.bookingId)
  assert.equal(params.payment_intent_data.metadata.benefitsi_commerce_booking_id, base.bookingId)
  assert.equal(params.payment_intent_data.application_fee_amount, undefined)
  assert.equal(params.payment_intent_data.transfer_data, undefined)
  assert.equal(params.payment_intent_data.on_behalf_of, undefined)
  assert.deepEqual(params.payment_method_types, ['card'])
})

test('direct checkout rejects missing account, invalid amounts and expired holds before Stripe', async () => {
  const { buildDirectCheckout } = await import('../lib/stripe/direct-contracts.ts')
  for (const invalid of [
    { accountId: '' }, { accountId: 'platform' }, { totalAmount: 0 },
    { totalAmount: 40.5 }, { currency: 'usd' }, { idempotencyKey: '' },
    { expiresAt: '2026-09-22T10:25:00Z' }, { email: 'bad-email' },
    { successUrl: 'http://untrusted.test/success' },
  ]) assert.throws(() => buildDirectCheckout({ ...base, ...invalid }, now))
})

test('legacy checkout uses separate metadata and the same direct-charge boundary', async () => {
  const { buildDirectCheckout } = await import('../lib/stripe/direct-contracts.ts')
  const { params } = buildDirectCheckout({ ...base, bookingSystem: 'legacy' }, now)
  assert.equal(params.metadata.benefitsi_booking_id, base.bookingId)
  assert.equal(params.metadata.benefitsi_commerce_booking_id, undefined)
})

test('an existing booking can replay the exact Stripe request after the initial creation window', async () => {
  const { buildDirectCheckout } = await import('../lib/stripe/direct-contracts.ts')
  const original = buildDirectCheckout(base, now)
  const retry = buildDirectCheckout({...base, idempotentReplay:true}, now + 6 * 60_000)
  assert.deepEqual(retry, original)
  assert.throws(() => buildDirectCheckout(base, now + 6 * 60_000))
  assert.throws(() => buildDirectCheckout({...base,idempotentReplay:true}, now + 36 * 60_000))
})

test('merchant onboarding cannot make Benefitsi the fee or loss collector', async () => {
  const { createTestMerchantAccount } = await import('../lib/stripe/connect.ts')
  let sent
  const stripe = { v2: { core: { accounts: { create: async (input) => { sent = input; return {id:'acct_Merchant123',livemode:false} } } } } }
  assert.equal(await createTestMerchantAccount(stripe, { providerId: base.bookingId, displayName:'Test Restaurant', supportEmail:null }), 'acct_Merchant123')
  assert.equal(sent.dashboard, 'full')
  assert.deepEqual(sent.defaults.responsibilities, { fees_collector: 'stripe', losses_collector: 'stripe' })
  assert.equal(sent.configuration.merchant.capabilities.card_payments.requested, true)
  assert.equal(sent.configuration.recipient, undefined)
  assert.equal(sent.identity.entity_type, undefined)
})

test('existing platform-liability or recipient-only accounts are blocked', async () => {
  const { retrieveMerchantAccountStatus } = await import('../lib/stripe/connect.ts')
  const good = { id:'acct_Merchant123', livemode:false, dashboard:'full', defaults:{responsibilities:{fees_collector:'stripe', losses_collector:'stripe'}}, configuration:{merchant:{capabilities:{card_payments:{status:'active'},stripe_balance:{payouts:{status:'active'}}}}} }
  const stripeFor = (account) => ({v2:{core:{accounts:{retrieve:async()=>account}}}})
  const status = await retrieveMerchantAccountStatus(stripeFor(good), good.id)
  assert.equal(status.chargesEnabled, true)
  assert.equal(status.payoutsEnabled, true)
  for (const bad of [
    {...good,livemode:true}, {...good,dashboard:'express'},
    {...good,defaults:{responsibilities:{fees_collector:'application',losses_collector:'application'}}},
    {...good,configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{status:'active'}}}}}},
  ]) await assert.rejects(retrieveMerchantAccountStatus(stripeFor(bad), good.id))
})

test('signed merchant events require the persisted account, currency, amount and session', async () => {
  const { validateDirectBookingEvent } = await import('../lib/stripe/direct-contracts.ts')
  const snapshot = { accountId:base.accountId,totalAmount:4200,currency:'eur',checkoutSessionId:'cs_test_123',paymentIntentId:'pi_123' }
  const event = { livemode:false, account:base.accountId,type:'checkout.session.completed',data:{object:{id:'cs_test_123',livemode:false,amount_total:4200,currency:'eur',payment_status:'paid',payment_intent:'pi_123'}} }
  assert.equal(validateDirectBookingEvent(event,snapshot), 'paid')
  assert.equal(validateDirectBookingEvent({...event,data:{object:{...event.data.object,payment_status:'unpaid'}}},snapshot),'pending')
  for (const invalid of [ {...event,account:undefined}, {...event,account:'acct_Other'}, {...event,livemode:true}, {...event,data:{object:{...event.data.object,currency:'usd'}}}, {...event,data:{object:{...event.data.object,amount_total:1}}}, {...event,data:{object:{...event.data.object,id:'cs_test_other'}}} ]) assert.throws(()=>validateDirectBookingEvent(invalid,snapshot))
  const refund = {...event,type:'charge.refunded',data:{object:{id:'ch_123',livemode:false,payment_intent:'pi_123',amount:4200,amount_refunded:1000,currency:'eur',refunded:false}}}
  assert.equal(validateDirectBookingEvent(refund,snapshot),'partial_refund')
  assert.equal(validateDirectBookingEvent({...refund,data:{object:{...refund.data.object,amount_refunded:4200,refunded:true}}},snapshot),'refunded')
})

test('owner onboarding callbacks return to the authenticated commerce flow', async () => {
 const {createMerchantOnboardingLink}=await import('../lib/stripe/connect.ts')
 let sent
 const account={id:'acct_Merchant123',livemode:false,dashboard:'full',defaults:{responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},configuration:{merchant:{capabilities:{card_payments:{status:'inactive'}}}}}
 const stripe={v2:{core:{accounts:{retrieve:async()=>account},accountLinks:{create:async input=>{sent=input;return {livemode:false,url:'https://connect.stripe.com/setup/test'}}}}}}
 const url=await createMerchantOnboardingLink(stripe,{accountId:account.id,providerId:base.bookingId,baseUrl:'http://localhost:3011',callbackPath:'/api/commerce/connect'})
 assert.equal(url,'https://connect.stripe.com/setup/test')
 assert.deepEqual(sent.use_case.account_onboarding.configurations,['merchant'])
 assert.equal(new URL(sent.use_case.account_onboarding.return_url).pathname,'/api/commerce/connect')
 assert.equal(new URL(sent.use_case.account_onboarding.refresh_url).searchParams.get('provider'),base.bookingId)
})

test('paid checkout cannot confirm without a refundable payment identity',async()=>{
 const {validateDirectBookingEvent}=await import('../lib/stripe/direct-contracts.ts')
 const snapshot={accountId:'acct_Merchant123',totalAmount:4200,currency:'eur',checkoutSessionId:'cs_test_123',paymentIntentId:null}
 const event={livemode:false,account:'acct_Merchant123',type:'checkout.session.completed',data:{object:{id:'cs_test_123',livemode:false,amount_total:4200,currency:'eur',payment_status:'paid',payment_intent:null}}}
 assert.throws(()=>validateDirectBookingEvent(event,snapshot))
})
