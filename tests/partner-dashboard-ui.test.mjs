import assert from 'node:assert/strict'
import test from 'node:test'
import {createElement as h} from 'react'
import {renderToStaticMarkup as render} from 'react-dom/server'
import {loadUi,free,pro,billing,partnerId} from './helpers/partner-ui-fixtures.mjs'
const {PartnerStatistics}=loadUi('components/partner/partner-statistics.tsx')
const {PartnerPlanPanel,PartnerPlanSummary}=loadUi('components/partner/partner-plan-panel.tsx')
const {PartnerDashboard}=loadUi('components/partner/partner-dashboard.tsx')
test('server statuses render as unavailable, suppressed and locked instead of invented zero',()=>{
 const data=structuredClone(pro);data.metrics.visits={status:'suppressed'}
 const html=render(h(PartnerStatistics,{data}))
 assert.match(html,/Aus Datenschutzgründen ausgeblendet/)
 assert.match(html,/Noch nicht auswertbar|Nicht verfügbar/)
 assert.match(html,/letzte abgeschlossene Kalenderwoche/)
 assert.match(html,/Nur vollständig gereifte Erstbesuchswochen/)
 assert.match(html,/vollständig abgeschlossene Kalenderwochen/)
 const start=html.indexOf('>Besuche<'),end=html.indexOf('</article>',start)
 assert.doesNotMatch(html.slice(start,end),/>0<\/p>/)
})
test('Free UI keeps manual business navigation and visibly locks paid analytics',()=>{
 const data=billing(false)
 const html=render(h(PartnerDashboard,{partnerId,name:'Synthetic shop',partners:[{id:partnerId,name:'Synthetic shop'}],rights:data.entitlements,active:'statistics',children:h(PartnerStatistics,{data:free})}))
 assert.match(html,/Betrieb/);assert.match(html,/Vorteile/);assert.match(html,/aria-current="page"/)
 assert.match(html,/Im aktuellen Tarif gesperrt/)
 const adminRights={...data.entitlements,role:'admin'}
 const restricted=render(h(PartnerDashboard,{partnerId,name:'Shop',partners:[],rights:adminRights,active:'billing',children:null}))
 assert.doesNotMatch(restricted,/section=business/)
})
test('admin review shows labeled controls and a human-readable price draft',()=>{
 const html=render(h(PartnerPlanPanel,{partnerId,initialData:billing(true)}))
 for(const text of ['Tarifstandard wiederherstellen','Grund der Änderung','Ablaufdatum','Entwurf zur Prüfung speichern','Geprüfte Version freigeben','34,90','Archiviert','Sichere Admin-Vorschau'])assert.ok(html.includes(text),text)
 assert.doesNotMatch(html,/<textarea|stripe_customer|provider_secret/)
})
test('billing reads authoritative pinned amounts and distinguishes freegrant from paid subscription',()=>{
 const data=billing(true);data.subscription.offer.unit_amount=2190
 assert.match(render(h(PartnerPlanSummary,{data})),/21,90/)
 data.subscription={...data.subscription,source:'admin_freegrant',offer:null};data.entitlements.state='manual_grant'
 const html=render(h(PartnerPlanSummary,{data}))
 assert.match(html,/Kostenlos · keine Rechnung/);assert.match(html,/Admin-Testfreigabe ohne Rechnung/)
})
test('admin Founder control displays verified campaign and evidence, or explains missing setup',()=>{
 const data=billing(true)
 let html=render(h(PartnerPlanPanel,{partnerId,initialData:data}))
 assert.match(html,/verifizierte Kampagnenstadt ist noch nicht eingerichtet/)
 assert.doesNotMatch(html,/name="operation" value="founder_eligibility"/)
 data.founder={campaign_city_id:'campaign-city',campaign_city_name:'Annweiler',eligible:true,evidence:'Editorial site visit confirmed',decided_at:'2026-09-30T10:00:00Z',admitted:false}
 html=render(h(PartnerPlanPanel,{partnerId,initialData:data}))
 assert.match(html,/Founder-Entscheidung speichern/)
 assert.match(html,/Geprüfter Annweiler-Nachweis und Entscheidungsgrund/)
 assert.match(html,/Editorial site visit confirmed/)
 assert.match(html,/name="city_id" value="campaign-city"/)
 assert.match(html,/name="operation" value="founder_eligibility"/)
})
// Billing controls load with a stubbed server action, never a provider connection.
import {loadTypescript} from './helpers/load-typescript.mjs'
const {PartnerBillingControls}=loadTypescript('components/partner/partner-billing-controls.tsx',{'@/app/partner/billing/actions':{partnerBillingAction:async()=>{}}})
test('owner billing hides conflicting plans and addon purchases without an eligible ready Pro base',()=>{
 const offers=[...billing(true).catalog.offers,{...billing(true).catalog.offers[0],offer_code:'commerce',plan_code:null,addon_code:'commerce'}]
 const readiness={enabled:true,terms:{version:'v1'},founder_eligible:true,founder_admitted:true,founder_ready:true,module_readiness:{commerce:true}}
 let html=render(h(PartnerBillingControls,{partner:partnerId,offers,readiness,currentOffers:['founder'],canBuyAddons:true,error:false}))
 assert.doesNotMatch(html,/name="offer" value="standard"/)
 assert.match(html,/Pro Founder zum nächsten vertraglichen Termin kündigen/)
 assert.match(html,/Bestellungen &amp; Termine/)
 html=render(h(PartnerBillingControls,{partner:partnerId,offers,readiness,currentOffers:[],canBuyAddons:false,error:false}))
 assert.doesNotMatch(html,/name="offer" value="commerce"/)
 html=render(h(PartnerBillingControls,{partner:partnerId,offers,readiness:{...readiness,module_readiness:{commerce:false}},currentOffers:['founder'],canBuyAddons:true,error:false}))
 assert.doesNotMatch(html,/name="offer" value="commerce"/)
})
test('Founder offer cards disclose free monthly exit and the later paid minimum for both intervals',()=>{
 const base=billing(true).catalog.offers[0]
 const offers=[{...base,offer_code:'founder',billing_interval:'month',unit_amount:1990},{...base,offer_code:'founder_annual',billing_interval:'year',unit_amount:19900}]
 const html=render(h(PartnerBillingControls,{partner:partnerId,offers,currentOffers:[],readiness:{enabled:true,founder_ready:true,founder_eligible:true,founder_admitted:false,terms:{version:'v2',founder:{price_change:'Vereinbarte Preisregel'}}},error:false}))
 assert.match(html,/sechs Kalendermonate gratis/i);assert.match(html,/während der Gratisphase monatlich kündbar/)
 assert.match(html,/Erst danach beginnt bei Fortsetzung die bezahlte Mindestlaufzeit von zwölf Monaten/)
 assert.match(html,/danach monatlich kündbar/);assert.match(html,/Verlängerung um jeweils ein Jahr/)
 assert.match(html,/Erste Zahlung erst nach der Gratisphase/)
})
test('timely free-phase exit removes future paid obligation wording from Founder summary',()=>{
 const data=billing(true);data.subscription={...data.subscription,activated_at:'2026-01-31T11:00:00Z',trial_end:'2026-07-31T10:00:00Z',first_payment_at:'2026-07-31T10:00:00Z',paid_minimum_end:'2027-07-31T10:00:00Z',cancellation_at:'2026-06-30T10:00:00Z'}
 data.founder_cancellation={requested_at:'2026-06-15T10:00:00Z',effective_at:'2026-06-30T10:00:00Z',billing_review_required:true};data.billing_recovery={pending:true,status:'outcome_unconfirmed',created_at:'2026-06-15T10:00:00Z'}
 const html=render(h(PartnerPlanSummary,{data}))
 assert.match(html,/Keine Verpflichtung zur bezahlten Zwölfmonatslaufzeit/)
 assert.match(html,/Abwicklung \/ Bestätigung ausstehend/)
 assert.doesNotMatch(html,/Bezahlte Mindestlaufzeit bis/)
 assert.match(html,/Erste Zahlung entfällt/)
})

