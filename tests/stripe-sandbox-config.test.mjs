import assert from 'node:assert/strict'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'

const target='acct_1T3ZuLH0Ev7iKGq0'
const envKeys=['STRIPE_SECRET_KEY','STRIPE_SANDBOX_SECRET_KEY','BENEFITSI_STRIPE_SANDBOX_READY','BENEFITSI_STRIPE_EXPECTED_ACCOUNT_ID','BENEFITSI_STRIPE_CONNECT_PLATFORM_READY']
function setup(t,overrides={},responses={}) {
  const previous=envKeys.map(key=>process.env[key])
  for(const key of envKeys)delete process.env[key]
  Object.assign(process.env,{STRIPE_SECRET_KEY:'sk_test_primary_fixture',STRIPE_SANDBOX_SECRET_KEY:'rk_test_sandbox_fixture',BENEFITSI_STRIPE_SANDBOX_READY:'true',BENEFITSI_STRIPE_EXPECTED_ACCOUNT_ID:target,...overrides})
  t.after(()=>envKeys.forEach((key,index)=>previous[index]===undefined?delete process.env[key]:process.env[key]=previous[index]))
  const calls=[],clients=[]
  class StripeFixture {
    constructor(key,options){
      this.key=key;this.options=options;clients.push(this)
      this.accounts={retrieveCurrent:async(...args)=>{calls.push({operation:'account',args,key});return responses.account ? responses.account() : {id:target,object:'account'}}}
      this.balance={retrieve:async(...args)=>{calls.push({operation:'balance',args,key});return responses.balance ? responses.balance() : {object:'balance',livemode:false}}}
    }
  }
  const config=loadTypescript('lib/stripe/config.ts',{stripe:StripeFixture})
  return {config,calls,clients}
}

test('sandbox policy accepts only test restricted/secret keys and exact separately approved account',async t=>{
  const {config,calls}=setup(t)
  assert.equal(typeof config.isStripeSandboxConfigured,'function')
  assert.equal(config.isStripeSandboxConfigured(),true)
  for(const value of ['sk_live_rejected','rk_live_rejected','pk_test_public','rk_test_','rk_test_bad\nembedded','sk_test_has space']){
    process.env.STRIPE_SANDBOX_SECRET_KEY=value
    assert.equal(config.isStripeSandboxConfigured(),false)
    await assert.rejects(config.getVerifiedStripeSandboxClient())
  }
  assert.equal(calls.length,0)
})

test('missing readiness, wrong target or invalid key denies access before creating SDK or reading Stripe',async t=>{
  const {config,calls,clients}=setup(t)
  for(const [key,value] of [['BENEFITSI_STRIPE_SANDBOX_READY','false'],['BENEFITSI_STRIPE_EXPECTED_ACCOUNT_ID','acct_OtherSandbox'],['STRIPE_SANDBOX_SECRET_KEY','sk_live_rejected']]){
    const before=process.env[key];process.env[key]=value
    assert.equal(config.isStripeSandboxConfigured(),false)
    await assert.rejects(config.getVerifiedStripeSandboxClient())
    process.env[key]=before
  }
  assert.equal(calls.length,0);assert.equal(clients.length,0)
  assert.equal(config.isStripeConnectPlatformReady(),false)
})

test('same SDK verifies its own platform account then exact false livemode before client return',async t=>{
  let resolveAccount,resolveBalance,balanceStarted
  const account=new Promise(resolve=>{resolveAccount=resolve}),balance=new Promise(resolve=>{resolveBalance=resolve})
  const started=new Promise(resolve=>{balanceStarted=resolve})
  const {config,calls}=setup(t,{}, {account:()=>account,balance:()=>{balanceStarted();return balance}})
  let returned=false
  const pending=config.getVerifiedStripeSandboxClient().then(client=>{returned=true;return client})
  assert.equal(returned,false);assert.equal(calls.length,1)
  resolveAccount({id:target,object:'account'})
  await started
  assert.equal(returned,false);assert.equal(calls.length,2)
  resolveBalance({object:'balance',livemode:false})
  const client=await pending
  assert.equal(returned,true);assert.equal(client.key,'rk_test_sandbox_fixture')
  assert.deepEqual(calls.map(call=>call.operation),['account','balance'])
  assert.ok(calls.every(call=>call.args.length===0))
})

test('wrong account and unconfirmed test mode never expose the client',async t=>{
  let current={id:'acct_WrongPrimary',object:'account'},mode=false
  const {config,calls}=setup(t,{}, {account:async()=>current,balance:async()=>({object:'balance',livemode:mode})})
  await assert.rejects(config.getVerifiedStripeSandboxClient())
  assert.deepEqual(calls.map(call=>call.operation),['account'])
  current={id:target,object:'account'}
  for(const bad of [true,undefined,'false']){mode=bad;await assert.rejects(config.getVerifiedStripeSandboxClient())}
  mode=false;assert.ok(await config.getVerifiedStripeSandboxClient())
})

test('concurrent verification is shared, while key rotation and disable invalidate proof',async t=>{
  const {config,calls}=setup(t)
  const [one,two]=await Promise.all([config.getVerifiedStripeSandboxClient(),config.getVerifiedStripeSandboxClient()])
  assert.equal(one,two);assert.equal(calls.length,2)
  assert.equal(await config.getVerifiedStripeSandboxClient(),one);assert.equal(calls.length,2)
  process.env.STRIPE_SANDBOX_SECRET_KEY='sk_test_rotated_fixture'
  const rotated=await config.getVerifiedStripeSandboxClient()
  assert.notEqual(rotated,one);assert.equal(calls.length,4)
  process.env.BENEFITSI_STRIPE_SANDBOX_READY='false'
  await assert.rejects(config.getVerifiedStripeSandboxClient());assert.equal(calls.length,4)
  process.env.BENEFITSI_STRIPE_SANDBOX_READY='true'
  assert.ok(await config.getVerifiedStripeSandboxClient());assert.equal(calls.length,6)
})

test('policy changes during readback reject pending proof and SDK errors never expose their messages',async t=>{
  let fail=true
  const {config}=setup(t,{}, {account:async()=>{
    if(fail)throw new Error('private rk_test_never_echo account diagnostics')
    process.env.BENEFITSI_STRIPE_SANDBOX_READY='false'
    return {id:target,object:'account'}
  }})
  await assert.rejects(config.getVerifiedStripeSandboxClient(),error=>!error.message.includes('never_echo'))
  fail=false;await assert.rejects(config.getVerifiedStripeSandboxClient())
})

test('sandbox never falls back to the existing primary key and legacy validates rotations before cache',async t=>{
  const {config,calls}=setup(t)
  const legacy=config.getStripeTestClient()
  const sandbox=await config.getVerifiedStripeSandboxClient()
  assert.notEqual(legacy,sandbox);assert.equal(legacy.key,'sk_test_primary_fixture')
  assert.equal(config.isStripeConnectPlatformReady(),false)
  delete process.env.STRIPE_SANDBOX_SECRET_KEY
  await assert.rejects(config.getVerifiedStripeSandboxClient())
  assert.equal(calls.length,2)
  process.env.STRIPE_SECRET_KEY='rk_test_primary_rotated_fixture'
  assert.equal(config.isStripeTestConfigured(),true)
  assert.notEqual(config.getStripeTestClient(),legacy)
  process.env.STRIPE_SECRET_KEY='sk_live_never_return_cached_client'
  assert.equal(config.isStripeTestConfigured(),false)
  assert.throws(()=>config.getStripeTestClient())
})
