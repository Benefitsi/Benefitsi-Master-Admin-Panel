import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTypescript } from './helpers/load-typescript.mjs'
const native = JSON.parse(readFileSync(new URL('./fixtures/corporate-recurring/current.json', import.meta.url)))
const state = native.paid
const company = {...state.original_agreement, current_period:state.current_period, current_starts_on:state.current_period.starts_on, current_ends_on:state.current_period.ends_on, current_capacity_seats:25, current_funding_confirmed:true}
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props))
test('summary explicitly distinguishes historical agreement from the actual funded current year', () => {
 const {CorporateCompanySummary} = loadTypescript('components/corporate/company-detail.tsx', {'@/app/companies/actions':{}})
 const html=render(CorporateCompanySummary,{company})
 assert.match(html,/Aktuelles bezahltes Firmenjahr/)
 assert.match(html,/23.10.2026 bis 22.10.2027/)
 assert.match(html,/Ursprünglicher Jahreszeitraum/)
})
test('annual billing accepts a renewal extension bound to its actual period without rewriting original year', async () => {
 const {loadCorporateBilling} = loadTypescript('lib/corporate/annual.ts')
 const id='11111111-1111-4111-8111-111111111111'
 const extension={extension_id:id,company_id:company.company_id,requested_by:id,additional_seats:2,status:'requested',net_amount_cents:null,currency:'EUR',starts_on:null,ends_on:state.current_period.ends_on,invoice_reference:'',invoice_document:null,payment_reference:'',accepted_at:null,accepted_by:null,accepted_snapshot:null,activated_at:null,created_at:state.version,updated_at:state.version,period_id:state.current_period.period_id,renewal_preview:{seats:27,unit_amount_cents:1990,total_amount_cents:53730,currency:'EUR'}}
 const result=await loadCorporateBilling({rpc:async()=>({data:{status:'ok',agreement:company,extensions:[extension]},error:null})},company.company_id)
 assert.equal(result.status,'ok')
 assert.equal(result.agreement.ends_on,state.original_agreement.ends_on)
 assert.equal(result.extensions[0].ends_on,state.current_period.ends_on)
})
test('recurring contract renders immutable accepted terms and distinct actual current, future and nonbinding amounts',()=>{
 const {CorporateRecurringContract}=loadTypescript('components/corporate/CorporateRecurringContract.tsx',{'@/app/companies/actions':{}},{crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}})
 const html=render(CorporateRecurringContract,{state})
 assert.match(html,/Laufender Jahresvertrag/);assert.match(html,/Unverbindliche Vorschau/);assert.match(html,/497,50/);assert.match(html,/23.10.2027 bis 22.10.2028/)
 assert.match(html,/SYNTHETIC DE TERMS ONLY/);assert.match(html,/translate="no"/);assert.ok(html.includes(state.version))
 assert.doesNotMatch(html,/Setup starten|Vertrag annehmen|Zahlung erzwingen/)
})
test('readiness explicitly separates configuration from actual release and keeps unapproved drafts editable',()=>{
 const {CorporateRecurringReadiness}=loadTypescript('components/corporate/CorporateRecurringReadiness.tsx',{'@/app/companies/actions':{}},{crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}})
 for(const configured of [false,true]){
 const html=render(CorporateRecurringReadiness,{state,runtime:{environment:'test',configured,reason:configured?null:'billing_disabled',live_enabled:false}})
 assert.match(html,configured?/Testlaufzeit konfiguriert/:/Testlaufzeit nicht konfiguriert/);assert.match(html,/Entwurf/);assert.match(html,/Keine operative Freigabe/);assert.match(html,/Aussteller/)
 assert.doesNotMatch(html,/checked=""/)
 }
})
test('billing archive renders actual old and future periods and every genuine PDF/XML original',()=>{
 const archive=JSON.parse(readFileSync(new URL('./fixtures/corporate-recurring/invoice-periods.json',import.meta.url))).admin_all
 const {CorporateRecurringBilling}=loadTypescript('components/corporate/CorporateRecurringBilling.tsx',{'@/app/companies/actions':{}},{crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}})
 const html=render(CorporateRecurringBilling,{state,index:archive,before:null})
 assert.match(html,/Periodenrechnungen/)
 for(const p of archive.periods)for(const d of p.invoice_documents){assert.ok(html.includes(d.document_id));assert.ok(html.includes(d.sha256));assert.ok(html.includes(d.invoice_ref))}
 assert.match(html,/xml_original/);assert.match(html,/Keine Zertifizierung/)
})
const operationSample={status:'ok',company_id:state.company_id,snapshot_at:state.version,operations:[{operation_id:'11111111-1111-4111-8111-111111111111',contract_id:state.contract.contract_id,period_id:null,kind:'setup_customer',state:'succeeded',attempts:1,next_attempt_at:'infinity',lease_expires_at:null,created_at:state.version,updated_at:state.version}],has_more:true,counts:{total:4,due:1,review_required:1,by_state:{pending:1,processing:0,awaiting_setup:1,succeeded:1,retry_wait:0,review_required:1,cancelled:0}}}
test('bounded worker snapshot preserves older company-wide holds and opaque infinity without claiming worker health',async()=>{
 const {loadAdminOperations}=loadTypescript('lib/corporate/recurring.ts')
 const calls=[];const result=await loadAdminOperations({rpc:async(name,args)=>{calls.push({name,args});return {data:operationSample,error:null}}},state.company_id)
 assert.equal(result.counts.review_required,1);assert.equal(result.operations.length,1);assert.equal(result.operations[0].next_attempt_at,'infinity');assert.equal(result.has_more,true)
 assert.equal(calls[0].name,'admin_get_corporate_billing_operations');assert.equal(calls[0].args.p_limit,20)
 const {CorporateRecurringReadiness}=loadTypescript('components/corporate/CorporateRecurringReadiness.tsx',{'@/app/companies/actions':{}},{crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}})
 const html=render(CorporateRecurringReadiness,{state,runtime:{environment:'test',configured:false,reason:'billing_disabled',live_enabled:false},operations:result})
 assert.match(html,/Zeitlich fällig/);assert.match(html,/Wartet auf Zahlungsautorisierung/);assert.match(html,/Keine begrenzte Fälligkeit/);assert.match(html,/Keine Aussage über Worker-Betrieb/)
 assert.doesNotMatch(html,/Erneut einziehen|Force paid|Worker starten/)
})
test('new Admin copy round-trips DE/EN while opaque financial data and accepted texts stay isolated',async()=>{
 const {translateValue}=await import('../app/admin-language.tsx')
 for(const [de,en] of [['Laufender Jahresvertrag','Recurring annual agreement'],['Periodenrechnungen','Period invoices'],['Unverbindliche Vorschau','Nonbinding preview'],['Zeitlich fällig','Time-due'],['Abrechnungsbereitschaft','Billing readiness'],['Keine begrenzte Fälligkeit','No finite due time'],['Externe Kündigung erfassen','Record external cancellation']]){assert.equal(translateValue(de,'en'),en);assert.equal(translateValue(en,'de'),de)}
 const {CorporateRecurringContract}=loadTypescript('components/corporate/CorporateRecurringContract.tsx',{'@/app/companies/actions':{}},{crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}})
 const copy={...state,terms:{...state.terms,de_text:'Wissen',en_text:'Unverbindliche Vorschau'}}
 const html=render(CorporateRecurringContract,{state:copy});assert.match(html,/<pre translate="no"[^>]*lang="de">Wissen<\/pre>/);assert.ok(html.includes(encodeURIComponent('Wissen')));assert.equal(state.version,native.paid.version)
})
test('operation snapshots reject foreign scope, missing all-company counts and malformed records',()=>{
 const {parseAdminOperations}=loadTypescript('lib/corporate/recurring.ts')
 for(const changed of [{...operationSample,company_id:'foreign'},{...operationSample,counts:{...operationSample.counts,total:1}},{...operationSample,operations:[{...operationSample.operations[0],state:'force_paid'}]}])assert.equal(parseAdminOperations(changed,state.company_id),null)
 const withExtra={...operationSample,operations:[{...operationSample.operations[0],lease_token:'secret',provider_object_ref:'in_private'}]};const parsed=parseAdminOperations(withExtra,state.company_id);assert.ok(parsed);assert.doesNotMatch(JSON.stringify(parsed),/secret|in_private/)
})
test('recurring or unreadable contract prevents legacy annual force-paid presentation',async()=>{
 for(const contract of [state,null]){
  function Premium(){}
  const page=loadTypescript('app/companies/[id]/page.tsx',{'@/lib/admin':{requireAdmin:async()=>({supabase:{},adminSession:{user:{id:'admin'}}})},'@/lib/corporate/companies':{loadCorporateCompany:async()=>({status:'ok',company,roster:[],offset:0}),parseOffset:()=>0},'@/lib/corporate/annual':{loadCorporateBilling:async()=>null},'@/lib/corporate/recurring':{loadRecurringContract:async()=>contract,loadInvoiceIndex:async()=>null,loadAdminOperations:async()=>null},'@/components/corporate/company-premium':{CorporateCompanyPremium:Premium},'@/app/admin-shell':{}})
  const result=await page.default({params:Promise.resolve({id:state.company_id}),searchParams:Promise.resolve({})})
  function flatten(v){return Array.isArray(v)?v.flatMap(flatten):v&&typeof v==='object'?[v,...flatten(v.props?.children)]:[]}
  assert.equal(flatten(result).some(e=>e.type===Premium),false)
 }
})
test('every nonpaid actual period shows exact payment/review state without provisional access',()=>{
 const {CorporateRecurringContract}=loadTypescript('components/corporate/CorporateRecurringContract.tsx',{'@/app/companies/actions':{}},{crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}})
 for(const [payment,label] of [['action_required','Zahlungsaktion erforderlich'],['payment_review','Zahlungsprüfung erforderlich'],['pending','Zahlung ausstehend'],['failed','Zahlung fehlgeschlagen']]){
 const html=render(CorporateRecurringContract,{state:{...state,contract:{...state.contract,review_required:true},current_period:{...state.current_period,payment_state:payment,funding_confirmed:false,access_status:'not_enabled',paid_at:null}}});assert.match(html,new RegExp(label));assert.match(html,/Keine bezahlte Freigabe/);assert.match(html,/Prüfung erforderlich/)
 }
})

