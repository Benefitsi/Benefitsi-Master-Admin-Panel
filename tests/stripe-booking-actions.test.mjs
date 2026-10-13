import test from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import {loadTypescript} from './helpers/load-typescript.mjs'

const providerId='11111111-2222-4333-8444-555555555555'
const bookingId='22222222-3333-4444-8555-666666666666'
const offerId='33333333-4444-4555-8666-777777777777'
const partnerId='44444444-5555-4666-8777-888888888888'

// Optional audit run proves these regressions against the pre-fix committed
// source without changing the working tree or creating compiler/cache files.
function loadAction(relative,stubs){
 if(process.env.BENEFITSI_ACTIONS_AUDIT_BASELINE!=='true')return loadTypescript(relative,stubs)
 const source=execFileSync('git',['show',`HEAD:${relative}`],{encoding:'utf8'})
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 const loadedModule={exports:{}},nativeRequire=createRequire(import.meta.url)
 vm.runInNewContext(js,{module:loadedModule,exports:loadedModule.exports,process,URL,console,require:id=>{
  if(Object.hasOwn(stubs,id))return stubs[id]
  if(id==='server-only')return {}
  return nativeRequire(id)
 }},{filename:relative})
 return loadedModule.exports
}

function form(values){const result=new FormData();for(const [key,value]of Object.entries(values))result.set(key,String(value));return result}
const cancelForm=()=>form({bookingId,reason:'Controlled TEST cancellation',confirm:'yes'})
const providerForm=()=>form({displayName:'Controlled TEST provider',supportEmail:'test@example.test'})
const offerForm=()=>form({providerId,cityId:partnerId,title:'Controlled TEST offer',slug:'controlled-test',description:'Controlled TEST description with adequate length',startsAt:'2027-01-01T10:00:00Z',endsAt:'2027-01-01T11:00:00Z',priceEuro:'12.00',capacity:'3'})
const orderingForm=()=>form({provider_id:providerId,partner_id:partnerId,enabled:'true'})

function setup({authorized=true,boundaryAllowed=true,scopeAllowed=true,realm='sandbox',configured=true,state='hold'}={}){
 const calls=[],mutations=[]
 const booking={id:bookingId,provider_id:providerId,state,stripe_account_id:'acct_TestMerchant',stripe_payment_intent_id:state==='confirmed'?'pi_Test':null}
 const offer={id:offerId,providerId},provider={id:providerId}
 const admin={
  from:table=>({
   select:()=>({eq:(column,value)=>({maybeSingle:async()=>{calls.push({kind:'read',table,column,value});return{data:booking,error:null}}})}),
   update:data=>{
    const mutation={table,data,filters:[]};mutations.push(mutation)
    const chain={eq(column,value){mutation.filters.push([column,value]);return this},select(){return this},single:async()=>({data:{id:providerId},error:null})}
    return chain
   },
  }),
  rpc:async(name,args)=>{mutations.push({name,args});return{error:null}},
 }
 const stubs={
  'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:url=>{throw Error(`redirect:${url}`)}},
  '@/lib/admin':{requireAdmin:async()=>{calls.push({kind:'admin'});if(!authorized)throw Error('admin-denied');return{adminSession:{user:{id:'admin-fixture',email:'admin@example.test'},profile:null}}}},
  '@/lib/supabase/admin':{createAdminClient:()=>{calls.push({kind:'db-client'});return admin}},
  '@/lib/stripe/booking-client':{
   assertBookingRealmBoundary:()=>{calls.push({kind:'boundary'});if(!boundaryAllowed)throw Error('boundary-denied')},
   getBookingRealm:()=>realm,isBookingStripeConfigured:()=>configured,
  },
  '@/lib/stripe/booking-provider-scope':{
   requireBookingProviderScope:async(client,id)=>{assert.equal(client,admin);calls.push({kind:'provider-scope',id});if(!scopeAllowed)throw Error('scope-denied')},
   requireBookingObjectScope:async(client,table,id)=>{assert.equal(client,admin);calls.push({kind:'object-scope',table,id});if(!scopeAllowed)throw Error('scope-denied')},
  },
  '@/lib/stripe/config':{isStripeTestConfigured:()=>configured},
  '@/lib/stripe/legacy-payments':{refundLegacyPayment:async()=>{calls.push({kind:'refund'});return{id:'re_Test'}}},
  '@/lib/bookings/contracts':{canPublishBookingOffer:()=>true},
  '@/lib/bookings/data':{loadBookingOperations:async()=>({offers:[offer],providers:[provider]})},
  '@/lib/commerce/requests':{uuid:value=>{assert.match(value,/^[a-f0-9-]{36}$/);return value}},
 }
 return{...loadAction('app/bookings/actions.ts',stubs),...loadAction('app/commerce/actions.ts',stubs),calls,mutations}
}

