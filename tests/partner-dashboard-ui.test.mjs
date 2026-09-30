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
