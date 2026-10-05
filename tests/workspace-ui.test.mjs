import assert from 'node:assert/strict'
import test from 'node:test'
import React, {act} from 'react'
import {JSDOM} from 'jsdom'
import {makePage} from '../lib/workspace/model.ts'
import {onboardingContent} from '../lib/workspace/templates.ts'
import {workspaceFixture,fixturePartner} from './helpers/workspace-fixture.mjs'

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost/workspace',pretendToBeVisual:true})
const names=['window','self','document','Element','Text','Node','NodeFilter','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT']
const previous=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]))
for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]})
dom.window.confirm=()=>true
const {createRoot}=await import('react-dom/client')
const {WorkspaceApp}=await import('../components/workspace/workspace-app.tsx')
test.after(()=>{dom.window.close();for(const name of names){if(previous[name])Object.defineProperty(globalThis,name,previous[name]);else delete globalThis[name]}})

const workspace={id:'00000000-0000-4000-8000-000000000001',title:'Partnergespräche',description:'Notizen und nächste Schritte',revision:1,archived:false,created_at:'2026-10-05T12:00:00Z',updated_at:'2026-10-05T12:00:00Z'}
const button=(name,within=document)=>[...within.querySelectorAll('button')].find(el=>(el.getAttribute('aria-label')??el.textContent).trim()===name)
const field=(name,within=document)=>[...within.querySelectorAll('input,select,textarea')].find(el=>el.getAttribute('aria-label')===name || el.closest('label')?.querySelector('span')?.textContent===name)
const wait=async predicate=>{for(let n=0;n<60;n++){if(predicate())return;await act(async()=>new Promise(resolve=>setTimeout(resolve,20)))}assert.ok(predicate(),'Timed out waiting for UI state')}
const click=async el=>{assert.ok(el,'Button exists');await act(async()=>el.click())}
const fill=async(el,value)=>{assert.ok(el,'Field exists');await act(async()=>{const prototype=el instanceof window.HTMLSelectElement?window.HTMLSelectElement.prototype:el instanceof window.HTMLTextAreaElement?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event(el instanceof window.HTMLSelectElement?'change':'input',{bubbles:true}))})}
const save=()=>click(button('Jetzt speichern'))
const back=()=>click(button('Zur Seitenübersicht'))
async function withApp(fixture,props,run){
  const root=createRoot(document.getElementById('root'))
  const render=async()=>{const initial=await fixture.services.loadWorkspaceIndex();await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(WorkspaceApp,{...props,initial,services:fixture.services}))))}
  try{await render();await run({render,remount:async()=>{await act(async()=>root.render(null));await render()}})}finally{await act(async()=>root.unmount());window.history.replaceState(null,'','/workspace')}
}

test('create workspace and note, save blocks, favorite, child, search, board, archive and restore',async()=>{
  const fixture=workspaceFixture()
  await withApp(fixture,{},async()=>{
    await click(button('Arbeitsbereich erstellen'))
    await fill(field('Name'),'Partnergespräche')
    await click(button('Speichern'))
    await wait(()=>button('Neue Seite'))
    await click(button('Neue Seite'))
    await wait(()=>field('Seitentitel'))
    await fill(field('Seitentitel'),'Sommeraktionen')
    await click(button('Textblock hinzufügen'))
    await fill(field('Inhalt Block 1'),'Idee: Kaffee am Freitag')
    await fill(field('Blocktyp 1'),'todo')
    await click(field('Checkliste 1 erledigt'))
    await save()
    const note=[...fixture.pages.values()][0]
    assert.equal(note.title,'Sommeraktionen')
    assert.equal(note.content.blocks[0].checked,true)
    assert.equal(note.content.blocks[0].text,'Idee: Kaffee am Freitag')
    await click(button('Als Favorit markieren'))
    assert.ok(fixture.favorites.has(note.id))
    await click(button('Unterseite'))
    await wait(()=>field('Seitentitel')?.value==='Neue Notiz')
    await fill(field('Seitentitel'),'Weitere Ideen')
    await save()
    assert.equal([...fixture.pages.values()].find(p=>p.title==='Weitere Ideen').parent_id,note.id)
    await back()
    await fill(field('Seiten und Antworten durchsuchen'),'Kaffee am Freitag')
    await wait(()=>document.body.textContent.includes('1 von 1 Seiten geladen'))
    await click(button('Board'))
    await fill(field('Status für Sommeraktionen'),'active')
    assert.equal(fixture.pages.get(note.id).status,'active')
    await click(button('Sommeraktionen'))
    await click(button('Archivieren'))
    assert.equal(fixture.pages.get(note.id).archived,true)
    await click(button('Wiederherstellen'))
    assert.equal(fixture.pages.get(note.id).archived,false)
  })
})

