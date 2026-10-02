import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createElement as h} from 'react'
import {renderToStaticMarkup as render} from 'react-dom/server'
import {loadUi} from './helpers/partner-ui-fixtures.mjs'
const fixture=JSON.parse(readFileSync('tests/fixtures/partner-dashboard/release-v1.json','utf8'))
const {PartnerStatistics}=loadUi('components/partner/partner-statistics.tsx')
const {PartnerPlanPanel,PartnerPlanSummary}=loadUi('components/partner/partner-plan-panel.tsx')
for(const [name,scenario] of Object.entries(fixture.scenarios))test(`canonical ${name} RPC fixture renders identically scoped owner/Admin states`,()=>{
 const rights=scenario.billing.entitlements
 assert.deepEqual(rights.features,scenario.admin_panel.entitlements.features)
 assert.equal(rights.plan_code,['pro','founder'].includes(name)?'pro':'free')
 const statistics=render(h(PartnerStatistics,{data:scenario.dashboard}))
 const owner=render(h(PartnerPlanSummary,{data:scenario.billing}))
 const admin=render(h(PartnerPlanPanel,{partnerId:rights.partner_id,initialData:scenario.admin_panel}))
 assert.match(statistics,/1[.,]226/)
 assert.match(statistics,/Nicht verfügbar/)
 assert.match(statistics,/letzte abgeschlossene Kalenderwoche/)
 assert.match(owner,/Free|Pro/);assert.match(admin,/Sichere Admin-Vorschau/)
 if(name==='founder')assert.match(owner,/199,00/)
 if(['pro','founder'].includes(name))assert.match(statistics,/Wochentag/)
 else assert.match(statistics,/Im aktuellen Tarif gesperrt/)
})
