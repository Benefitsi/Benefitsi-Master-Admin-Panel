import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import * as preview from '../lib/city-pages/memory-stamp-map.ts'

test('real map layers follow edits, remove invalid circles and clean up on stamp changes', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://admin.example.test' })
  const names = ['window','document','navigator','Element','HTMLElement','SVGElement','ResizeObserver','IS_REACT_ACT_ENVIRONMENT']
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  // Layout and SVG capabilities supplied by browsers but absent from jsdom.
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', {get: () => 800})
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', {get: () => 390})
  dom.window.SVGSVGElement.prototype.createSVGRect = () => ({})
  class ResizeObserver { observe() {} disconnect() {} }
  for (const name of names) Object.defineProperty(globalThis, name, {configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:name==='ResizeObserver'?ResizeObserver:dom.window[name]})
  const root = createRoot(document.getElementById('root'))
  const require = createRequire(import.meta.url)
  const file = new URL('../components/city-pages/memory-stamp-map.tsx', import.meta.url)
  const js = ts.transpileModule(await readFile(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
  const compiled = {exports:{}}
  vm.runInNewContext(js, {module:compiled,exports:compiled.exports,document,ResizeObserver,console,require:name=>{
    if(name==='@/lib/city-pages/memory-stamp-map')return preview
    if(name.endsWith('.module.css'))return {default:{map:'test-map',number:'test-number'}}
    return require(name)
  }})
  const Map = compiled.exports.MemoryStampMap
  const place = {id:'trifels',name:'Reichsburg Trifels',status:'active',geometry_type:'POINT',latitude:49.1965846,longitude:7.9784024}
  const zone = {zone_key:'primary',label:'Schlossäcker',verification_type:'POINT_RADIUS',safe_latitude:49.194314771322,safe_longitude:7.9801118798371,unlock_radius_meters:400,edge_tolerance_meters:0,active:true}
  const render = async zones => { await act(async()=>{root.render(React.createElement(React.StrictMode,null,React.createElement(Map,{zones,place})));await new Promise(resolve=>setTimeout(resolve,15))}) }
  const circlePath = () => document.querySelector('path[fill-opacity="0.13"]')
  try {
    await render([zone])
    assert.equal(document.querySelectorAll('.leaflet-map-pane').length,1)
    assert.ok(circlePath(),'The initial radius must be drawn')
    const before = circlePath().getAttribute('d')
    assert.match(document.body.textContent,/400 m/)
    await render([{...zone,unlock_radius_meters:200}])
    assert.match(document.body.textContent,/200 m/)
    assert.notEqual(circlePath().getAttribute('d'),before,'Changing the form radius must redraw the circle')
    await render([{...zone,label:'<img src=x onerror=alert(1)>',active:false}])
    assert.ok(document.querySelector('path[stroke-dasharray="6 6"]'),'Inactive areas need a distinct outline')
    assert.equal(document.querySelector('img[src="x"]'),null,'Labels must remain text')
    await render([{...zone,safe_latitude:null}])
    assert.equal(circlePath(),null,'The old valid radius must not remain visible after invalid input')
    assert.match(document.body.textContent,/gültige Koordinaten/)
    await render([])
    assert.equal(document.querySelectorAll('path.leaflet-interactive').length,1,'Only the linked place remains')
    await act(async()=>root.render(null))
    assert.equal(document.querySelectorAll('.leaflet-map-pane').length,0)
  } finally {
    await act(async()=>root.unmount())
    for(const name of names){if(previous[name])Object.defineProperty(globalThis,name,previous[name]);else delete globalThis[name]}
    dom.window.close()
  }
})
