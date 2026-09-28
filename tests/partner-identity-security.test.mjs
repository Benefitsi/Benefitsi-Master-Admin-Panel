import assert from 'node:assert/strict'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'
const code=loadTypescript('lib/partner-portal.ts',{'./admin':{getAdminSession:async()=>({isAdmin:false})},'./supabase/server':{}})
function sessionClient() {
 const uid='authenticated-uid'
 return {auth:{getUser:async()=>({data:{user:{id:uid,email:'%@example.com'}},error:null})},from:table=>{
   let ids=[];let byId=false
   const q={select:()=>q,eq:(col,val)=>{byId=col==='id'&&val===uid;return q},
     ilike:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:byId?{id:uid,uid:'victim-uid',is_partner:true}:{id:'victim-uid',is_partner:true},error:null}),
     in:(_col,val)=>{ids=val;return q},then:(resolve)=>resolve({error:null,data:table==='partners'?[{id:ids.includes('victim-uid')?'victim-shop':'own-shop'}]:[
      {partner_id:'active-staff-shop',active:true},{partner_id:'disabled-shop',active:false},{partner_id:'null-active-shop',active:null}
     ]})}
   return q
 }}
}
test('a legacy profile uid and wildcard email cannot expand partner ownership',async()=>{
 const session=await code.getPartnerPortalSession(sessionClient())
 assert.deepEqual([...session.ownedPartnerIds],['own-shop'])
 assert.equal(session.isAdmin,false)
})
test('only explicitly active staff memberships grant access',async()=>{
 const session=await code.getPartnerPortalSession(sessionClient())
 assert.deepEqual([...session.partnerIds],['own-shop','active-staff-shop'])
 assert.equal(code.canManagePartner(session,'active-staff-shop'),false)
 assert.equal(code.canAccessPartner(session,'victim-shop'),false)
})
