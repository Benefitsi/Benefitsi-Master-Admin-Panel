import {existsSync,readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {posix} from 'node:path'
import ts from 'typescript'
const require=createRequire(import.meta.url),cache=new Map()
export function loadUi(relative) {
 relative=['','.ts','.tsx','.js','.json'].map(suffix=>relative+suffix).find(candidate=>existsSync(new URL('../../'+candidate,import.meta.url)))??relative
 if(cache.has(relative))return cache.get(relative)
 if(relative.endsWith('.json'))return JSON.parse(readFileSync(new URL('../../'+relative,import.meta.url),'utf8'))
 const source=readFileSync(new URL('../../'+relative,import.meta.url),'utf8')
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:relative}).outputText
 const m={exports:{}}
 new Function('require','module','exports',js)(id=>{
  if(id==='@/app/admin-language')return loadUi('app/admin-language.tsx')
  if(id==='@/app/partner/actions')return {signOutPartner:async()=>{}}
  if(id==='next/navigation')return {useRouter:()=>({refresh:()=>{}})}
  if(id==='@/app/partner/plan-actions')return {loadPartnerPlanPanel:async()=>{throw new Error('Synthetic preview has no server connection')},updatePartnerPlan:async()=>({ok:false,message:'Statische Vorschau – keine Änderung gespeichert.'})}
  if(id==='@/app/partner/crm-actions')return {updatePartnerEditorial:async()=>({ok:false,message:'No test server mutation'})}
  if(id.startsWith('@/'))return loadUi(id.slice(2))
  if(id.startsWith('.'))return loadUi(posix.join(posix.dirname(relative),id))
  return require(id)
 },m,m.exports)
 cache.set(relative,m.exports);return m.exports
}
export const free=JSON.parse(readFileSync(new URL('../fixtures/partner-dashboard/free.json',import.meta.url),'utf8'))
export const pro=JSON.parse(readFileSync(new URL('../fixtures/partner-dashboard/pro.json',import.meta.url),'utf8'))
export const partnerId=free.partner_id
export function billing(paid=false) {
 const keys=['microsite.publish','media.rich','analytics.basic','analytics.advanced','analytics.export','team.manage','menu.ai_import','commerce','seo.monitor']
 const features=Object.fromEntries(keys.map(k=>[k,paid?!['commerce','seo.monitor'].includes(k):['analytics.basic','team.manage'].includes(k)]))
 const offer={offer_code:'founder',version:1,plan_code:'pro',plan_version:1,addon_code:null,unit_amount:1990,setup_amount:0,currency:'eur',billing_interval:'month',tax_behavior:'exclusive',status:'published'}
 return {schema_version:1,entitlements:{schema_version:1,partner_id:partnerId,role:'owner',plan_code:paid?'pro':'free',capability_policy_version:2,deal_drop_limit_provisional:paid,plan_version:1,offer_code:paid?'founder':null,state:paid?'subscription':'free',valid_until:paid?'2026-10-30T00:00:00Z':null,version:'synthetic-fixture',features:{...features,'feedback.manage':paid,'marketing.manage':paid,'crm.manage':paid},limits:{deal_drops_monthly:paid?null:1,team_members:paid?10:3,analytics_days:paid?365:30,menu_ai_imports_monthly:paid?2:0},reason_codes:Object.fromEntries(keys.map(k=>[k,features[k]?(paid?'subscription':'free'):['commerce','seo.monitor'].includes(k)?'release_blocked':'plan_required']))},subscription:paid?{state:'active',source:'subscription',period_start:'2026-09-30T00:00:00Z',period_end:'2026-10-30T00:00:00Z',paid_through:'2026-10-30T00:00:00Z',trial_end:null,first_payment_at:null,cancel_at_period_end:false,payment_status:'paid_through',offer}:null,usage:[],catalog:{schema_version:1,offers:[{...offer,offer_code:'standard',unit_amount:2990},offer]},overrides:[],audit:[{created_at:'2026-09-30T08:00:00Z',source:'admin',reason:'Synthetische Freigabe zur UI-Prüfung',object_type:'plan_grant'}],drafts:[{id:'synthetic-draft',kind:'offer',payload:{offer_code:'standard',version:2,plan_code:'pro',plan_version:1,unit_amount:3490,setup_amount:0},status:'draft'}],plans:[],archives:[]}
}
