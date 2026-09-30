import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePartnerPrice, validatePartnerPortal, billingState, runFenced } from '../lib/stripe/partner-billing-contracts.ts'
const offer={stripe_price_id:'price_pro',environment:'test',currency:'eur',unit_amount:2990,tax_behavior:'exclusive',billing_interval:'month'}
const price={id:'price_pro',active:true,livemode:false,currency:'eur',unit_amount:2990,tax_behavior:'exclusive',type:'recurring',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}}
test('pinned price rejects unknown, live, amount, tax and interval mismatch',()=>{
 validatePartnerPrice(price,offer)
 for(const change of [{id:'price_other'},{livemode:true},{unit_amount:1990},{tax_behavior:'inclusive'},{recurring:{interval:'year'}}]) assert.throws(()=>validatePartnerPrice({...price,...change},offer))
})
test('portal must explicitly disable subscription updates and immediate cancellation',()=>{
 const config={id:'bpc_safe',active:true,livemode:false,features:{subscription_update:{enabled:false},subscription_cancel:{enabled:true,mode:'at_period_end'},invoice_history:{enabled:true},payment_method_update:{enabled:true}}}
 validatePartnerPortal(config,'bpc_safe','test')
 assert.throws(()=>validatePartnerPortal({...config,features:{...config.features,subscription_update:{enabled:true}}},'bpc_safe','test'))
 assert.throws(()=>validatePartnerPortal(config,'bpc_other','test'))
})
test('active alone and initial payment failure do not grant Pro; unresolved failures keep fixed grace',()=>{
 const now=Date.parse('2026-09-30T12:00Z')
 const previous={state:'active',paid_through:'2026-09-29T12:00Z',past_due_since:null}
 assert.equal(billingState({status:'active',paidThrough:null,periodEnd:now+100000,trialAccepted:false},null,now).state,'incomplete')
 assert.equal(billingState({status:'past_due',paidThrough:null,periodEnd:now+100000,trialAccepted:false},null,now).state,'incomplete')
 const failed=billingState({status:'past_due',paidThrough:null,periodEnd:now+100000,trialAccepted:false},previous,now)
 assert.equal(failed.past_due_since,new Date(now).toISOString())
 const later=billingState({status:'past_due',paidThrough:null,periodEnd:now+100000,trialAccepted:false},failed,now+86400000)
 assert.equal(later.past_due_since,failed.past_due_since)
 assert.equal(billingState({status:'trialing',paidThrough:null,periodEnd:now-1,trialAccepted:false},null,now).state,'incomplete')
})
test('fence is acquired before read and stale apply fails after lease turnover',async()=>{
 let epoch=0,releaseFirst,firstRead
 const ready=new Promise(r=>firstRead=r)
 const wait=new Promise(r=>releaseFirst=r)
 const store={claim:async()=>++epoch,apply:async(f,v)=>{if(f!==epoch)throw Error('stale_fence');return v},fail:async()=>{}}
 const first=runFenced(store,async()=>{firstRead();await wait;return 'old'})
 await ready
 assert.equal(await runFenced(store,async()=>'new'),'new')
 releaseFirst()
 await assert.rejects(first,/stale_fence/)
})

