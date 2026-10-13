import assert from 'node:assert/strict'
import test from 'node:test'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import {loadTypescript} from './helpers/load-typescript.mjs'
const date='2026-10-13T14:00:00Z'
const catalogue={profileId:'ben',checkedAt:date,current:{provider:'minimax',model:'MiniMax-M3.0'},revision:'rev-1',starter:{mode:'profile-default',appliesToNewJobs:true,limitations:[]},providers:[{id:'minimax',label:'MiniMax',authenticated:true,models:[{id:'MiniMax-M3.0',label:'MiniMax M3'}]},{id:'openai-codex',label:'Codex',authenticated:true,models:[{id:'gpt-5.5',label:'GPT 5.5'}]}]}
async function mount(t,fetch){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://admin.benefitsi.de/agents'})
 const names=['window','document','IS_REACT_ACT_ENVIRONMENT'];const old=Object.fromEntries(names.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 for(const key of names)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]})
 const root=createRoot(document.getElementById('root'))
 t.after(async()=>{await act(()=>root.unmount());dom.window.close();for(const key of names){if(old[key])Object.defineProperty(globalThis,key,old[key]);else delete globalThis[key]}})
 let ui={};try{ui=loadTypescript('app/agents/agent-controls.tsx',{'@/app/admin-language':{useAdminLanguage:()=>({language:'de',tr:x=>x})}},{fetch,AbortController})}catch{}
 assert.equal(typeof ui.AgentProfileControls,'function')
 await act(()=>root.render(React.createElement(ui.AgentProfileControls,{profileId:'ben',initialProvider:'minimax',initialModel:'MiniMax-M3.0'})))
 return {dom,button:text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text),click:async button=>act(()=>button.click()),change:async(select,value)=>act(()=>{select.value=value;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
}
test('reader waits for explicit choice and renders Markdown as text, not executed HTML',async t=>{
 const calls=[]
 const fetch=async url=>{calls.push(url);return {ok:true,json:async()=>String(url).includes('fileId=')?{profileId:'ben',fileId:'soul',path:'SOUL.md',modifiedAt:date,readAt:date,content:'# Wissen\n<script>window.BAD=true</script>'}:{documents:[{fileId:'soul',path:'SOUL.md',exists:true,byteLength:46,modifiedAt:date}]}}}
 const ui=await mount(t,fetch)
 assert.equal(calls.length,0)
 await ui.click(ui.button('Dateien anzeigen'));assert.equal(calls.length,1)
 await ui.click(ui.button('SOUL.md'))
 assert.match(document.querySelector('pre').textContent,/<script>/)
 assert.equal(document.querySelector('script'),null);assert.equal(ui.dom.window.BAD,undefined)
 assert.equal(document.querySelector('pre').getAttribute('translate'),'no')
})
test('model picker uses available catalog and confirms actual applied readback only',async t=>{
 const calls=[]
 const fetch=async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>init.method==='POST'?{...catalogue,current:{provider:'openai-codex',model:'gpt-5.5'},revision:'rev-2',confirmed:true,readbackVerified:true,effectiveFor:'new-jobs',changed:true}:catalogue}}
 const ui=await mount(t,fetch)
 await ui.click(ui.button('Verbindungen prüfen'));assert.equal(calls.length,1)
 assert.equal(ui.button('Anwenden').disabled,true)
 const [provider,model]=document.querySelectorAll('select')
 await ui.change(provider,'openai-codex');await ui.change(model,'gpt-5.5');await ui.click(ui.button('Anwenden'))
 assert.deepEqual(JSON.parse(calls[1].init.body),{provider:'openai-codex',model:'gpt-5.5',expectedProvider:'minimax',expectedModel:'MiniMax-M3.0',expectedRevision:'rev-1',confirmed:true})
 assert.match(document.querySelector('[role="status"]').textContent,/gespeichert und zurückgelesen/)
 assert.match(document.body.textContent,/Laufende Aufträge bleiben unverändert/)
})

test('model selection cannot apply when the actual starter does not use the profile choice',async t=>{
 const unavailable={...catalogue,starter:{mode:'profile-default',appliesToNewJobs:false,limitations:['Kommerzielle Menüimporte mit festem Kostenvertrag verwenden ihren gesonderten zugelassenen Provideradapter.']}}
 const calls=[]
 const ui=await mount(t,async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>unavailable}})
 await ui.click(ui.button('Verbindungen prüfen'))
 const [provider,model]=document.querySelectorAll('select')
 await ui.change(provider,'openai-codex');await ui.change(model,'gpt-5.5')
 assert.equal(ui.button('Anwenden').disabled,true)
 await ui.click(ui.button('Anwenden'));assert.equal(calls.length,1)
 assert.match(document.body.textContent,/übernimmt diese Profilwahl derzeit nicht/)
 assert.match(document.body.textContent,/gesonderten zugelassenen Provideradapter/)
})
