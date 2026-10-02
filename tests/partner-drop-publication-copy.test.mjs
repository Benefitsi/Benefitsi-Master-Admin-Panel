import test from 'node:test'
import assert from 'node:assert/strict'
import {renderToStaticMarkup} from 'react-dom/server'
import {loadTypescript} from './helpers/load-typescript.mjs'
const ent=loadTypescript('lib/partners/entitlements.ts')
const {PartnerDropUsage}=loadTypescript('components/partner/partner-drop-usage.tsx',{'@/lib/partners/entitlements':ent})
const base={schema_version:1,partner_id:'p',timezone:'Europe/Berlin',month_start:'2026-10-01',used:0,limit:0,remaining:0,resets_at:'2026-10-31T23:00:00Z',next_available_at:'2026-10-31T23:00:00Z',provisional:false}
async function render(data){return renderToStaticMarkup(await PartnerDropUsage({client:{rpc:async()=>({data,error:null})},partnerId:'p'}))}
test('zero quota never promises a publication after calendar reset',async()=>{
 const html=await render(base)
 assert.match(html,/Unter dem aktuellen Kontingent sind keine Veröffentlichungen möglich/)
 assert.doesNotMatch(html,/Nächste Veröffentlichung möglich ab/)
})
test('explicit unlimited plan quota is not mislabeled as provisional fallback',async()=>{
 const html=await render({...base,limit:null,remaining:null,next_available_at:null})
 assert.match(html,/ohne Monatslimit/);assert.doesNotMatch(html,/vorläufig/)
})
