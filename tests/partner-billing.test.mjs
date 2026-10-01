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
test('finalized zero-EUR Founder trial invoice with paid_at never becomes a first payment after provider cancellation',async()=>{
 const activation=Date.parse('2026-01-31T11:00:00Z')/1000,exit=Date.parse('2026-02-28T11:00:00Z')/1000,paidAt=activation+3600
 const founder={...contract,id:'founder-zero-fixture',offer:{...contract.offer,offer_code:'founder',unit_amount:1990},
  trial_start:new Date(activation*1000).toISOString(),activated_at:new Date(activation*1000).toISOString(),
  trial_end:'2026-07-31T10:00:00Z',cancellation_at:new Date(exit*1000).toISOString(),schedule_id:'sub_sched_zero',payment_method_id:'pm_zero'}
 const params=founderModule.founderScheduleParams(founder,'cus_partner')
 const schedule={...params,id:founder.schedule_id,livemode:false,status:'canceled',end_behavior:'cancel',
  phases:[{...params.phases[0],start_date:activation,end_date:exit,trial_end:exit}]}
 const mock=provider({status:'canceled',trial_start:activation,trial_end:exit,schedule:schedule.id,cancel_at:exit,
  items:{has_more:false,data:[{...subscription.items.data[0],price:{...price,unit_amount:1990},current_period_start:activation,current_period_end:exit}]}})
 mock.checkout.sessions.retrieve=async()=>({mode:'setup',customer:'cus_partner',livemode:false,status:'complete'})
 mock.subscriptionSchedules={retrieve:async()=>schedule}
 mock.invoices.retrieve=async()=>({id:'in_paid',customer:'cus_partner',livemode:false,parent:{subscription_details:{subscription:'sub_partner'}},
  status:'paid',amount_due:0,amount_paid:0,status_transitions:{paid_at:paidAt,finalized_at:paidAt}})
 mock.invoices.listLineItems=()=>iterable([{pricing:{price_details:{price:'price_pro'}},period:{start:activation,end:exit},quantity:1}])
 mock.invoicePayments.list=()=>iterable([])
 const previous={state:'canceled',paid_through:null,past_due_since:null,first_payment_at:new Date(paidAt*1000).toISOString()}
 const s=await readPartnerSubscription(mock,founder,'cus_partner',previous)
 assert.equal(s.provider_status,'canceled');assert.equal(s.state,'canceled')
 assert.equal(s.first_payment_at,null);assert.equal(s.paid_through,null);assert.equal(s.past_due_since,null)
 assert.equal(s.period_start,new Date(activation*1000).toISOString());assert.equal(s.period_end,new Date(exit*1000).toISOString())
})
test('first payment uses the same positive verified charge and matching period line gate as paid rights',async()=>{
 const paidAt=start+10,first=new Date(paidAt*1000).toISOString()
 const paidProvider=()=>{
  const mock=provider(),read=mock.invoices.retrieve
  mock.invoices.retrieve=async()=>({...await read(),amount_paid:2990,status_transitions:{paid_at:paidAt}})
  return mock
 }
 const valid=await readPartnerSubscription(paidProvider(),contract,'cus_partner',null)
 assert.equal(valid.first_payment_at,first);assert.equal(valid.paid_through,new Date(end*1000).toISOString());assert.equal(valid.state,'active')
 const noTimestamp=paidProvider(),read=noTimestamp.invoices.retrieve
 noTimestamp.invoices.retrieve=async()=>({...await read(),status_transitions:{}})
 const missing=await readPartnerSubscription(noTimestamp,contract,'cus_partner',null)
 assert.equal(missing.first_payment_at,null);assert.equal(missing.paid_through,valid.paid_through)
 const cases=[
  ['manual out-of-band',m=>{m.invoicePayments.list=()=>iterable([{invoice:'in_paid',livemode:false,amount_paid:2990,payment:{}}])}],
  ['no verified charge',m=>{m.charges.retrieve=async()=>({customer:'cus_partner',livemode:false,paid:false,amount_refunded:0,disputed:false})}],
  ['insufficient verified amount',m=>{m.invoicePayments.list=()=>iterable([{invoice:'in_paid',livemode:false,amount_paid:1,payment:{charge:'ch_paid'}}])}],
  ['wrong price line',m=>{m.invoices.listLineItems=()=>iterable([{pricing:{price_details:{price:'price_other'}},period:{start,end},quantity:1}])}],
  ['wrong period line',m=>{m.invoices.listLineItems=()=>iterable([{pricing:{price_details:{price:'price_pro'}},period:{start,end:end-1},quantity:1}])}],
  ['refunded',m=>{m.charges.retrieve=async()=>({customer:'cus_partner',livemode:false,paid:true,amount_refunded:2990,disputed:false})}],
  ['disputed',m=>{m.charges.retrieve=async()=>({customer:'cus_partner',livemode:false,paid:true,amount_refunded:0,disputed:true})}]
 ]
 for(const [label,change] of cases){
  const mock=paidProvider();change(mock)
  const s=await readPartnerSubscription(mock,contract,'cus_partner',null)
  assert.equal(s.first_payment_at,null,label);assert.equal(s.paid_through,null,label)
  assert.equal(s.state,['refunded','disputed'].includes(label)?'unpaid':'incomplete',label)
 }
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
 const accepted={...contract,activated_at:new Date(start*1000).toISOString(),trial_start:new Date(start*1000).toISOString(),trial_end:new Date(end*1000).toISOString(),offer:{...contract.offer,offer_code:'founder'}}
 const valid=provider({status:'trialing',trial_start:start,trial_end:end});valid.checkout.sessions.retrieve=async()=>({mode:'setup',customer:'cus_partner',livemode:false,status:'complete'});
 assert.equal((await readPartnerSubscription(valid,accepted,'cus_partner',null)).state,'trialing')
 const invalid=provider({status:'trialing',trial_start:start,trial_end:end+1});invalid.checkout.sessions=valid.checkout.sessions;
 assert.equal((await readPartnerSubscription(invalid,accepted,'cus_partner',null)).state,'incomplete')
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
import * as founderModule from '../lib/stripe/partner-founder.ts'
async function engine(run,{status='active',addon=false}={}) {
 const saved={...process.env},commands=[],mutations=[]
 Object.assign(process.env,{BENEFITSI_PARTNER_BILLING_ENABLED:'true',BENEFITSI_PARTNER_BILLING_ENVIRONMENT:'test',BENEFITSI_PARTNER_STRIPE_SECRET_KEY:'sk_test_local_fixture',BENEFITSI_PARTNER_BILLING_WEBHOOK_SECRET:'whsec_local_fixture'})
 const mock=provider({status});const canceled=new Map()
 mock.subscriptions.update=async(id,params)=>{mutations.push({id,params});canceled.set(id,params);return {...subscription,id,cancel_at_period_end:!!params.cancel_at_period_end,cancel_at:params.cancel_at}}
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
 const applied=new Set(),store={fence:0,held:false,mutation:null}
 store.expire=()=>{store.held=false}
 const api=loadTypescript('lib/stripe/partner-billing.ts',{
  'stripe':class {constructor(){return mock}},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{
   if(name==='partner_billing_context')return {data:ctx}
   if(name==='partner_billing_claim') {if(applied.has(args.p_event_id))return {data:{duplicate:true}};if(store.held)return {error:{message:'billing_busy'}};store.held=true;return {data:{fence:++store.fence,recovery:store.mutation}}}
   if(name==='partner_billing_command'){
    if(args.p_fence!==store.fence||!store.held)return {error:{message:'stale_billing_fence'}}
    commands.push(args);const a=args.p_action,d=args.p_data
    if(a==='mutation_begin'){if(!ctx.contracts.some(c=>c.id===d.contract_id&&c.subscription_id===d.subscription_id&&d.subscription_id))return {error:{message:'billing_mutation_contract_required'}};store.mutation={...d,id:'mutation-'+commands.length,params:null,operation:null};return {data:store.mutation}}
    if(a==='mutation_plan'){store.mutation={...store.mutation,...d,idempotency_key:'key-'+d.id};return {data:store.mutation}}
    if(a==='mutation_finish')store.mutation=null
    if(a==='batch')applied.add(d.event_id)
    if(['batch','complete','failed'].includes(a))store.held=false
    return {data:{ok:true}}
   }
   throw Error('unexpected RPC '+name)
  }})},
  '@/lib/supabase/server':{createClient:async()=>({rpc:async(name)=>({data:name==='prepare_partner_billing_checkout'?'contract':{enabled:true}})})},
  '@/lib/stripe/config':{requirePartnerBaseUrl:()=> 'https://partner.example.invalid'},
  './partner-billing-contracts':contractsModule,'./partner-billing-provider':providerModule,'./partner-founder':founderModule,
 })
 try {await run({api,commands,mutations,mock,store,secret:'whsec_local_fixture',ctx})} finally {for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved)}
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

