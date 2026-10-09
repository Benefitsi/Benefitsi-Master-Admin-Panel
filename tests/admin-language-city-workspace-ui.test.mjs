import assert from 'node:assert/strict'
import test from 'node:test'
import {createRequire} from 'node:module'
import React, {act} from 'react'
import {JSDOM} from 'jsdom'
import {AdminLanguageProvider, useAdminLanguage} from '../app/admin-language.tsx'
import {QuestionEditor} from '../components/workspace/question-editor.tsx'
import {onboardingContent} from '../lib/workspace/templates.ts'
import {makePage} from '../lib/workspace/model.ts'
import {WorkspaceEditor} from '../components/workspace/workspace-editor.tsx'
import {workspaceFixture} from './helpers/workspace-fixture.mjs'

// The transport is injected; Next normally replaces these server action imports.
const require=createRequire(import.meta.url)
const serverOnly=require.resolve('server-only'), previousServerOnly=require.cache[serverOnly]
require.cache[serverOnly]={exports:{}}
const {WorkspaceApp}=await import('../components/workspace/workspace-app.tsx')
test.after(()=>{if(previousServerOnly)require.cache[serverOnly]=previousServerOnly;else delete require.cache[serverOnly]})

async function withDom(run) {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/workspace',pretendToBeVisual:true})
  const names=['window','self','document','Element','Text','Node','NodeFilter','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT']
  const previous=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]))
  for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]})
  const {createRoot}=await import('react-dom/client')
  const root=createRoot(document.getElementById('root'))
  try {await run(root,dom)} finally {await act(async()=>root.unmount());dom.window.close();for(const name of names){if(previous[name])Object.defineProperty(globalThis,name,previous[name]);else delete globalThis[name]}}
}
function Toggle() {
  const {language,setLanguage}=useAdminLanguage()
  return React.createElement('button',{'data-language-toggle':true,onClick:()=>setLanguage(language==='en'?'de':'en')},'Toggle')
}
const settle=()=>act(async()=>new Promise(resolve=>setTimeout(resolve,30)))
const switchLanguage=async()=>{await act(async()=>document.querySelector('[data-language-toggle]').click());await settle()}

// Regression: the workspace used to exclude its whole subtree from translation.
test('workspace controls switch language while stored titles and descriptions stay verbatim',async()=>withDom(async(root)=>{
  const workspace={id:'00000000-0000-4000-8000-000000000001',title:'Speichern',description:'Stadtverwaltung',revision:1,archived:false,created_at:'2026-10-09T12:00:00Z',updated_at:'2026-10-09T12:00:00Z'}
  const fixture=workspaceFixture({workspaces:[workspace]})
  const initial=await fixture.services.loadWorkspaceIndex()
  await act(async()=>root.render(React.createElement(AdminLanguageProvider,{initialLanguage:'en',storageKey:'workspace-i18n-test'},React.createElement(Toggle),React.createElement(WorkspaceApp,{initial,services:fixture.services}))))
  await settle()
  assert.equal(document.querySelector('h1').textContent,'Speichern')
  assert.ok(document.body.textContent.includes('Stadtverwaltung'))
  assert.ok([...document.querySelectorAll('button')].some(button=>button.textContent.includes('New page')))
  await switchLanguage()
  assert.ok([...document.querySelectorAll('button')].some(button=>button.textContent.includes('Neue Seite')))
  assert.equal(document.querySelector('h1').textContent,'Speichern')
  await switchLanguage()
  assert.ok([...document.querySelectorAll('button')].some(button=>button.textContent.includes('New page')))
  assert.equal(document.querySelector('h1').textContent,'Speichern')
  assert.equal(fixture.workspaces.get(workspace.id).description,'Stadtverwaltung')
}))

test('onboarding guidance switches but custom prompts and entered answers are preserved',async()=>withDom(async(root)=>{
  const original=onboardingContent().questions[0]
  const questions=[{...original,answer:'Inhalte prüfen'}, {...original,id:'custom-123',prompt:'Stadtverwaltung',answer:'Speichern'}]
  const snapshot=structuredClone(questions)
  await act(async()=>root.render(React.createElement(AdminLanguageProvider,{initialLanguage:'en',storageKey:'questions-i18n-test'},React.createElement(Toggle),React.createElement(QuestionEditor,{questions,onChange:()=>{throw new Error('Translation must not save content')}}))))
  await settle()
  assert.ok(document.body.textContent.includes('Review master data together:'))
  assert.ok([...document.querySelectorAll('h3')].some(heading=>heading.textContent==='Stadtverwaltung'))
  assert.ok([...document.querySelectorAll('textarea')].some(field=>field.value==='Inhalte prüfen'))
  await switchLanguage()
  assert.ok(document.body.textContent.includes('Stammdaten gemeinsam prüfen:'))
  await switchLanguage()
  assert.ok(document.body.textContent.includes('Review master data together:'))
  assert.deepEqual(questions,snapshot)
}))

test('switching language keeps pending autosave and subsequent workspace edits connected',async()=>withDom(async(root)=>{
  const page={...makePage('00000000-0000-4000-8000-000000000001','note'),title:'Original',revision:1}
  const fixture=workspaceFixture({pages:[page]})
  const noop=()=>{}
  await act(async()=>root.render(React.createElement(AdminLanguageProvider,{initialLanguage:'en',storageKey:'editor-autosave-i18n'},React.createElement(Toggle),React.createElement(WorkspaceEditor,{
    page,pages:[page],favorite:false,externalBusy:false,services:fixture.services,onStored:noop,onReplace:noop,onFavorite:noop,onCreate:async()=>{},onBack:noop,setGuard:noop,
  }))))
  await settle()
  const title=document.querySelector('input[maxlength="200"]')
  const fill=async value=>act(async()=>{
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(title,value)
    title.dispatchEvent(new window.Event('input',{bubbles:true}))
  })
  await fill('Before toggle')
  await switchLanguage()
  await act(async()=>new Promise(resolve=>setTimeout(resolve,1050)))
  assert.equal(fixture.pages.get(page.id).title,'Before toggle','The pending autosave must survive a language change')
  await fill('After toggle')
  assert.equal(title.value,'After toggle','The input remains subscribed to the document session')
  await act(async()=>new Promise(resolve=>setTimeout(resolve,1050)))
  assert.equal(fixture.pages.get(page.id).title,'After toggle')
  assert.ok([...document.querySelectorAll('[role="status"]')].some(node=>node.textContent==='Gespeichert'))
}))
