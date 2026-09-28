import test from 'node:test'
import assert from 'node:assert/strict'
import { runCollectionTick } from '../lib/seo/collection-runner.ts'
import { batchesFromSnapshots } from '../lib/seo/seo-comparison.ts'

const clock=()=>new Date('2026-09-28T12:00:00Z')
const comparison={version:1,channel:'organic',subjectUrl:'https://partner.example/',keywords:['Döner Annweiler','Pizza Annweiler'],location:'Annweiler am Trifels, DE',locale:'de-DE',device:'mobile',latitude:null,longitude:null,partnerSince:null,packageStartedOn:null,baseline:null}
const target={id:'target',canonical_url:comparison.subjectUrl,target_type:'domain',partner_id:'partner',city_id:null,provider_config:{comparison}}
const good={state:'ok',source:'website',method:'bounded_https_audit_v1',observedAt:clock().toISOString(),data:{findings:[]}}
function harness(kinds=['crawl']) {
 const calls={finish:[],requests:[],reservations:[],ticks:[]}
 const jobs=kinds.map((kind,i)=>({id:`run-${i}`,target_id:'target',kind,lease_token:`lease-${i}`,settings_updated_at:'version',target_url:target.canonical_url,comparison_config:comparison}))
 const store={startTick:async()=>'tick',finishTick:async(...args)=>calls.ticks.push(args),schedule:async()=>jobs.length,claim:async()=>jobs.shift()??null,
  load:async()=>({target,settings:{enabled:true,crawl_enabled:true,gsc_enabled:false,gbp_enabled:false,psi_enabled:false,rank_enabled:true,updated_at:'version'}}),
  finish:async(...args)=>{calls.finish.push(args);return true},reserve:async(...args)=>{calls.reservations.push(args);return{state:'claimed',id:'request'}},finishRequest:async(...args)=>calls.requests.push(args)}
 const credentials={google:async()=>null,bright:null,psi:null}
 const providers={crawl:async()=>good,rank:async()=>{throw Error('unexpected network')},gsc:async()=>{throw Error('unexpected Google')},gbp:async()=>good,psi:async()=>good}
 return{store,calls,credentials,providers}
}
test('worker bounds job count and reports only lease-accepted completions',async()=>{
 const h=harness(['crawl','crawl','crawl','crawl','crawl']);let count=0
 h.store.finish=async(...args)=>{h.calls.finish.push(args);return++count!==1}
 const result=await runCollectionTick(h.store,h.credentials,{clock,providers:h.providers})
 assert.equal(result.processed,4);assert.equal(result.saved,3);assert.equal(result.stale,1)
 assert.equal(h.calls.ticks.length,1);assert.equal(h.calls.finish[0][1],good)
})
test('missing SERP credentials do not reserve quota and persist a complete unknown batch',async()=>{
 const h=harness(['rank'])
 await runCollectionTick(h.store,h.credentials,{clock,providers:h.providers})
 assert.equal(h.calls.reservations.length,0)
 const [,observation,rows]=h.calls.finish[0]
 assert.equal(observation.state,'unconfigured');assert.equal(rows.length,2)
 assert.equal(batchesFromSnapshots('target',comparison,rows)[0].results.every(r=>r.state==='unknown'),true)
})
test('cached SERPs preserve observation time and reuse without external calls or extra reservations',async()=>{
 const h=harness(['rank']);h.credentials.bright={apiKey:'fixture',zone:'free'}
 let index=0
 h.store.reserve=async()=>({state:'cached',observation:{state:'ok',source:'bright_data',method:'google_organic_top10_full_json_v1',observedAt:'2026-09-28T06:00:00Z',data:{query:comparison.keywords[index++],context:{...comparison},organic:[{rank:3,link:'https://partner.example/menu'}],coverage:{depth:10,complete:false}}}})
 await runCollectionTick(h.store,h.credentials,{clock,providers:h.providers})
 const [,observation,rows]=h.calls.finish[0]
 assert.equal(observation.state,'ok');assert.equal(h.calls.requests.length,0)
 assert.equal(rows[0].observed_at,'2026-09-28T06:00:00Z')
 assert.equal(batchesFromSnapshots('target',comparison,rows)[0].results[0].position,3)
})
test('quota refusal never invokes a provider and never claims outside top10',async()=>{
 const h=harness(['rank']);h.credentials.bright={apiKey:'fixture',zone:'free'}
 h.store.reserve=async()=>({state:'blocked',reason:'quota_exhausted'})
 await runCollectionTick(h.store,h.credentials,{clock,providers:h.providers})
 const [,result,rows]=h.calls.finish[0]
 assert.equal(result.state,'blocked');assert.equal(result.errorCode,'quota_exhausted')
 assert.equal(rows.every(r=>r.rank_position===null&&r.coverage===0),true)
})
test('network failure consumes its reservation, is recorded, and keeps missing keywords unknown',async()=>{
 const h=harness(['rank']);h.credentials.bright={apiKey:'fixture',zone:'free'}
 h.providers.rank=async()=>({state:'rate_limited',source:'bright_data',method:'google_organic_top10_full_json_v1',observedAt:clock().toISOString(),data:null})
 await runCollectionTick(h.store,h.credentials,{clock,providers:h.providers})
 assert.equal(h.calls.reservations.length,1);assert.equal(h.calls.requests.length,1)
 assert.equal(h.calls.finish[0][1].state,'rate_limited');assert.equal(h.calls.finish[0][2].length,2)
})
test('storage failures leave an error heartbeat without leaking exception contents',async()=>{
 const h=harness();h.store.claim=async()=>{throw Error('SECRET database payload')}
 await assert.rejects(runCollectionTick(h.store,h.credentials,{clock,providers:h.providers}),/collection_storage/)
 assert.equal(h.calls.ticks[0][2],'collection_storage')
 assert.equal(JSON.stringify(h.calls).includes('SECRET'),false)
})
test('slow successful storage and crawl calls stay within the 220 second tick including start and finalization',async()=>{
 const h=harness(['crawl','crawl','crawl','crawl']);const originalNow=Date.now;let elapsed=0
 const slow=(fn,ms)=>async(...args)=>{elapsed+=ms;return fn(...args)}
 try{
  Date.now=()=>elapsed
  h.store.startTick=slow(h.store.startTick,11_000)
  h.store.schedule=slow(h.store.schedule,11_000)
  h.store.claim=slow(h.store.claim,11_000)
  h.store.load=slow(h.store.load,11_000)
  h.store.finish=slow(h.store.finish,11_000)
  h.store.finishTick=slow(h.store.finishTick,11_000)
  h.providers.crawl=slow(h.providers.crawl,45_000)
  const result=await runCollectionTick(h.store,h.credentials,{clock,providers:h.providers})
  assert.equal(result.processed,2)
  assert.equal(result.saved,2)
  assert.ok(elapsed<=220_000,`tick elapsed ${elapsed}ms`)
 }finally{Date.now=originalNow}
})
test('rank stops admitting requests while preserving a complete unknown batch and its claimed request result',async()=>{
 const h=harness(['crawl','rank']);h.credentials.bright={apiKey:'fixture',zone:'free'}
 const originalNow=Date.now;let elapsed=0
 const slow=(fn,ms)=>async(...args)=>{elapsed+=ms;return fn(...args)}
 try{
  Date.now=()=>elapsed
  h.store.startTick=slow(h.store.startTick,11_000)
  h.store.schedule=slow(h.store.schedule,11_000)
  h.store.claim=slow(h.store.claim,11_000)
  h.store.load=slow(h.store.load,11_000)
  h.store.reserve=slow(h.store.reserve,11_000)
  h.store.finishRequest=slow(h.store.finishRequest,11_000)
  h.store.finish=slow(h.store.finish,11_000)
  h.store.finishTick=slow(h.store.finishTick,11_000)
  h.providers.crawl=slow(h.providers.crawl,45_000)
  h.providers.rank=slow(async()=>({state:'ok',source:'bright_data',method:'google_organic_top10_full_json_v1',observedAt:clock().toISOString(),data:{query:comparison.keywords[0],context:{...comparison},organic:[{rank:3,link:'https://partner.example/menu'}],coverage:{depth:10,complete:false}}}),20_000)
  const result=await runCollectionTick(h.store,h.credentials,{clock,providers:h.providers})
  assert.equal(result.saved,2)
  assert.equal(h.calls.requests.length,1)
  assert.equal(h.calls.finish[1][2].length,2)
  assert.equal(h.calls.finish[1][1].errorCode,'batch_deadline')
  assert.equal(h.calls.finish[1][2][1].coverage,0)
  assert.ok(elapsed<=220_000,`tick elapsed ${elapsed}ms`)
 }finally{Date.now=originalNow}
})
