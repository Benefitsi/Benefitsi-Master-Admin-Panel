import assert from 'node:assert/strict'
import test from 'node:test'
import { requestPublicCityRevalidation } from '../lib/city-pages/public-revalidation-request.ts'
const input={citySlug:'annweiler',cityId:'743d7d74-5856-4ccd-b91a-907a8cecab90'}
test('missing secret never attempts a public request', async()=>{
 let called=false
 assert.equal(await requestPublicCityRevalidation(input,{fetcher:async()=>{called=true}}),'not_configured')
 assert.equal(called,false)
})
test('refresh uses the fixed endpoint, bearer auth and bounded request', async()=>{
 let called=false
 const result=await requestPublicCityRevalidation(input,{secret:'test-only-token',fetcher:async(url,options)=>{
  called=true
  assert.equal(url,'https://benefitsi.de/api/revalidate')
  assert.equal(options.headers.Authorization,'Bearer test-only-token')
  assert.equal(options.cache,'no-store')
  assert.equal(options.redirect,'error')
  assert.ok(options.signal instanceof AbortSignal)
  assert.deepEqual(JSON.parse(options.body),{resource:'city',...input})
  return new Response(JSON.stringify({ok:true}),{status:200})
 }})
 assert.equal(result,'ok');assert.equal(called,true)
})
test('network, unsuccessful status and false payload produce a warning outcome', async()=>{
 for(const fetcher of [async()=>{throw new Error('network')},async()=>new Response('{}',{status:503}),async()=>new Response('{"ok":false}',{status:200})]) {
  assert.equal(await requestPublicCityRevalidation(input,{secret:'test-only-token',fetcher}),'failed')
 }
})
test('invalid city slugs and non-HTTPS configuration never send credentials',async()=>{
 const fetcher=async()=>{assert.fail('must not fetch')}
 assert.equal(await requestPublicCityRevalidation({...input,citySlug:'../foo'},{secret:'test',fetcher}),'failed')
 assert.equal(await requestPublicCityRevalidation(input,{secret:'test',baseUrl:'http://example.com',fetcher}),'failed')
})
