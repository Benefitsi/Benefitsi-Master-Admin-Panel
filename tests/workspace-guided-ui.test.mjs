import assert from 'node:assert/strict'
import test from 'node:test'
import React,{act,useState} from 'react'
import {JSDOM} from 'jsdom'
import {onboardingContent} from '../lib/workspace/templates.ts'
import {decodeChoiceAnswer} from '../lib/workspace/choice-answers.ts'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://example.test',pretendToBeVisual:true})
const names=['window','self','document','Element','Text','Node','NodeFilter','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT']
const previous=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]))
for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]})
const {createRoot}=await import('react-dom/client')
const {QuestionEditor}=await import('../components/workspace/question-editor.tsx')
test.after(()=>{dom.window.close();for(const name of names){if(previous[name])Object.defineProperty(globalThis,name,previous[name]);else delete globalThis[name]}})
const click=async el=>{assert.ok(el,'Control exists');await act(async()=>el.click())}
const checkbox=name=>[...document.querySelectorAll('input[type=checkbox]')].find(el=>el.getAttribute('aria-label')===name||el.closest('label')?.textContent.trim()===name)
const fill=async(el,value)=>{assert.ok(el);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}))})}
async function renderQuestions(questions,run){let latest=questions;const root=createRoot(document.getElementById('root'));function Harness(){const [value,setValue]=useState(questions);return React.createElement(QuestionEditor,{questions:value,onChange:q=>{latest=q;setValue(q)}})}try{await act(async()=>root.render(React.createElement(Harness)));await run(()=>latest,async()=>{questions=latest;await act(async()=>root.render(null));await act(async()=>root.render(React.createElement(Harness)))})}finally{await act(async()=>root.unmount())}}
test('core, open and hidden filters compose across all topics and list only matching questions',async()=>{
  const base=onboardingContent().questions[0]
  const questions=[{...base,id:'A01',section:'A',core:true,status:'agreed'},{...base,id:'A02',section:'A',core:false,status:'open'},{...base,id:'B01',section:'B',core:true,status:'open'},{...base,id:'C01',section:'C',core:true,status:'clarify',hidden:true},{...base,id:'C02',section:'C',core:false,status:'open',hidden:true}]
  const visible=()=>[...document.querySelectorAll('section[id^="question-"]')].map(el=>el.id.replace('question-',''))
  await renderQuestions(questions,async()=>{
    await click(checkbox('Nur Kernfragen'));assert.deepEqual(visible(),['A01','B01'])
    await click(checkbox('Nur offene Fragen'));assert.deepEqual(visible(),['B01'])
    await click(checkbox('Nur ausgeblendete Fragen'));assert.deepEqual(visible(),['C01'])
    await click(checkbox('Nur Kernfragen'));assert.deepEqual(visible(),['C01','C02'])
    await click(checkbox('Nur ausgeblendete Fragen'));assert.deepEqual(visible(),['A02','B01'])
  })
})
test('deal checkboxes reveal details and persist their selections and notes across remount',async()=>{
  const question={...onboardingContent().questions.find(q=>q.id==='D01'),answer:'Bisherige Gesprächsnotiz'}
  await renderQuestions([question],async(latest,remount)=>{
    assert.ok(checkbox('2 für 1'))
    assert.ok(checkbox('Deal Drop'))
    assert.ok(!document.querySelector('textarea[aria-label="Details · 2 für 1"]'))
    await click(checkbox('2 für 1'))
    await fill(document.querySelector('textarea[aria-label="Details · 2 für 1"]'),'Pizza am Dienstag')
    await remount()
    assert.equal(checkbox('2 für 1').checked,true)
    assert.equal(document.querySelector('textarea[aria-label="Details · 2 für 1"]').value,'Pizza am Dienstag')
    await click(checkbox('2 für 1'))
    assert.ok(!document.querySelector('textarea[aria-label="Details · 2 für 1"]'))
    await click(checkbox('2 für 1'))
    assert.equal(document.querySelector('textarea[aria-label="Details · 2 für 1"]').value,'Pizza am Dienstag')
    assert.equal(decodeChoiceAnswer(latest()[0].answer).notes,'Bisherige Gesprächsnotiz')
  })
})