test('expired production worker cannot cancel addon after newer paid recovery commits',()=>engine(async({api,mock,mutations,store})=>{
 const retrieve=mock.subscriptions.retrieve;let firstBase=true,firstAddon=true,release,entered
 const gate=new Promise(r=>release=r),blocked=new Promise(r=>entered=r)
 mock.subscriptions.retrieve=async id=>{
  const sub=await retrieve(id)
  if(id==='sub_partner'&&firstBase){firstBase=false;return {...sub,status:'unpaid'}}
  if(id==='sub_addon'&&firstAddon){firstAddon=false;entered();await gate}
  return sub
 }
 mock.subscriptions.cancel=async(id,params)=>{mutations.push({id,params});return {...await retrieve(id),status:'canceled'}}
 const stale=api.reconcilePartnerBilling('partner','old').then(()=>null,e=>e)
 await blocked;store.expire();await api.reconcilePartnerBilling('partner','recovered');release()
 assert.match((await stale).message,/stale_billing_fence/)
 assert.equal(mutations.length,0)
},{addon:true}))
test('unknown update result is retained and recovered using the exact immutable order',()=>engine(async({api,mock,store,mutations,commands})=>{
 const update=mock.subscriptions.update;let first=true
 mock.subscriptions.update=async(id,params,options)=>{
  if(first){first=false;throw Error('simulated ambiguous transport timeout')}
  assert.equal(options.idempotencyKey,store.mutation.idempotency_key)
  return update(id,params)
 }
 await assert.rejects(()=>api.cancelPartnerSubscription('partner','standard'),/timeout/)
 const saved=structuredClone(store.mutation)
 assert.deepEqual(saved.params,{cancel_at_period_end:true,proration_behavior:'none'})
 await api.recoverPartnerBilling('partner')
 assert.equal(store.mutation,null);assert.equal(mutations[0].id,saved.subscription_id)
 assert.deepEqual(structuredClone(mutations[0].params),saved.params)
 assert.ok(commands.some(c=>c.p_action==='mutation_finish'))
}))
test('late dispatched request after identical takeover cannot change target or cancellation end',()=>engine(async({api,mock,store,mutations})=>{
 const update=mock.subscriptions.update;let first=true,release,entered
 const gate=new Promise(r=>release=r),blocked=new Promise(r=>entered=r)
 mock.subscriptions.update=async(id,params,options)=>{
  if(first){first=false;entered();await gate}
  return update(id,params,options)
 }
 const old=api.cancelPartnerSubscription('partner','standard').then(()=>null,e=>e)
 await blocked;const saved=structuredClone(store.mutation);store.expire()
 await api.recoverPartnerBilling('partner');release()
 assert.match((await old).message,/stale_billing_fence/)
 assert.equal(mutations.length,2)
 assert.deepEqual(mutations[0],mutations[1]);assert.equal(mutations[1].id,saved.subscription_id)
 assert.equal((await mock.subscriptions.retrieve(saved.subscription_id)).cancel_at_period_end,true)
}))
test('base recovery during barrier recheck aborts a previously inferred addon cancellation',()=>engine(async({api,mock,mutations})=>{
 const retrieve=mock.subscriptions.retrieve;let first=true
 mock.subscriptions.retrieve=async id=>{const sub=await retrieve(id);if(id==='sub_partner'&&first){first=false;return {...sub,status:'unpaid'}}return sub}
 await api.reconcilePartnerBilling('partner')
 assert.equal(mutations.length,0)
},{addon:true}))
test('unknown persisted provider target keeps recovery blocked and visible to later attempts',()=>engine(async({api,mock,store})=>{
 mock.subscriptions.update=async()=>{throw Error('unknown target')}
 await assert.rejects(()=>api.cancelPartnerSubscription('partner','standard'),/unknown target/)
 const saved=structuredClone(store.mutation)
 await assert.rejects(()=>api.recoverPartnerBilling('partner'),/unknown target/)
 assert.deepEqual(structuredClone(store.mutation),saved)
}))

