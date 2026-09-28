import assert from 'node:assert/strict'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'
const booking={id:'booking-123',stripe_account_id:'acct_Merchant',total_amount:1200,currency:'eur',stripe_checkout_session_id:'cs_test_123',stripe_payment_intent_id:'pi_123'}
const intent={id:'pi_123',livemode:false,amount:1200,currency:'eur',metadata:{benefitsi_booking_id:booking.id},transfer_data:{destination:booking.stripe_account_id}}
const session={id:'cs_test_123',livemode:false,mode:'payment',amount_total:1200,currency:'eur',payment_intent:'pi_123',metadata:{benefitsi_booking_id:booking.id},status:'complete',payment_status:'paid'}
function setup(event,{pi=intent,invalidSignature=false}={}) {
 const writes=[],tables=[],filters=[]
 const admin={from:table=>{tables.push(table);return {select:()=>({eq:(key,value)=>{
  filters.push([key,value]);return {maybeSingle:async()=>({data:booking[key]===value?booking:null,error:null})}
 }})}},rpc:async(name,args)=>{writes.push({name,args});return {error:null}}}
 const {POST}=loadTypescript('app/api/stripe/webhook/route.ts',{
  'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/stripe/config':{verifyBookingWebhook:()=>{if(invalidSignature)throw Error('bad signature');return event},getStripeTestClient:()=>({paymentIntents:{retrieve:async()=>pi}})},
  '@/lib/commerce/service':{settleCancellation:async()=>assert.fail('not a commerce refund')},
 })
 return {writes,tables,filters,post:()=>POST(new Request('https://admin.test/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':'test'},body:'signed event fixture'}))}
}
test('signed pre-cutover payment and refund events reconcile the exact stored legacy objects',async()=>{
 const events=[{type:'checkout.session.completed',object:session},{type:'charge.refunded',object:{id:'ch_123',livemode:false,payment_intent:'pi_123',amount:1200,currency:'eur',amount_refunded:1200,refunded:true}}]
 for(const {type,object} of events){
  const d=setup({id:'evt_123',type,livemode:false,data:{object}});assert.equal((await d.post()).status,200)
  assert.equal(d.writes.length,1);assert.equal(d.writes[0].name,'apply_stripe_booking_event')
  assert.equal(d.writes[0].args.p_stripe_account_id,null);assert.equal(d.writes[0].args.p_booking_id,booking.id)
  assert.deepEqual(d.tables,['bookings'])
 }
})
test('unrelated, forged, commerce and wrong-destination platform events never change bookings',async()=>{
 const base={id:'evt_123',type:'checkout.session.completed',livemode:false,data:{object:session}}
 for(const [event,options] of [
  [{...base,data:{object:{...session,id:'cs_test_other'}}},{}],
  [{...base,data:{object:{...session,metadata:{benefitsi_commerce_booking_id:booking.id}}}},{}],
  [base,{invalidSignature:true}],
  [base,{pi:{...intent,transfer_data:{destination:'acct_Other'}}}],
 ]){
  const d=setup(event,options);await d.post();assert.equal(d.writes.length,0)
 }
})
test('both booking endpoint signatures are accepted; billing or unsigned payloads are rejected',()=>{
 const keys=['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_LEGACY_WEBHOOK_SECRET']
 const before=keys.map(key=>process.env[key])
 try {
  process.env.STRIPE_SECRET_KEY='sk_test_'+'local_signature_fixture'
  process.env.STRIPE_WEBHOOK_SECRET='whsec_'+'connected_fixture'
  process.env.STRIPE_LEGACY_WEBHOOK_SECRET='whsec_'+'historical_fixture'
  const {getStripeTestClient,verifyBookingWebhook}=loadTypescript('lib/stripe/config.ts')
  const stripe=getStripeTestClient(),payload=JSON.stringify({id:'evt_test',livemode:false,type:'charge.refunded'})
  for(const secret of [process.env.STRIPE_WEBHOOK_SECRET,process.env.STRIPE_LEGACY_WEBHOOK_SECRET]) {
   const signature=stripe.webhooks.generateTestHeaderString({payload,secret})
   assert.equal(verifyBookingWebhook(payload,signature).id,'evt_test')
  }
  const billing=stripe.webhooks.generateTestHeaderString({payload,secret:'whsec_'+'billing_fixture'})
  assert.throws(()=>verifyBookingWebhook(payload,billing));assert.throws(()=>verifyBookingWebhook(payload,''))
 } finally {keys.forEach((key,i)=>before[i]===undefined?delete process.env[key]:process.env[key]=before[i])}
})
