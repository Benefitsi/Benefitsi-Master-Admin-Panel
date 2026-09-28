import assert from 'node:assert/strict'
import test from 'node:test'
import { requireCommerceProxy, requestBody, webOrigin } from '../../lib/commerce/http.ts'

function environment(values, run) {
 const saved=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]))
 for(const [key,value] of Object.entries(values))if(value===undefined)delete process.env[key];else process.env[key]=value
 try{return run()}finally{for(const [key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value}
}
const secret='test-only-proxy-secret-1234567890abcdef'
test('commerce proxy rejects disabled, missing, short and mismatched shared secrets',()=>{
 const request=(value)=>new Request('http://localhost/api/commerce/bookings',{headers:value?{'x-benefitsi-booking-secret':value}:{}})
 environment({BENEFITSI_COMMERCE_ENABLED:'true',BENEFITSI_BOOKING_PROXY_SECRET:secret},()=>{
  assert.doesNotThrow(()=>requireCommerceProxy(request(secret)))
  for(const value of [undefined,'short',secret.slice(0,-1)+'Z','ö'.repeat(40)])assert.throws(()=>requireCommerceProxy(request(value)),/unauthorized/)
 })
 for(const flag of ['false',undefined])environment({BENEFITSI_COMMERCE_ENABLED:flag,BENEFITSI_BOOKING_PROXY_SECRET:secret},()=>assert.throws(()=>requireCommerceProxy(request(secret)),/commerce_disabled/))
 environment({BENEFITSI_COMMERCE_ENABLED:'true',BENEFITSI_BOOKING_PROXY_SECRET:'short'},()=>assert.throws(()=>requireCommerceProxy(request('short')),/unauthorized/))
})
test('body reader accepts bounded JSON and rejects incompatible type or malformed body',async()=>{
 assert.deepEqual(await requestBody(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:'{"quantity":2}'})),{quantity:2})
 await assert.rejects(()=>requestBody(new Request('http://localhost',{method:'POST',body:'{}'})),/invalid_content_type/)
 await assert.rejects(()=>requestBody(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:'bad-json'})))
})
test('body reader cancels a chunked oversized stream without trusting Content-Length',async()=>{
 let cancelled=false
 const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(13000))},cancel(){cancelled=true}})
 const request=new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json','content-length':'1'},body:stream,duplex:'half'})
 await assert.rejects(()=>requestBody(request),/request_too_large/)
 assert.equal(cancelled,true)
})
test('public callback origin allows HTTPS and development HTTP localhost only',()=>{
 environment({NODE_ENV:'development',BENEFITSI_BOOKING_WEB_ORIGIN:'http://localhost:3011/path'},()=>assert.equal(webOrigin(),'http://localhost:3011'))
 environment({NODE_ENV:'production',BENEFITSI_BOOKING_WEB_ORIGIN:'https://benefitsi.example/path'},()=>assert.equal(webOrigin(),'https://benefitsi.example'))
 for(const value of ['http://elsewhere.test','ftp://localhost','file://localhost/a'])environment({NODE_ENV:'development',BENEFITSI_BOOKING_WEB_ORIGIN:value},()=>assert.throws(()=>webOrigin(),/invalid_web_origin/))
 environment({NODE_ENV:'production',BENEFITSI_BOOKING_WEB_ORIGIN:'http://localhost'},()=>assert.throws(()=>webOrigin(),/invalid_web_origin/))
})
