// Actual components + canonical synthetic PG output. Offline, unhydrated SSR only.
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createRequire} from 'node:module'
import {createElement as h} from 'react'
import {renderToStaticMarkup as render} from 'react-dom/server'
import {loadUi} from '../tests/helpers/partner-ui-fixtures.mjs'
const require=createRequire(import.meta.url)
const out=resolve(process.argv[2]??'/private/tmp/task8-partner-preview')
await mkdir(out,{recursive:true})
const fixture=JSON.parse(await readFile('tests/fixtures/partner-dashboard/release-v1.json','utf8'))
const css=(await require('postcss')([require('@tailwindcss/postcss')()]).process('@import "tailwindcss"; @source "../components/partner";',{from:resolve('scripts/partner-preview.css')})).css
const {PartnerDashboard}=loadUi('components/partner/partner-dashboard.tsx')
const {PartnerStatistics}=loadUi('components/partner/partner-statistics.tsx')
const {PartnerPlanPanel,PartnerPlanSummary}=loadUi('components/partner/partner-plan-panel.tsx')
for(const [name,scenario] of Object.entries(fixture.scenarios)) {
 const id=scenario.billing.entitlements.partner_id
 const label=h('div',{style:{background:'#fff4cc',padding:12}},'SYNTHETISCHE DB-FIXTURE · '+fixture.fixture_version+' · '+name+' · keine echten Kundendaten · statische Formulare')
 for(const admin of [false,true]) {
  const body=admin?h(PartnerPlanPanel,{partnerId:id,initialData:scenario.admin_panel}):h('div',null,h(PartnerPlanSummary,{data:scenario.billing}),h(PartnerStatistics,{data:scenario.dashboard}))
  const html=render(h('div',null,label,h(PartnerDashboard,{partnerId:id,name:'Synthetischer Partner',partners:[{id,name:'Synthetischer Partner'}],rights:scenario.billing.entitlements,active:admin?'billing':'statistics',children:body})))
  await writeFile(resolve(out,`${name}${admin?'-admin':''}.html`),'<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic Partner Release QA</title><style>'+css+'body{font-family:system-ui,sans-serif}button,input,select{font:inherit}</style>'+html+'</html>')
 }
}
console.log(out)