test('retained expired price is historical while an active offer remains current',()=>{
 const data=billing(true)
 assert.match(render(h(PartnerPlanSummary,{data})),/Aktuelles Preisangebot/)
 data.entitlements.plan_code='free';data.entitlements.state='free';data.subscription.state='expired'
 const html=render(h(PartnerPlanSummary,{data}))
 assert.match(html,/Gespeichertes Vertragsangebot/);assert.doesNotMatch(html,/Aktuelles Preisangebot/);assert.match(html,/19,90/)
})
test('feedback canonical categories are German, unknown codes safe, suppression retained',()=>{
 const data=structuredClone(pro)
 data.metrics.feedback={status:'ok',categories_status:'ok',clarity:{clear:5,mostly_clear:6,unclear:7},issues:{none:8,deal:9,stamp:10,scan:11,other:12,constructor:13}}
 let html=render(h(PartnerStatistics,{data}))
 for(const label of ['Verständlich','Überwiegend verständlich','Unverständlich','Keine Probleme','Problem mit dem Angebot','Problem mit dem Stempel','Problem beim Scannen','Sonstiges','Weitere Kategorie'])assert.ok(html.includes(label),label)
 for(const count of [5,6,7,8,9,10,11,12,13])assert.match(html,new RegExp('<dd[^>]*>'+count+'</dd>'))
 assert.doesNotMatch(html,/unexpected_code|>clear<|>none</)
 data.metrics.feedback.categories_status='suppressed'
 html=render(h(PartnerStatistics,{data}));assert.doesNotMatch(html,/Problem beim Scannen|Weitere Kategorie/)
})
test('Founder draft approval derives annual versus monthly interval from supported offer code',()=>{
 for(const [code,amount,label] of [['founder',1990,'monatlich'],['founder_annual',19900,'jährlich im Voraus']]){
  const data=billing(true);data.drafts[0].payload={offer_code:code,version:2,unit_amount:amount}
  const html=render(h(PartnerPlanPanel,{partnerId,initialData:data}))
  assert.match(html,new RegExp((amount/100).toFixed(2).replace('.',',')+'[^<]* '+label+', zzgl. MwSt.'))
 }
})
test('existing partner navigation and overview expose Kundenbindung using the selected partner',()=>{
 const rights=billing(true).entitlements
 const html=render(h(PartnerDashboard,{partnerId,name:'Shop',partners:[],rights,active:'crm',children:null}))
 assert.match(html,/href="\/partner\/crm\?partner=/)
 assert.match(html,/Kundenbindung/)
 const {PartnerOverview}=loadUi('components/partner/partner-dashboard.tsx')
 assert.match(render(h(PartnerOverview,{partnerId,name:'Shop',rights})),/href="\/partner\/crm\?partner=/)
})
test('tariff summary renders complete grouped benefits and an unavailable legacy catalog without invented quotas',()=>{
 const data=billing(true),html=render(h(PartnerPlanSummary,{data}))
 for(const text of ['Auftritt &amp; Entdeckung','Kundenbindung &amp; Redaktion','Basisbelohnungen','Blogartikel','Inhaberinterview','Geschäftszeiten','360°','Versand noch nicht verfügbar'])assert.ok(html.includes(text),text)
 const legacy=structuredClone(data);legacy.entitlements.features={};legacy.entitlements.limits={}
 assert.match(render(h(PartnerPlanSummary,{data:legacy})),/Tarifumfang derzeit nicht verfügbar/)
})
test('current Pro benefits use matching catalog capabilities and quotas while effective readiness stays separate',()=>{
 const data=billing(true);data.entitlements.features['menu.ai_import']=false;data.entitlements.reason_codes['menu.ai_import']='verified_cost_required';data.entitlements.limits.menu_ai_imports_monthly=0;data.entitlements.limits.team_members=2
 data.catalog.plans=[{plan_code:'pro',version:1,features:{...data.entitlements.features,'menu.ai_import':true},limits:{menu_ai_imports_monthly:2,team_members:10,analytics_days:365,deal_drops_monthly:null},deal_drop_limit_provisional:true}]
 const html=render(h(PartnerPlanSummary,{data})),from=html.indexOf('Deine Leistungen im Überblick'),to=html.indexOf('Deine Funktionen',from),benefits=html.slice(from,to)
 assert.match(benefits,/2 KI-Menüimporte pro Abo-Monat/);assert.match(benefits,/Kosten- und Betriebsfreigabe/);assert.match(benefits,/10 Teammitglieder einschließlich Inhaber/);assert.doesNotMatch(benefits,/KI-Menüimports: nicht enthalten|KI-Menüimport nicht enthalten|2 Teammitglieder/);assert.match(html.slice(to),/Kosten- und Betriebsfreigabe ausstehend/)
 data.catalog.plans[0].features['menu.ai_import']=false;const excluded=render(h(PartnerPlanSummary,{data}));assert.match(excluded,/KI-Menüimports: nicht enthalten/)
 data.catalog.plans[0].version=2;const unknown=render(h(PartnerPlanSummary,{data}));const current=unknown.slice(unknown.indexOf('Deine Leistungen im Überblick'),unknown.indexOf('Deine Funktionen'));assert.match(current,/Tarifumfang derzeit nicht verfügbar/);assert.doesNotMatch(current,/2 KI-Menüimporte|10 Teammitglieder/)
})
