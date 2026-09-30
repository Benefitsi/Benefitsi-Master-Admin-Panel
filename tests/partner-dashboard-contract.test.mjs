import assert from 'node:assert/strict'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'
import {existsSync} from 'node:fs'
const path=new URL('../lib/partners/analytics.ts',import.meta.url)
test('Berlin presets preserve calendar midnights across DST regardless of host timezone',()=>{
 assert.ok(existsSync(path),'Missing dashboard interval adapter')
 const {dashboardWindow}=loadTypescript('lib/partners/analytics.ts')
 assert.equal(dashboardWindow('today',new Date('2026-03-29T12:00:00Z')).from,'2026-03-28T23:00:00.000Z')
 assert.equal(dashboardWindow('last7',new Date('2026-10-26T12:00:00Z')).from,'2026-10-19T22:00:00.000Z')
 const month=dashboardWindow('month',new Date('2026-04-15T12:00:00Z'))
 assert.equal(month.from,'2026-02-28T23:00:00.000Z')
 assert.equal(month.to,'2026-03-31T22:00:00.000Z')
})
test('dashboard adapter has no raw fallback and export uses protected RPC',async()=>{
 assert.ok(existsSync(path),'Missing dashboard adapter')
 const {readDashboard}=loadTypescript('lib/partners/analytics.ts')
 const seen=[]
 const client={rpc:async(name,args)=>{seen.push({name,args});return {data:{definition_version:'partner-dashboard-v1',partner_id:'own'},error:null}}}
 await readDashboard(client,'own',{from:'2026-09-29T22:00:00Z',to:'2026-09-30T10:00:00Z'},true)
 assert.equal(seen[0].name,'export_partner_dashboard')
 assert.deepEqual({...seen[0].args},{p_partner_id:'own',p_from:'2026-09-29T22:00:00Z',p_to:'2026-09-30T10:00:00Z',p_timezone:'Europe/Berlin'})
 await assert.rejects(()=>readDashboard({rpc:async()=>({data:null,error:{message:'denied'}})},'foreign',{}),/denied/)
})
test('Tarifstandard calls clear, requires reason, and carries no client actor',async()=>{
 assert.ok(existsSync(new URL('../lib/partners/entitlements.ts',import.meta.url)),'Missing entitlement adapter')
 const {setEntitlementOverride}=loadTypescript('lib/partners/entitlements.ts')
 const seen=[];const client={rpc:async(name,args)=>{seen.push({name,args});return {data:null,error:null}}}
 await setEntitlementOverride(client,{partnerId:'own',feature:'menu.ai_import',mode:'standard',reason:'Test end'})
 assert.equal(seen[0].name,'admin_clear_partner_entitlement_override')
 assert.deepEqual({...seen[0].args},{p_partner_id:'own',p_feature_key:'menu.ai_import',p_reason:'Test end'})
 await assert.rejects(()=>setEntitlementOverride(client,{partnerId:'own',feature:'menu.ai_import',mode:'allow',reason:' '}),/Grund/)
 assert.equal(seen.length,1)
})

test('closed weekly ranges use inclusive human dates while custom dates include the final day',()=>{
 const {dashboardWindow,formatBerlinRange}=loadTypescript('lib/partners/analytics.ts')
 assert.match(formatBerlinRange('2026-09-20T22:00:00Z','2026-09-27T22:00:00Z'),/21\.09\.2026 – 27\.09\.2026/)
 const custom=dashboardWindow('custom',new Date('2026-10-01T12:00:00Z'),'2026-09-21','2026-09-27')
 assert.equal(custom.to,'2026-09-27T22:00:00.000Z')
 const today=dashboardWindow('custom',new Date('2026-10-01T12:00:00Z'),'2026-09-21','2026-10-01')
 assert.equal(today.to,'2026-10-01T12:00:00.000Z')
})
