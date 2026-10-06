import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {loadTypescript} from './helpers/load-typescript.mjs'
const require=createRequire(import.meta.url)
const fixture=JSON.parse(readFileSync(new URL('./fixtures/corporate-occasions-contract.json',import.meta.url)))
const id=fixture.manager_default.company_id, deal=fixture.preview.deal_id, offer=fixture.manager_configured.offers[0], member=fixture.manager_configured.members[0]
const success={status:'updated',updatedAt:offer.updated_at,message:'Gespeichert'}
function editor(actions={}) {assert.ok(existsSync(new URL('../components/corporate/occasion-workspace.tsx',import.meta.url)),'occasion UI is required');return loadTypescript('components/corporate/occasion-workspace.tsx',{'@/app/companies/actions':{loadCorporateOccasions:async()=>fixture.manager_configured,previewCorporateOccasionOffer:async()=>({status:'ok',preview:fixture.preview}),approveCorporateOccasionOffer:async()=>success,saveCorporateOccasionProgram:async()=>success,saveCorporateMemberOccasion:async()=>success,...actions}},{FormData}).CorporateOccasionWorkspace}
async function withDom(run){const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'http://localhost/companies'});const values={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true};const previous=Object.fromEntries(Object.keys(values).map(k=>[k,globalThis[k]]));Object.assign(globalThis,values);const root=require('react-dom/client').createRoot(document.getElementById('root'));try {await run(root,dom.window)}finally{await act(async()=>root.unmount());Object.assign(globalThis,previous);dom.window.close()}}
const props={companyId:id,adminIdentity:'admin-a'}
const form=label=>document.querySelector(`form[aria-label="${label}"]`)
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
function edit(window,el,value){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}))}
function select(window,el,value){el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}))}
async function show(root,Editor,p=props){await act(async()=>root.render(React.createElement(Editor,p)))}
async function preview(window){await act(async()=>edit(window,form('Partnerangebot freigeben').elements.dealId,deal));await act(async()=>button('Angebot prüfen').click())}
test('concrete preview requires reference and unchecked separate confirmation, binds shown hash/version and reloads authoritative settings',async()=>{
 const calls=[],reads=[];const Editor=editor({loadCorporateOccasions:async(company,offset)=>{reads.push([company,offset]);return fixture.manager_configured},approveCorporateOccasionOffer:async data=>{calls.push(new Map(data));return success}})
 await withDom(async(root,window)=>{await show(root,Editor);const approval=form('Partnerangebot freigeben');assert.equal(button('Freigabe bestätigen'),undefined);await preview(window)
 assert.match(document.body.textContent,/Synthetic BEN35/);assert.match(approval.textContent,/2,00 € Rabatt/);assert.ok(approval.textContent.includes(fixture.preview.description));assert.match(document.body.textContent,/Bedingungen/);assert.match(document.body.textContent,/außerhalb.*normalen Angebotslimits/)
 assert.equal(approval.elements.confirmed.checked,false);assert.equal(button('Freigabe bestätigen').disabled,true)
 await act(async()=>{edit(window,approval.elements.authorizationReference,'Vereinbarung 42');approval.elements.confirmed.click()})
 await act(async()=>approval.requestSubmit());assert.equal(calls.length,1);assert.equal(calls[0].get('previewHash'),fixture.preview.preview_hash);assert.equal(calls[0].get('expectedUpdatedAt'),offer.updated_at);assert.equal(calls[0].get('dealId'),deal);assert.equal(calls[0].get('confirmed'),'true');assert.equal(reads.length,2);assert.equal(form('Partnerangebot freigeben').elements.dealId.value,'');assert.equal(button('Freigabe bestätigen'),undefined)
 })
})
test('deal input changes invalidate preview, confirmation and pending old preview results',async()=>{
 let finish;const Editor=editor({previewCorporateOccasionOffer:async()=>new Promise(resolve=>{finish=resolve})})
 await withDom(async(root,window)=>{await show(root,Editor);await act(async()=>edit(window,form('Partnerangebot freigeben').elements.dealId,deal));await act(async()=>button('Angebot prüfen').click());await act(async()=>edit(window,form('Partnerangebot freigeben').elements.dealId,offer.offer_id));await act(async()=>finish({status:'ok',preview:fixture.preview}));assert.equal(button('Freigabe bestätigen'),undefined)
 await act(async()=>edit(window,form('Partnerangebot freigeben').elements.dealId,deal));await act(async()=>button('Angebot prüfen').click());await act(async()=>finish({status:'ok',preview:fixture.preview}));await act(async()=>form('Partnerangebot freigeben').elements.confirmed.click());await act(async()=>edit(window,form('Partnerangebot freigeben').elements.dealId,offer.offer_id));assert.equal(button('Freigabe bestätigen'),undefined)
 })
})
test('annual/five-year selection and explicit enabling/disable send exact draft and full version; no edit activates before save',async()=>{
 const calls=[];const Editor=editor({saveCorporateOccasionProgram:async data=>{calls.push(new Map(data));return success}})
 await withDom(async(root,window)=>{await show(root,Editor);let anniversary=form('Dienstjubiläum bearbeiten');assert.equal(anniversary.elements.anniversaryInterval.value,'1');assert.equal(anniversary.elements.enabled.checked,false)
 await act(async()=>{select(window,anniversary.elements.anniversaryInterval,'5');select(window,anniversary.elements.offerId,offer.offer_id);anniversary.elements.enabled.click()});assert.equal(calls.length,0)
 await act(async()=>anniversary.requestSubmit());assert.equal(calls[0].get('anniversaryInterval'),'5');assert.equal(calls[0].get('enabled'),'true');assert.equal(calls[0].get('offerId'),offer.offer_id);assert.equal(calls[0].get('expectedUpdatedAt'),'')
 const birthday=form('Geburtstag bearbeiten');await act(async()=>birthday.elements.enabled.click());assert.match(document.body.textContent,/bereits ausgegebene Vorteile bleiben/);await act(async()=>birthday.requestSubmit());assert.equal(calls[1].get('enabled'),'false');assert.equal(calls[1].get('expectedUpdatedAt'),fixture.manager_configured.programs[0].updated_at)
 })
})
test('start-date save preserves null/full membership version, actual calendar input and server conflict draft until explicit reload',async()=>{
 const calls=[];const Editor=editor({saveCorporateMemberOccasion:async data=>{calls.push(new Map(data));return {status:'conflict',message:'Inzwischen geändert. Bitte neu laden'}}})
 await withDom(async(root,window)=>{await show(root,Editor);const row=form(`Eintrittsdatum ${member.email}`);await act(async()=>edit(window,row.elements.employmentStartedOn,'2020-02-29'));await act(async()=>row.requestSubmit());assert.equal(calls[0].get('employmentStartedOn'),'2020-02-29');assert.equal(calls[0].get('expectedUpdatedAt'),member.updated_at);assert.equal(row.elements.employmentStartedOn.value,'2020-02-29');assert.equal(row.querySelector('button[type="submit"]').disabled,true)
 await show(root,Editor);assert.equal(row.elements.employmentStartedOn.value,'2020-02-29');await act(async()=>button('Serverstand neu laden').click());assert.equal(form(`Eintrittsdatum ${member.email}`).elements.employmentStartedOn.value,'');assert.equal(form(`Eintrittsdatum ${member.email}`).querySelector('button[type="submit"]').disabled,false)
 })
})
test('revoke shows immediate impact and requires explicit confirmation with null preview payload',async()=>{
 const calls=[];const Editor=editor({approveCorporateOccasionOffer:async data=>{calls.push(new Map(data));return success}})
 await withDom(async root=>{await show(root,Editor);await act(async()=>button('Freigabe widerrufen').click());assert.match(document.body.textContent,/ausstehende.*nicht mehr nutzbar/);assert.equal(calls.length,0);await act(async()=>button('Widerruf bestätigen').click());assert.equal(calls[0].get('enabled'),'false');assert.equal(calls[0].get('previewHash'),'');assert.equal(calls[0].get('authorizationReference'),offer.authorization_reference);assert.equal(calls[0].get('expectedUpdatedAt'),offer.updated_at)})
})
test('unavailable/reapproval offers stay visible, cannot enable an issuing rule; private birthday year and consent editor stay absent',async()=>{
 const Editor=editor({loadCorporateOccasions:async()=>({...fixture.manager_configured,offers:[{...offer,available:false,reapproval_required:true}]})})
 await withDom(async(root,window)=>{await show(root,Editor);assert.match(document.body.textContent,/erneute Freigabe/);const birthday=form('Geburtstag bearbeiten');assert.equal(birthday.querySelector('button[type="submit"]').disabled,true);const selected=birthday.elements.offerId.selectedOptions[0];assert.equal(selected.disabled,true);assert.equal(document.querySelector('input[name="birthdayEnabled"]'),null);assert.doesNotMatch(document.body.textContent,/Geburtsjahr|Alter:/);await act(async()=>birthday.elements.enabled.click());assert.equal(birthday.querySelector('button[type="submit"]').disabled,false)})
})
test('read loading/failure/empty and 50-member paging remain distinct; failed reload keeps conflict draft',async()=>{
 const reads=[];let finish;const Editor=editor({loadCorporateOccasions:async(company,offset)=>{reads.push([company,offset]);return reads.length===1?new Promise(resolve=>{finish=resolve}):{...fixture.manager_default,members:[]}}})
 await withDom(async root=>{await show(root,Editor);assert.match(document.body.textContent,/werden geladen/);assert.doesNotMatch(document.body.textContent,/Keine Mitarbeitenden/);await act(async()=>finish({...fixture.manager_default,next_offset:50}));await act(async()=>button('Nächste Teamseite').click());assert.deepEqual(reads.at(-1),[id,50]);assert.match(document.body.textContent,/Keine Mitarbeitenden/);assert.match(document.body.textContent,/noch kein Partnerangebot/);await act(async()=>button('Vorherige Teamseite').click());assert.deepEqual(reads.at(-1),[id,0])})
 const Failed=editor({loadCorporateOccasions:async()=>({status:'error',message:'Zugriff abgelehnt'})});await withDom(async root=>{await show(root,Failed);assert.match(document.querySelector('[role="alert"]').textContent,/abgelehnt/);assert.doesNotMatch(document.body.textContent,/Keine Mitarbeitenden/);assert.ok(button('Serverstand neu laden'))})
})
test('mismatched company DTOs fail closed; A-B-A identity switches discard stale reads and stale saves, duplicate submit blocked',async()=>{
 const Bad=editor({loadCorporateOccasions:async()=>({...fixture.manager_configured,company_id:deal})});await withDom(async root=>{await show(root,Bad);assert.equal(form('Geburtstag bearbeiten'),null);assert.ok(document.querySelector('[role="alert"]'))})
 const requests=[],calls=[];let finish;const Editor=editor({loadCorporateOccasions:async(company)=>new Promise(resolve=>{requests.push({company,resolve})}),saveCorporateOccasionProgram:async data=>{calls.push(data);return new Promise(resolve=>{finish=resolve})}})
 await withDom(async(root,window)=>{await show(root,Editor);await show(root,Editor,{...props,adminIdentity:'admin-b'});await show(root,Editor);await act(async()=>requests[0].resolve(fixture.manager_configured));assert.equal(form('Geburtstag bearbeiten'),null);await act(async()=>requests[2].resolve(fixture.manager_configured));const birthday=form('Geburtstag bearbeiten');await act(async()=>{birthday.requestSubmit();birthday.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}))});assert.equal(calls.length,1);assert.equal(birthday.querySelector('fieldset').disabled,true);await show(root,Editor,{...props,companyId:deal});await act(async()=>finish({status:'conflict',message:'Old save secret'}));assert.doesNotMatch(document.body.textContent,/Old save secret|Synthetic BEN35/);assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);await act(async()=>requests[1].resolve(fixture.manager_configured));assert.equal(form('Geburtstag bearbeiten'),null)})
})
test('mounted company occasion area calls real guarded server actions and exact RPCs, then reloads fresh member/program versions',async()=>{
 const {createClient}=await import('@supabase/supabase-js')
 const calls=[];let reads=0,guards=0
 const newer='2026-10-06T08:20:01.123456+00:00'
 const supabase=createClient('https://synthetic.supabase.invalid','synthetic-publishable',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,init)=>{
  const name=new URL(url).pathname.split('/').at(-1),body=JSON.parse(init.body);calls.push([name,body])
  if(name==='get_corporate_occasion_settings'){reads++;return Response.json(reads===1?fixture.manager_configured:{...fixture.manager_configured,members:[{...member,updated_at:newer,employment_started_on:'2020-02-29'}]})}
  if(name==='set_corporate_member_occasion')return Response.json({status:'updated',updated_at:newer})
  throw Error(`unexpected RPC ${name}`)
 }}})
 const actions=loadTypescript('app/companies/actions.ts',{'@/lib/admin':{requireAdmin:async()=>{guards++;return {supabase}}},'next/cache':{revalidatePath:()=>{},refresh:()=>{}}},{FormData})
 const Detail=loadTypescript('components/corporate/company-detail.tsx',{'@/app/companies/actions':actions},{FormData}).CorporateCompanyOccasions
 await withDom(async(root,window)=>{await act(async()=>root.render(React.createElement(Detail,{company:{company_id:id},adminIdentity:'admin-a'})));let row=form(`Eintrittsdatum ${member.email}`);await act(async()=>edit(window,row.elements.employmentStartedOn,'2020-02-29'));await act(async()=>row.requestSubmit());assert.deepEqual(calls[1],['set_corporate_member_occasion',{p_company_id:id,p_user_id:member.user_id,p_employment_started_on:'2020-02-29',p_expected_updated_at:member.updated_at}]);row=form(`Eintrittsdatum ${member.email}`);assert.equal(row.elements.employmentStartedOn.value,'2020-02-29');await act(async()=>row.requestSubmit());assert.equal(calls[3][1].p_expected_updated_at,newer);assert.equal(reads,3);assert.equal(guards,5)})
})
test('denied save and failed explicit reload retain date draft; stale-preview conflict blocks approval until fresh preview',async()=>{
 let reads=0;const Editor=editor({loadCorporateOccasions:async()=>++reads===1?fixture.manager_configured:{status:'error',message:'Serverstand nicht verfügbar'},saveCorporateMemberOccasion:async()=>{throw Error('private denial')}})
 await withDom(async(root,window)=>{await show(root,Editor);const row=form(`Eintrittsdatum ${member.email}`);await act(async()=>edit(window,row.elements.employmentStartedOn,'2020-02-29'));await act(async()=>row.requestSubmit());assert.match(document.querySelector('[role="alert"]').textContent,/neu laden/);assert.doesNotMatch(document.body.textContent,/private denial/);await act(async()=>button('Serverstand neu laden').click());assert.equal(row.elements.employmentStartedOn.value,'2020-02-29');assert.equal(row.querySelector('button[type="submit"]').disabled,true)})
 const Conflict=editor({approveCorporateOccasionOffer:async()=>({status:'conflict',message:'Partnerangebot geändert. Bitte neu laden'})})
 await withDom(async(root,window)=>{await show(root,Conflict);await preview(window);let approval=form('Partnerangebot freigeben');await act(async()=>{edit(window,approval.elements.authorizationReference,'Partnervertrag');approval.elements.confirmed.click()});await act(async()=>approval.requestSubmit());assert.equal(approval.elements.authorizationReference.value,'Partnervertrag');assert.equal(button('Freigabe bestätigen').disabled,true);await act(async()=>button('Serverstand neu laden').click());assert.equal(button('Freigabe bestätigen'),undefined);assert.equal(form('Partnerangebot freigeben').elements.dealId.value,'')})
})
test('changed approved offer can be selected for an explicit new preview without reusing its old confirmation',async()=>{
 const Editor=editor({loadCorporateOccasions:async()=>({...fixture.manager_configured,offers:[{...offer,available:false,reapproval_required:true}]})})
 await withDom(async(root,window)=>{await show(root,Editor);assert.ok(button('Dieses Angebot erneut prüfen'));await act(async()=>button('Dieses Angebot erneut prüfen').click());assert.equal(form('Partnerangebot freigeben').elements.dealId.value,deal);assert.equal(button('Freigabe bestätigen'),undefined);await act(async()=>button('Angebot prüfen').click());assert.equal(form('Partnerangebot freigeben').elements.confirmed.checked,false);assert.equal(button('Freigabe bestätigen').disabled,true)})
})

