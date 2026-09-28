import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as requests from '../lib/commerce/requests.ts'

const owner='11111111-1111-4111-8111-111111111111'
const foreign='22222222-2222-4222-8222-222222222222'
function load() {
 const authorized=[],writes=[]
 const imports={
  '@/lib/commerce/requests':requests,
  '@/lib/commerce/time':{}, '@/lib/commerce/service':{},
  '@/lib/commerce/partner':{commercePartner:async id=>{
   authorized.push(id);assert.equal(id,owner)
   return {admin:{from:table=>({insert:async data=>{writes.push({table,data});return {error:null}}})}}
  }},
  'next/cache':{revalidatePath:()=>{}},
  'next/navigation':{redirect:path=>{throw Object.assign(Error('redirect'),{path})}},
 }
 const compiled=ts.transpileModule(readFileSync(new URL('../app/partner/commerce/actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const loadedModule={exports:{}}
 vm.runInNewContext(compiled,{module:loadedModule,exports:loadedModule.exports,require:name=>{assert.ok(imports[name],name);return imports[name]}})
 return {save:loadedModule.exports.saveCommerceConfiguration,authorized,writes}
}
function resource() {
 const form=new FormData()
 for(const [key,value] of Object.entries({entity:'resource',provider_id:owner,kind:'table',name:'Tisch 1',capacity:'4'}))form.set(key,value)
 return form
}
test('duplicate provider fields cannot authorize one tenant and insert into another',async()=>{
 const d=load(),form=resource();form.append('provider_id',foreign)
 await assert.rejects(d.save(form),e=>e.path?.endsWith('&error=save'))
 assert.equal(d.writes.length,0)
})
test('valid configuration is inserted with the same provider that was authorized',async()=>{
 const d=load();await assert.rejects(d.save(resource()),e=>e.path===`/partner/commerce?provider=${owner}`)
 assert.deepEqual(d.authorized,[owner]);assert.equal(d.writes.length,1)
 assert.equal(d.writes[0].data.provider_id,owner)
})
test('only multiselect fields may repeat in configuration transport',()=>{
 const form=resource();form.append('name','Another table')
 assert.throws(()=>requests.configurationFormInput(form))
 const offering=new FormData()
 offering.set('entity','offering');offering.append('payment_modes','online');offering.append('payment_modes','pay_on_site')
 offering.append('fulfillment_modes','pickup');offering.append('fulfillment_modes','delivery')
 const parsed=requests.configurationFormInput(offering)
 assert.deepEqual(parsed.payment_modes,['online','pay_on_site'])
 assert.deepEqual(parsed.fulfillment_modes,['pickup','delivery'])
})
