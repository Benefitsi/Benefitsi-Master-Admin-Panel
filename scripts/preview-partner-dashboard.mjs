// Static synthetic fixtures of the actual UI. No Next route, auth bypass or network calls.
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createRequire} from 'node:module'
import {createElement as h} from 'react'
import {renderToStaticMarkup as render} from 'react-dom/server'
import {loadUi,free,pro,billing,partnerId} from '../tests/helpers/partner-ui-fixtures.mjs'
const require=createRequire(import.meta.url)
const postcss=require('postcss'),tailwind=require('@tailwindcss/postcss')
const out=resolve(process.argv[2]??'/tmp/benefitsi-task3-preview')
await mkdir(out,{recursive:true})
const css=(await postcss([tailwind()]).process('@import "tailwindcss"; @source "../components/partner";',{from:resolve('scripts/partner-preview.css')})).css
const {PartnerDashboard,PartnerOverview}=loadUi('components/partner/partner-dashboard.tsx'),{PartnerStatistics}=loadUi('components/partner/partner-statistics.tsx'),{PartnerPlanPanel,PartnerPlanSummary}=loadUi('components/partner/partner-plan-panel.tsx')
const label=h('div',{style:{background:'#fff4cc',padding:'12px 20px',fontFamily:'sans-serif',fontSize:14}},'SYNTHETISCHE UI-VORSCHAU · keine echten Kundendaten · statische Formulare · ',...['home','free','pro','billing','admin','error'].map(name=>h('a',{key:name,href:`${name}.html`,style:{marginRight:14}},name)))
// Synthetic empty seven-day response for the overview fixture; production requests Last7.
const home=structuredClone(free)
home.period.from='2026-09-24T00:00:00+02:00'
home.series.daily.buckets=[24,25,26,27,28,29,30].map(day=>({start:`2026-09-${day}T00:00:00+02:00`,visits:0}))
for(const kind of ['home','free','pro','billing','admin','error']) {
 const data=billing(!['free','home'].includes(kind)),rights=data.entitlements
 const body=kind==='home'?h(PartnerOverview,{partnerId,name:'Café Morgenlicht',rights,data:home}):kind==='admin'?h(PartnerPlanPanel,{partnerId,initialData:data}):kind==='billing'?h(PartnerPlanSummary,{data}):kind==='error'?h('div',{role:'alert',className:'rounded-xl border border-amber-200 bg-amber-50 p-5'},'Die Statistik konnte nicht geladen werden. Bitte erneut versuchen.'):h(PartnerStatistics,{data:kind==='free'?free:pro})
 const html=render(h('div',null,label,h(PartnerDashboard,{partnerId,name:'Café Morgenlicht · Synthetisch',partners:[{id:partnerId,name:'Café Morgenlicht'},{id:'synthetic-second',name:'Zweiter Testbetrieb'}],rights,active:kind==='home'?'overview':kind==='billing'||kind==='admin'?'billing':'statistics',children:body})))
 await writeFile(resolve(out,kind+'.html'),'<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Benefitsi Partner · Synthetische Vorschau</title><style>'+css+'body{font-family:system-ui,sans-serif}button,input,select{font:inherit}</style>'+html+'</html>')
}
console.log(out)
