import assert from 'node:assert/strict'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'
const code=loadTypescript('lib/partner-portal.ts',{'./admin':{getAdminSession:async client=>{
 const {data:{user},error}=await client.auth.getUser()
 return error||!user?null:{user,isAdmin:false}
}},'./supabase/server':{}})
function sessionClient({expired=false,revoked=false,pro=false}={}) {
 const uid='authenticated-uid'
 return {auth:{getUser:async()=>({data:{user:expired?null:{id:uid,email:'%@example.com'}},error:null})},rpc:async(_name,{p_partner_id})=>p_partner_id==='own-shop'?{data:revoked?null:{partner_id:p_partner_id,role:'owner',plan_code:'free'},error:revoked?{message:'denied'}:null}:{data:{partner_id:p_partner_id,role:'admin',plan_code:pro?'pro':'free'},error:null},from:table=>{
   const q={select:()=>q,eq:()=>q,in:()=>q,maybeSingle:async()=>({data:{id:uid,uid:'victim-uid',is_partner:true},error:null}),then:resolve=>resolve({error:null,data:table==='partner_memberships'?[
     {partner_id:'own-shop',role:'owner',status:'active'}, {partner_id:'manager-shop',role:'admin',status:'active'}, {partner_id:'scanner-shop',role:'scanner',status:'active'}, {partner_id:'disabled-shop',role:'owner',status:'suspended'}]:[]})};return q
 }}
}
test('legacy profile uid and wildcard email cannot expand ownership',async()=>{
 const session=await code.getPartnerPortalSession(sessionClient())
 assert.deepEqual([...session.ownedPartnerIds],['own-shop'])
 assert.equal(code.canAccessPartner(session,'victim-shop'),false)
})
test('scanner and suspended membership never enter management portal',async()=>{
 const session=await code.getPartnerPortalSession(sessionClient())
 assert.deepEqual([...session.partnerIds],['own-shop','manager-shop'])
 assert.equal(code.canManagePartner(session,'manager-shop'),false)
 assert.equal(code.canManagePartner(await code.getPartnerPortalSession(sessionClient({pro:true})),'manager-shop'),true)
})
test('fresh resolver denial overrides persisted membership and expired session has no access',async()=>{
 const session=await code.getPartnerPortalSession(sessionClient({revoked:true}))
 assert.equal(code.canManagePartner(session,'own-shop'),false)
 assert.equal(await code.getPartnerPortalSession(sessionClient({expired:true})),null)
})
test('a validated server session is reused without a second authentication request',async()=>{
 const client=sessionClient()
 client.auth.getUser=async()=>{throw new Error('Redundant auth request')}
 const session=await code.getPartnerPortalSession(client,{user:{id:'authenticated-uid'},isAdmin:false})
 assert.deepEqual([...session.ownedPartnerIds],['own-shop'])
})
