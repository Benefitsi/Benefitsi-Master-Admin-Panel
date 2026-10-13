import test from 'node:test'
import assert from 'node:assert/strict'
import Stripe from 'stripe'
import {loadTypescript} from './helpers/load-typescript.mjs'

const provider='11111111-2222-4333-8444-555555555555'
const merchant='acct_SandboxMerchant'
const staging='https://klfaqrrbigjtcgrslkkl.supabase.co'
const envKeys=['BENEFITSI_STRIPE_BOOKING_REALM','VERCEL_ENV','NEXT_PUBLIC_SUPABASE_URL','BENEFITSI_STRIPE_SANDBOX_PROVIDER_IDS','BENEFITSI_STRIPE_SANDBOX_MERCHANT_IDS','STRIPE_SANDBOX_WEBHOOK_SECRET']
function environment(t,overrides={}){
 const before=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]))
 t.after(()=>{for(const key of envKeys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]}})
 for(const key of envKeys)delete process.env[key]
 Object.assign(process.env,{BENEFITSI_STRIPE_BOOKING_REALM:'sandbox',VERCEL_ENV:'preview',NEXT_PUBLIC_SUPABASE_URL:staging,BENEFITSI_STRIPE_SANDBOX_PROVIDER_IDS:provider,BENEFITSI_STRIPE_SANDBOX_MERCHANT_IDS:merchant,STRIPE_SANDBOX_WEBHOOK_SECRET:'whsec_sandbox_fixture',...overrides})
}
function setup({configured=true,legacyConfigured=true,platformReady=true,verified}={}){
 const calls=[],sandbox=new Stripe('sk_test_sandbox_fixture'),legacy=new Stripe('sk_test_legacy_fixture')
 const config={isStripeSandboxConfigured:()=>configured,isStripeTestConfigured:()=>legacyConfigured,isStripeConnectPlatformReady:()=>platformReady,
  getVerifiedStripeSandboxClient:async()=>{calls.push('verify');return verified?await verified:sandbox},
  getStripeTestClient:()=>{calls.push('legacy');return legacy},verifyBookingWebhook:(...args)=>{calls.push('legacy-webhook');return legacy.webhooks.constructEvent(...args,'whsec_legacy_fixture')}}
 let client={}
 try{client=loadTypescript('lib/stripe/booking-client.ts',{'@/lib/stripe/config':config})}catch(error){if(error.code!=='ENOENT')throw error}
 return {...client,calls,sandbox,legacy}
}
function signed(stripe,event,secret='whsec_sandbox_fixture'){
 const payload=JSON.stringify(event)
 return [payload,stripe.webhooks.generateTestHeaderString({payload,secret})]
}

test('sandbox selection requires isolated Preview and never falls back to a primary client',async t=>{
 environment(t)
 const b=setup()
 assert.equal(b.getBookingRealm?.(),'sandbox')
 assert.equal(b.isBookingConnectConfigured(),true)
 assert.equal(await b.getBookingStripeClient(merchant),b.sandbox)
 assert.deepEqual(b.calls,['verify'])
 for(const value of ['production','development','Preview','']){
  process.env.VERCEL_ENV=value
  assert.equal(b.isBookingConnectConfigured(),false)
  await assert.rejects(()=>b.getBookingStripeClient(merchant))
 }
 assert.deepEqual(b.calls,['verify'])
})

test('unknown realm values fail closed while absent and exact legacy retain existing behavior',async t=>{
 environment(t)
 const b=setup()
 for(const realm of ['Sandbox',' sandbox','LEGACY','typo','']){
  process.env.BENEFITSI_STRIPE_BOOKING_REALM=realm
  assert.throws(()=>b.getBookingRealm())
  assert.equal(b.isBookingConnectConfigured(),false)
  await assert.rejects(()=>b.getBookingStripeClient('acct_LegacyMerchant'))
 }
 assert.deepEqual(b.calls,[])
 for(const realm of [undefined,'legacy']){
  if(realm===undefined)delete process.env.BENEFITSI_STRIPE_BOOKING_REALM;else process.env.BENEFITSI_STRIPE_BOOKING_REALM=realm
  assert.equal(b.getBookingRealm(),'legacy')
  assert.equal(b.isBookingConnectConfigured(),true)
  assert.equal(await b.getBookingStripeClient('acct_LegacyMerchant'),b.legacy)
  assert.equal(await b.getBookingConnectClient({providerId:provider,testMode:true,accountId:null}),b.legacy)
 }
 assert.deepEqual(b.calls,['legacy','legacy','legacy','legacy'])
})