import {readPartnerSubscription,assertDedicatedCustomer} from '../lib/stripe/partner-billing-provider.ts'
const contract={id:'contract',created_at:'2026-01-01',state:'accepted',subscription_id:'sub_partner',checkout_id:'cs_partner',trial_start:null,trial_end:null,offer:{...offer,offer_code:'standard',version:1,addon_code:null}}
const start=Math.floor(Date.now()/1000)-100,end=start+86400*30
const subscription={id:'sub_partner',customer:'cus_partner',livemode:false,status:'active',metadata:{},items:{has_more:false,data:[{id:'si_partner',quantity:1,price,current_period_start:start,current_period_end:end}]},discounts:[],latest_invoice:'in_paid',trial_end:null,cancel_at_period_end:false}
const iterable=data=>({async *[Symbol.asyncIterator](){yield*data}})
function provider(overrides={}) {
 const s={...subscription,...overrides}
 return {subscriptions:{retrieve:async()=>s,list:()=>iterable([s])},checkout:{sessions:{retrieve:async()=>({customer:'cus_partner',mode:'subscription',livemode:false,status:'complete',subscription:s.id})}},invoices:{retrieve:async()=>({id:'in_paid',customer:'cus_partner',livemode:false,parent:{subscription_details:{subscription:s.id}},status:'paid',amount_due:2990}),listLineItems:()=>iterable([{pricing:{price_details:{price:'price_pro'}},period:{start,end},quantity:1}]),list:()=>iterable([])},invoicePayments:{list:()=>iterable([{invoice:'in_paid',livemode:false,amount_paid:2990,payment:{charge:'ch_paid'}}])},charges:{retrieve:async()=>({customer:'cus_partner',livemode:false,paid:true,amount_refunded:0,disputed:false})},customers:{retrieve:async()=>({id:'cus_partner'})}}
}
test('verified invoice/charge and item-level periods grant paid active state',async()=>{
 const s=await readPartnerSubscription(provider(),contract,'cus_partner',null)
 assert.equal(s.state,'active');assert.equal(s.period_end,new Date(end*1000).toISOString())
})
test('foreign subscription, unknown price and legacy Commerce cannot mutate Partner',async()=>{
 for(const patch of [{customer:'cus_foreign'},{metadata:{benefitsi_billing_provider_id:'commerce'}},{items:{has_more:false,data:[{...subscription.items.data[0],price:{...price,id:'price_unknown'}}]}}]) await assert.rejects(()=>readPartnerSubscription(provider(patch),contract,'cus_partner',null))
})
test('initial incomplete payment, active without paid invoice, and refund fail closed',async()=>{
 assert.equal((await readPartnerSubscription(provider({status:'incomplete'}),contract,'cus_partner',null)).state,'incomplete')
 const noPayment=provider();noPayment.invoicePayments.list=()=>iterable([])
 assert.equal((await readPartnerSubscription(noPayment,contract,'cus_partner',null)).state,'incomplete')
 const refunded=provider();refunded.charges.retrieve=async()=>({customer:'cus_partner',livemode:false,paid:true,amount_refunded:2990})
 assert.equal((await readPartnerSubscription(refunded,contract,'cus_partner',null)).state,'unpaid')
})
test('customer portal isolation checks every subscription and every invoice',async()=>{
 await assertDedicatedCustomer(provider(),'cus_partner',[contract])
 const foreign=provider();foreign.subscriptions.list=()=>iterable([subscription,{id:'sub_consumer'}])
 await assert.rejects(()=>assertDedicatedCustomer(foreign,'cus_partner',[contract]),/not_dedicated/)
 const invoices=provider();invoices.invoices.list=()=>iterable([{parent:{subscription_details:{subscription:'sub_consumer'}}}])
 await assert.rejects(()=>assertDedicatedCustomer(invoices,'cus_partner',[contract]),/not_dedicated/)
})
test('trial grant requires exact accepted dates and expires without a paid agreement',async()=>{
 const accepted={...contract,trial_start:new Date(start*1000).toISOString(),trial_end:new Date(end*1000).toISOString(),offer:{...contract.offer,offer_code:'founder'}}
 assert.equal((await readPartnerSubscription(provider({status:'trialing',trial_end:end}),accepted,'cus_partner',null)).state,'trialing')
 assert.equal((await readPartnerSubscription(provider({status:'trialing',trial_end:end+1}),accepted,'cus_partner',null)).state,'incomplete')
})
test('signature verification rejects invalid and live payloads at a test contract boundary',async()=>{
 const Stripe=(await import('stripe')).default
 const stripe=new Stripe('sk_test_local_fixture')
 const secret='whsec_local_fixture',payload=JSON.stringify({id:'evt_fixture',livemode:false,type:'invoice.paid',data:{object:{}}})
 const signature=stripe.webhooks.generateTestHeaderString({payload,secret})
 assert.equal(stripe.webhooks.constructEvent(payload,signature,secret).livemode,false)
 assert.throws(()=>stripe.webhooks.constructEvent(payload,signature,'whsec_other'))
})

