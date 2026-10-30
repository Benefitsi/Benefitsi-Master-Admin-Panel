import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {loadTypescript} from './helpers/load-typescript.mjs'
const require=createRequire(import.meta.url)
const fixture=JSON.parse(readFileSync(new URL('./fixtures/corporate-branding-contract.json',import.meta.url)))
const company=fixture.default_detail.company
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0])
function editor(actions={},url=URL) {
 return loadTypescript('components/corporate/company-branding.tsx',{'@/app/companies/actions':{readCorporateCompanyLogo:async()=>null,reloadCorporateCompanyBranding:async()=>fixture.branded_owner_detail,...actions}}, {Blob,Uint8Array,FormData,atob,URL:url}).CorporateCompanyBranding
}
async function withDom(run) {
 const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'http://localhost/companies'})
 const values={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true}
 const previous=Object.fromEntries(Object.keys(values).map(k=>[k,globalThis[k]]));Object.assign(globalThis,values)
 const root=require('react-dom/client').createRoot(document.getElementById('root'))
 try {await run(root,dom.window)} finally {await act(async()=>root.unmount());Object.assign(globalThis,previous);dom.window.close()}
}
function edit(window,value) {
 const element=document.querySelector('textarea')
 Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(element,value)
 element.dispatchEvent(new window.Event('input',{bubbles:true}))
}
function file(window,value) {
 const element=document.querySelector('input[type="file"]')
 Object.defineProperty(element,'files',{value:[value],configurable:true})
 element.dispatchEvent(new window.Event('change',{bubbles:true}))
}
test('editor submits text and valid file with original lock, preserves conflict through refresh and explicitly adopts fresh DTO',async()=>{
 const calls=[]
 const Editor=editor({saveCorporateCompanyBranding:async data=>{calls.push(data);return {status:'conflict',message:'Bitte neu laden'}}})
 await withDom(async(root,window)=>{
  const props={company,adminIdentity:'admin-a'}
  await act(async()=>root.render(React.createElement(Editor,props)))
  await act(async()=>{edit(window,'Mein Team 👋');file(window,new File([png],'team.png',{type:'image/png'}))})
  await act(async()=>document.querySelector('form').requestSubmit())
  assert.equal(calls[0].get('companyId'),company.company_id);assert.equal(calls[0].get('expectedUpdatedAt'),company.updated_at)
  assert.equal(calls[0].get('welcomeText'),'Mein Team 👋');assert.equal(calls[0].get('logo').name,'team.png')
  await act(async()=>root.render(React.createElement(Editor,{...props,company:fixture.branded_owner_detail.company})))
  assert.equal(document.querySelector('textarea').value,'Mein Team 👋');assert.equal(document.querySelector('button[type="submit"]').disabled,true)
  assert.match(document.body.textContent,/Mein Team 👋/)
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Serverstand neu laden').click())
  assert.equal(document.querySelector('textarea').value,'Willkommen im Team! 👋')
  await act(async()=>document.querySelector('form').requestSubmit())
  assert.equal(calls[1].get('expectedUpdatedAt'),fixture.branded_owner_detail.company.updated_at);assert.equal(calls[1].get('logo'),null)
 })
})
test('pending saves block duplicate operations and stale completion cannot appear after company or admin switch',async()=>{
 let finish,calls=0
 const Editor=editor({saveCorporateCompanyBranding:async()=>{calls++;return new Promise(resolve=>{finish=resolve})}})
 await withDom(async(root,window)=>{
  const props={company,adminIdentity:'admin-a'}
  await act(async()=>root.render(React.createElement(Editor,props)))
  await act(async()=>edit(window,'Old private text'))
  await act(async()=>{document.querySelector('form').requestSubmit();document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}))})
  assert.equal(calls,1);assert.equal(document.querySelector('fieldset').disabled,true)
  await act(async()=>root.render(React.createElement(Editor,{...props,adminIdentity:'admin-b'})))
  assert.equal(document.querySelector('textarea').value,'')
  await act(async()=>finish({status:'updated',updatedAt:fixture.update.updated_at,branding:{logo_path:null,welcome_text:'Old private text'},message:'Old success'}))
  assert.doesNotMatch(document.body.textContent,/Old private text|Old success/)
  await act(async()=>edit(window,'Other draft'))
  await act(async()=>document.querySelector('form').requestSubmit())
  await act(async()=>root.render(React.createElement(Editor,{...props,adminIdentity:'admin-b',company:{...company,company_id:'4c99bd37-aeee-4c36-aee6-012b4619a521'}})))
  await act(async()=>finish({status:'conflict',message:'Other stale completion'}))
  assert.doesNotMatch(document.body.textContent,/Other draft|Other stale completion/)
  assert.equal(document.querySelector('textarea').value,'');assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0)
 })
})
test('verified private image uses ephemeral Blob, errors fallback, and pending old image is discarded on identity switch',async()=>{
 let finish;const created=[],revoked=[]
 const urls={createObjectURL:blob=>{created.push(blob);return 'blob:verified'},revokeObjectURL:url=>revoked.push(url)}
 const Editor=editor({readCorporateCompanyLogo:async()=>new Promise(resolve=>{finish=resolve})},urls)
 await withDom(async root=>{
  const props={company:fixture.branded_owner_detail.company,adminIdentity:'admin-a'}
  await act(async()=>root.render(React.createElement(Editor,props)))
  const old=finish
  await act(async()=>root.render(React.createElement(Editor,{company,adminIdentity:'admin-b'})))
  await act(async()=>old({mime:'image/png',base64:Buffer.from(png).toString('base64')}))
  assert.equal(document.querySelector('img'),null);assert.equal(created.length,0)
  await act(async()=>root.render(React.createElement(Editor,{...props,adminIdentity:'admin-c'})))
  await act(async()=>finish({mime:'image/png',base64:Buffer.from(png).toString('base64')}))
  assert.equal(document.querySelector('img').src,'blob:verified');assert.match(document.querySelector('img').alt,/Example Company/)
  await act(async()=>document.querySelector('img').dispatchEvent(new window.Event('error')))
  assert.equal(document.querySelector('img'),null)
 })
 assert.deepEqual(revoked,['blob:verified'])
})
test('invalid bytes and over-limit Unicode drafts cannot save; plain text preview and success remain accessible',async()=>{
 const calls=[]
 const Editor=editor({saveCorporateCompanyBranding:async data=>{calls.push(data);return {status:'updated',message:'Firmenauftritt gespeichert.',updatedAt:fixture.update.updated_at,branding:{logo_path:null,welcome_text:data.get('welcomeText').trim()},cleanupWarning:'Bereinigung ausstehend'}}})
 await withDom(async(root,window)=>{
  await act(async()=>root.render(React.createElement(Editor,{company,adminIdentity:'a'})))
  await act(async()=>file(window,new File(['bad'],'logo.png',{type:'image/png'})))
  assert.match(document.querySelector('[role="alert"]').textContent,/PNG|JPEG|WebP/);assert.equal(document.querySelector('button[type="submit"]').disabled,true)
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Logo entfernen').click())
  await act(async()=>edit(window,'😀'.repeat(500)))
  assert.equal(document.querySelector('button[type="submit"]').disabled,false)
  await act(async()=>edit(window,'😀'.repeat(501)))
  assert.equal(document.querySelector('button[type="submit"]').disabled,true)
  await act(async()=>edit(window,'<b>Welcome</b>'))
  assert.equal(document.querySelector('b'),null);assert.match(document.body.textContent,/<b>Welcome<\/b>/)
  await act(async()=>document.querySelector('form').requestSubmit())
  assert.equal(calls.length,1);assert.match(document.querySelector('[role="status"]').textContent,/Firmenauftritt gespeichert/);assert.match(document.body.textContent,/Bereinigung ausstehend/)
 })
})
