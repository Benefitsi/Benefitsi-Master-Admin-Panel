import assert from "node:assert/strict"
import test from "node:test"
import React, {act} from "react"
import {JSDOM} from "jsdom"
import {loadTypescript} from "./helpers/load-typescript.mjs"
import * as language from "../app/admin-language.tsx"
import * as contract from "../lib/benefitsi-knowledge-controls.ts"
import * as navigation from "../lib/admin-navigation.ts"
import {AdminTranslationBoundary} from "../components/admin-translation-boundary.tsx"
const h=React.createElement,Link=({children,...props})=>{delete props.prefetch;return h('a',props,children)}
const common={'next/link':Link,'@/app/admin-language':language,'@/components/admin-translation-boundary':{AdminTranslationBoundary}}
const date='2026-10-13T10:00:00Z',id='ea4db5c0-dfd4-4106-94b4-b22c5ad608ff'
const raw='# Wissen\n<script>window.BAD=true</script> Prüfung & Freigaben · $&\r\n'
const note={schemaVersion:1,sourceId:'benefitsi-obsidian',ownership:'BENEFITSI_EXTERNAL',checkedAt:date,id,path:'96 Aufgaben/'+id+'.md',title:'Wissen',kind:'task',profileId:'benefitsi-menu',createdAt:date,modifiedAt:date,sha256:'a'.repeat(64),hashVersion:'sha256-bytes-v1',byteLength:Buffer.byteLength(raw),content:raw}
async function mount(t){
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://admin.example/wissen'})
 const names=['window','self','document','Element','Text','Node','NodeFilter','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT']
 const previous=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]))
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]})
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const name of names){if(previous[name])Object.defineProperty(globalThis,name,previous[name]);else delete globalThis[name]}})
 const settle=()=>new Promise(resolve=>setTimeout(resolve,15))
 const render=async tree=>{await act(async()=>{root.render(tree);await settle()});await act(settle)}
 const toggle=async option=>act(async()=>{[...document.querySelectorAll('button')].find(node=>node.textContent===option).click();await settle()})
 return{dom,render,toggle}
}
function modules(){
 const proxy=Object.fromEntries(['document','window'].map(name=>[name,new Proxy({},{get:(_target,key)=>{const value=globalThis[name]?.[key];return typeof value==='function'?value.bind(globalThis[name]):value}})]))
 const shell=loadTypescript('app/admin-shell.tsx',{...common,'next/navigation':{usePathname:()=>'/wissen'},'next/image':props=>{const p={...props};delete p.priority;return h('img',p)},'./actions':{signOut:async()=>{}},'./admin-language':language,'@/lib/admin-navigation':navigation,'@/components/pending-submit-button':{PendingSubmitButton:({children,...props})=>{delete props.pendingLabel;return h('button',props,children)}},'@/components/brand-logo':{BrandLogo:()=>h('span',null,'Benefitsi')}},proxy)
 const composer=loadTypescript('components/knowledge/benefitsi-note-composer.tsx',{...common,'@/lib/benefitsi-knowledge-controls':contract},{crypto:globalThis.crypto,fetch:()=>{throw new Error('No automatic calls')}})
 const entry=loadTypescript('components/knowledge/benefitsi-knowledge-entry.tsx',{'next/navigation':{useRouter:()=>({refresh:()=>{}})},'./benefitsi-note-composer':composer})
 const browser=loadTypescript('app/wissen/knowledge-browser.tsx',common,{URLSearchParams})
 let detail={};try{detail=loadTypescript('components/knowledge/benefitsi-note-detail.tsx',common)}catch(error){if(error.code!=='ENOENT')throw error}
 let readerCalls=[],mirrorCalls=0,readerError=null,authorized=true
 const page=loadTypescript('app/wissen/page.tsx',{...common,'@/app/admin-shell':shell,'@/lib/admin':{requireAdmin:async()=>{if(!authorized)throw new Error('login redirect');return{adminSession:{isAdmin:true,user:{email:'Wissen'},profile:{display_name:'Wissen'}}}}},'@/lib/benefitsi-knowledge-controls':contract,'@/lib/benefitsi-knowledge-controls-server':{requestKnowledgeNote:async value=>{readerCalls.push(value);if(readerError)throw readerError;return note}},'@/lib/knowledge/read':{getBenefitsiKnowledgeStatus:async()=>{mirrorCalls++;return{status:'healthy',documentCount:1,lastSuccessfulSyncAt:date,lastErrorCode:null}},searchBenefitsiKnowledge:async()=>({items:[{id:'mirror-id',title:'Prüfung & Freigaben',relativePath:'Wissen.md',sourceModifiedAt:date,syncedAt:date,isDeleted:false}],totalCount:1,hasMore:false,errorCode:null}),getBenefitsiKnowledgeDocument:async()=>null},'./knowledge-browser':browser,'@/components/knowledge/benefitsi-knowledge-entry':entry,'@/components/knowledge/benefitsi-note-detail':detail})
 return{page,detail,readerCalls,get mirrorCalls(){return mirrorCalls},set readerError(value){readerError=value},set authorized(value){authorized=value}}
}
test('actual knowledge page reads only a managed UUID and renders escaped raw content with EN/DE metadata',async t=>{
 const ui=await mount(t),m=modules()
 assert.equal(typeof m.detail.ManagedNoteDetail,'function')
 const tree=await m.page.default({searchParams:Promise.resolve({note:id})})
 await ui.render(tree)
 assert.deepEqual(m.readerCalls,[id])
 const section=document.querySelector('#managed-note')
 assert.ok(section)
 assert.match(section.textContent,/Directly from Obsidian/)
 assert.match(section.textContent,/The knowledge mirror updates separately/)
 assert.equal(section.querySelector('h2').textContent,'Wissen')
 assert.equal(section.querySelector('pre').textContent,raw)
 assert.equal(section.querySelector('pre').getAttribute('data-admin-no-translate'),'true')
 assert.equal(section.querySelector('pre').getAttribute('translate'),'no')
 assert.equal(document.querySelector('script'),null);assert.equal(ui.dom.window.BAD,undefined)
 assert.match(document.body.textContent,/Prüfung & Freigaben/)
 for(const option of ['DE','EN','DE','EN']){
  await ui.toggle(option)
  assert.equal(section.querySelector('h2').textContent,'Wissen')
  assert.equal(section.querySelector('pre').textContent,raw)
  assert.match(section.textContent,/Menü/)
  assert.match(section.textContent,option==='DE'?/Direkt aus Obsidian/:/Directly from Obsidian/)
  assert.equal(section.querySelector('code').textContent,note.path)
  assert.equal(document.querySelector('tbody td').textContent,'Prüfung & Freigaben')
 }
})
test('knowledge page blocks invalid selectors and displays missing, invalid and forbidden note states honestly',async t=>{
 const ui=await mount(t),m=modules()
 for(const value of ['../secret',[id,id],'']){
  await ui.render(await m.page.default({searchParams:Promise.resolve({note:value})}))
  assert.match(document.querySelector('#managed-note').textContent,/could not be safely confirmed/)
 }
 assert.equal(m.readerCalls.length,0)
 for(const [code,en,de]of [['unavailable','currently unavailable','derzeit nicht verfügbar'],['invalid_response','could not be safely confirmed','konnte nicht sicher bestätigt werden'],['permission_denied','required permission is missing','fehlt die erforderliche Berechtigung']]){
  m.readerError=new contract.KnowledgeControlError(code)
  await ui.render(await m.page.default({searchParams:Promise.resolve({note:id})}))
  const section=document.querySelector('#managed-note')
  assert.match(section.textContent,new RegExp(en));assert.equal(section.querySelector('pre'),null)
  await ui.toggle('DE');assert.match(section.textContent,new RegExp(de));await ui.toggle('EN')
 }
 m.authorized=false
 const reads=m.readerCalls.length,mirror=m.mirrorCalls
 await assert.rejects(m.page.default({searchParams:Promise.resolve({note:id})}),/login redirect/)
 assert.equal(m.readerCalls.length,reads);assert.equal(m.mirrorCalls,mirror)
})
