import assert from 'node:assert/strict'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'
const controls=loadTypescript('lib/agent-profile-controls.ts')
const server=loadTypescript('lib/agent-profile-controls-server.ts',{'./agent-profile-controls':controls,'./admin':{},'./supabase/server':{},'./finance-agent':{}},{Request,Response,AbortSignal})

test('model write requires same origin, JSON and bounded actual stream',async()=>{
  const url='https://admin.benefitsi.de/api/agents/profiles/ben/models'
  const request=(body,headers={})=>new Request(url,{method:'POST',body,headers:{origin:'https://admin.benefitsi.de','content-type':'application/json',...headers}})
  assert.deepEqual(JSON.parse(JSON.stringify(await server.profileModelRequestBody(request('{"confirmed":true}')))),{confirmed:true})
  for(const bad of [request('{}',{origin:'https://evil.example'}),request('{}',{'content-type':'text/plain'}),request('x'.repeat(4097)),request('[]'),request('invalid')]) await assert.rejects(server.profileModelRequestBody(bad))
})
test('error responses have no-store and never expose raw provider or document errors',async()=>{
  const response=server.profileControlErrorResponse(new Error('sk-private provider stack /Users/patrick'))
  assert.equal(response.status,503)
  assert.equal(response.headers.get('cache-control'),'no-store')
  assert.deepEqual(await response.json(),{error:'bridge_unavailable'})
  assert.equal(server.profileControlErrorResponse(new controls.AgentProfileControlError('access_denied',403)).status,403)
})

test('actual server authority denies unauthenticated, partner and finance-limited requests before remote IO',async()=>{
  let calls=0
  const load=(isAdmin,financeRead)=>loadTypescript('lib/agent-profile-controls-server.ts',{
    './agent-profile-controls':controls,'./admin':{getAdminSession:async()=>isAdmin===null?null:{isAdmin}},
    './supabase/server':{createClient:async()=>({})},'./finance-agent':{getFinanceAccess:async()=>({isAdmin,financeRead})},
  },{Request,Response,AbortSignal,fetch:async()=>{calls++;throw new Error('remote must not happen')}})
  for(const [admin,finance,profile] of [[null,true,'ben'],[false,true,'ben'],[true,false,'benefitsi-finance'],[true,true,'studio'],[true,true,'viki']]){
    await assert.rejects(load(admin,finance).requestAgentProfileOperation(profile,'context-list'))
  }
  assert.equal(calls,0)
})

test('server bridge uses configured endpoint without redirects, rejects oversized and sanitizes unknown errors',async()=>{
  const previous={url:process.env.M1_BRIDGE_URL,secret:process.env.M1_BRIDGE_SECRET}
  process.env.M1_BRIDGE_URL='https://m1.example/untrusted/path';process.env.M1_BRIDGE_SECRET='test-only-token'
  let calls=0
  const load=response=>loadTypescript('lib/agent-profile-controls-server.ts',{
    './agent-profile-controls':controls,'./admin':{getAdminSession:async()=>({isAdmin:true})},
    './supabase/server':{createClient:async()=>({})},'./finance-agent':{},
  },{Request,Response,AbortSignal,fetch:async(url,init)=>{calls++;assert.equal(url,'https://m1.example/hermes/profiles');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(JSON.parse(init.body).schemaVersion,1);return response}})
  try{
    const oversized=load(new Response('x'.repeat(512*1024+1)))
    await assert.rejects(oversized.requestAgentProfileOperation('ben','model-options'),error=>error.code==='invalid_response')
    const privateError=load(Response.json({error:'raw-private-key /Users/path'},{status:500}))
    await assert.rejects(privateError.requestAgentProfileOperation('ben','model-options'),error=>error.code==='bridge_unavailable'&&!error.message.includes('private'))
    assert.equal(calls,2)
  }finally{
    if(previous.url===undefined)delete process.env.M1_BRIDGE_URL;else process.env.M1_BRIDGE_URL=previous.url
    if(previous.secret===undefined)delete process.env.M1_BRIDGE_SECRET;else process.env.M1_BRIDGE_SECRET=previous.secret
  }
})
