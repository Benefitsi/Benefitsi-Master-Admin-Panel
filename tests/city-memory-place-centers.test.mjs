import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import * as centers from '../lib/city-pages/memory-place-centers.ts'
import * as stamps from '../lib/city-pages/memory-stamps.ts'

const castle={id:'castle',name:'Reichsburg Trifels',geometry_type:'POINT',latitude:49.1965846,longitude:7.9784024}
const museum={id:'museum',name:'Museum',geometry_type:'POINT',latitude:49.203586232147,longitude:7.9637038707733}
const zone={zone_key:'primary',label:'Trifels',verification_type:'POINT_RADIUS',safe_latitude:49.194314771322,safe_longitude:7.9801118798371,unlock_radius_meters:400,edge_tolerance_meters:0,active:true}

test('the chosen place owns the centre; a legacy parking coordinate cannot survive an edit',async()=>{
 const c=await import('../lib/city-pages/memory-place-centers.ts')
 const [bound]=c.bindMemoryZones([zone],castle.id,[castle])
 assert.equal(bound.safe_latitude,castle.latitude)
 assert.equal(bound.safe_longitude,castle.longitude)
 assert.equal(bound.unlock_radius_meters,400)
 assert.equal(zone.safe_latitude,49.194314771322)
 const [changed]=c.bindMemoryZones([bound],museum.id,[castle,museum])
 assert.equal(changed.source_place_id,museum.id)
 assert.equal(changed.safe_latitude,museum.latitude)
})

test('separate real places keep their own circles; areas never invent point coordinates',async()=>{
 const c=await import('../lib/city-pages/memory-place-centers.ts')
 const zones=c.bindMemoryZones([zone,{...zone,zone_key:'museum',source_place_id:museum.id},{...zone,zone_key:'area',verification_type:'AREA'}],castle.id,[castle,museum])
 assert.equal(zones[1].safe_latitude,museum.latitude)
 assert.equal(zones[2].safe_latitude,null)
 assert.equal(zones[2].safe_longitude,null)
 assert.equal(c.bindMemoryZones([zone],null,[castle])[0].safe_latitude,null)
 assert.equal(c.memoryPlaceCenter({...castle,latitude:null,map_center_latitude:49,map_center_longitude:8}),null,'POINT cannot silently use a different display centre')
 assert.deepEqual(c.memoryPlaceCenter({...castle,geometry_type:'LINESTRING',latitude:null,longitude:null,map_center_latitude:49.20374605,map_center_longitude:7.9610445}),[49.20374605,7.9610445])
})

test('the editor displays locked place coordinates and submits the same centre as the map',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'})
 const names=['window','document','navigator','HTMLElement','FormData','IS_REACT_ACT_ENVIRONMENT']
 const previous=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]))
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]})
 const root=createRoot(document.getElementById('root'))
 let mapProps,saved
 try{
  const require=createRequire(import.meta.url)
  const source=await readFile(new URL('../components/city-pages/memory-stamp-editor.tsx',import.meta.url),'utf8')
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
  const compiled={exports:{}}
  vm.runInNewContext(js,{module:compiled,exports:compiled.exports,console,require:name=>{
   if(name==='next/navigation')return {useRouter:()=>({push(){},replace(){},refresh(){}})}
   if(name==='./memory-stamp-map')return {MemoryStampMap:props=>{mapProps=props;return null}}
   if(name==='@/lib/city-pages/memory-place-centers')return centers
   if(name==='@/lib/city-pages/memory-stamps')return stamps
   if(name==='@/app/city-pages/[citySlug]/memory-stamps/actions')return {saveMemoryStamp:async input=>{saved=input;return {ok:true,id:'stamp',refresh:'ok'}}}
   return require(name)
  }})
  const catalog={city:{id:'city',slug:'annweiler',name:'Annweiler'},assets:[],places:[{...castle,status:'active'},{...museum,status:'active'}],stamps:[{
   definition:{id:'stamp',slug:'annweiler-trifels',memory_code:'ANN-01',title:'Reichsburg Trifels',description:'Burg',criteria:'Burg besuchen',place_id:castle.id,edition_type:'standard',sort_order:1,active:true,configuration_status:'ready'},
   config:{},zones:[zone],revision:'revision',claim_count:0,artwork_asset_id:null,
  }]}
  await act(async()=>root.render(React.createElement(compiled.exports.MemoryStampEditor,{catalog,selectedId:'stamp'})))
  const field=title=>[...document.querySelectorAll('label')].find(label=>label.firstChild.textContent===title)?.querySelector('input,select')
  assert.equal(field('Breitengrad').readOnly,true)
  assert.equal(field('Längengrad').readOnly,true)
  assert.equal(Number(field('Breitengrad').value),castle.latitude)
  assert.equal(mapProps.zones[0].safe_latitude,castle.latitude)
  assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent.includes('Koordinaten übernehmen')),false)
  await act(async()=>{field('Ort in dieser Stadt').value=museum.id;field('Ort in dieser Stadt').dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  assert.equal(Number(field('Breitengrad').value),museum.latitude)
  assert.equal(mapProps.zones[0].safe_longitude,museum.longitude)
  await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(saved.zones[0].source_place_id,museum.id)
  assert.equal(saved.zones[0].safe_latitude,mapProps.zones[0].safe_latitude)
  assert.equal(saved.zones[0].unlock_radius_meters,400)
 }finally{
  await act(async()=>root.unmount())
  for(const name of names){if(previous[name])Object.defineProperty(globalThis,name,previous[name]);else delete globalThis[name]}
  dom.window.close()
 }
})
