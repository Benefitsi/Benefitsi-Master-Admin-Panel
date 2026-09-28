import assert from 'node:assert/strict'
import test from 'node:test'

test('late paid event and replay attempt the same pending merchant refund',async()=>{
 const {settleCommercePayment}=await import('../lib/stripe/commerce-event.ts')
 const attempts=[]
 const result={ok:true,booking:{id:'booking-123',payment_state:'refund_pending'}}
 await settleCommercePayment(result,async id=>{attempts.push(id)})
 await settleCommercePayment({...result,duplicate:true},async id=>{attempts.push(id)})
 assert.deepEqual(attempts,['booking-123','booking-123'])
})
test('transient refund error propagates so Stripe retries delivery',async()=>{
 const {settleCommercePayment}=await import('../lib/stripe/commerce-event.ts')
 await assert.rejects(()=>settleCommercePayment({ok:true,booking:{id:'booking-123',payment_state:'refund_pending'}},async()=>{throw Error('stripe-temporarily-unavailable')}),/stripe-temporarily-unavailable/)
})
test('settled or unrelated events never issue another merchant refund',async()=>{
 const {settleCommercePayment}=await import('../lib/stripe/commerce-event.ts')
 for(const state of ['paid','pending','refunded','failed'])await settleCommercePayment({ok:true,booking:{id:'booking-123',payment_state:state}},async()=>{assert.fail('unexpected refund')})
})