test('completed pending addon binds verified subscription before coordinated cancellation and retries',async()=>{
 for(const lapsed of [false,true])await engine(async({api,mock,ctx,mutations})=>{
  ctx.contracts[1]={...ctx.contracts[1],state:'pending',subscription_id:null}
  const retrieve=mock.subscriptions.retrieve;let ended=false
  mock.subscriptions.retrieve=async id=>({...await retrieve(id),...(id==='sub_partner'? lapsed?{status:'unpaid'}:{cancel_at_period_end:true}:ended?{status:'canceled'}:{})})
  mock.subscriptions.cancel=async(id,params)=>{mutations.push({id,params});ended=true;return {...await retrieve(id),id,status:'canceled'}}
  await api.reconcilePartnerBilling('partner','completed-addon')
  assert.equal(ctx.contracts[1].subscription_id,'sub_addon')
  assert.equal(mutations[0].id,'sub_addon')
  await api.reconcilePartnerBilling('partner','addon-retry')
 },{addon:true})
})
test('Founder Checkout collects a payment method without starting a subscription or trial',()=>engine(async({api,mock,ctx})=>{
 ctx.contracts=[{...contract,offer:{...contract.offer,offer_code:'founder'},state:'pending',subscription_id:null,checkout_id:null,expires_at:new Date(Date.now()+3600000).toISOString()}]
 ctx.configuration.portal_configuration_id='bpc_safe';mock.subscriptions.list=()=>iterable([])
 mock.prices={retrieve:async()=>price}
 mock.billingPortal={configurations:{retrieve:async()=>({id:'bpc_safe',active:true,livemode:false,features:{subscription_update:{enabled:false},subscription_cancel:{enabled:false},invoice_history:{enabled:true},payment_method_update:{enabled:true}}})}}
 mock.checkout.sessions.create=async params=>{assert.equal(params.mode,'setup');assert.equal(params.subscription_data,undefined);assert.equal(params.line_items,undefined);return {id:'cs_setup',livemode:false,customer:'cus_partner',url:'https://checkout.stripe.com/fixture'}}
 await api.createPartnerCheckout('partner','founder',1,'terms')
}))
function founderEngine(f,annual=false) {
 const trialStart=Math.floor(Date.now()/1000)-150*86400,trialEnd=Math.floor(Date.now()/1000)+60
 const c={...contract,offer:{...contract.offer,offer_code:annual?'founder_annual':'founder',billing_interval:annual?'year':'month',unit_amount:annual?19900:1990},schedule_id:'sub_sched_founder',setup_intent_id:'seti_founder',payment_method_id:'pm_founder',activated_at:new Date(trialStart*1000).toISOString(),trial_start:new Date(trialStart*1000).toISOString(),trial_end:new Date(trialEnd*1000).toISOString(),cancellation_at:new Date(trialEnd*1000).toISOString(),paid_minimum_end:new Date((trialEnd+365*86400)*1000).toISOString()}
 f.ctx.contracts=[c]
 const schedule={id:c.schedule_id,customer:'cus_partner',livemode:false,metadata:{benefitsi_partner_contract:c.id},status:'active',subscription:'sub_partner',end_behavior:'release',default_settings:{default_payment_method:'pm_founder',collection_method:'charge_automatically'},phases:[{start_date:trialStart,end_date:trialEnd,trial_end:trialEnd,items:[{price:'price_pro',quantity:1,metadata:{}}],metadata:{benefitsi_partner_contract:c.id},proration_behavior:'none'}]}
 let canceled=false,paid=false
 const read=f.mock.subscriptions.retrieve
 f.mock.subscriptions.retrieve=async id=>({...await read(id),status:canceled?'canceled':paid?'active':'trialing',schedule:paid?null:schedule.id,trial_start:trialStart,trial_end:schedule.phases[0].trial_end,cancel_at:schedule.end_behavior==='cancel'?schedule.phases[0].end_date:null,items:{has_more:false,data:[{...subscription.items.data[0],price:{...price,unit_amount:c.offer.unit_amount,recurring:{...price.recurring,interval:c.offer.billing_interval}}}]}})
 f.mock.checkout.sessions.retrieve=async()=>({id:'cs_partner',mode:'setup',status:'complete',livemode:false,customer:'cus_partner',setup_intent:'seti_founder'})
 f.mock.subscriptionSchedules={retrieve:async()=>schedule,update:async(id,params)=>{assert.equal(id,schedule.id);assert.equal(params.proration_behavior,'none');assert.equal(params.phases[0].trial_end,params.phases[0].end_date);Object.assign(schedule,params);return schedule}}
 f.mock.subscriptions.cancel=async(id,params)=>{assert.equal(id,c.subscription_id);assert.deepEqual(structuredClone(params),{invoice_now:false,prorate:false});canceled=true;return f.mock.subscriptions.retrieve(id)}
 return {c,schedule,setPaid:()=>{paid=true;schedule.status='completed';schedule.subscription=null;schedule.released_subscription='sub_partner'}}
}
test('Founder month and year exit in sixth free month preserves trial-only phase and saved end on retry',async()=>{
 for(const annual of [false,true])await engine(async f=>{
  const {c,schedule}=founderEngine(f,annual)
  await f.api.cancelPartnerSubscription('partner',c.offer.offer_code)
  assert.equal(schedule.end_behavior,'cancel');assert.equal(schedule.phases[0].end_date,Date.parse(c.trial_end)/1000)
  assert.equal(schedule.phases[0].trial_end,schedule.phases[0].end_date)
  await f.api.reconcilePartnerBilling('partner','founder-retry')
  assert.equal(schedule.phases[0].end_date,Date.parse(c.cancellation_at)/1000)
  assert.equal(f.commands.find(x=>x.p_action==='batch').p_data.commands[0].data.state,'trialing')
 })
})
test('timely Founder cancellation rejected after transition survives recovery and cannot grant paid term',()=>engine(async f=>{
 const {c,schedule,setPaid}=founderEngine(f,true)
 const deadline=Math.floor(Date.now()/1000)+1
 c.trial_end=c.cancellation_at=new Date(deadline*1000).toISOString();schedule.phases[0].end_date=schedule.phases[0].trial_end=deadline
 f.mock.subscriptionSchedules.update=async()=>{setPaid();await new Promise(r=>setTimeout(r,Math.max(0,deadline*1000-Date.now()+10)));throw Error('provider phase already completed')}
 await assert.rejects(()=>f.api.cancelPartnerSubscription('partner','founder_annual'),/phase already completed/)
 assert.equal(f.store.mutation.operation,'schedule_trial_cancel')
 await f.api.recoverPartnerBilling('partner')
 assert.ok(f.commands.some(x=>x.p_action==='founder_late_exit_review'))
 assert.equal(f.commands.find(x=>x.p_action==='batch').p_data.commands[0].data.state,'canceled')
 await f.api.recoverPartnerBilling('partner')
 assert.equal(f.store.mutation,null)
}))
test('late provider objects for a closed Founder intent enter review without admitting or granting it',()=>engine(async f=>{
 const closed={...contract,id:'closed-founder',state:'expired',offer:{...contract.offer,offer_code:'founder'},trial_start:new Date(Date.now()-3600000).toISOString(),setup_intent_id:'seti_closed',subscription_id:null,schedule_id:null}
 f.ctx.contracts=[];f.ctx.closed_founders=[closed]
 const schedule={id:'sub_sched_late',metadata:{benefitsi_partner_contract:closed.id},customer:'cus_partner',livemode:false,status:'active',subscription:'sub_late'}
 f.mock.subscriptionSchedules={list:()=>iterable([schedule])}
 f.mock.subscriptions.list=()=>iterable([])
 await f.api.reconcilePartnerBilling('partner','late-closed-object')
 assert.ok(f.commands.some(x=>x.p_action==='founder_closed_object_review'&&x.p_data.active_objects))
 assert.equal(f.commands.find(x=>x.p_action==='batch').p_data.commands.length,0)
 await assert.rejects(()=>f.api.verifyClosedFounderReview('partner'),/cancellation_unconfirmed/)
 schedule.status='canceled';const retrieve=f.mock.subscriptions.retrieve;f.mock.subscriptions.retrieve=async id=>({...await retrieve(id),status:'canceled'})
 await f.api.verifyClosedFounderReview('partner')
 assert.ok(f.commands.some(x=>x.p_action==='founder_closed_objects_checked'))
}))

