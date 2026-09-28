import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { uuid } from '../lib/commerce/requests.ts'
const partner='44444444-4444-4444-8444-444444444444'
const provider='11111111-1111-4111-8111-111111111111'
function load({authorized=true,globalEnabled=true,saveError=false}={}) {
 const writes=[],filters=[],paths=[]
 const imports={
  '@/lib/admin':{requireAdmin:async()=>{if(!authorized)throw Error('login_required')}},
  '@/lib/supabase/admin':{createAdminClient:()=>({from:table=>({update:values=>{
   writes.push({table,values});const q={eq:(key,value)=>{filters.push([key,value]);return q},select:()=>q,single:async()=>({data:{id:provider},error:saveError?{message:'private database failure'}:null})};return q
  }})})},
  '@/lib/commerce/requests':{uuid},
  'next/cache':{revalidatePath:(...args)=>paths.push(args)},
  'next/navigation':{redirect:path=>{throw Object.assign(Error('redirect'),{path})}},
 }
 const compiled=ts.transpileModule(readFileSync(new URL('../app/commerce/actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const module={exports:{}}
 vm.runInNewContext(compiled,{module,exports:module.exports,process:{env:{BENEFITSI_COMMERCE_ENABLED:globalEnabled?'true':'false'}},require:name=>{assert.ok(imports[name],name);return imports[name]}})
 return {action:module.exports.setPartnerOrdering,writes,filters,paths}
}
function form(enabled='true') {const f=new FormData();f.set('provider_id',provider);f.set('partner_id',partner);f.set('enabled',enabled);return f}
test('only authenticated admins can change a partner ordering setting',async()=>{
 const d=load({authorized:false});await assert.rejects(d.action(form()),/login_required/);assert.equal(d.writes.length,0)
})
test('global-off and malformed toggles never mutate providers',async()=>{
 for(const [options,value] of [[{globalEnabled:false},'true'],[{},'yes'],[{},''],[{},'1']]){
  const d=load(options);await assert.rejects(d.action(form(value)));assert.equal(d.writes.length,0)
 }
 const d=load();const f=form();f.set('partner_id','bad');await assert.rejects(d.action(f));assert.equal(d.writes.length,0)
})
test('admin can enable and disable exactly the selected provider and partner',async()=>{
 for(const enabled of ['true','false']){
  const d=load();await assert.rejects(d.action(form(enabled)),e=>e.path==='/commerce?success=saved')
  assert.equal(d.writes.length,1);assert.equal(d.writes[0].table,'booking_providers')
  assert.equal(d.writes[0].values.food_ordering_enabled,enabled==='true')
  assert.deepEqual(d.filters,[['id',provider],['partner_id',partner]])
  assert.ok(d.paths.some(p=>p[0]==='/partner/commerce'))
 }
})
test('failed saves never announce successful activation or expose SQL details',async()=>{
 const d=load({saveError:true});await assert.rejects(d.action(form()),e=>e.path==='/commerce?error=save')
})