test('partner entry creates linked meeting, keeps proposals separate, saves resources and tasks across remount',async()=>{
  const fixture=workspaceFixture({workspaces:[workspace]})
  await withApp(fixture,{initialPartnerId:fixturePartner.id},async({remount})=>{
    await click(button('Partnerakte anlegen'))
    await wait(()=>field('Seitentitel')?.value===fixturePartner.name)
    await click(button('Gespräch starten'))
    await wait(()=>field('Antwort · A01'))
    await fill(field('Antwort · A01'),'Mara verantwortet Freigaben')
    await fill(field('Änderungswunsch · A01'),'Rücksprache am Dienstag')
    assert.equal(field('Vereinbart · A01').value,'')
    await click(button('In Vereinbarung übernehmen',document.getElementById('question-A01')))
    await fill(field('Status · A01'),'agreed')
    await fill(field('Teilnehmende & Rollen'),'Mara, Inhaberin; Patrick, Benefitsi')
    await save()
    const meeting=[...fixture.pages.values()].find(p=>p.kind==='conversation')
    assert.equal(meeting.partner_id,fixturePartner.id)
    assert.ok(meeting.parent_id)
    assert.equal(meeting.content.questions.length,50)
    assert.equal(meeting.content.questions[0].answer,'Mara verantwortet Freigaben')
    const target=document.querySelector(`a[href="/partners?partner=${fixturePartner.id}&tab=deals"]`)
    assert.equal(target?.target,'_blank')
    await click(button('Dateien (0)'))
    await click(button('Link hinzufügen'))
    await fill(field('Linktitel 1'),'Speisekarte')
    await fill(field('Adresse 1'),'https://example.org/menu.pdf')
    await click(button('Aufgaben (0)'))
    await click(button('Aufgabe hinzufügen'))
    await fill(field('Aufgabe 1'),'Logo freigeben')
    await fill(field('Verantwortlich 1'),'Mara')
    await save()
    await back()
    await remount()
    await wait(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Onboarding-Gespräch')))
    await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Onboarding-Gespräch')))
    await wait(()=>field('Antwort · A01'))
    assert.equal(field('Antwort · A01').value,'Mara verantwortet Freigaben')
    assert.equal(fixture.pages.get(meeting.id).content.links[0].url,'https://example.org/menu.pdf')
    assert.equal(fixture.pages.get(meeting.id).content.tasks[0].owner,'Mara')
    await click(button('Als Vorlage speichern'))
    await wait(()=>field('Seitentitel')?.value.startsWith('Vorlage:'))
    const template=[...fixture.pages.values()].find(p=>p.kind==='template')
    assert.equal(template.content.questions[0].answer,'')
    assert.equal(template.partner_id,null)
    await click(button('Vorlage verwenden'))
    await wait(()=>field('Antwort · A01'))
    assert.equal(field('Antwort · A01').value,'')
  })
})

test('concurrent update blocks navigation, preserves draft as copy, and history restore creates a new revision',async()=>{
  const page={...makePage(workspace.id,'conversation'),title:'Erstgespräch',revision:1,content:onboardingContent()}
  const fixture=workspaceFixture({workspaces:[workspace],pages:[page]})
  await withApp(fixture,{initialPageId:page.id},async()=>{
    await wait(()=>field('Antwort · A01'))
    await fill(field('Antwort · A01'),'Eigene Gesprächsnotizen')
    await fixture.services.saveWorkspacePage({...page,title:'Andere Adminfassung'})
    await back()
    assert.equal(field('Antwort · A01').value,'Eigene Gesprächsnotizen')
    assert.ok(document.body.textContent.includes('Versionskonflikt'))
    await click(button('Lokalen Entwurf als Kopie sichern'))
    await wait(()=>field('Seitentitel')?.value.includes('lokaler Entwurf'))
    const copy=[...fixture.pages.values()].find(p=>p.id!==page.id)
    assert.equal(copy.content.questions[0].answer,'Eigene Gesprächsnotizen')
    assert.equal(fixture.pages.get(page.id).title,'Andere Adminfassung')
    await fill(field('Seitentitel'),'Überarbeitete Kopie')
    await save()
    await click(button('Verlauf'))
    await wait(()=>document.body.textContent.includes('Version 1'))
    const row=[...document.querySelectorAll('span')].find(el=>el.textContent.startsWith('Version 1 ·')).parentElement
    await click(button('Wiederherstellen',row))
    await wait(()=>field('Seitentitel')?.value===copy.title)
    assert.equal(fixture.pages.get(copy.id).revision,3)
  })
})

test('unknown create response can be retried with the same ID without duplicating a page',async()=>{
  const fixture=workspaceFixture({workspaces:[workspace]})
  const original=fixture.services.saveWorkspacePage
  let first=true
  fixture.services.saveWorkspacePage=async page=>{const result=await original(page);if(first){first=false;throw new Error('Response lost')}return result}
  await withApp(fixture,{},async()=>{
    await click(button('Neue Seite'))
    assert.equal(fixture.pages.size,1)
    assert.ok(document.body.textContent.includes('Die Aktion ist fehlgeschlagen'))
    await click(button('Neue Seite'))
    await wait(()=>field('Seitentitel'))
    assert.equal(fixture.pages.size,1)
  })
})
