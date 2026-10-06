import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {loadTypescript} from './helpers/load-typescript.mjs'
const bytes=readFileSync(new URL('./fixtures/corporate-occasions-contract.json',import.meta.url))
const fixture=JSON.parse(bytes), id=fixture.manager_default.company_id, deal=fixture.preview.deal_id
const offer=fixture.manager_configured.offers[0], member=fixture.manager_configured.members[0]
function model(){assert.ok(existsSync(new URL('../lib/corporate/occasions.ts',import.meta.url)),'occasion contract implementation is required');return loadTypescript('lib/corporate/occasions.ts')}
function database(responses=[]){const calls=[];const supabase=createClient('https://synthetic.supabase.invalid','synthetic-publishable',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,init)=>{calls.push([new URL(url).pathname.split('/').at(-1),JSON.parse(init.body)]);const response=responses.shift();if(response instanceof Error)throw response;return Response.json(response??null)}}});return {supabase,calls}}
function actions(db,denied=false){return loadTypescript('app/companies/actions.ts',{'@/lib/admin':{requireAdmin:async()=>{if(denied)throw new Error('admin denied');return {supabase:db.supabase}}},'next/cache':{revalidatePath:()=>{},refresh:()=>{}}},{FormData})}
function form(changes={}){const data=new FormData();for(const [k,v]of Object.entries({companyId:id,expectedUpdatedAt:'',...changes}))data.set(k,v);return data}
test('native fixture SHA and strict manager parser preserve the exact microsecond tokens',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'9db8f4fdc16662e17718b9e727fc771373572d4ed730bf96ac848de68bdfc7f5')
 const api=model();assert.equal(api.parseOccasionSettings(fixture.manager_configured,id).offers[0].updated_at,offer.updated_at)
 assert.equal(api.parseOccasionSettings(fixture.manager_default,id).programs[1].anniversary_interval,1)
 assert.throws(()=>api.parseOccasionSettings(fixture.manager_configured,deal))
 const bad=[{company_id:'bad'},{programs:[fixture.manager_default.programs[0]]},{next_offset:-1},{next_offset:1},{members:[{...member,employment_started_on:'2026-02-30'}]},{members:[{...member,birthday_month:2,birthday_day:30}]},{members:[{...member,birthday_enabled:false}]},{offers:[{...offer,available:'true'}]},{offers:[{...offer,updated_at:'2026-02-30T00:00:00Z'}]},{offers:[{...offer,reapproval_required:undefined}]},{programs:[...fixture.manager_configured.programs,fixture.manager_configured.programs[0]]}]
 for(const change of bad)assert.throws(()=>api.parseOccasionSettings({...fixture.manager_configured,...change},id))
 assert.throws(()=>api.parseOccasionSettings({...fixture.manager_configured,members:[{...member,birth_year:1990}]},id))
 const parsed=api.parseOccasionSettings({...fixture.manager_configured,internal_secret:'discard'},id);assert.equal(Object.hasOwn(parsed,'internal_secret'),false)
})
test('every new action authenticates independently before calling the user JWT RPC',async()=>{
 const db=database(),api=actions(db,true)
 for(const name of ['loadCorporateOccasions','previewCorporateOccasionOffer','approveCorporateOccasionOffer','saveCorporateOccasionProgram','saveCorporateMemberOccasion']){assert.equal(typeof api[name],'function',name);await assert.rejects(api[name](form()),/admin denied/)}assert.equal(db.calls.length,0)
})
test('manager and preview readers bind exact company/deal scope and sanitize denial versus empty',async()=>{
 const db=database([fixture.manager_default,fixture.preview,{...fixture.preview,company_id:deal},new Error('private secret')]),api=actions(db)
 assert.equal((await api.loadCorporateOccasions(id,0)).status,'ok')
 assert.equal((await api.previewCorporateOccasionOffer(form({dealId:deal}))).preview.preview_hash,fixture.preview.preview_hash)
 assert.equal((await api.previewCorporateOccasionOffer(form({dealId:deal}))).status,'error')
 const result=await api.loadCorporateOccasions(id,0);assert.equal(result.status,'error');assert.doesNotMatch(result.message,/secret/)
 assert.deepEqual(db.calls.slice(0,2),[['get_corporate_occasion_settings',{p_company_id:id,p_offset:0}],['admin_preview_corporate_occasion_offer',{p_company_id:id,p_deal_id:deal}]])
 assert.equal((await api.loadCorporateOccasions(id,1)).status,'error');assert.equal(db.calls.length,4)
})
test('approval binds only shown preview hash plus absent/full offer version; revoke preserves stored reference and uses null hash',async()=>{
 const stamp=offer.updated_at,db=database([{status:'updated',updated_at:stamp},{status:'updated',updated_at:stamp}]),api=actions(db)
 const enabled=form({dealId:deal,enabled:'true',authorizationReference:'😀'.repeat(160),previewHash:fixture.preview.preview_hash,confirmed:'true'})
 assert.equal((await api.approveCorporateOccasionOffer(enabled)).updatedAt,stamp)
 assert.deepEqual(db.calls[0],['admin_set_corporate_occasion_offer',{p_company_id:id,p_deal_id:deal,p_enabled:true,p_authorization_reference:'😀'.repeat(160),p_expected_updated_at:null,p_expected_preview_hash:fixture.preview.preview_hash}])
 await api.approveCorporateOccasionOffer(form({dealId:deal,enabled:'false',authorizationReference:offer.authorization_reference,previewHash:'',confirmed:'true',expectedUpdatedAt:stamp}))
 assert.deepEqual(db.calls[1][1],{p_company_id:id,p_deal_id:deal,p_enabled:false,p_authorization_reference:offer.authorization_reference,p_expected_updated_at:stamp,p_expected_preview_hash:null})
})
test('invalid/duplicate inputs, Unicode controls, malformed hash, confirmation and calendar dates never mutate',async()=>{
 const db=database(),api=actions(db),base={dealId:deal,enabled:'true',authorizationReference:'Ref',previewHash:fixture.preview.preview_hash,confirmed:'true'}
 for(const change of [{authorizationReference:''},{authorizationReference:'😀'.repeat(161)},{authorizationReference:'bad\nreference'},{authorizationReference:'bad\u0085reference'},{previewHash:'A'.repeat(64)},{confirmed:'false'},{enabled:'yes'},{companyId:'bad'},{expectedUpdatedAt:'rounded'}])assert.equal((await api.approveCorporateOccasionOffer(form({...base,...change}))).status,'invalid')
 for(const reference of ['', 'bad\nreference', '😀'.repeat(161)])assert.equal((await api.approveCorporateOccasionOffer(form({...base,enabled:'false',previewHash:'',authorizationReference:reference}))).status,'invalid')
 const dup=form(base);dup.append('dealId',deal);assert.equal((await api.approveCorporateOccasionOffer(dup)).status,'invalid')
 for(const date of ['2026-02-30','1899-12-31','9999-01-01'])assert.equal((await api.saveCorporateMemberOccasion(form({userId:member.user_id,employmentStartedOn:date}))).status,'invalid')
 assert.equal((await api.saveCorporateOccasionProgram(form({kind:'anniversary',enabled:'true',offerId:offer.offer_id,anniversaryInterval:'2'}))).status,'invalid');assert.equal(db.calls.length,0)
})
test('program/date mutations bind exact RPC values and preserve conflict/error without raw details',async()=>{
 const stamp=fixture.manager_configured.programs[0].updated_at,db=database([{status:'updated',updated_at:stamp},fixture.conflict,{status:'updated',updated_at:member.updated_at},new Error('PII date secret')]),api=actions(db)
 assert.equal((await api.saveCorporateOccasionProgram(form({kind:'anniversary',enabled:'true',offerId:offer.offer_id,anniversaryInterval:'5',expectedUpdatedAt:stamp}))).status,'updated')
 assert.deepEqual(db.calls[0],['set_corporate_occasion_program',{p_company_id:id,p_kind:'anniversary',p_enabled:true,p_offer_id:offer.offer_id,p_anniversary_interval:5,p_expected_updated_at:stamp}])
 assert.equal((await api.saveCorporateOccasionProgram(form({kind:'birthday',enabled:'false',offerId:'',anniversaryInterval:'1'}))).status,'conflict')
 assert.equal((await api.saveCorporateMemberOccasion(form({userId:member.user_id,employmentStartedOn:'2020-02-29',expectedUpdatedAt:member.updated_at}))).status,'updated')
 assert.deepEqual(db.calls[2],['set_corporate_member_occasion',{p_company_id:id,p_user_id:member.user_id,p_employment_started_on:'2020-02-29',p_expected_updated_at:member.updated_at}])
 const failed=await api.saveCorporateMemberOccasion(form({userId:member.user_id,employmentStartedOn:''}));assert.equal(failed.status,'error');assert.doesNotMatch(failed.message,/secret|PII/)
})
