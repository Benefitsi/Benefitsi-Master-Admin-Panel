import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createClient} from '@supabase/supabase-js'
import {loadTypescript} from './helpers/load-typescript.mjs'
const state=JSON.parse(readFileSync(new URL('./fixtures/corporate-recurring/current.json',import.meta.url))).paid
const id='11111111-1111-4111-8111-111111111111', evidenceId='22222222-2222-4222-8222-222222222222'
const model=()=>loadTypescript('lib/corporate/recurring-admin-mutations.ts',{}, {FormData,TextDecoder,TextEncoder,Uint8Array})
function api(responses) {
 const calls=[]
 const client=createClient('https://synthetic.supabase.invalid','synthetic-publishable',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,init)=>{calls.push({name:new URL(url).pathname.split('/').at(-1),body:JSON.parse(init.body)});const body=responses.shift();if(body instanceof Error)throw body;return Response.json(body??null)}}})
 return {client,calls}
}
function form(changes={}){const f=new FormData();for(const [k,v] of Object.entries({companyId:state.company_id,contractId:state.contract.contract_id,requestId:id,evidenceId,receivedAt:'2026-10-22T21:59:59.123456+00:00',evidenceRef:'private-archive/cancellation-original-42',confirmed:'true',...changes})) f.set(k,v);f.set('evidence',new Blob(['Actual synthetic received cancellation']), 'evidence.txt');return f}
test('external cancellation hashes original bytes, registers immutable evidence first and retains exact received time',async()=>{
 const {client,calls}=api([state,{status:'recorded',evidence_id:evidenceId,replayed:false},{status:'cancelled',receipt_id:id,received_at:'2026-10-22T21:59:59.123456+00:00',effective_end:'2027-10-23',version:state.version,replayed:false}])
 const r=await model().recordExternalCancellation(client,form())
 assert.equal(r.status,'cancelled');assert.deepEqual(calls.map(c=>c.name),['get_corporate_contract','admin_register_corporate_cancellation_evidence','record_corporate_external_cancellation'])
 assert.equal(calls[1].body.p_received_at,'2026-10-22T21:59:59.123456+00:00');assert.match(calls[1].body.p_sha256,/^[a-f0-9]{64}$/)
 assert.equal(calls[2].body.p_received_at,calls[1].body.p_received_at);assert.equal(calls[2].body.p_requested_end,null)
})
test('unconfirmed, future, missing or duplicate evidence is rejected without recording a cancellation',async()=>{
 for(const changes of [{confirmed:'false'},{receivedAt:'2099-01-01T00:00:00Z'},{evidenceRef:''}]){const {client,calls}=api([]);assert.equal((await model().recordExternalCancellation(client,form(changes))).status,'invalid');assert.equal(calls.length,0)}
 const {client,calls}=api([]),f=form();f.delete('evidence');assert.equal((await model().recordExternalCancellation(client,f)).status,'invalid');assert.equal(calls.length,0)
})
test('foreign binding and ambiguous registration never evaluate cancellation or leak internal error',async()=>{
 for(const responses of [[{...state,company_id:id}],[state,new Error('private provider detail')],[state,{status:'recorded',evidence_id:id,replayed:false}]]){
  const {client,calls}=api(responses),r=await model().recordExternalCancellation(client,form());assert.ok(['unavailable','error'].includes(r.status));assert.ok(!calls.some(c=>c.name==='record_corporate_external_cancellation'));assert.doesNotMatch(JSON.stringify(r),/private provider detail/)
 }
})
test('published terms preserve exact DE/EN text and require explicit genuine evidence confirmation',async()=>{
 const f=new FormData();const de='DE accepted opaque Wissen & <exact> '.repeat(5),en='EN accepted opaque Wissen & <exact> '.repeat(5)
 for(const [k,v] of Object.entries({termsVersion:'reviewed-v1',profileId:id,deText:de,enText:en,approvalEvidenceRef:'private-legal/approved-42',confirmed:'true'}))f.set(k,v)
 const {client,calls}=api([{status:'published',terms_version:'reviewed-v1',terms_hash:'a'.repeat(64),replayed:false}])
 assert.equal((await model().publishRecurringTerms(client,f)).status,'published');assert.equal(calls[0].body.p_de_text,de);assert.equal(calls[0].body.p_en_text,en)
 f.set('confirmed','false');assert.equal((await model().publishRecurringTerms(client,f)).status,'invalid');assert.equal(calls.length,1)
})
test('billing profile has no invented identity/tax defaults and is only explicitly published',async()=>{
 const f=new FormData();f.set('profileId',id);f.set('confirmed','true');f.set('profile','{}')
 const {client,calls}=api([]);assert.equal((await model().publishRecurringProfile(client,f)).status,'invalid');assert.equal(calls.length,0)
})
test('every recurring server action requires fresh current Admin admission before data or money paths',async()=>{
 let attempts=0
 const actions=loadTypescript('app/companies/actions.ts',{'@/lib/admin':{requireAdmin:async()=>{attempts++;throw Error('current admin denied')}},'next/cache':{revalidatePath:()=>{},refresh:()=>{}}},{FormData,TextDecoder,TextEncoder,Uint8Array})
 for(const name of ['recordCorporateExternalCancellation','publishCorporateRecurringProfile','publishCorporateRecurringTerms','attachCorporatePeriodDocument','readCorporatePeriodDocument'])await assert.rejects(actions[name](form()),/current admin denied/)
 assert.equal(attempts,5)
})
test('ambiguous cancellation retries preserve exact request/evidence and a changed registration conflicts',async()=>{
 const received='2026-10-22T21:59:59.123456+00:00'
 const transport=api([state,{status:'recorded',evidence_id:evidenceId,replayed:false},new Error('lost response'),state,{status:'recorded',evidence_id:evidenceId,replayed:true},{status:'cancelled',receipt_id:id,received_at:received,effective_end:'2027-10-23',version:state.version,replayed:true}])
 const f=form();assert.equal((await model().recordExternalCancellation(transport.client,f)).status,'error');assert.equal((await model().recordExternalCancellation(transport.client,f)).status,'cancelled')
 assert.deepEqual(transport.calls[1].body,transport.calls[4].body);assert.deepEqual(transport.calls[2].body,transport.calls[5].body)
 const bad=api([state,{status:'conflict'}]);assert.equal((await model().recordExternalCancellation(bad.client,form())).status,'conflict');assert.equal(bad.calls.length,2)
})
test('malformed profile draft is editable validation failure and cannot publish',async()=>{
 const f=new FormData();f.set('profileId',id);f.set('confirmed','true');f.set('profile','{bad JSON')
 const {client,calls}=api([]);assert.equal((await model().publishRecurringProfile(client,f)).status,'invalid');assert.equal(calls.length,0)
})
test('cancellation response cannot substitute a different microsecond receipt or omit the effective boundary',async()=>{
 for(const result of [{received_at:'2026-10-22T21:59:59.123457+00:00',effective_end:'2027-10-23'},{received_at:'2026-10-22T21:59:59.123456+00:00'}]){
 const {client}=api([state,{status:'recorded',evidence_id:evidenceId,replayed:false},{status:'cancelled',receipt_id:id,version:state.version,replayed:false,...result}]);assert.equal((await model().recordExternalCancellation(client,form())).status,'error')
 }
})
test('explicit reviewed profile publication sends the exact tax/operator evidence without defaults',async()=>{
 const profile={environment:'test',provider_account_ref:'acct_synthetic',billing_identity_ref:'private/operator-evidence',tax_profile_ref:'private/exemption-evidence',operator_name:'SYNTHETIC ONLY',operator_address:'Synthetic Address',operator_email:'issuer@example.test',tax_mode:'explicit_exempt',tax_basis_points:0,tax_country:'DE',invoice_format:'xml_original',invoice_format_evidence_ref:'private/format-evidence',release_evidence_ref:'private/review-evidence',return_origin:'https://synthetic.example.test',released:true}
 const f=new FormData();f.set('profileId',id);f.set('confirmed','true');f.set('profile',JSON.stringify(profile))
 const {client,calls}=api([{status:'published',profile_id:id,replayed:false}]);assert.equal((await model().publishRecurringProfile(client,f)).status,'published');assert.deepEqual(calls[0],{name:'admin_publish_corporate_billing_profile',body:{p_profile_id:id,p_profile:profile}})
})
