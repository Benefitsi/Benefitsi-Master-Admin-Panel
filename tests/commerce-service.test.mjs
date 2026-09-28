import assert from 'node:assert/strict'
import test from 'node:test'
import { checkoutBooking, recoverableCheckout } from '../lib/commerce/checkout.ts'
const booking={id:'booking-1',public_reference:'ABC123',public_token:'a'.repeat(64),state:'pending',payment_method:'online',payment_state:'pending',total_amount:2400,currency:'eur',stripe_account_id:'acct_Merchant',hold_expires_at:'2027-01-01T12:35:00Z',customer:{email:'a@example.de'}}
function deps(overrides={}) { return {readSession:async()=>({url:'https://checkout.stripe.com/c/pay/retry',status:'open'}),createSession:async()=>({id:'cs_test_1',url:'https://checkout.stripe.com/c/pay/1'}),attachSession:async()=>{},expireSession:async()=>{},...overrides} }
test('offline reservation confirms without invoking Stripe',async()=>{
 const result=await checkoutBooking({ok:true,booking:{...booking,payment_method:'pay_on_site',state:'confirmed'}},'https://benefitsi.de',deps({createSession:()=>{throw Error('must not invoke')}}))
 assert.equal(result.booking.state,'confirmed');assert.equal(result.checkout_url,undefined)
})
test('checkout uses the database snapshot and scoped merchant, exposes no account or contacts',async()=>{
 let input
 const result=await checkoutBooking({booking},'https://benefitsi.de',deps({createSession:async value=>{input=value;return {id:'cs_test_1',url:'https://checkout.stripe.com/c/pay/1'}}}))
 assert.equal(input.accountId,'acct_Merchant');assert.equal(input.totalAmount,2400);assert.equal(input.idempotencyKey,'commerce-checkout-booking-1')
 assert.match(input.successUrl,/buchung\/ABC123/);assert.equal(result.booking.customer,undefined)
})
test('retries reuse attached Checkout and do not create a second payment',async()=>{
 const result=await checkoutBooking({replayed:true,booking:{...booking,stripe_checkout_session_id:'cs_existing'}},'https://benefitsi.de',deps({createSession:()=>{throw Error('duplicate')}}))
 assert.equal(result.checkout_url,'https://checkout.stripe.com/c/pay/retry')
})
test('failed database attachment expires the checkout before surfacing failure',async()=>{
 let expired=false
 await assert.rejects(()=>checkoutBooking({booking},'https://benefitsi.de',deps({attachSession:async()=>{throw Error('attach')},expireSession:async()=>{expired=true}})))
 assert.equal(expired,true)
})
test('a paid or cancelled replay never starts a new checkout',async()=>{
 for(const state of ['confirmed','cancelled','completed']) {
 const result=await checkoutBooking({booking:{...booking,state,payment_state:state==='confirmed'?'paid':'pending'}},'https://benefitsi.de',deps({createSession:()=>{throw Error('must not invoke')}}))
 assert.equal(result.checkout_url,undefined)
 }
})

test('an expired Stripe replay is never returned as a usable checkout',async()=>{
 let expired=false
 await assert.rejects(()=>checkoutBooking({booking},'https://benefitsi.de',deps({createSession:async()=>({id:'cs_test_old',url:'https://checkout.stripe.com/c/pay/old',status:'expired'}),readSession:async()=>({id:'cs_test_old',url:null,status:'expired'}),expireSession:async()=>{expired=true}})))
 assert.equal(expired,true)
})

test('cached create responses are rechecked against current Stripe session state',async()=>{
 let attached=false
 await assert.rejects(()=>checkoutBooking({booking},'https://benefitsi.de',deps({readSession:async()=>({id:'cs_test_1',url:null,status:'expired'}),attachSession:async()=>{attached=true}})))
 assert.equal(attached,false)
})

test('Stripe failure after database commit keeps the guest capability available for recovery',async()=>{
 const result=await recoverableCheckout({replayed:true,booking},'https://benefitsi.de',deps({createSession:async()=>{throw Error('private stripe error')}}))
 assert.equal(result.booking.public_token,booking.public_token)
 assert.equal(result.booking.public_reference,booking.public_reference)
 assert.equal(result.booking.customer,undefined)
 assert.equal(result.checkout_url,undefined)
 assert.ok(result.checkout_error)
 assert.doesNotMatch(result.checkout_error,/private stripe/)
})

test('an authoritative replay retains its original expiry and Stripe idempotency key',async()=>{
 let input
 await recoverableCheckout({replayed:true,booking},'https://benefitsi.de',deps({createSession:async value=>{input=value;return {id:'cs_test_1',url:'https://checkout.stripe.com/c/pay/1'}}}))
 assert.equal(input.idempotentReplay,true)
 assert.equal(input.expiresAt,booking.hold_expires_at)
 assert.equal(input.idempotencyKey,'commerce-checkout-booking-1')
})

test('an attached checkout expired at Stripe releases its booking instead of offering a dead resume',async()=>{
 let released=false
 const response=await recoverableCheckout({booking:{...booking,stripe_checkout_session_id:'cs_test_expired'}},'https://benefitsi.de',deps({readSession:async()=>({id:'cs_test_expired',url:null,status:'expired'}),expireSession:async()=>{released=true}}))
 assert.equal(released,true)
 assert.equal(response.checkout_url,undefined)
})
