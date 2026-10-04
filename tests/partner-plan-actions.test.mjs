import assert from 'node:assert/strict'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'
function fixture(allowed=true) {
 const calls=[],client={rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:null}}}
 const code=loadTypescript('app/partner/plan-actions.ts',{'@/lib/admin':{requireAdmin:async()=>{if(!allowed)throw new Error('admin_required');return {supabase:client}}},'@/lib/stripe/partner-billing':{verifyFailedFounderActivation:async(partner)=>calls.push({name:'verify_absence',partner}),verifyClosedFounderReview:async(partner)=>calls.push({name:'verify_closed',partner})},'next/cache':{revalidatePath:()=>{}}})
 const form=new FormData();form.set('partner_id','own');form.set('reason','Reviewed request');form.set('operation','override');form.set('mode','standard');form.set('feature','menu.ai_import')
 return {code,calls,form}
}
test('direct tariff actions require current Benefitsi admin and never trust supplied role',async()=>{
 const f=fixture(false);f.form.set('is_admin','true')
 assert.equal((await f.code.updatePartnerPlan({},f.form)).ok,false)
 assert.equal(f.calls.length,0)
 await assert.rejects(f.code.loadPartnerPlanPanel('own'),/admin_required/)
 await assert.rejects(f.code.loadPartnerDashboardPreview('own'),/admin_required/)
})
test('Tarifstandard really clears and German expiry date becomes Berlin midnight',async()=>{
 const f=fixture()
 assert.equal((await f.code.updatePartnerPlan({},f.form)).ok,true)
 assert.equal(f.calls[0].name,'admin_clear_partner_entitlement_override')
 f.form.set('mode','allow');f.form.set('valid_until','2099-10-01')
 assert.equal((await f.code.updatePartnerPlan({},f.form)).ok,true)
 assert.equal(f.calls[1].args.p_valid_until,'2099-09-30T22:00:00.000Z')
})
test('price form writes a reviewable draft in cents and cannot pass checkout credentials',async()=>{
 const f=fixture();f.form.set('operation','draft_offer');f.form.set('offer_code','founder');f.form.set('version','2');f.form.set('plan_version','1');f.form.set('amount','24.90');f.form.set('setup','0');f.form.set('stripe_price_id','forged')
 assert.equal((await f.code.updatePartnerPlan({},f.form)).ok,true)
 assert.equal(f.calls[0].name,'admin_save_partner_catalog_draft')
 assert.equal(f.calls[0].args.p_payload.unit_amount,2490)
 assert.equal(f.calls[0].args.p_payload.stripe_price_id,undefined)
})
test('Founder decision uses current admin, verified city and documentary reason',async()=>{
 const f=fixture();f.form.set('operation','founder_eligibility');f.form.set('city_id','campaign-city');f.form.set('eligible','true')
 assert.equal((await f.code.updatePartnerPlan({},f.form)).ok,true)
 assert.equal(f.calls[0].name,'admin_set_partner_founder_eligibility')
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].args)),{p_partner_id:'own',p_city_id:'campaign-city',p_evidence:'Reviewed request',p_eligible:true})
 const denied=fixture(false);denied.form.set('operation','founder_eligibility')
 assert.equal((await denied.code.updatePartnerPlan({},denied.form)).ok,false)
 assert.equal(denied.calls.length,0)
})

test('Admin activation recovery requires terminal-failure evidence before scoped provider absence check',async()=>{
 const f=fixture();f.form.set('operation','failed_founder_activation');f.form.set('request_id','req_proven')
 assert.equal((await f.code.updatePartnerPlan({},f.form)).ok,false);assert.equal(f.calls.length,0)
 f.form.set('terminal_failure','confirmed')
 assert.equal((await f.code.updatePartnerPlan({},f.form)).ok,true)
 assert.equal(f.calls[0].name,'verify_absence');assert.equal(f.calls[1].name,'admin_close_failed_founder_activation')
 const denied=fixture(false);denied.form.set('operation','failed_founder_activation');denied.form.set('terminal_failure','confirmed')
 assert.equal((await denied.code.updatePartnerPlan({},denied.form)).ok,false);assert.equal(denied.calls.length,0)
})

test('new capability draft preserves nullable Pro drop limit and independent rights',async()=>{
 const f=fixture();f.form.set('operation','draft_plan');f.form.set('plan_code','pro');f.form.set('version','2');f.form.set('deal_drops_monthly','');f.form.set('feedback.manage','on')
 assert.equal((await f.code.updatePartnerPlan({},f.form)).ok,true)
 const p=f.calls[0].args.p_payload
 assert.equal(p.limits.deal_drops_monthly,null)
 assert.equal(p.limits.active_offers,undefined)
 assert.equal(p.features['feedback.manage'],true)
 assert.equal(p.features['marketing.manage'],false)
})

test('onboarding uses the authenticated bounded lifecycle RPC without accepting prices or plan versions',async()=>{
 const f=fixture();f.form.set('operation','onboarding');f.form.set('onboarding_action','start');f.form.set('days','14');f.form.set('plan_version','99')
 assert.equal((await f.code.updatePartnerPlan({},f.form)).ok,true)
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])),{name:'admin_set_partner_onboarding',args:{p_partner_id:'own',p_action:'start',p_days:14,p_expected_until:null,p_reason:'Reviewed request'}})
 const denied=fixture(false);denied.form.set('operation','onboarding');denied.form.set('onboarding_action','start');denied.form.set('days','14')
 assert.equal((await denied.code.updatePartnerPlan({},denied.form)).ok,false);assert.equal(denied.calls.length,0)
})
test('onboarding rejects malformed actions and durations and preserves the concurrency boundary',async()=>{
 for(const [action,days] of [['start','365'],['publish','14'],['extend',''],['start','14.5']]){
  const f=fixture();f.form.set('operation','onboarding');f.form.set('onboarding_action',action);f.form.set('days',days)
  assert.equal((await f.code.updatePartnerPlan({},f.form)).ok,false);assert.equal(f.calls.length,0)
 }
 const f=fixture();f.form.set('operation','onboarding');f.form.set('onboarding_action','stop');f.form.set('expected_until','2099-10-01T15:42:00.123456+00:00')
 assert.equal((await f.code.updatePartnerPlan({},f.form)).ok,true)
 assert.equal(f.calls[0].args.p_expected_until,'2099-10-01T15:42:00.123456+00:00')
})
