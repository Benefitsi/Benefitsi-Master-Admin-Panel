import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const nativeRequire=createRequire(import.meta.url)
export function loadTypescript(relative,stubs={},globals={}) {
 const cache=new Map()
 function load(url) {
  if(cache.has(url.href))return cache.get(url.href)
  const loadedModule={exports:{}};cache.set(url.href,loadedModule.exports)
  const js=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText
  vm.runInNewContext(js,{module:loadedModule,exports:loadedModule.exports,Buffer,URL,process,console,...globals,require:id=>{
   if(Object.hasOwn(stubs,id))return stubs[id]
   if(id==='server-only')return {}
   if(id.startsWith('@/')) {
    const path='../../'+id.slice(2)
    const tsUrl=new URL(path+'.ts',import.meta.url)
    return load(existsSync(tsUrl)?tsUrl:new URL(path+'.tsx',import.meta.url))
   }
   assert.ok(!id.startsWith('.'),'relative imports require an explicit stub')
   return nativeRequire(id)
  }},{filename:url.pathname})
  return loadedModule.exports
 }
 return load(new URL('../../'+relative,import.meta.url))
}