import {loadTypescript} from './helpers/load-typescript.mjs'
import * as contractsModule from '../lib/stripe/partner-billing-contracts.ts'
import * as providerModule from '../lib/stripe/partner-billing-provider.ts'
async function engine(run,{status='active',addon=false}={}) {
 const saved={...process.env},commands=[],mutations=[]
 Object.assign(process.env,{BENEFITSI_PARTNER_BILLING_ENABLED:'true',BENEFITSI_PARTNER_BILLING_ENVIRONMENT:'test',BENEFITSI_PARTNER_STRIPE_SECRET_KEY:'sk_test_local_fixture',BENEFITSI_PARTNER_BILLING_WEBHOOK_SECRET:'whsec_local_fixture'})
 const mock=provider({status});const canceled=new Map()
 mock.subscriptions.update=async(id,params)=>{mutations.push({id,params});canceled.set(id,params);return subscription}
 const originalRetrieve=mock.subscriptions.retrieve
 mock.subscriptions.retrieve=async id=>({...await originalRetrieve(),id,latest_invoice:'in_'+id,cancel_at_period_end:!!canceled.get(id)?.cancel_at_period_end,cancel_at:canceled.get(id)?.cancel_at,...(id==='sub_addon'?{items:{has_more:false,data:[{...subscription.items.data[0],price:{...price,id:'price_addon'}}]}}:{})})
 mock.checkout.sessions.retrieve=async(id)=>({customer:'cus_partner',mode:'subscription',livemode:false,status:'complete',subscription:id==='cs_addon'?'sub_addon':'sub_partner'})
 mock.invoices.retrieve=async(id)=>({id,customer:'cus_partner',livemode:false,parent:{subscription_details:{subscription:id.slice(3)}},status:'paid',amount_due:2990})
 mock.invoices.listLineItems=id=>iterable([{pricing:{price_details:{price:id==='in_sub_addon'?'price_addon':'price_pro'}},period:{start,end},quantity:1}])
 mock.invoicePayments.list=({invoice})=>iterable([{invoice,livemode:false,amount_paid:2990,payment:{charge:'ch_paid'}}])
 const Stripe=(await import('stripe')).default
 mock.webhooks=new Stripe('sk_test_local_fixture').webhooks
 const extra={...contract,id:'addon',checkout_id:'cs_addon',subscription_id:'sub_addon',offer:{...contract.offer,offer_code:'commerce',addon_code:'commerce',stripe_price_id:'price_addon'}}
 const ctx={partner_id:'partner',environment:'test',customer_id:'cus_partner',contracts:addon?[contract,extra]:[contract],configuration:{enabled:true},subscription:{state:'active',paid_through:new Date(end*1000).toISOString(),past_due_since:null}}
 const applied=new Set()
 const api=loadTypescript('lib/stripe/partner-billing.ts',{
  'stripe':class {constructor(){return mock}},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{
   if(name==='partner_billing_context')return {data:ctx}
   if(name==='partner_billing_claim')return {data:applied.has(args.p_event_id)?{duplicate:true}:{fence:1}}
   if(name==='partner_billing_command'){commands.push(args);if(args.p_action==='batch')applied.add(args.p_data.event_id);return {data:{ok:true}}}
   throw Error('unexpected RPC '+name)
  }})},
  '@/lib/supabase/server':{createClient:async()=>({rpc:async(name)=>({data:name==='prepare_partner_billing_checkout'?'contract':{enabled:true}})})},
  '@/lib/stripe/config':{requirePartnerBaseUrl:()=> 'https://partner.example.invalid'},
  './partner-billing-contracts':contractsModule,'./partner-billing-provider':providerModule,
 })
 try {await run({api,commands,mutations,mock,secret:'whsec_local_fixture',ctx})} finally {for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved)}
}
test('webhook uses actual signature/environment checks; duplicate invoice event applies once',()=>engine(async({api,mock,secret,commands})=>{
 const payload=JSON.stringify({id:'evt_fixture',livemode:false,type:'invoice.paid',data:{object:{customer:'cus_partner'}}})
 const signature=mock.webhooks.generateTestHeaderString({payload,secret})
 await assert.rejects(()=>api.handlePartnerBillingWebhook(payload,'invalid'),/invalid_signature/)
 const live=JSON.stringify({id:'evt_live',livemode:true,type:'invoice.paid',data:{object:{customer:'cus_partner'}}})
 await assert.rejects(()=>api.handlePartnerBillingWebhook(live,mock.webhooks.generateTestHeaderString({payload:live,secret})),/environment_mismatch/)
 await api.handlePartnerBillingWebhook(payload,signature)
 await api.handlePartnerBillingWebhook(payload,signature)
 assert.equal(commands.filter(c=>c.p_action==='batch').length,1)
 assert.equal(commands.filter(c=>c.p_action==='complete').length,0,'batch commits event and releases once')
}))
test('owner base cancellation calls scoped Stripe update and preserves paid end',()=>engine(async({api,mutations,commands})=>{
 await api.cancelPartnerSubscription('partner','standard')
 assert.equal(mutations[0].id,'sub_partner');assert.equal(mutations[0].params.cancel_at_period_end,true)
 const batch=commands.find(c=>c.p_action==='batch')
 assert.equal(batch.p_data.commands[0].data.state,'active')
 assert.equal(batch.p_data.commands[0].data.cancel_at_period_end,true)
 await assert.rejects(()=>api.cancelPartnerSubscription('partner','unknown'),/subscription_missing/)
}))
test('individual module cancellation preserves Pro; Pro cancellation also stops addon renewal',async()=>{
 await engine(async({api,mutations,commands})=>{
  await api.cancelPartnerSubscription('partner','commerce')
  assert.equal(mutations.length,1);assert.equal(mutations[0].id,'sub_addon')
  const rows=commands.find(c=>c.p_action==='batch').p_data.commands
  assert.equal(rows.find(r=>r.data.subscription_id==='sub_partner').data.cancel_at_period_end,false)
 },{addon:true})
 await engine(async({api,mutations})=>{
  await api.cancelPartnerSubscription('partner','standard')
  assert.equal(mutations.length,2);assert.equal(mutations[1].id,'sub_addon')
  assert.equal(mutations[1].params.cancel_at,end)
 },{addon:true})
})
test('Checkout retries reuse persisted intent and customer; return URL grants nothing',()=>engine(async({api,mock,ctx,commands})=>{
 const pending={...contract,state:'pending',subscription_id:null,checkout_id:null,expires_at:new Date(Date.now()+3600000).toISOString()}
 ctx.contracts=[pending];ctx.configuration.portal_configuration_id='bpc_safe'
 mock.subscriptions.list=()=>iterable([])
 mock.prices={retrieve:async()=>price}
 mock.billingPortal={configurations:{retrieve:async()=>({id:'bpc_safe',active:true,livemode:false,features:{subscription_update:{enabled:false},subscription_cancel:{enabled:false},invoice_history:{enabled:true},payment_method_update:{enabled:true}}})}}
 let created=0
 mock.checkout.sessions.create=async(params,options)=>{created++;assert.equal(params.customer,'cus_partner');assert.equal(options.idempotencyKey,'partner-saas-checkout:contract');assert.match(params.success_url,/partner.example.invalid/);pending.checkout_id='cs_created';return {id:'cs_created',livemode:false,customer:'cus_partner',url:'https://checkout.stripe.com/fixture'}}
 mock.checkout.sessions.retrieve=async()=>({id:'cs_created',customer:'cus_partner',status:'open',url:'https://checkout.stripe.com/fixture'})
 const first=await api.createPartnerCheckout('partner','standard',1,'terms')
 const second=await api.createPartnerCheckout('partner','standard',1,'terms')
 assert.equal(first.url,second.url);assert.equal(created,1)
 assert.equal(commands.filter(c=>c.p_action==='apply'||c.p_action==='batch').length,0)
}))
test('long-expired prior payment cannot create a fresh grace episode; delayed failure uses original failure time',()=>{
 const now=Date.parse('2026-09-30T12:00Z'),current={status:'past_due',periodStart:now-86400000,periodEnd:now+29*86400000,paidThrough:null,trialAccepted:false,failureAt:now-86400000}
 assert.equal(billingState(current,{state:'active',paid_through:'2026-06-01T00:00Z',past_due_since:null},now).state,'incomplete')
 assert.equal(billingState(current,{state:'active',paid_through:new Date(current.periodStart).toISOString(),past_due_since:null},now).past_due_since,new Date(current.failureAt).toISOString())
})
test('a late active event cannot restore a currently canceled subscription',()=>engine(async({api,mock,secret,commands})=>{
 const payload=JSON.stringify({id:'evt_late',created:1,livemode:false,type:'customer.subscription.updated',data:{object:{customer:'cus_partner',status:'active'}}})
 await api.handlePartnerBillingWebhook(payload,mock.webhooks.generateTestHeaderString({payload,secret}))
 assert.equal(commands.find(c=>c.p_action==='batch').p_data.commands[0].data.state,'canceled')
},{status:'canceled'}))
test('pending expiry reconciles missing responses; a completed Checkout is admitted instead of released',async()=>{
 await engine(async({api,mock,ctx,commands})=>{
  ctx.contracts=[{...contract,state:'pending',subscription_id:null,checkout_id:null,expires_at:new Date(Date.now()-1000).toISOString()}]
  mock.checkout.sessions.list=()=>iterable([])
  await api.reconcilePartnerBilling('partner')
  assert.equal(commands.find(c=>c.p_action==='batch').p_data.commands[0].action,'expire')
 })
 await engine(async({api,mock,ctx,commands})=>{
  ctx.contracts=[{...contract,state:'pending',subscription_id:null,checkout_id:null,expires_at:new Date(Date.now()-1000).toISOString()}]
  mock.checkout.sessions.list=()=>iterable([{id:'cs_partner',client_reference_id:contract.id}])
  await api.reconcilePartnerBilling('partner')
  assert.equal(commands.find(c=>c.p_action==='checkout').p_data.checkout_id,'cs_partner')
  const batch=commands.find(c=>c.p_action==='batch').p_data.commands
  assert.equal(batch[0].action,'apply');assert.equal(batch[0].data.checkout_complete,true)
 })
})
test('expired initial payment normalizes to canceled, allowing a new standard checkout without a trial reset',()=>{
 assert.equal(billingState({status:'incomplete_expired',paidThrough:null,periodEnd:Date.now()-1,trialAccepted:false},null).state,'canceled')
})
