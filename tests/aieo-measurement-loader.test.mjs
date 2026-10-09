import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as normalize from '../lib/analytics/aieo-measurement.ts';
import * as windows from '../lib/analytics/city-measurement-filters.ts';
import * as permissions from '../lib/analytics/permissions.ts';
const filters={dateFrom:'2026-10-01',dateTo:'2026-10-05',timezone:'Europe/Berlin',environment:'production',cityId:null,partnerId:null,channel:null,planCode:null};
function setup(options={}) {
 const calls=[];
 const query=result=>({abortSignal:async()=>result});
 const userClient={rpc(name){calls.push(['permission',name]);return query(options.permissions??{data:{business_analytics_read:true},error:null});}};
 const deps={'server-only':{},'../admin':{getAdminSession:async()=>{calls.push(['session']);return options.session===undefined?{isAdmin:true}:options.session;}},'../supabase/admin':{createAdminClient(){calls.push(['service']);return {rpc(name,args){calls.push(['readout',name,args]);return query(options.readout??{data:null,error:{code:'PGRST202'}});}};}},'./aieo-measurement':normalize,'./city-measurement-filters':windows,'./permissions':permissions};
 const compiled=ts.transpileModule(readFileSync(new URL('../lib/analytics/aieo-measurement-loader.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const loaded={exports:{}};new Function('require','exports',compiled)(name=>{assert.ok(name in deps,name);return deps[name];},loaded.exports);
 return {calls,run:(f=filters)=>loaded.exports.loadAieoMeasurement(userClient,f)};
}
test('admin and analytics permission are required before creating a privileged client',async()=>{
 for(const session of [null,{isAdmin:false}]) {const r=setup({session});assert.equal((await r.run()).state,'forbidden');assert.deepEqual(r.calls,[['session']]);}
 const r=setup({permissions:{data:{business_analytics_read:false},error:null}});assert.equal((await r.run()).state,'forbidden');assert.equal(r.calls.some(c=>c[0]==='service'),false);
});
test('missing RPC is setup required; provider errors and malformed facts never appear as zero',async()=>{
 const r=setup();assert.equal((await r.run()).state,'setup_required');assert.deepEqual(r.calls.map(c=>c[0]),['session','permission','service','readout']);
 assert.deepEqual(r.calls[3][2],{p_from:'2026-09-30T22:00:00.000Z',p_until:'2026-10-05T22:00:00.000Z',p_environment:'production',p_city_id:null});
 for(const readout of [{data:{},error:null},{data:null,error:{code:'42501',message:'private'}}]) assert.equal((await setup({readout}).run()).state,'unavailable');
});
test('unsupported dimensions and invalid scope fail before privileged access',async()=>{
 for(const extra of [{partnerId:'some-partner'},{channel:'ai_referral'},{planCode:'pro'},{cityId:'invalid'},{dateFrom:'2025-01-01'}]) {const r=setup();assert.equal((await r.run({...filters,...extra})).state,'invalid_scope');assert.equal(r.calls.some(c=>c[0]==='service'),false);}
});
