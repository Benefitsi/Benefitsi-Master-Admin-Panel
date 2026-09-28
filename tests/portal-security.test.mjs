import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTypescript } from './helpers/load-typescript.mjs'

const hostHeaders = (host) => ({ headers: async () => new Headers({host}) })
const user = {id:'partner-uid',email:'%@example.com'}
const profile = {id:'partner-uid',email:user.email,display_name:'Partner',is_admin:false}
function clientFor(profileResult=profile) {
  return {
    auth:{getUser:async()=>({data:{user},error:null})},
    from:()=>{
      let byId=false
      const query={select:()=>query,eq:(column,id)=>{byId=column==='id'&&id===user.id;return query},
        ilike:()=>query,order:()=>query,limit:()=>query,
        maybeSingle:async()=>({data:byId?profileResult:{...profile,id:'admin-uid',is_admin:true},error:null})}
      return query
    }
  }
}
function adminCode(host='admin.benefitsi.de') {
  return loadTypescript('lib/admin.ts',{'next/headers':hostHeaders(host),'@/lib/supabase/server':{},'@/lib/supabase/config':{}})
}
test('an email wildcard or collision cannot confer admin privileges',async()=>{
  assert.equal((await adminCode().getAdminSession(clientFor())).isAdmin,false)
})
test('admin privilege requires a literal database boolean',()=>{
  for(const is_admin of [1,'true','false',null,undefined]) assert.equal(adminCode().isAdminProfile({...profile,is_admin}),false)
})
test('even an admin session cannot authorize an admin action on the partner host',async()=>{
  assert.equal((await adminCode('partner.benefitsi.de').getAdminSession(clientFor({...profile,is_admin:true}))).isAdmin,false)
})
test('a UID-linked admin retains access on the admin host',async()=>{
  assert.equal((await adminCode().getAdminSession(clientFor({...profile,is_admin:true}))).isAdmin,true)
})