test('every booking admin mutation checks the realm boundary before opening a database client',async()=>{
 for(const [method,input]of [['createBookingProvider',providerForm()],['createBookingOffer',offerForm()],['submitBookingOfferToBen',form({offerId})],['publishBookingOffer',form({offerId})],['cancelOrRefundBooking',cancelForm()],['setPartnerOrdering',orderingForm()]]){
  const d=setup({boundaryAllowed:false})
  await assert.rejects(()=>d[method](input),/boundary-denied/)
  assert.deepEqual(d.calls.map(call=>call.kind),['admin','boundary'])
  assert.deepEqual(d.mutations,[])
 }
})

test('unpaid cancellation still requires allowed persisted provider before the cancellation RPC',async()=>{
 const denied=setup({scopeAllowed:false,state:'hold',configured:false})
 await assert.rejects(()=>denied.cancelOrRefundBooking(cancelForm()),/scope-denied/)
 assert.deepEqual(denied.mutations,[])
 assert.equal(denied.calls.some(call=>call.kind==='refund'),false)
 assert.equal(denied.calls.find(call=>call.kind==='provider-scope').id,providerId)
 const allowed=setup({realm:'legacy',state:'hold',configured:false})
 await assert.rejects(()=>allowed.cancelOrRefundBooking(cancelForm()),/success=booking_cancelled/)
 assert.equal(allowed.mutations.length,1)
 assert.equal(allowed.mutations[0].name,'request_booking_cancellation')
 assert.equal(allowed.mutations[0].args.p_booking_id,bookingId)
 assert.equal(allowed.calls.some(call=>call.kind==='refund'),false)
})

test('sandbox provider creation is refused server-side while the existing legacy workflow remains available',async()=>{
 const sandbox=setup()
 await assert.rejects(()=>sandbox.createBookingProvider(providerForm()),/error=sandbox_fixture_setup_only/)
 assert.deepEqual(sandbox.calls.map(call=>call.kind),['admin','boundary'])
 assert.deepEqual(sandbox.mutations,[])
 const legacy=setup({realm:'legacy'})
 await assert.rejects(()=>legacy.createBookingProvider(providerForm()),/success=provider_created/)
 assert.equal(legacy.mutations.length,1)
 assert.equal(legacy.mutations[0].name,'create_booking_provider')
})

test('offer creation, review and publication cannot mutate a denied provider or object',async()=>{
 for(const [method,input]of [['createBookingOffer',offerForm()],['submitBookingOfferToBen',form({offerId})],['publishBookingOffer',form({offerId})]]){
  const d=setup({scopeAllowed:false})
  await assert.rejects(()=>d[method](input),/scope-denied/)
  assert.deepEqual(d.mutations,[])
  const scope=d.calls.find(call=>call.kind.endsWith('-scope'))
  assert.equal(scope.id,method==='submitBookingOfferToBen'?offerId:providerId)
 }
})

test('commerce admin ordering requires provider scope and preserves the exact provider and partner filter',async t=>{
 const before=process.env.BENEFITSI_COMMERCE_ENABLED
 process.env.BENEFITSI_COMMERCE_ENABLED='true'
 t.after(()=>{if(before===undefined)delete process.env.BENEFITSI_COMMERCE_ENABLED;else process.env.BENEFITSI_COMMERCE_ENABLED=before})
 const denied=setup({scopeAllowed:false})
 await assert.rejects(()=>denied.setPartnerOrdering(orderingForm()),/error=save/)
 assert.deepEqual(denied.mutations,[])
 const allowed=setup()
 await assert.rejects(()=>allowed.setPartnerOrdering(orderingForm()),/success=saved/)
 assert.deepEqual(JSON.parse(JSON.stringify(allowed.mutations)),[{table:'booking_providers',data:{food_ordering_enabled:true},filters:[['id',providerId],['partner_id',partnerId]]}])
 assert.equal(allowed.calls.find(call=>call.kind==='provider-scope').id,providerId)
})

test('missing administrator authorization reaches neither boundary nor database in any mutation',async()=>{
 for(const [method,input]of [['createBookingProvider',providerForm()],['createBookingOffer',offerForm()],['submitBookingOfferToBen',form({offerId})],['publishBookingOffer',form({offerId})],['cancelOrRefundBooking',cancelForm()],['setPartnerOrdering',orderingForm()]]){
  const d=setup({authorized:false})
  await assert.rejects(()=>d[method](input),/admin-denied/)
  assert.deepEqual(d.calls,[{kind:'admin'}])
  assert.deepEqual(d.mutations,[])
 }
})

test('paid cancellation with missing selected Stripe configuration stops before the cancellation RPC or refund',async()=>{
 const d=setup({state:'confirmed',configured:false})
 await assert.rejects(()=>d.cancelOrRefundBooking(cancelForm()),/error=stripe_test_refund_unavailable/)
 assert.deepEqual(d.mutations,[])
 assert.equal(d.calls.some(call=>call.kind==='refund'),false)
})