test('sandbox DB boundary rejects production or missing database before local configuration or API access',async t=>{
 environment(t)
 const b=setup()
 assert.doesNotThrow(()=>b.assertBookingRealmBoundary())
 for(const url of ['https://production.supabase.co',staging+'/',undefined]){
  if(url===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=url
  assert.throws(()=>b.assertBookingRealmBoundary())
  assert.equal(b.isBookingConnectConfigured(),false)
  assert.equal(b.isBookingProviderAllowed(provider,merchant,true),false)
  await assert.rejects(()=>b.getBookingStripeClient(merchant))
  await assert.rejects(()=>b.getBookingConnectClient({providerId:provider,accountId:merchant,testMode:true}))
 }
 assert.deepEqual(b.calls,[])
 process.env.BENEFITSI_STRIPE_BOOKING_REALM='legacy'
 assert.doesNotThrow(()=>b.assertBookingRealmBoundary())
})

test('sandbox scope requires exact explicit provider and merchant IDs plus a persisted test assignment',async t=>{
 environment(t)
 const b=setup()
 assert.equal(b.isBookingProviderAllowed(provider,merchant,true),true)
 assert.equal(await b.getBookingConnectClient({providerId:provider,accountId:merchant,testMode:true}),b.sandbox)
 for(const input of [
  {providerId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',accountId:merchant,testMode:true},
  {providerId:provider,accountId:'acct_OtherMerchant',testMode:true},
  {providerId:provider,accountId:null,testMode:true},
  {providerId:provider,accountId:merchant,testMode:false},
  {providerId:provider,accountId:merchant,testMode:undefined},
 ]){
  assert.equal(b.isBookingProviderAllowed(input.providerId,input.accountId,input.testMode),false)
  await assert.rejects(()=>b.getBookingConnectClient(input))
 }
 await assert.rejects(()=>b.getBookingStripeClient('acct_OtherMerchant'))
 assert.deepEqual(b.calls,['verify'])
 process.env.BENEFITSI_STRIPE_SANDBOX_MERCHANT_IDS=merchant+'Extra'
 assert.equal(b.isBookingProviderAllowed(provider,merchant,true),false)
 await assert.rejects(()=>b.getBookingStripeClient(merchant))
 assert.deepEqual(b.calls,['verify'])
})

test('malformed or empty allowlists deny sandbox locally and sandbox readiness stays separate from UG readiness',async t=>{
 environment(t)
 const b=setup({platformReady:false})
 assert.equal(b.isBookingConnectConfigured(),true)
 for(const [key,value] of [
  ['BENEFITSI_STRIPE_SANDBOX_PROVIDER_IDS',''],
  ['BENEFITSI_STRIPE_SANDBOX_PROVIDER_IDS',provider+',*'],
  ['BENEFITSI_STRIPE_SANDBOX_MERCHANT_IDS','acct_'],
  ['BENEFITSI_STRIPE_SANDBOX_MERCHANT_IDS',merchant+',invalid'],
 ]){
  process.env.BENEFITSI_STRIPE_SANDBOX_PROVIDER_IDS=provider;process.env.BENEFITSI_STRIPE_SANDBOX_MERCHANT_IDS=merchant
  process.env[key]=value
  assert.equal(b.isBookingConnectConfigured(),false)
  await assert.rejects(()=>b.getBookingStripeClient(merchant))
 }
 assert.deepEqual(b.calls,[])
 process.env.BENEFITSI_STRIPE_SANDBOX_PROVIDER_IDS=provider;process.env.BENEFITSI_STRIPE_SANDBOX_MERCHANT_IDS=merchant
 const disabled=setup({configured:false})
 assert.equal(disabled.isBookingConnectConfigured(),false)
 await assert.rejects(()=>disabled.getBookingStripeClient(merchant))
 assert.deepEqual(disabled.calls,[])
 process.env.BENEFITSI_STRIPE_BOOKING_REALM='legacy'
 assert.equal(b.isBookingConnectConfigured(),false)
})

test('a scoped sandbox caller waits for identity proof and rechecks scope after the await',async t=>{
 environment(t)
 let resolve
 const proof=new Promise(done=>{resolve=done})
 const b=setup({verified:proof})
 let returned=false
 const pending=b.getBookingStripeClient(merchant).then(value=>{returned=true;return value})
 await Promise.resolve()
 assert.equal(returned,false)
 process.env.BENEFITSI_STRIPE_SANDBOX_MERCHANT_IDS='acct_ChangedMerchant'
 resolve(b.sandbox)
 await assert.rejects(()=>pending)
 assert.equal(returned,false)
 assert.deepEqual(b.calls,['verify'])
})

test('sandbox webhook requires its own signature, false mode and an allowed connected account',async t=>{
 environment(t)
 const b=setup()
 const event={id:'evt_test',object:'event',livemode:false,type:'checkout.session.completed',account:merchant,data:{object:{id:'cs_test_1',object:'checkout.session',livemode:false}}}
 const valid=signed(b.sandbox,event)
 assert.equal((await b.verifyBookingPaymentWebhook(...valid)).id,'evt_test')
 for(const args of [signed(b.sandbox,event,'whsec_legacy_fixture'),[valid[0],valid[1].replace(/v1=[^,]+/,'v1=invalid')],signed(b.sandbox,{...event,account:'acct_OtherMerchant'}),signed(b.sandbox,{...event,account:undefined}),signed(b.sandbox,{...event,livemode:true}),signed(b.sandbox,{...event,livemode:undefined})]){
  await assert.rejects(()=>b.verifyBookingPaymentWebhook(...args))
 }
 assert.equal(b.calls.includes('legacy'),false)
 assert.equal(b.calls.includes('legacy-webhook'),false)
 delete process.env.STRIPE_SANDBOX_WEBHOOK_SECRET
 await assert.rejects(()=>b.verifyBookingPaymentWebhook(...valid))
 process.env.BENEFITSI_STRIPE_BOOKING_REALM='legacy'
 const legacy=signed(b.legacy,event,'whsec_legacy_fixture')
 assert.equal((await b.verifyBookingPaymentWebhook(...legacy)).id,'evt_test')
 assert.equal(b.calls.at(-1),'legacy-webhook')
})
