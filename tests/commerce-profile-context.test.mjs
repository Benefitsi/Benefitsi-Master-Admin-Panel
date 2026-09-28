import test from 'node:test'
import assert from 'node:assert/strict'
import {commerceAccount,accountIdentity} from '../lib/commerce/account.ts'
import {loadTypescript} from './helpers/load-typescript.mjs'
const partner='44444444-4444-4444-8444-444444444444',user='22222222-2222-4222-8222-222222222222'
test('checkout profile works when production denies direct users-table reads',async()=>{
 const admin={
  auth:{getUser:async()=>({data:{user:{id:user}},error:null})},
  from:()=>{throw Error('permission denied for table users')},
  rpc:async(name,args)=>{
   if(name==='commerce_app_session_context')return {data:{user_id:user,partner_id:partner},error:null}
   assert.equal(name,'commerce_deal_context');assert.equal(args.p_user_id,user)
   return {data:{deals:[],test_mode:true,customer:{name:'Test Customer',email:'test@example.invalid'}},error:null}
  },
 }
 const {accountRequest}=loadTypescript('lib/commerce/account-service.ts',{'@/lib/supabase/admin':{createAdminClient:()=>admin},'./account':{commerceAccount,accountIdentity}})
 const context=await accountRequest({action:'context',partner_id:partner,session_token:'a'.repeat(64)})
 assert.equal(context.authenticated,true)
 assert.deepEqual(context.customer,{name:'Test Customer',email:'test@example.invalid'})
})
