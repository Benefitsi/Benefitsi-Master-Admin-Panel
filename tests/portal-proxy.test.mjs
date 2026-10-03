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
  '@/lib/supabase/bounded-fetch':{createBoundedSupabaseFetch:()=>()=>{throw new Error('No hosted transport in this test')}},
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

function capturedProxy(metrics,failure=false) {
 return loadTypescript('lib/supabase/proxy.ts',{
  './config':{getSupabaseConfig:()=>({isConfigured:true,url:'https://example.supabase.co',publishableKey:'test'})},
  '../auth-recovery':recovery,'@/lib/portal-routing':routing,
  '@/lib/supabase/bounded-fetch':{createBoundedSupabaseFetch:()=>()=>{throw new Error('No hosted transport in this test')}},
  '@supabase/ssr':{createServerClient:(_url,_key,options)=>{
   metrics.clients=(metrics.clients??0)+1;metrics.fetch=options.global?.fetch
   return {auth:{getUser:async()=>{
    if(metrics.refreshCookie) {
     options.cookies.setAll([{name:'__Host-benefitsi-admin-auth',value:'synthetic-refreshed-cookie',options:{path:'/',secure:true,sameSite:'lax'}}],{'Cache-Control':'private, no-store','Expires':'0'})
     metrics.requestCookies=options.cookies.getAll()
    }
    if(failure===true)throw new DOMException('Synthetic timeout','TimeoutError')
    return {data:{user:{id:'u'}},error:null}
   }},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{
    if(failure==='profile')throw new DOMException('Synthetic profile timeout','TimeoutError')
    return {data:{id:'u',is_admin:false},error:null}
   }})})})}
  }},
 }).updateSession
}
test('already public assets avoid session refresh while unknown assets retain the admin gate',async()=>{
 for(const path of ['/benefitsi-logo-on-light.svg','/favicon.ico','/ai-sw.js']) {
  const metrics={}
  const response=await capturedProxy(metrics)(new NextRequest('https://admin.benefitsi.de'+path))
  assert.equal(response.status,200)
  assert.equal(metrics.clients??0,0)
 }
 const metrics={}
 assert.equal((await capturedProxy(metrics)(new NextRequest('https://admin.benefitsi.de/private.svg'))).status,403)
 assert.equal(metrics.clients,1)
})
test('proxy auth and role queries use the bounded transport',async()=>{
 const metrics={}
 await capturedProxy(metrics)(new NextRequest('https://admin.benefitsi.de/'))
 assert.equal(typeof metrics.fetch,'function')
})
test('a thrown proxy auth failure cannot grant access and keeps public sign-in reachable',async()=>{
 const updateSession=capturedProxy({},true)
 for(const path of ['/','/api/bookings/export']) {
  const response=await updateSession(new NextRequest('https://admin.benefitsi.de'+path))
  assert.equal(response.status,503)
  assert.equal(response.headers.get('cache-control'),'private, no-store')
  assert.equal(response.headers.get('x-middleware-next'),null)
 }
 assert.equal((await updateSession(new NextRequest('https://admin.benefitsi.de/login'))).headers.get('x-middleware-next'),'1')
})
test('thrown auth and profile failures retain refreshed cookies and deny private access',async()=>{
 for(const failure of [true,'profile']) {
  const metrics={refreshCookie:true}
  const response=await capturedProxy(metrics,failure)(new NextRequest('https://admin.benefitsi.de/analytics'))
  assert.equal(response.status,503)
  assert.equal(response.headers.get('x-middleware-next'),null)
  assert.equal(response.headers.get('cache-control'),'private, no-store')
  assert.equal(response.cookies.get('__Host-benefitsi-admin-auth')?.value,'synthetic-refreshed-cookie')
  assert.equal(response.cookies.get('__Host-benefitsi-admin-auth')?.secure,true)
  assert.equal(metrics.requestCookies.find(cookie=>cookie.name==='__Host-benefitsi-admin-auth')?.value,'synthetic-refreshed-cookie')
 }
 const response=await capturedProxy({refreshCookie:true},true)(new NextRequest('https://admin.benefitsi.de/login'))
 assert.equal(response.headers.get('x-middleware-next'),'1')
 assert.equal(response.headers.get('cache-control'),'private, no-store')
 assert.equal(response.headers.get('expires'),'0')
 assert.equal(response.cookies.get('__Host-benefitsi-admin-auth')?.value,'synthetic-refreshed-cookie')
})
