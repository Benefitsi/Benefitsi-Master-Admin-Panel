import {existsSync, readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const nativeRequire=createRequire(import.meta.url)
export function loadTypescript(relative,stubs={},globals={}) {
 const cache=new Map()
 function resolve(url) {
  for (const suffix of ['', '.ts', '.tsx', '.js', '.mjs']) {
   const candidate=new URL(url.href+suffix)
   if(existsSync(candidate))return candidate
  }
  throw new Error(`Cannot resolve test module ${url.pathname}`)
 }
 function load(url) {
  if(cache.has(url.href))return cache.get(url.href)
  const loadedModule={exports:{}};cache.set(url.href,loadedModule.exports)
  const js=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText
  vm.runInNewContext(js,{...globals,module:loadedModule,exports:loadedModule.exports,Buffer,URL,process,console,require:id=>{
   if(Object.hasOwn(stubs,id))return stubs[id]
   if(id==='server-only')return {}
   if(id.startsWith('@/'))return load(resolve(new URL('../../'+id.slice(2),import.meta.url)))
   if(id.startsWith('.'))return load(resolve(new URL(id,url)))
   return nativeRequire(id)
  }},{filename:url.pathname})
  return loadedModule.exports
 }
 return load(new URL('../../'+relative,import.meta.url))
}
