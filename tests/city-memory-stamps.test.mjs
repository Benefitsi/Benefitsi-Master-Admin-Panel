import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import vm from 'node:vm'

const contractUrl = new URL('../lib/city-pages/memory-stamps.ts', import.meta.url)
const load = async () => existsSync(contractUrl) ? import(contractUrl.href) : {}
const id = 'a17ae6fd-6e4e-4091-8e15-3e32a065e429'
const draft = (overrides = {}) => ({
  citySlug: 'annweiler', id: null, revision: null, operation: 'save',
  title: 'Reichsburg Trifels', short_title: 'Trifels', description: 'Ein besonderer Ort.', criteria: 'Am freigegebenen Sammelort sammeln.',
  slug: 'annweiler-memory-11', memory_code: 'ANN-11', place_id: id,
  edition_type: 'standard', sort_order: 11, artwork_asset_id: null, review_notes: '', confirm_review: false,
  minimum_accuracy_meters: 50, minimum_sample_count: 3, maximum_sample_window_seconds: 120,
  zones: [{ zone_key: 'primary', label: 'Sammelpunkt', verification_type: 'POINT_RADIUS', safe_latitude: 49.2, safe_longitude: 7.96, unlock_radius_meters: 200, edge_tolerance_meters: 0, active: true }], ...overrides,
})

test('draft input is validated and actor/approval metadata cannot be injected', async () => {
  const c = await load()
  assert.equal(typeof c.parseMemoryStampInput, 'function', 'memory administration contract is missing')
  const result = c.parseMemoryStampInput(draft({ approved_by: id, human_approved: true, active: true }))
  assert.equal(result.ok, true)
  assert.equal(result.input.approved_by, undefined)
  assert.equal(result.input.human_approved, undefined)
  assert.equal(result.input.active, undefined)
})

test('reject invalid coordinates, city identifiers, stale versions and weak location proof', async () => {
  const c = await load(); assert.equal(typeof c.parseMemoryStampInput, 'function')
  for (const change of [{citySlug:'../landau'}, {id,revision:null}, {id:null,revision:'abc'}, {place_id:'bad'}, {minimum_sample_count:2}, {minimum_sample_count:65}, {minimum_accuracy_meters:1001}, {maximum_sample_window_seconds:901}, {sort_order:-1}, {title:'  '}, {slug:'Bad slug'}, {operation:'delete'}]) {
    assert.equal(c.parseMemoryStampInput(draft(change)).ok,false,JSON.stringify(change))
  }
  for (const zone of [{safe_latitude:91}, {safe_longitude:null}, {unlock_radius_meters:0}, {unlock_radius_meters:10001}, {edge_tolerance_meters:51}, {safe_latitude:NaN}]) {
    assert.equal(c.parseMemoryStampInput(draft({zones:[{...draft().zones[0],...zone}]})).ok,false)
  }
})

test('publication requires an explicit review, a place, artwork and an active zone', async () => {
  const c = await load(); assert.equal(typeof c.parseMemoryStampInput, 'function')
  const ready=draft({operation:'approve', confirm_review:true, artwork_asset_id:id})
  assert.equal(c.parseMemoryStampInput(ready).ok,true)
  for(const change of [{confirm_review:false},{edition_type:'first_edition'},{place_id:null},{artwork_asset_id:null},{zones:[]},{zones:[{...ready.zones[0],active:false}]}]) assert.equal(c.parseMemoryStampInput({...ready,...change}).ok,false)
})

test('preserve multiple zones and area verification without inventing coordinates', async () => {
  const c = await load(); assert.equal(typeof c.parseMemoryStampInput, 'function')
  const area={...draft().zones[0],zone_key:'area',verification_type:'AREA',safe_latitude:null,safe_longitude:null,edge_tolerance_meters:10}
  assert.equal(c.parseMemoryStampInput(draft({zones:[draft().zones[0],area]})).input.zones.length,2)
  assert.equal(c.parseMemoryStampInput(draft({zones:[{...area,safe_latitude:49}]})).ok,false)
  assert.equal(c.parseMemoryStampInput(draft({zones:[draft().zones[0],draft().zones[0]]})).ok,false)
})

async function action(options={}) {
  const calls=[]
  const contract=await load()
  const client={rpc:async (name,args)=>{calls.push({name,args});return {error:options.error??null,data:{id,city_id:id,city_slug:'annweiler'}}}}
  const imports={
    'next/cache':{revalidatePath:p=>calls.push({local:p})},
    '@/lib/admin':{requireAdmin:async()=>{calls.push('auth');if(options.denied)throw Error('denied');return {supabase:client}}},
    '@/lib/city-pages/memory-stamps':contract,
    '@/lib/city-pages/public-revalidation':{refreshPublicCity:async(...args)=>{calls.push({refresh:args});return options.refresh??'ok'}},
  }
  const path=new URL('../app/city-pages/[citySlug]/memory-stamps/actions.ts',import.meta.url)
  assert.ok(existsSync(path),'server action missing')
  const js=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const m={exports:{}}
  vm.runInNewContext(js,{module:m,exports:m.exports,require:n=>{assert.ok(imports[n],n);return imports[n]},console})
  return {save:m.exports.saveMemoryStamp,calls}
}

test('unauthenticated callers never reach storage and saves use the caller session RPC',async()=>{
  const denied=await action({denied:true});await assert.rejects(denied.save(draft()),/denied/);assert.deepEqual(denied.calls,['auth'])
  const a=await action();assert.equal((await a.save(draft())).ok,true)
  assert.equal(a.calls[1].name,'admin_save_city_memory_stamp')
  assert.equal(a.calls[1].args.p_city_slug,'annweiler')
  assert.deepEqual(a.calls.find(x=>x?.refresh)?.refresh,['annweiler',id])
})

test('database rejection never revalidates; cache warning does not hide a successful save',async()=>{
  const a=await action({error:{message:'memory_conflict',code:'40001'}})
  assert.equal((await a.save(draft())).ok,false)
  assert.ok(!a.calls.some(x=>x?.refresh))
  const b=await action({refresh:'failed'});const saved=await b.save(draft());assert.equal(saved.ok,true);assert.equal(saved.refresh,'failed')
})

 test('withdrawal works even when retired content no longer passes new editing rules', async () => {
  const c=await load();
  const result=c.parseMemoryStampInput(draft({operation:'withdraw',id,revision:'a'.repeat(32),title:'',description:'',minimum_sample_count:90,zones:[]}));
  assert.equal(result.ok,true);
  assert.deepEqual(Object.keys(result.input).sort(),['citySlug','id','memory_code','operation','revision','slug']);
});
