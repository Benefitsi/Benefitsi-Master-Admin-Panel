import assert from 'node:assert/strict'
import test from 'node:test'
import {ensureFounderSubscription,founderTrialCancellation,validateFounderSchedule} from '../lib/stripe/partner-founder.ts'
const iterable=rows=>({async *[Symbol.asyncIterator](){yield*rows}})
function fixture({future=false,annual=false}={}) {
 const start=Math.floor(Date.now()/1000)+(future?600:-1),end=start+180*86400
 const contract={id:'contract',state:'pending',checkout_id:'cs_setup',subscription_id:null,schedule_id:null,setup_intent_id:null,payment_method_id:null,activated_at:null,trial_start:null,trial_end:null,cancellation_at:null,offer:{offer_code:annual?'founder_annual':'founder',stripe_price_id:annual?'price_year':'price_month',billing_interval:annual?'year':'month',unit_amount:annual?19900:1990,environment:'test',currency:'eur'}}
 const events=[],requests=[]
 const schedule={id:'sub_sched_fixture',customer:'cus_fixture',livemode:false,status:future?'not_started':'active',subscription:future?null:'sub_fixture',metadata:{benefitsi_partner_contract:'contract'},end_behavior:'release',billing_mode:{type:'flexible'},default_settings:{default_payment_method:'pm_fixture',collection_method:'charge_automatically'},phases:[{start_date:start,end_date:end,trial_end:end,items:[{price:contract.offer.stripe_price_id,quantity:1,metadata:{original:'item'}}],metadata:{original:'phase'},proration_behavior:'none',currency:'eur',invoice_settings:{account_tax_ids:['txi_fixture'],issuer:{type:'self'}}}]}
 const stripe={checkout:{sessions:{retrieve:async()=>({id:'cs_setup',mode:'setup',status:'complete',customer:'cus_fixture',livemode:false,setup_intent:'seti_fixture'})}},setupIntents:{retrieve:async()=>({id:'seti_fixture',status:'succeeded',customer:'cus_fixture',livemode:false,payment_method:'pm_fixture'})},subscriptionSchedules:{list:()=>iterable(future?[]:[schedule]),create:async(params,options)=>{requests.push({params,options});return schedule},retrieve:async()=>schedule},subscriptions:{retrieve:async()=>({id:'sub_fixture',customer:'cus_fixture',livemode:false,trial_start:start,trial_end:end,status:'trialing'})}}
 const command=async(action,data)=>{events.push({action,data});if(action==='founder_schedule_prepare')return {setup_intent_id:data.setup_intent_id,payment_method_id:data.payment_method_id,trial_start:new Date(start*1000).toISOString(),trial_end:new Date(end*1000).toISOString()};if(action==='founder_schedule_bind')return {schedule_id:data.schedule_id};if(action==='founder_schedule_confirm')return {activated_at:contract.trial_start,subscription_id:data.subscription_id};throw Error(action)}
 return {contract,stripe,schedule,command,events,requests,start,end}
}
test('completed setup plans one exact future calendar trial; retries never start a provisional subscription',async()=>{
 for(const annual of [false,true]){
  const f=fixture({future:true,annual})
  assert.equal(await ensureFounderSubscription(f.stripe,f.contract,'cus_fixture',f.command),false)
  assert.equal(await ensureFounderSubscription(f.stripe,f.contract,'cus_fixture',f.command),false)
  assert.equal(f.requests.length,1)
  const {params,options}=f.requests[0]
  assert.equal(params.start_date,f.start);assert.equal(params.phases[0].trial_end,f.end)
  assert.equal(params.phases[0].end_date,f.end);assert.equal(params.phases[0].items[0].price,annual?'price_year':'price_month')
  assert.equal(options.idempotencyKey,'partner-founder-activation:contract')
  assert.equal(f.events.some(x=>x.action==='founder_schedule_confirm'),false)
 }
})
test('lost schedule response is recovered by pinned contract metadata; actual activation must match exactly once',async()=>{
 const f=fixture()
 assert.equal(await ensureFounderSubscription(f.stripe,f.contract,'cus_fixture',f.command),true)
 assert.equal(f.requests.length,0)
 await ensureFounderSubscription(f.stripe,f.contract,'cus_fixture',f.command)
 assert.equal(f.events.filter(x=>x.action==='founder_schedule_confirm').length,1)
 f.stripe.subscriptions.retrieve=async()=>({id:'sub_fixture',customer:'cus_fixture',livemode:false,trial_start:f.start+1,trial_end:f.end})
 await assert.rejects(()=>ensureFounderSubscription(f.stripe,f.contract,'cus_fixture',f.command),/activation_unconfirmed/)
})
test('missing schedule after saved activation never backdates or moves the trial on retry',async()=>{
 const f=fixture();f.stripe.subscriptionSchedules.list=()=>iterable([])
 await assert.rejects(()=>ensureFounderSubscription(f.stripe,f.contract,'cus_fixture',f.command),/activation_recovery_required/)
 assert.equal(f.requests.length,0)
})
test('trial cancellation preserves current phase configuration and rejects foreign prices or schedules',async()=>{
 const f=fixture();await ensureFounderSubscription(f.stripe,f.contract,'cus_fixture',f.command)
 f.contract.cancellation_at=new Date((f.start+30*86400)*1000).toISOString()
 const update=founderTrialCancellation(f.schedule,f.contract,'cus_fixture')
 assert.equal(update.phases[0].end_date,update.phases[0].trial_end)
 assert.equal(update.phases[0].metadata.original,'phase');assert.equal(update.phases[0].items[0].metadata.original,'item')
 assert.deepEqual(update.phases[0].invoice_settings,{account_tax_ids:['txi_fixture'],issuer:{type:'self'}})
 assert.equal(update.phases[0].currency,'eur');assert.equal(update.proration_behavior,'none')
 assert.throws(()=>validateFounderSchedule({...f.schedule,id:'sub_sched_foreign'},f.contract,'cus_fixture'),/mismatch/)
 f.schedule.phases[0].items[0].price='price_wrong'
 assert.throws(()=>founderTrialCancellation(f.schedule,f.contract,'cus_fixture'),/unapproved_change/)
})