for (const boundary of ['monthly','final']) for (const paid of [false,true]) {
 test(`pre-dispatch Founder read failure recovers after ${boundary} end with ${paid?'paid':'trialing'} provider`,()=>engine(async f=>{
  const {c,schedule,setPaid}=founderEngine(f,true)
  const initialNow=Date.now(),effective=Math.floor(initialNow/1000)+1
  c.cancellation_requested_at=new Date(initialNow).toISOString()
  c.cancellation_at=new Date(effective*1000).toISOString()
  if(boundary==='final')c.trial_end=new Date(effective*1000).toISOString()
  schedule.phases[0].end_date=schedule.phases[0].trial_end=Date.parse(c.trial_end)/1000
  const originalEnd=c.cancellation_at,receipt=c.cancellation_requested_at
  const read=f.mock.subscriptions.retrieve
  f.mock.subscriptions.retrieve=async()=>{throw Error('first provider read unavailable')}
  await assert.rejects(()=>f.api.cancelPartnerSubscription('partner','founder_annual'),/first provider read unavailable/)
  assert.equal(f.store.mutation.operation,null)
  const preparedId=f.store.mutation.id
  let cancelAttempts=0,confirmed=false
  f.mock.subscriptions.retrieve=async id=>({...await read(id),...(confirmed?{status:'canceled'}:{})})
  f.mock.subscriptionSchedules.update=async()=>{throw Error('must not backdate completed cancellation phase')}
  f.mock.subscriptionSchedules.cancel=async(id,params)=>{
   assert.equal(id,schedule.id);assert.deepEqual(structuredClone(params),{invoice_now:false,prorate:false})
   cancelAttempts++;if(cancelAttempts===1)throw Error('cancellation transport unknown')
   confirmed=true;schedule.status='canceled';return schedule
  }
  const cancel=f.mock.subscriptions.cancel
  f.mock.subscriptions.cancel=async(id,params)=>{cancelAttempts++;if(cancelAttempts===1)throw Error('cancellation transport unknown');confirmed=true;return cancel(id,params)}
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,effective*1000-Date.now()+20)))
  if(paid){
   setPaid();schedule.status='released'
   f.mock.invoices.retrieve=async id=>({id,customer:'cus_partner',livemode:false,parent:{subscription_details:{subscription:c.subscription_id}},status:'paid',amount_due:c.offer.unit_amount,status_transitions:{paid_at:effective}})
   f.mock.invoicePayments.list=({invoice})=>iterable([{invoice,livemode:false,amount_paid:c.offer.unit_amount,payment:{charge:'ch_paid'}}])
  }
  // Contractual expiry must never masquerade as actual provider termination.
  const observed=await readPartnerSubscription(f.mock,c,'cus_partner',null)
  assert.equal(observed.state,'canceled')
  await assert.rejects(()=>f.api.recoverPartnerBilling('partner'),/cancellation transport unknown/)
  assert.equal(observed.provider_status,paid?'active':'trialing')
  if(paid)assert.equal(observed.first_payment_at,new Date(effective*1000).toISOString())
  assert.equal(f.store.mutation.id,preparedId,'prepared order remains actionable across takeover')
  assert.equal(f.store.mutation.operation,'schedule_trial_cancel')
  assert.ok(f.commands.some(x=>x.p_action==='founder_late_exit_review'),'uncertainty is visible before dispatch')
  const saved=structuredClone(f.store.mutation)
  await f.api.recoverPartnerBilling('partner')
  assert.equal(f.store.mutation,null)
  assert.equal((await f.mock.subscriptions.retrieve(c.subscription_id)).status,'canceled')
  assert.equal(c.cancellation_at,originalEnd);assert.equal(c.cancellation_requested_at,receipt)
  assert.equal(f.commands.filter(x=>x.p_action==='mutation_plan').length,1,'recovery retains exact planned operation')
  assert.equal(saved.params.schedule_id,c.schedule_id)
  const snapshot=f.commands.find(x=>x.p_action==='batch').p_data.commands[0].data
  assert.equal(snapshot.state,'canceled');assert.equal(snapshot.provider_status,'canceled')
  await f.api.recoverPartnerBilling('partner')
  assert.equal(cancelAttempts,2,'confirmed termination is not dispatched again')
 }))
}

test('lost overdue schedule cancellation response recovers actual termination without repeating dispatch',()=>engine(async f=>{
 const {c,schedule}=founderEngine(f)
 c.cancellation_at=new Date(Date.now()-1000).toISOString()
 let dispatches=0,canceled=false
 const read=f.mock.subscriptions.retrieve
 f.mock.subscriptions.retrieve=async id=>({...await read(id),...(canceled?{status:'canceled'}:{})})
 f.mock.subscriptionSchedules.update=async()=>{throw Error('cannot backdate a phase')}
 f.mock.subscriptionSchedules.cancel=async()=>{
  dispatches++;schedule.status='canceled';canceled=true
  throw Error('response lost after provider cancellation')
 }
 await assert.rejects(()=>f.api.cancelPartnerSubscription('partner','founder'),/response lost/)
 assert.equal(f.store.mutation.operation,'schedule_trial_cancel')
 assert.ok(f.commands.some(x=>x.p_action==='founder_late_exit_review'))
 await f.api.recoverPartnerBilling('partner')
 assert.equal(dispatches,1);assert.equal(f.store.mutation,null)
 assert.equal(f.commands.find(x=>x.p_action==='batch').p_data.commands[0].data.provider_status,'canceled')
}))
