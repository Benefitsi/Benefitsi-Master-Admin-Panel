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
