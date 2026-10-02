import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTypescript} from './helpers/load-typescript.mjs'
const ent=loadTypescript('lib/partners/entitlements.ts')
const feedback=loadTypescript('lib/partners/feedback.ts',{'@/lib/partners/entitlements':ent})
const id='11111111-1111-4111-8111-111111111111'
const rights=(role='owner',allowed=false)=>({schema_version:1,partner_id:id,role,plan_code:allowed?'pro':'free',features:{'feedback.manage':allowed},limits:{deal_drops_monthly:allowed?null:1}})
const clientFor=(r)=>({rpc:async(name)=>name==='get_partner_entitlements'?{data:r}:{data:{partner_id:id,enabled:false,deal_id:null,available_deals:[]}}})
test('Free owner feedback is a known locked state',async()=>{const result=await feedback.readFeedbackSettings(clientFor(rights()),id);assert.equal(result.available,false);assert.equal(result.reason,'feedback_pro_required')})
test('direct feedback mutations require both capability and management role',async()=>{for(const r of [rights(),rights('scanner',true)])await assert.rejects(()=>feedback.saveFeedbackSettings(clientFor(r),{partnerId:id,enabled:false,dealId:null}))})
test('Pro owner feedback remains readable',async()=>{assert.equal((await feedback.readFeedbackSettings(clientFor(rights('owner',true)),id)).available,true)})
test('drop DTO preserves provisional unlimited and rejects foreign identity',async()=>{const dto={schema_version:1,partner_id:id,timezone:'Europe/Berlin',month_start:'2026-10-01',used:2,limit:null,remaining:null,resets_at:'2026-10-31T23:00:00Z',next_available_at:null,provisional:true};const client={rpc:async()=>({data:dto})};assert.equal((await ent.readDealDropUsage(client,id)).limit,null);await assert.rejects(()=>ent.readDealDropUsage(client,'other'))})


test('drop usage surface renders server exhaustion and does not invent usage on failure',async()=>{
 const {renderToStaticMarkup}=await import('react-dom/server')
 const {readFileSync}=await import('node:fs')
 const fixtures=JSON.parse(readFileSync(new URL('./fixtures/partner-dashboard/capability-v2.json',import.meta.url)))
 const {PartnerDropUsage}=loadTypescript('components/partner/partner-drop-usage.tsx',{'@/lib/partners/entitlements':ent})
 for(const [name,scenario] of Object.entries(fixtures.scenarios)){
  const html=renderToStaticMarkup(await PartnerDropUsage({client:{rpc:async()=>({data:scenario.drop_usage})},partnerId:id}))
  assert.match(html,/Normale Angebote und Happy Hour bleiben unbegrenzt/)
  if(['free','expired'].includes(name)){assert.match(html,/1 von 1 genutzt/);assert.match(html,/01.11.2026/)}else assert.match(html,/vorläufig/)
 }
 const html=renderToStaticMarkup(await PartnerDropUsage({client:{rpc:async()=>({error:{message:'network'}})},partnerId:id}))
 assert.match(html,/konnte nicht geladen/);assert.doesNotMatch(html,/0 von 1|aktuell möglich/)
})
