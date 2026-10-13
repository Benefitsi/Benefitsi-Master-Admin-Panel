import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTypescript} from './helpers/load-typescript.mjs'

const merchant='acct_SandboxMerchant'
const input={bookingId:'booking-sandbox',reference:'TEST-123',accountId:merchant,totalAmount:1200,currency:'eur',email:'sandbox@example.test',expiresAt:Math.floor(Date.now()/1000)+3600,successUrl:'https://example.test/success',cancelUrl:'https://example.test/cancel',idempotencyKey:'sandbox-checkout-fixture-key'}
function setup(options={}){
 const {denied=false,sessionStatus='open'}=options
 const mode=Object.hasOwn(options,'mode')?options.mode:false
 const calls=[]
 const record=(kind,result)=>async(...args)=>{calls.push({kind,args});return result}
 const session={id:'cs_test_sandbox',object:'checkout.session',livemode:mode,status:sessionStatus}
 // Stripe Refund does not expose livemode. Its scope comes from the verified
 // test client and connected-account request option, never an invented field.
 const refund={id:'re_sandbox',object:'refund',payment_intent:'pi_sandbox',amount:1200,currency:'eur',status:'succeeded'}
 const stripe={v2:{core:{accounts:{retrieve:record('merchant',{id:merchant,livemode:false,dashboard:'full',defaults:{responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},configuration:{merchant:{capabilities:{card_payments:{status:'active'},stripe_balance:{payouts:{status:'active'}}}}}})}}},checkout:{sessions:{create:record('create',session),retrieve:record('retrieve',session),expire:record('expire',{...session,status:'expired'})}},refunds:{create:record('refund',refund),retrieve:record('read-refund',refund)}}
 const payments=loadTypescript('lib/stripe/direct-payments.ts',{
  '@/lib/stripe/booking-client':{getBookingStripeClient:async accountId=>{calls.push({kind:'guard',accountId});if(denied)throw new Error('scope-denied');return stripe}},
  '@/lib/stripe/config':{getStripeTestClient:()=>{calls.push({kind:'unguarded-legacy'});return stripe}},
 })
 return {...payments,calls}
}

test('direct checkout, retrieval, expiry and refunds await the merchant-scoped client',async()=>{
 const p=setup()
 assert.equal((await p.createDirectCheckout(input)).id,'cs_test_sandbox')
 assert.deepEqual(p.calls.map(x=>x.kind),['guard','merchant','create'])
 assert.equal(p.calls[0].accountId,merchant)
 assert.equal(p.calls[2].args[1].stripeAccount,merchant)
 p.calls.length=0
 await p.retrieveDirectCheckout('cs_test_sandbox',merchant)
 await p.expireDirectCheckout('cs_test_sandbox',merchant)
 await p.refundDirectPayment({paymentIntentId:'pi_sandbox',accountId:merchant,bookingId:'booking-sandbox',idempotencyKey:'sandbox-refund-fixture-key'})
 await p.retrieveDirectRefund('re_sandbox',merchant)
 assert.equal(p.calls.some(x=>x.kind==='unguarded-legacy'),false)
 for(const call of p.calls){if(call.kind==='guard')assert.equal(call.accountId,merchant);else assert.equal(call.args.at(-1).stripeAccount,merchant)}
 assert.ok(p.calls.findIndex(x=>x.kind==='guard')<p.calls.findIndex(x=>x.kind==='refund'))
})

test('denied merchant scope prevents every direct payment API call',async()=>{
 const p=setup({denied:true})
 for(const action of [()=>p.createDirectCheckout(input),()=>p.retrieveDirectCheckout('cs_test_sandbox',merchant),()=>p.expireDirectCheckout('cs_test_sandbox',merchant),()=>p.refundDirectPayment({paymentIntentId:'pi_sandbox',accountId:merchant,bookingId:'booking-sandbox',idempotencyKey:'sandbox-refund-fixture-key'}),()=>p.retrieveDirectRefund('re_sandbox',merchant)]){
  await assert.rejects(action,/scope-denied/)
 }
 assert.ok(p.calls.every(x=>x.kind==='guard'))
})

test('checkout responses with live or unconfirmed mode are rejected',async()=>{
 for(const mode of [true,undefined]){
  const p=setup({mode})
  for(const action of [()=>p.createDirectCheckout(input),()=>p.retrieveDirectCheckout('cs_test_sandbox',merchant)]){
   await assert.rejects(action)
  }
 }
})
