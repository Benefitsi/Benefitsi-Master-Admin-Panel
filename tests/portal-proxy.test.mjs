import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server.js'
import { loadTypescript } from './helpers/load-typescript.mjs'
import * as routing from '../lib/portal-routing.ts'
import * as recovery from '../lib/auth-recovery.ts'
function proxyFor(user,profile,error=null) {
 return loadTypescript('lib/supabase/proxy.ts',{
  './config':{getSupabaseConfig:()=>({isConfigured:true,url:'https://example.supabase.co',publishableKey:'test'})},
  '../auth-recovery':recovery,'@/lib/portal-routing':routing,
  '@supabase/ssr':{createServerClient:()=>({auth:{getUser:async()=>({data:{user},error})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile,error:null})})})})})},
 }).updateSession
}
test('partner and forged roles are denied on every privileged route regardless of method or RSC headers',async()=>{
 for(const profile of [null,{id:'u',is_admin:false},{id:'other',is_admin:true},{id:'u',is_admin:'true'}]) {
  for(const path of ['/','/analytics','/wissen','/api/bookings/export','/api/stripe/connect/status','/unknown-admin-route']) {
   for(const method of ['GET','POST']) {
    const response=await proxyFor({id:'u'},profile)(new NextRequest('https://admin.benefitsi.de'+path,{method,headers:{RSC:'1','Next-Action':'forged','x-middleware-subrequest':'proxy:proxy:proxy'}}))
    assert.equal(response.status,403,path)
   }
  }
 }
})
test('anonymous APIs and mutation attempts return 401, pages redirect without leaking query tokens',async()=>{
 const proxy=proxyFor(null,null)
 assert.equal((await proxy(new NextRequest('https://admin.benefitsi.de/api/bookings/export'))).status,401)
 assert.equal((await proxy(new NextRequest('https://admin.benefitsi.de/',{method:'POST'}))).status,401)
 const response=await proxy(new NextRequest('https://partner.benefitsi.de/partner?token=secret'))
 assert.equal(response.headers.get('location'),'https://partner.benefitsi.de/partner/login')
 assert.equal(response.headers.get('cache-control'),'private, no-store')
})
test('a valid admin is admitted only on the admin surface; partner host never serves admin endpoints',async()=>{
 const proxy=proxyFor({id:'u'},{id:'u',is_admin:true})
 assert.equal((await proxy(new NextRequest('https://admin.benefitsi.de/analytics'))).status,200)
 assert.equal((await proxy(new NextRequest('https://partner.benefitsi.de/analytics'))).status,403)
})
test('auth errors deny access even when a user object is returned',async()=>{
 assert.equal((await proxyFor({id:'u'},{id:'u',is_admin:true},{message:'revoked'})(new NextRequest('https://admin.benefitsi.de/api/bookings/export'))).status,401)
})
