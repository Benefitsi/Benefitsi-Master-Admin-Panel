import assert from 'node:assert/strict'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'
import entitlementAdapter from '../lib/partners/entitlements.ts'
function context(session,{revoked=false}={}) {
 const client={from:()=>{const q={select:()=>q,order:()=>q,in:()=>q,then:resolve=>resolve({data:[{id:'own',name:'Shop'}],error:null})};return q},rpc:async()=>revoked?{error:{message:'partner_access_denied'}}:{data:{partner_id:'own',schema_version:1,role:'owner',plan_code:'free'},error:null}}
 return loadTypescript('lib/partners/page-context.ts',{'next/navigation':{redirect:path=>{throw new Error('redirect:'+path)},notFound:()=>{throw new Error('not_found')}},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/partner-portal':{getPartnerPortalSession:async()=>session},'./entitlements':entitlementAdapter}).partnerPageContext
}
test('expired/scanner sessions cannot enter dashboard, statistics or billing context',async()=>{
 for(const session of [null,{isAdmin:false,partnerIds:[]}])await assert.rejects(context(session)('own'),/redirect:\/partner\/login/)
})
test('switching partner cannot reuse previous scope and revoked RPC fails closed',async()=>{
 const session={isAdmin:false,partnerIds:['own']}
 await assert.rejects(context(session)('foreign'),/not_found/)
 await assert.rejects(context(session,{revoked:true})('own'),/partner_access_denied/)
 assert.equal((await context(session)('own')).partnerId,'own')
})
