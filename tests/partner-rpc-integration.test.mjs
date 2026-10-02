import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {renderToStaticMarkup} from 'react-dom/server'
import {loadTypescript} from './helpers/load-typescript.mjs'
const fixture=JSON.parse(readFileSync(new URL('./fixtures/partner-dashboard/capability-v2-rpc.json',import.meta.url)))
const ent=loadTypescript('lib/partners/entitlements.ts')
const feedback=loadTypescript('lib/partners/feedback.ts',{'@/lib/partners/entitlements':ent})
const analytics=loadTypescript('lib/partners/analytics.ts')
const {readDashboard}=analytics
const {dashboardCsv}=loadTypescript('lib/partners/csv.ts',{'./analytics':analytics})
const {PartnerDropUsage}=loadTypescript('components/partner/partner-drop-usage.tsx',{'@/lib/partners/entitlements':ent})
assert.equal(fixture.synthetic,true)
assert.match(fixture.source,/actual isolated PostgreSQL17/)
for(const [name,scenario] of Object.entries(fixture.scenarios)){
 for(const [role,outcomes] of Object.entries(scenario.actors)){
  test(`actual PG ${name}/${role} replays entitlement, quota, feedback read/write/action, dashboard/export`,async()=>{
   const calls=[]
   const window=scenario.actors.owner.get_partner_dashboard.data.period
   const client={rpc:async(rpc,args)=>{
    assert.equal(args.p_partner_id,scenario.partner_id)
    assert.ok(Object.hasOwn(outcomes,rpc),rpc)
    if(['get_partner_dashboard','export_partner_dashboard'].includes(rpc)){
     assert.equal(args.p_from,window.from);assert.equal(args.p_to,window.to);assert.equal(args.p_timezone,'Europe/Berlin')
    }
    if(outcomes[rpc].error)assert.equal(outcomes[rpc].error.code,'42501')
    calls.push(rpc)
    return structuredClone(outcomes[rpc])
   }}
   if(outcomes.get_partner_entitlements.error){
    await assert.rejects(()=>ent.readEntitlements(client,scenario.partner_id))
    await assert.rejects(()=>feedback.readFeedbackSettings(client,scenario.partner_id))
    await assert.rejects(()=>feedback.saveFeedbackSettings(client,{partnerId:scenario.partner_id,enabled:false,dealId:null}))
   }else{
    const rights=await ent.readEntitlements(client,scenario.partner_id)
    assert.equal(rights.capability_policy_version,2)
    assert.ok(!Object.hasOwn(rights.limits,'active_offers'))
    const permitted=ent.canManageFeedback(rights)
    if(permitted){
     assert.equal((await feedback.readFeedbackSettings(client,scenario.partner_id)).available,true)
     assert.equal((await feedback.saveFeedbackSettings(client,{partnerId:scenario.partner_id,enabled:false,dealId:null})).enabled,false)
    }else{
     if(ent.canManageProfile(rights))assert.equal((await feedback.readFeedbackSettings(client,scenario.partner_id)).reason,'feedback_pro_required')
     else await assert.rejects(()=>feedback.readFeedbackSettings(client,scenario.partner_id))
     await assert.rejects(()=>feedback.saveFeedbackSettings(client,{partnerId:scenario.partner_id,enabled:false,dealId:null}))
     assert.ok(!calls.includes('set_partner_feedback_reward'),'denied save must not issue a mutation RPC')
    }
   }
   const usage=outcomes.get_partner_deal_drop_usage
   if(usage.error)await assert.rejects(()=>ent.readDealDropUsage(client,scenario.partner_id))
   else {
    const parsed=await ent.readDealDropUsage(client,scenario.partner_id)
    assert.equal(parsed.limit,usage.data.limit)
    const html=renderToStaticMarkup(await PartnerDropUsage({client,partnerId:scenario.partner_id}))
    assert.match(html,usage.data.limit===null?/vorläufig/:/1 von 1 genutzt/)
    assert.match(html,usage.data.next_available_at?/Monatskontingent ausgeschöpft/:/Nach aktuellem Monatskontingent verfügbar/)
   }
   for(const exporting of [false,true]){
    const rpc=exporting?'export_partner_dashboard':'get_partner_dashboard'
    if(outcomes[rpc].error)await assert.rejects(()=>readDashboard(client,scenario.partner_id,window,exporting))
    else {
     const data=await readDashboard(client,scenario.partner_id,window,exporting)
     assert.equal(data.metrics.feedback.status,outcomes[rpc].data.metrics.feedback.status)
     const csv=dashboardCsv(data)
     assert.doesNotMatch(csv,/user_id|stripe_customer|request_id/)
     if(data.metrics.feedback.reason==='feedback_pro_required')assert.match(csv,/"unavailable"/)
    }
   }
   // Exercise the actual direct Server Action using the same DB result tape.
   const {updateFeedbackReward}=loadTypescript('app/partner/feedback-actions.ts',{
    'next/cache':{revalidatePath(){}},'@/lib/supabase/server':{createClient:async()=>client},
    '@/lib/partner-portal':{getPartnerPortalSession:async()=>({isAdmin:false,partnerIds:[scenario.partner_id]})},
    '@/lib/partners/feedback':feedback,
   })
   const form=new FormData();form.set('partner_id',scenario.partner_id)
   const result=await updateFeedbackReward({ok:false,message:''},form)
   const expected=!outcomes.get_partner_entitlements.error && ent.canManageFeedback(outcomes.get_partner_entitlements.data)
   assert.equal(result.ok,expected)
  })
 }
}
for(const [name,scenario] of Object.entries(fixture.catalog_publications)){
 test(`actual Admin published ${name} survives entitlement/quota/feedback consumers and rendering`,async()=>{
  assert.equal(scenario.draft_status,'published');assert.equal(scenario.publish_outcome.error,null)
  const client={rpc:async(rpc,args)=>{assert.equal(args.p_partner_id,scenario.partner_id);return structuredClone(scenario.owner[rpc])}}
  const rights=await ent.readEntitlements(client,scenario.partner_id)
  const usage=await ent.readDealDropUsage(client,scenario.partner_id)
  assert.equal(usage.limit,{finite:2,unlimited:null,pro_zero:0,free_zero:0,free_high:1,free_null:1}[name])
  assert.equal(usage.provisional,false)
  assert.equal(ent.canManageFeedback(rights),name==='finite')
  const settings=await feedback.readFeedbackSettings(client,scenario.partner_id)
  assert.equal(settings.available,name==='finite')
  const html=renderToStaticMarkup(await PartnerDropUsage({client,partnerId:scenario.partner_id}))
  if(name==='free_zero'||name==='pro_zero')assert.match(html,/Unter dem aktuellen Kontingent sind keine Veröffentlichungen möglich/)
  if(name==='unlimited'){assert.match(html,/ohne Monatslimit/);assert.doesNotMatch(html,/vorläufig/)}
  assert.doesNotMatch(html,/Nächste Veröffentlichung möglich ab/)
 })
}
