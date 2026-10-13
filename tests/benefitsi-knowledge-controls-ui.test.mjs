import assert from 'node:assert/strict'
import test from 'node:test'
import {createRequire} from 'node:module'
const nativeRequire=createRequire(import.meta.url)
const React=nativeRequire('react')
const language=await import('../app/admin-language.tsx')
const contract=await import('../lib/benefitsi-knowledge-controls.ts')
import {loadTypescript} from './helpers/load-typescript.mjs'
const load=(file,stubs={},globals={})=>loadTypescript(file,stubs,{URL,Request,Response,TextDecoder,Buffer,AbortSignal,crypto:globalThis.crypto,...globals})
const base={schemaVersion:1,action:'note-create',kind:'task',title:'Notiz',content:'Eigener Inhalt',requestId:'ea4db5c0-dfd4-4106-94b4-b22c5ad608ff'}
const receipt=body=>({schemaVersion:1,sourceId:'benefitsi-obsidian',ownership:'BENEFITSI_EXTERNAL',checkedAt:'2026-10-13T10:00:00Z',path:'96 Aufgaben/'+body.requestId+'.md',kind:body.kind,title:body.title,sha256:'a'.repeat(64),readbackVerified:true,created:true,mirrorState:'pending'})
const request=(body=base,headers={})=>new Request('https://admin.example/api/knowledge/notes',{method:'POST',headers:{origin:'https://admin.example','content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)})
test('notes route denies unauthenticated, cross-origin and non-JSON writes before any gateway call',async()=>{
 let admin=false,calls=0
 const route=load('app/api/knowledge/notes/route.ts',{'@/lib/admin':{getAdminSession:async()=>admin?{isAdmin:true}:null},'@/lib/benefitsi-knowledge-controls':contract,'@/lib/benefitsi-knowledge-controls-server':{requestKnowledge:async(_action,input)=>{calls++;return receipt(input)}}})
 assert.equal((await route.POST(request())).status,403);assert.equal(calls,0)
 admin=true
 assert.equal((await route.POST(request(base,{origin:'https://evil.example'}))).status,403)
 assert.equal((await route.POST(request(base,{'content-type':'text/plain'}))).status,415)
 assert.equal((await route.POST(request({...base,path:'/tmp/existing'}))).status,400)
 assert.equal((await route.POST(request('x'.repeat(65537)))).status,413)
 assert.equal(calls,0)
 const result=await route.POST(request());assert.equal(result.status,200);assert.equal(calls,1)
 assert.equal(result.headers.get('cache-control'),'private, no-store')
 assert.equal((await result.json()).readbackVerified,true)
})
test('note composer submits only on explicit save and retains the request ID when retrying an uncertain result',async t=>{
 const {JSDOM}=await import('jsdom')
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://admin.example'})
 const names=['React','window','self','document','Element','Text','Node','NodeFilter','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT']
 const previous=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]))
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='React'?React:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]})
 const {createRoot}=nativeRequire('react-dom/client'),root=createRoot(document.getElementById('root'))
 t.after(async()=>{await React.act(async()=>root.unmount());dom.window.close();for(const name of names){if(previous[name])Object.defineProperty(globalThis,name,previous[name]);else delete globalThis[name]}})
 const requests=[]
 const composer=load('components/knowledge/benefitsi-note-composer.tsx',{'@/app/admin-language':language,'@/lib/benefitsi-knowledge-controls':contract},{fetch:async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);return requests.length===1?Response.json({error:'unavailable'},{status:503}):Response.json(receipt(body))}})
 const settle=()=>new Promise(resolve=>setTimeout(resolve,15))
 await React.act(async()=>{root.render(React.createElement(language.AdminLanguageProvider,{initialLanguage:'de'},React.createElement(language.AdminLanguageControl),React.createElement(composer.BenefitsiNoteComposer)));await settle()})
 await React.act(settle)
 assert.equal(requests.length,0)
 assert.match(document.body.textContent,/Wissen ergänzen/)
 const change=async(selector,value)=>{await React.act(async()=>{const element=document.querySelector(selector);Object.getOwnPropertyDescriptor(element.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await settle()})}
 await change('input[name="title"]','Wissen')
 await change('textarea','Wissen bleibt $& und 12,50.')
 assert.equal(requests.length,0)
 const save=()=>document.querySelector('button[type="submit"]')
 await React.act(async()=>{save().click();await settle()})
 assert.equal(requests.length,1)
 assert.equal(requests[0].title,'Wissen');assert.equal(requests[0].content,'Wissen bleibt $& und 12,50.')
 assert.match(document.body.textContent,/derzeit nicht verfügbar/)
 await React.act(async()=>{save().click();await settle()})
 assert.equal(requests.length,2);assert.equal(requests[0].requestId,requests[1].requestId)
 assert.match(document.body.textContent,/In Obsidian gespeichert; Wissensspiegel wird separat aktualisiert/)
 assert.equal(save().disabled,true)
 await React.act(async()=>{[...document.querySelectorAll('button')].find(button=>button.textContent==='EN').click();await settle()})
 assert.match(document.body.textContent,/Add knowledge/)
 assert.match(document.body.textContent,/Saved in Obsidian; the knowledge mirror updates separately/)
 assert.equal(document.querySelector('select[name="kind"]').options[0].textContent,'Task')
 assert.equal(document.querySelector('select[name="profileId"]').options[6].textContent,'Menü')
 assert.equal(document.querySelector('textarea').value,'Wissen bleibt $& und 12,50.')
 assert.equal(requests.length,2)
 assert.equal(document.querySelector('code').textContent,'96 Aufgaben/'+requests[1].requestId+'.md')
 assert.equal(document.querySelector('[role="status"] a').getAttribute('href'),'/wissen?note='+requests[1].requestId)
 assert.equal(document.querySelector('[role="status"] a').textContent,'Read saved note')
})

test('GET managed note route requires admin and exactly one UUID without path selectors',async()=>{
 let admin=false,calls=0
 const route=load('app/api/knowledge/notes/route.ts',{'@/lib/admin':{getAdminSession:async()=>admin?{isAdmin:true}:null},'@/lib/benefitsi-knowledge-controls':contract,'@/lib/benefitsi-knowledge-controls-server':{requestKnowledgeNote:async id=>{calls++;return {id,content:'<script>kept as data</script>'}}}})
 assert.equal(typeof route.GET,'function')
 const get=query=>route.GET(new Request('https://admin.example/api/knowledge/notes'+query))
 assert.equal((await get('?id='+base.requestId)).status,403);assert.equal(calls,0)
 admin=true
 for(const query of ['', '?id=../secret','?id='+base.requestId+'&path=/tmp/x','?id='+base.requestId+'&id='+base.requestId])assert.equal((await get(query)).status,400)
 assert.equal(calls,0)
 const response=await get('?id='+base.requestId)
 assert.equal(response.status,200);assert.equal(calls,1);assert.equal(response.headers.get('cache-control'),'private, no-store')
 assert.equal((await response.json()).content,'<script>kept as data</script>')
})
