import assert from 'node:assert/strict'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const booking={id:'booking-123',stripe_account_id:'acct_Merchant',total_amount:1200,currency:'eur',stripe_checkout_session_id:'cs_test_123',stripe_payment_intent_id:'pi_123',stripe_refund_id:null}
const intent={id:'pi_123',livemode:false,amount:1200,currency:'eur',metadata:{benefitsi_booking_id:booking.id},transfer_data:{destination:booking.stripe_account_id}}
const session={id:'cs_test_123',livemode:false,mode:'payment',amount_total:1200,currency:'eur',payment_intent:'pi_123',metadata:{benefitsi_booking_id:booking.id},status:'complete',payment_status:'paid'}
const missing=()=>Object.assign(Error('No such resource'),{code:'resource_missing'})
function setup({platform=true,pi=intent,checkout=session,directError,refundFailure,refund={id:'re_123',payment_intent:'pi_123'}}={}) {
 const calls=[]
 const retrieve=kind=>async(id,params,options)=>{
  calls.push({kind,id,options})
  if(options?.stripeAccount&&(platform||directError))throw directError||missing()
  return kind==='intent'?pi:checkout
 }
 const stripe={paymentIntents:{retrieve:retrieve('intent')},checkout:{sessions:{retrieve:retrieve('session')}},refunds:{
  create:async(params,options)=>{calls.push({kind:'refund',params,options});if(refundFailure)throw refundFailure;return refund},
  retrieve:async(id,params,options)=>{calls.push({kind:'retrieve-refund',id,options});return refund},
 }}
 const api=loadTypescript('lib/stripe/legacy-payments.ts',{'@/lib/stripe/config':{getStripeTestClient:()=>stripe}})
 return {...api,calls}
}
test('historical destination payments are refunded on the platform with the original idempotency contract',async()=>{
 const d=setup();const refund=await d.refundLegacyPayment(booking)
 assert.equal(refund.id,'re_123')
 const call=d.calls.find(c=>c.kind==='refund')
 assert.equal(call.options.stripeAccount,undefined);assert.equal(call.options.idempotencyKey,`benefitsi-refund-${booking.id}`)
 assert.equal(call.params.payment_intent,'pi_123');assert.equal(call.params.reverse_transfer,undefined)
})
test('new legacy direct payments stay on the connected account',async()=>{
 const d=setup({platform:false,pi:{...intent,transfer_data:null}});await d.refundLegacyPayment(booking)
 assert.equal(d.calls.find(c=>c.kind==='refund').options.stripeAccount,booking.stripe_account_id)
 assert.equal(d.calls.filter(c=>c.kind==='intent').length,1)
})
test('scope fallback is forbidden for network errors, validation failures and refund failures',async()=>{
 const d=setup({directError:Error('network')});await assert.rejects(d.refundLegacyPayment(booking));assert.equal(d.calls.length,1)
 const bad=setup({platform:false,pi:{...intent,amount:1}});await assert.rejects(bad.refundLegacyPayment(booking));assert.equal(bad.calls.length,1)
 const failed=setup({platform:false,pi:{...intent,transfer_data:null},refundFailure:missing()});await assert.rejects(failed.refundLegacyPayment(booking));assert.equal(failed.calls.length,2)
})
test('historical intent destination, owner, amount and stored identity are validated before refund',async()=>{
 for(const change of [{transfer_data:{destination:'acct_Other'}},{metadata:{}},{amount:1},{currency:'usd'},{id:'pi_Other'},{livemode:true}]){
  const d=setup({pi:{...intent,...change}});await assert.rejects(d.refundLegacyPayment(booking));assert.equal(d.calls.some(c=>c.kind==='refund'),false)
 }
 const wrong=setup({refund:{id:'re_123',payment_intent:'pi_Other'}});await assert.rejects(wrong.refundLegacyPayment({...booking,stripe_refund_id:'re_123'}))
})
test('historical sessions retain retrieval and signed payment/expiration reconciliation',async()=>{
 const d=setup();assert.equal((await d.retrieveLegacyCheckout(booking)).session.id,session.id)
 const event={livemode:false,type:'checkout.session.completed',data:{object:session}}
 assert.equal(await d.validateHistoricalBookingEvent(event,booking),'paid')
 const unpaid={...session,status:'open',payment_status:'unpaid',payment_intent:null}
 const empty=setup({checkout:unpaid});const hold={...booking,stripe_payment_intent_id:null}
 assert.equal((await empty.retrieveLegacyCheckout(hold)).session.id,session.id)
 assert.equal(await empty.validateHistoricalBookingEvent({...event,data:{object:unpaid}},hold),'pending')
 assert.equal(await empty.validateHistoricalBookingEvent({...event,type:'checkout.session.expired',data:{object:unpaid}},hold),'expired')
 await assert.rejects(empty.validateHistoricalBookingEvent({...event,data:{object:{...unpaid,payment_status:'paid'}}},hold))
 await assert.rejects(d.validateHistoricalBookingEvent({...event,data:{object:{...session,id:'cs_test_other'}}},booking))
 await assert.rejects(d.validateHistoricalBookingEvent({...event,account:'acct_Merchant'},booking))
})
test('metadata-free refund charges require the persisted payment and verified destination',async()=>{
 const d=setup();const event={livemode:false,type:'charge.refunded',data:{object:{id:'ch_123',livemode:false,payment_intent:'pi_123',amount:1200,currency:'eur',amount_refunded:1200,refunded:true}}}
 assert.equal(await d.validateHistoricalBookingEvent(event,booking),'refunded')
 await assert.rejects(d.validateHistoricalBookingEvent(event,{...booking,stripe_payment_intent_id:'pi_Other'}))
 const wrong=setup({pi:{...intent,transfer_data:{destination:'acct_Other'}}});await assert.rejects(wrong.validateHistoricalBookingEvent(event,booking))
})

test('legacy success page displays the verified historical payment and reference',async()=>{
 const d=setup({checkout:{...session,client_reference_id:'LEGACY123'}})
 const {default:Page}=loadTypescript('app/bookings/success/page.tsx',{
  'next/link':props=>React.createElement('a',props),
  '@/lib/stripe/legacy-payments':d,
  '@/lib/stripe/direct-payments':{retrieveDirectCheckout:async()=>{throw missing()}},
  '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:booking})})})})})},
 })
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({session_id:session.id})}))
 assert.match(html,/Testzahlung erfolgreich/);assert.match(html,/LEGACY123/)
})
