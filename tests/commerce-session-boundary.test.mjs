import assert from 'node:assert/strict'
import test from 'node:test'
import {createRequire} from 'node:module'
import {loadTypescript} from './helpers/load-typescript.mjs'

const {NextRequest}=createRequire(import.meta.url)('next/server')
const {updateSession}=loadTypescript('lib/supabase/proxy.ts',{
 '@supabase/ssr':{createServerClient:()=>({auth:{getClaims:async()=>({data:{claims:null}})}})},
 './config':{getSupabaseConfig:()=>({isConfigured:true,url:'https://example.supabase.co',publishableKey:'test-key'})},
 '../auth-recovery':{loginPathForRequest:()=>'/login'},
})

test('commerce proxy APIs reach their secret authentication without a browser cookie',async()=>{
 for(const path of ['/api/commerce/catalog','/api/commerce/bookings','/api/commerce/status']){
  const response=await updateSession(new NextRequest('https://admin.benefitsi.test'+path))
  assert.equal(response.headers.get('location'),null,path)
  assert.equal(response.headers.get('x-middleware-next'),'1',path)
 }
})

test('commerce dashboard and unlisted API paths retain the session gate',async()=>{
 for(const path of ['/commerce','/partner/commerce','/api/commerce/catalog/extra','/api/commerce/notifications','/api/commerce/admin','/api/other']){
  const response=await updateSession(new NextRequest('https://admin.benefitsi.test'+path))
  assert.equal(response.status,307,path)
  assert.equal(response.headers.get('location'),'https://admin.benefitsi.test/login',path)
 }
})
