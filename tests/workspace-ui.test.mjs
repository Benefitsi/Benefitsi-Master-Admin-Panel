import assert from 'node:assert/strict'
import test from 'node:test'
import {createRequire} from 'node:module'
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
// Next substitutes server actions in the browser. Tests inject the transport and never execute them.
const require=createRequire(import.meta.url),serverOnly=require.resolve('server-only'),priorServerOnly=require.cache[serverOnly]
require.cache[serverOnly]={exports:{}}
test.after(()=>{if(priorServerOnly)require.cache[serverOnly]=priorServerOnly;else delete require.cache[serverOnly]})
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

test('partner entry uses one answer and keeps resources and tasks across remount',async()=>{
  const fixture=workspaceFixture({workspaces:[workspace]})
  await withApp(fixture,{initialPartnerId:fixturePartner.id},async({remount})=>{
    await click(button('Partnerakte anlegen'))
    await wait(()=>field('Seitentitel')?.value===fixturePartner.name)
    await click(button('Gespräch starten'))
    await wait(()=>field('Antwort · A01'))
    await fill(field('Antwort · A01'),'Mara verantwortet Freigaben')
    assert.ok(!field('Änderungswunsch · A01'),'Only one answer field should be shown')
    assert.ok(!field('Vereinbart · A01'),'No second agreement field')
    assert.ok(!button('In Vereinbarung übernehmen'))
    await fill(field('Status · A01'),'agreed')
    await fill(field('Teilnehmende & Rollen'),'Mara, Inhaberin; Patrick, Benefitsi')
    await save()
    const meeting=[...fixture.pages.values()].find(p=>p.kind==='conversation')
    assert.equal(meeting.partner_id,fixturePartner.id)
    assert.ok(meeting.parent_id)
    assert.equal(meeting.content.questions.length,42)
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
  const loadPages=fixture.services.loadWorkspacePages
  let finishLoading
  fixture.services.loadWorkspacePages=async(...args)=>{const result=await loadPages(...args);return new Promise(resolve=>{finishLoading=()=>resolve(result)})}
  let first=true
  fixture.services.saveWorkspacePage=async page=>{const result=await original(page);if(first){first=false;throw new Error('Response lost')}return result}
  await withApp(fixture,{},async()=>{
    await wait(()=>finishLoading)
    await click(button('Neue Seite'))
    assert.equal(fixture.pages.size,1)
    await act(async()=>finishLoading())
    assert.ok(document.body.textContent.includes('Die Aktion ist fehlgeschlagen'))
    await click(button('Neue Seite'))
    await wait(()=>field('Seitentitel'))
    assert.equal(fixture.pages.size,1)
  })
})

test('workspace rename stays bound to its original workspace when the sidebar selection changes',async()=>{
  const other={...workspace,id:'00000000-0000-4000-8000-000000000002',title:'Produktideen'}
  const fixture=workspaceFixture({workspaces:[workspace,other]})
  await withApp(fixture,{},async()=>{
    await click(button('Umbenennen & Beschreibung'))
    await fill(field('Name'),'Onboarding-Team')
    await click(button('Produktideen'))
    await click(button('Speichern'))
    assert.equal(fixture.workspaces.get(workspace.id).title,'Onboarding-Team')
    assert.equal(fixture.workspaces.get(other.id).title,'Produktideen')
  })
})

test('replacement requests lock input until the new document is ready',async()=>{
  const page={...makePage(workspace.id,'note'),revision:1,title:'Notiz'}
  const fixture=workspaceFixture({workspaces:[workspace],pages:[page]})
  const original=fixture.services.saveWorkspacePage
  let finish
  fixture.services.saveWorkspacePage=async p=>p.id===page.id?original(p):new Promise(resolve=>{finish=()=>original(p).then(resolve)})
  await withApp(fixture,{initialPageId:page.id},async()=>{
    await wait(()=>field('Seitentitel'))
    await click(button('Seite duplizieren'))
    await wait(()=>finish)
    assert.ok(field('Seitentitel').matches(':disabled'),'Late edits must be prevented while replacement is pending')
    await act(async()=>finish())
    await wait(()=>field('Seitentitel')?.value==='Notiz (Kopie)')
    assert.equal(field('Seitentitel').matches(':disabled'),false)
  })
})

test('browser history traversal cannot discard a conflicting draft',async()=>{
  const page={...makePage(workspace.id,'note'),revision:1,title:'Gesprächsnotiz'}
  const fixture=workspaceFixture({workspaces:[workspace],pages:[page]})
  await withApp(fixture,{initialPageId:page.id},async()=>{
    await wait(()=>field('Seitentitel'))
    await fill(field('Seitentitel'),'Noch nicht gespeichert')
    await fixture.services.saveWorkspacePage({...page,title:'Andere Fassung'})
    let routerEvents=0
    const router=()=>routerEvents++
    window.addEventListener('popstate',router)
    try{
      await act(async()=>{window.history.replaceState(null,'','/partners');window.dispatchEvent(new window.PopStateEvent('popstate'))})
      assert.equal(routerEvents,0,'Next must not unmount the document before its save guard runs')
      assert.equal(new URL(window.location.href).pathname,'/workspace')
      assert.equal(field('Seitentitel').value,'Noch nicht gespeichert')
      assert.ok(document.body.textContent.includes('Versionskonflikt'))
    }finally{window.removeEventListener('popstate',router)}
  })
})

test('duplicate and template retries reuse their original creation ID after a lost response',async()=>{
  for(const action of ['Seite duplizieren','Als Vorlage speichern']){
    const page={...makePage(workspace.id,'note'),revision:1,title:'Idee'}
    const fixture=workspaceFixture({workspaces:[workspace],pages:[page]})
    const original=fixture.services.saveWorkspacePage
    let lost=false
    fixture.services.saveWorkspacePage=async p=>{const result=await original(p);if(p.id!==page.id&&!lost){lost=true;throw new Error('Response lost')}return result}
    await withApp(fixture,{initialPageId:page.id},async()=>{
      await wait(()=>field('Seitentitel'))
      await click(button(action))
      assert.equal(fixture.pages.size,2)
      await click(button(action))
      assert.equal(fixture.pages.size,2,action)
    })
  }
})

test('a deferred initial permalink cannot overtake a newly opened editor',async()=>{
  const first={...makePage(workspace.id,'note'),revision:1,title:'Verlinkte Notiz'}
  const second={...makePage(workspace.id,'note'),revision:1,title:'Andere Notiz'}
  const fixture=workspaceFixture({workspaces:[workspace],pages:[first,second]})
  const load=fixture.services.loadWorkspacePage,finishes=[]
  fixture.services.loadWorkspacePage=async id=>id!==first.id?load(id):new Promise(resolve=>finishes.push(()=>load(id).then(resolve)))
  await withApp(fixture,{initialPageId:first.id},async()=>{
    await wait(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Andere Notiz')))
    await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Andere Notiz')))
    assert.equal(Boolean(field('Seitentitel')),false,'Navigation waits until the initial link resolves')
    await act(async()=>Promise.all(finishes.map(finish=>finish())))
    await wait(()=>field('Seitentitel')?.value==='Verlinkte Notiz')
    assert.equal(field('Seitentitel').matches(':disabled'),false)
  })
})


test('legacy changes and agreements remain readable in the one answer and save without duplicate fields',async()=>{
  const page={...makePage(workspace.id,'conversation'),revision:1,content:onboardingContent()}
  Object.assign(page.content.questions[0],{answer:'Erste Antwort',change:'Korrektur des Partners',agreement:'Endgültige Fassung'})
  const fixture=workspaceFixture({workspaces:[workspace],pages:[page]})
  await withApp(fixture,{initialPageId:page.id},async()=>{
    await wait(()=>field('Antwort · A01'))
    const answer=field('Antwort · A01')
    for(const value of ['Erste Antwort','Korrektur des Partners','Endgültige Fassung'])assert.ok(answer.value.includes(value))
    assert.ok(!field('Änderungswunsch · A01'),'Only one answer field should be shown')
    assert.ok(!field('Vereinbart · A01'),'No second agreement field')
    await fill(answer,'Gemeinsam korrigierte Antwort')
    await save()
    const q=fixture.pages.get(page.id).content.questions[0]
    assert.equal(q.answer,'Gemeinsam korrigierte Antwort')
    assert.equal(q.change,'')
    assert.equal(q.agreement,'')
  })
})

test('partner facts refresh independently of answers and failed refreshes are not shown as empty research',async()=>{
  const page={...makePage(workspace.id,'conversation'),partner_id:fixturePartner.id,revision:1,content:onboardingContent()}
  const fixture=workspaceFixture({workspaces:[workspace],pages:[page]})
  let name='Café Beispiel',failed=false
  fixture.services.loadWorkspacePartnerBrief=async id=>({ok:!failed,...(failed?{error:'Datenabruf fehlgeschlagen'}:{value:{partnerId:id,partnerName:name,loadedAt:'2026-10-06T21:00:00Z',facts:{A01:[{label:'Name',value:name,href:'/partners?partner='+id+'&tab=details'}]}}})})
  await withApp(fixture,{initialPageId:page.id},async()=>{
    await wait(()=>button('Stimmt so',document.getElementById('question-A01')))
    assert.equal(field('Antwort · A01').value,'')
    await click(button('Stimmt so',document.getElementById('question-A01')))
    assert.ok(field('Antwort · A01').value.includes('Café Beispiel'))
    await fill(field('Antwort · A01'),'Partner hat den Namen bestätigt')
    name='Neuer Adminname'
    await click(button('Admin-Daten aktualisieren'))
    await wait(()=>document.getElementById('question-A01').textContent.includes('Neuer Adminname'))
    assert.equal(field('Antwort · A01').value,'Partner hat den Namen bestätigt')
    failed=true
    await click(button('Admin-Daten aktualisieren'))
    await wait(()=>document.body.textContent.includes('Datenabruf fehlgeschlagen'))
    assert.ok(!button('Stimmt so',document.getElementById('question-A01')))
    assert.equal(field('Antwort · A01').value,'Partner hat den Namen bestätigt')
  })
})

test('changing only the question status preserves legacy notes exactly once',async()=>{
  const page={...makePage(workspace.id,'conversation'),revision:1,content:onboardingContent()}
  Object.assign(page.content.questions[0],{answer:'Antwort',reason:'Zusatznotiz'})
  const fixture=workspaceFixture({workspaces:[workspace],pages:[page]})
  await withApp(fixture,{initialPageId:page.id},async()=>{
    await wait(()=>field('Antwort · A01'))
    await fill(field('Status · A01'),'agreed')
    assert.equal(field('Antwort · A01').value,'Antwort\n\nZusatznotiz')
    await fill(field('Status · A01'),'irrelevant')
    assert.equal(field('Antwort · A01').value,'Antwort\n\nZusatznotiz')
    await save()
    assert.equal(fixture.pages.get(page.id).content.questions[0].answer,'Antwort\n\nZusatznotiz')
  })
})

test('a late partner-data response cannot replace the newly selected partner',async()=>{
  const other={...fixturePartner,id:'00000000-0000-4000-8000-000000000088',name:'Zweites Café'}
  const page={...makePage(workspace.id,'conversation'),partner_id:fixturePartner.id,revision:1,content:onboardingContent()}
  const fixture=workspaceFixture({workspaces:[workspace],pages:[page]}),pending=[]
  fixture.services.findWorkspacePartners=async(query='',id)=>({ok:true,value:[fixturePartner,other].filter(p=>(!id||p.id===id)&&p.name.includes(query))})
  fixture.services.loadWorkspacePartnerBrief=id=>new Promise(resolve=>pending.push({id,resolve}))
  const finish=request=>request.resolve({ok:true,value:{partnerId:request.id,partnerName:request.id===other.id?other.name:fixturePartner.name,loadedAt:'2026-10-06T21:00:00Z',facts:{A01:[{label:'Name',value:request.id===other.id?other.name:'Veralteter Partnername',href:'/partners?partner='+request.id}]}}})
  await withApp(fixture,{initialPageId:page.id},async()=>{
    await wait(()=>pending.length>0&&field('Antwort · A01'))
    await fill(field('Antwort · A01'),'Gesprächsnotiz bleibt erhalten')
    await click(button('Partner wechseln'))
    await wait(()=>button(other.name))
    await click(button(other.name))
    await wait(()=>pending.some(request=>request.id===other.id))
    await act(async()=>pending.filter(request=>request.id===other.id).forEach(finish))
    assert.ok(document.getElementById('question-A01').textContent.includes(other.name))
    await act(async()=>pending.filter(request=>request.id===fixturePartner.id).forEach(finish))
    assert.ok(!document.getElementById('question-A01').textContent.includes('Veralteter Partnername'))
    assert.equal(field('Antwort · A01').value,'Gesprächsnotiz bleibt erhalten')
  })
})

test('inline partner drafts survive cancelled tab/filter navigation and saved data refreshes preparation',async()=>{
  const page={...makePage(workspace.id,'conversation'),partner_id:fixturePartner.id,content:onboardingContent(),revision:1}
  const fixture=workspaceFixture({workspaces:[workspace],pages:[page]})
  await withApp(fixture,{initialPageId:page.id},async()=>{
    await wait(()=>field('Partnername'))
    await fill(field('Partnername'),'Café Neuer Name')
    window.confirm=()=>false
    await click(button('Notizen'))
    assert.equal(field('Partnername').value,'Café Neuer Name')
    const core=[...document.querySelectorAll('input[type=checkbox]')].find(el=>el.closest('label')?.textContent==='Nur Kernfragen')
    await click(core)
    assert.equal(core.checked,false)
    assert.equal(field('Partnername').value,'Café Neuer Name')
    await click(button('Partnername speichern'))
    await wait(()=>document.querySelector('#question-A01 dl').textContent.includes('Café Neuer Name'))
    assert.equal(fixture.details.profile.name,'Café Neuer Name')
    await click(button('Notizen'))
    assert.ok(!field('Partnername'))
    window.confirm=()=>true
  })
})
test('open-only filtering cannot unmount unsaved inline partner fields after an answer changes status',async()=>{
  const page={...makePage(workspace.id,'conversation'),partner_id:fixturePartner.id,content:onboardingContent(),revision:1}
  const fixture=workspaceFixture({workspaces:[workspace],pages:[page]})
  await withApp(fixture,{initialPageId:page.id},async()=>{
    await wait(()=>field('Partnername'))
    const onlyOpen=[...document.querySelectorAll('input[type=checkbox]')].find(el=>el.closest('label')?.textContent==='Nur offene Fragen')
    await click(onlyOpen)
    await fill(field('Partnername'),'Noch nicht gespeicherter Name')
    await fill(field('Antwort · A01'),'Angaben geprüft, Name korrigieren')
    await save()
    assert.equal(field('Partnername').value,'Noch nicht gespeicherter Name')
    window.confirm=()=>false
    await click(button('Notizen'))
    assert.equal(field('Partnername').value,'Noch nicht gespeicherter Name')
    window.confirm=()=>true
  })
})