const annualTestId = '11111111-1111-4111-8111-111111111111'
const annualBillingComponent = () => loadTypescript('components/corporate/CorporateAnnualBilling.tsx', {'@/app/companies/actions': {}}, {crypto: {randomUUID: () => annualTestId}}).CorporateAnnualBilling
async function acceptedAnnualBilling(agreement, extensions = []) {
 const {loadCorporateBilling} = loadTypescript('lib/corporate/annual.ts')
 const billing = await loadCorporateBilling({rpc: async () => ({data: {status: 'ok', agreement, extensions}, error: null})}, agreement.company_id)
 assert.equal(billing.status, 'ok')
 return billing
}
function requestedAnnualExtension(overrides = {}) {
 return {extension_id: annualTestId, company_id: company.company_id, requested_by: annualTestId, additional_seats: 2, status: 'requested', net_amount_cents: null, currency: 'EUR', starts_on: null, ends_on: state.current_period.ends_on, invoice_reference: '', invoice_document: null, payment_reference: '', accepted_at: null, accepted_by: null, accepted_snapshot: null, activated_at: null, created_at: state.version, updated_at: state.version, period_id: state.current_period.period_id, ...overrides}
}
test('annual panel labels an unpaid current renewal as booked and a funded renewal as paid without changing historical agreement', async () => {
 for (const funded of [false, true]) {
  const agreement = {...company, capacity_seats: 25, current_period: {...state.current_period, capacity_seats: 25, funding_confirmed: funded}}
  const billing = await acceptedAnnualBilling(agreement)
  const before = JSON.stringify(billing)
  const html = render(annualBillingComponent(), {billing, adminIdentity: 'admin'})
  assert.match(html, /Ursprüngliche Vereinbarung:/)
  assert.match(html, funded ? /Aktuelle bezahlte Kapazität:.*25 Plätze/ : /Aktuelle gebuchte Kapazität · nicht bezahlt:.*25 Plätze/)
  if (!funded) assert.doesNotMatch(html, /[Bb]ezahlte Kapazität:/)
  assert.equal(JSON.stringify(billing), before)
 }
})
test('annual panel keeps only the exact known end for a prior renewal request after a later period becomes current', async () => {
 const prior = requestedAnnualExtension()
 const later = {...company, current_period: {...state.current_period, period_id: '22222222-2222-4222-8222-222222222222', starts_on: '2027-10-23', ends_on: '2028-10-23'}}
 const billing = await acceptedAnnualBilling(later, [prior])
 const before = JSON.stringify(billing)
 const html = render(annualBillingComponent(), {billing, adminIdentity: 'admin'})
 const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)[1]
 assert.match(article, /Gemeinsames Ende \(exklusive Grenze\):/)
 assert.ok(article.includes(`<time translate="no" dateTime="${prior.ends_on}">${prior.ends_on}</time>`))
 assert.doesNotMatch(article, /23\.10\.2025|23\.10\.2026|23\.10\.2027|\d{2}\.\d{2}\.\d{4} bis|Firmenjahr/)
 assert.equal(JSON.stringify(billing), before)
 const current = await acceptedAnnualBilling(company, [prior])
 assert.match(render(annualBillingComponent(), {billing: current, adminIdentity: 'admin'}), /Gemeinsames Ende:.*23\.10\.2026 bis 22\.10\.2027/)
 const quoted = {...prior, status: 'quoted', starts_on: '2027-03-04', net_amount_cents: 1800, invoice_reference: 'Wissen'}
 const known = await acceptedAnnualBilling(later, [quoted])
 assert.match(render(annualBillingComponent(), {billing: known, adminIdentity: 'admin'}), /Verbleibende Laufzeit:.*04\.03\.2027 bis 22\.10\.2027/)
})
test('annual panel preserves legacy funded capacity and exact DE EN labels opaque references and raw period boundaries', async () => {
 const {translateValue} = await import('../app/admin-language.tsx')
 for (const [de, en] of [
  ['Aktuelle bezahlte Kapazität:', 'Current paid capacity:'],
  ['Aktuelle gebuchte Kapazität · nicht bezahlt:', 'Current booked capacity · Unpaid:'],
  ['Gebuchte Kapazität:', 'Booked capacity:'],
  ['Gemeinsames Ende (exklusive Grenze):', 'Common end date (exclusive boundary):'],
 ]) { assert.equal(translateValue(de, 'en'), en); assert.equal(translateValue(en, 'de'), de) }
 const legacy = {...company, current_period: null, capacity_seats: 27, available_seats: 27 - company.employee_count - company.reserved_count, premium_enabled: true, invoice_reference: 'Wissen', invoice_document: null}
 const extension = requestedAnnualExtension({period_id: undefined, ends_on: legacy.ends_on})
 const billing = await acceptedAnnualBilling(legacy, [extension])
 const before = JSON.stringify(billing)
 const html = render(annualBillingComponent(), {billing, adminIdentity: 'admin'})
 assert.match(html, /Bezahlte Kapazität:.*27 Plätze/)
 assert.match(html, /Gemeinsames Ende:.*23\.10\.2025 bis 22\.10\.2026/)
 assert.match(html, /<span translate="no">Wissen<\/span>/)
 assert.ok(html.includes(`<span translate="no">${extension.extension_id}</span>`))
 for (const value of [legacy.starts_on, legacy.ends_on, extension.updated_at]) for (const language of ['en', 'de']) assert.equal(translateValue(value, language), value)
 assert.equal(JSON.stringify(billing), before)
 const unfunded = await acceptedAnnualBilling({...legacy, premium_enabled: false, premium_payment_reference: ''})
 const unfundedHtml = render(annualBillingComponent(), {billing: unfunded, adminIdentity: 'admin'})
 assert.match(unfundedHtml, /Gebuchte Kapazität:.*27 Plätze/)
 assert.doesNotMatch(unfundedHtml, /Bezahlte Kapazität:/)
})

test('annual panel keeps disabled legacy capacity neutral when a genuine earlier payment reference remains', async () => {
 const disabled = {...company, current_period: null, premium_enabled: false, premium_payment_reference: 'PAY-EXAMPLE-42', entitlement_status: 'not_enabled'}
 const billing = await acceptedAnnualBilling(disabled)
 const before = JSON.stringify(billing)
 const html = render(annualBillingComponent(), {billing, adminIdentity: 'admin'})
 assert.match(html, /Gebuchte Kapazität:.*25 Plätze/)
 assert.doesNotMatch(html, /nicht bezahlt|Bezahlte Kapazität:/)
 assert.equal(JSON.stringify(billing), before)
})
