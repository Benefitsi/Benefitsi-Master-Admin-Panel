import assert from 'node:assert/strict'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'
const id='11111111-1111-4111-8111-111111111111',offer='22222222-2222-4222-8222-222222222222',slot='33333333-3333-4333-8333-333333333333'
const expiry=new Date(Date.now()+35*60_000).toISOString()
function setup({readError=false,state='hold',failAttach=false}={}) {
 const calls=[];let attempts=0,attachAttempts=0
 const hold={booking_id:id,public_reference:'TEST123',total_amount:1000,application_fee_amount:0,currency:'eur',stripe_account_id:'acct_Test',state}
 const persisted={id,state,offer_id:offer,slot_id:slot,quantity:1,customer_email:'test@example.test',hold_expires_at:expiry,stripe_checkout_session_id:null}
 const admin={rpc:async name=>name==='create_booking_hold'?{data:{...hold,replayed:attempts++>0,...(attempts===1?{hold_expires_at:expiry,offer_title:'Original title'}:{})}}:{error:failAttach&&attachAttempts++===0?{message:'temporary'}:null},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:persisted,error:readError?{message:'temporary'}:null})})})})}
 const session={id:'cs_test_123',status:'open',url:'https://checkout.stripe.com/test',livemode:false}
 const {POST}=loadTypescript('app/api/stripe/checkout/route.ts',{
  'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/stripe/config':{requireBookingProxySecret:()=> 'test-proxy-secret',requireBookingBaseUrl:()=> 'https://benefitsi.test'},
  '@/lib/stripe/direct-payments':{createDirectCheckout:async input=>{calls.push(input);return session},retrieveDirectCheckout:async()=>session},
  '@/lib/stripe/legacy-payments':{retrieveLegacyCheckout:async()=>({session})},
 })
 const request=()=>new Request('https://admin.test/api/stripe/checkout',{method:'POST',headers:{'x-benefitsi-booking-secret':'test-proxy-secret'},body:JSON.stringify({offerId:offer,slotId:slot,quantity:1,customerEmail:persisted.customer_email,idempotencyKey:'same-retry-key-123456789'})})
 return {post:()=>POST(request()),calls,persisted}
}
test('legacy attach failure recovers with persisted expiry and identical Stripe parameters',async()=>{
 const d=setup({failAttach:true});assert.equal((await d.post()).status,500)
 assert.equal((await d.post()).status,201);assert.equal(d.calls.length,2)
 assert.equal(d.calls[1].expiresAt,expiry);assert.equal(d.calls[1].idempotentReplay,true)
 const {buildDirectCheckout}=loadTypescript('lib/stripe/direct-contracts.ts')
 assert.deepEqual(JSON.parse(JSON.stringify(buildDirectCheckout(d.calls[0]))),JSON.parse(JSON.stringify(buildDirectCheckout(d.calls[1]))))
})
test('failed snapshot read and inactive holds cannot create new payments',async()=>{
 for(const options of [{readError:true},{state:'cancelled'},{state:'confirmed'}]) {
  const d=setup(options);assert.ok((await d.post()).status>=400);assert.equal(d.calls.length,0)
 }
})