test('confirmed revoke goes from mounted UI through guarded action with native SQL reference/version contract',async()=>{
 const {createClient}=await import('@supabase/supabase-js');const calls=[];let guards=0
 const supabase=createClient('https://synthetic.supabase.invalid','synthetic-publishable',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,init)=>{
  const name=new URL(url).pathname.split('/').at(-1),body=JSON.parse(init.body);calls.push([name,body]);
  if(name==='get_corporate_occasion_settings')return Response.json(fixture.manager_configured)
  if(name==='admin_set_corporate_occasion_offer')return Response.json({status:'updated',updated_at:offer.updated_at})
  throw Error(`unexpected RPC ${name}`)
 }}})
 const actions=loadTypescript('app/companies/actions.ts',{'@/lib/admin':{requireAdmin:async()=>{guards++;return {supabase}}},'next/cache':{revalidatePath:()=>{},refresh:()=>{}}},{FormData})
 const Editor=editor(actions)
 await withDom(async root=>{await show(root,Editor);await act(async()=>button('Freigabe widerrufen').click());assert.equal(calls.length,1);await act(async()=>button('Widerruf bestätigen').click());assert.deepEqual(calls[1],['admin_set_corporate_occasion_offer',{p_company_id:id,p_deal_id:deal,p_enabled:false,p_authorization_reference:offer.authorization_reference,p_expected_updated_at:offer.updated_at,p_expected_preview_hash:null}]);assert.equal(guards,3)})
})
