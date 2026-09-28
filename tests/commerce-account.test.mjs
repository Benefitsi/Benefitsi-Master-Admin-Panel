import test from 'node:test'
import assert from 'node:assert/strict'
import { commerceAccount } from '../lib/commerce/account.ts'
const partner='44444444-4444-4444-8444-444444444444', user='22222222-2222-4222-8222-222222222222'
const token='a'.repeat(64)
test('issue uses verified identity, never body user_id',async()=>{
 let issued
 const result=await commerceAccount({action:'issue',partner_id:partner,access_token:'signed-access-token',user_id:'forged'}, {
  verifyUser:async value=>{assert.equal(value,'signed-access-token');return {id:user}},
  rpc:async(name,args)=>{issued={name,args};return {ticket:token}},
 })
 assert.deepEqual(issued,{name:'commerce_issue_app_session',args:{p_user_id:user,p_partner_id:partner}})
 assert.equal(result.ticket,token)
})
test('anonymous or invalid access token cannot create account session',async()=>{
 for(const verified of [null,{id:user,is_anonymous:true}]) await assert.rejects(()=>commerceAccount({action:'issue',partner_id:partner,access_token:'bad'}, {verifyUser:async()=>verified,rpc:async()=>{throw Error('must not issue')}}),/account_login_required/)
})
test('quote obtains identity from partner-scoped session and discards client prices',async()=>{
 const calls=[]
 const result=await commerceAccount({action:'quote',partner_id:partner,session_token:token,offering_id:partner,items:[],deal_id:user,customer_user_id:'forged',discount_amount:5000}, {
  verifyUser:async()=>null,
  rpc:async(name,args)=>{calls.push({name,args});return name==='commerce_app_session_context'?{user_id:user,partner_id:partner}:{discount_amount:600}},
 })
 assert.equal(result.discount_amount,600)
 assert.deepEqual(calls[1].args,{p_partner_id:partner,p_user_id:user,p_offering_id:partner,p_items:[],p_deal_id:user})
})
test('guest context exposes no personal deals; unauthenticated quote fails',async()=>{
 const deps={verifyUser:async()=>null,rpc:async()=>{throw Error('must not read')}}
 assert.deepEqual(await commerceAccount({action:'context',partner_id:partner},deps),{authenticated:false,deals:[]})
 await assert.rejects(()=>commerceAccount({action:'quote',partner_id:partner,items:[]},deps),/account_login_required/)
})
test('cross-partner session response and malformed tokens fail closed',async()=>{
 const deps={verifyUser:async()=>null,rpc:async()=>({user_id:user,partner_id:user})}
 await assert.rejects(()=>commerceAccount({action:'context',partner_id:partner,session_token:token},deps),/account_login_required/)
 await assert.rejects(()=>commerceAccount({action:'consume',partner_id:partner,ticket:'bad'},deps),/invalid_account_token/)
})
test('recovery scope is stable for the verified account and distinct between accounts',async()=>{
 const input={action:'context',partner_id:partner,session_token:token}
 const deps=id=>({verifyUser:async()=>null,rpc:async name=>name==='commerce_app_session_context'?{user_id:id,partner_id:partner}:{deals:[]}})
 const a=await commerceAccount(input,deps(user)),again=await commerceAccount({...input,session_token:'b'.repeat(64)},deps(user)),other=await commerceAccount(input,deps(partner))
 assert.match(a.recovery_scope,/^[a-f0-9]{64}$/);assert.equal(a.recovery_scope,again.recovery_scope);assert.notEqual(a.recovery_scope,other.recovery_scope)
 assert.equal(a.user_id,undefined)
})
