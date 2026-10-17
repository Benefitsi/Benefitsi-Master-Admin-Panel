import assert from 'node:assert/strict'
import test from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {createRequire} from 'node:module'
import {createAcquisitionData} from '../lib/acquisition/data.ts'
import {acquisitionFixture,partner,workspace} from './helpers/acquisition-fixture.mjs'

const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/partners/acquisition'})
const names=['window','self','document','Element','Text','Node','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT']
const previous=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]))
for(const n of names)Object.defineProperty(globalThis,n,{configurable:true,writable:true,value:n==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[n]})
window.confirm=()=>true
const {createRoot}=await import('react-dom/client')
const require=createRequire(import.meta.url),serverOnly=require.resolve('server-only'),prior=require.cache[serverOnly]
require.cache[serverOnly]={exports:{}}
const {AcquisitionApp}=await import('../components/acquisition/acquisition-app.tsx')
const {retainAcquisitionDraftRecovery}=await import('../components/acquisition/draft-recovery.ts')
test.after(()=>{dom.window.close();for(const n of names){if(previous[n])Object.defineProperty(globalThis,n,previous[n]);else delete globalThis[n]}if(prior)require.cache[serverOnly]=prior;else delete require.cache[serverOnly]})
const button=name=>[...document.querySelectorAll('button')].find(el=>(el.getAttribute('aria-label')??el.textContent).trim()===name)
const field=name=>document.querySelector(`[aria-label="${name}"]`)
const click=async el=>{assert.ok(el,'Button exists');await act(async()=>el.click())}
const fill=async(name,value)=>{const el=field(name);assert.ok(el,`Field ${name}`);await act(async()=>{const proto=el instanceof window.HTMLSelectElement?window.HTMLSelectElement.prototype:el instanceof window.HTMLTextAreaElement?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
async function withApp(seed,overrides,run){
 const fixture=acquisitionFixture(seed),real=createAcquisitionData(fixture.client,{saveWorkspace:fixture.services.saveWorkspace,saveWorkspacePage:fixture.services.saveWorkspacePage})
 const services={...real,...overrides},root=createRoot(document.getElementById('root'))
 const render=async()=>{const initial=await real.loadAcquisitionIndex();await act(async()=>root.render(React.createElement(AcquisitionApp,{initial,services,today:'2026-10-17'})))}
 try{await render();await run({fixture,real,services,render,leave:async()=>{await act(async()=>root.render(null))},remount:async()=>{await act(async()=>root.render(null));await render()}})}finally{await act(async()=>root.unmount());retainAcquisitionDraftRecovery(null);window.confirm=()=>true}
}

test('existing unrecorded partner saves fields and actual contact through remount',async()=>{
 await withApp({partners:[{...partner,name:'Testhotel'}]}, {},async({remount,fixture})=>{
  assert.match(document.body.textContent,/Kontaktstatus nicht erfasst/)
  assert.equal(fixture.pages.size,0)
  await click(button('Testhotel'))
  await fill('Kontaktstatus','contacted');await fill('Nächster Schritt','Antwort nachfragen');await fill('Wiedervorlage','2026-10-20');await fill('360°','interested')
  await fill('Kontaktdatum','2026-10-16');await fill('Kontaktkanal','phone');await fill('Kontaktnotiz','Mit Frau Berg telefoniert')
  await click(button('Kontakt hinzufügen'));await click(button('Speichern'))
  await remount();await click(button('Testhotel'))
  assert.equal(field('Wiedervorlage').value,'2026-10-20');assert.equal(field('Nächster Schritt').value,'Antwort nachfragen');assert.equal(field('360°').value,'interested')
  assert.match(document.querySelector('[aria-label="Kontaktverlauf"]').textContent,/Mit Frau Berg telefoniert/)
  assert.equal(document.querySelector('[aria-label="Kontaktverlauf"] textarea'),null)
 })
})

test('city industry status and search combine on real table with filtered metrics',async()=>{
 await withApp({partners:[{...partner,name:'Testhotel'},{...partner,id:'00000000-0000-4000-8000-000000000003',name:'Cafe',type:'Gastronomie'}]}, {},async()=>{
  await fill('Stadt filtern','Berlin');await fill('Branche filtern','Hotel');await fill('Status filtern','unrecorded');await fill('Betriebe durchsuchen','Test')
  assert.ok(button('Testhotel'));assert.equal(button('Cafe'),undefined);assert.match(document.body.textContent,/1 von 2 Betrieben/)
  await fill('Status filtern','contacted');assert.equal(button('Testhotel'),undefined);assert.match(document.body.textContent,/Keine Betriebe/)
 })
})

test('new unlinked prospect is explicitly saved in selected workspace',async()=>{
 await withApp({}, {},async({remount,fixture})=>{
  await click(button('Interessent anlegen'));await fill('Betrieb','Neues Bistro');await fill('Kontaktstatus','new');await click(button('Speichern'))
  assert.equal([...fixture.pages.values()][0].partner_id,null)
  await remount();assert.ok(button('Neues Bistro'))
 })
})

for(const kind of ['error','conflict','throw'])test(`${kind} preserves draft and retry keeps contact identity`,async()=>{
 await withApp({}, {},async({real,services})=>{
  let sent
  services.saveAcquisitionDocument=async doc=>{sent??=structuredClone(doc);if(kind==='throw')throw new Error('Offline');return {ok:false,error:kind==='conflict'?'Versionskonflikt':'Speicherfehler',...(kind==='conflict'?{conflict:doc.page}:{})}}
  await click(button('Hotel'));await fill('Nächster Schritt','Entwurf behalten');await fill('Kontaktdatum','2026-10-17');await fill('Kontaktnotiz','Besprochen');await click(button('Kontakt hinzufügen'));await click(button('Speichern'))
  assert.ok(document.querySelector('[role="alert"]'));assert.equal(field('Nächster Schritt').value,'Entwurf behalten')
  if(kind==='conflict'){window.confirm=()=>false;await click(button('Aktuellen Stand laden'));assert.equal(field('Nächster Schritt').value,'Entwurf behalten')}
  services.saveAcquisitionDocument=async doc=>{assert.equal(doc.contacts[0].id,sent.contacts[0].id);return real.saveAcquisitionDocument(doc)}
  await click(button('Speichern'));assert.match(document.body.textContent,/Gespeichert/)
 })
})

test('pending save blocks double submits and edits; abandonment requires confirmation',async()=>{
 await withApp({}, {},async({services,real})=>{
  await click(button('Hotel'));await fill('Nächster Schritt','Entwurf')
  window.confirm=()=>false;await click(button('Zur Übersicht'));assert.equal(field('Nächster Schritt').value,'Entwurf')
  const pending=deferred();let calls=0
  services.saveAcquisitionDocument=async doc=>{calls++;await pending.promise;return real.saveAcquisitionDocument(doc)}
  await click(button('Speichern'));await click(button('Wird gespeichert …'));assert.equal(calls,1);assert.equal(field('Nächster Schritt').matches(':disabled'),true)
  await act(async()=>pending.resolve());assert.match(document.body.textContent,/Gespeichert/)
 })
})

test('late document load cannot replace a newer selection',async()=>{
 await withApp({partners:[partner,{...partner,id:'00000000-0000-4000-8000-000000000003',name:'Cafe'}]}, {},async({services,real})=>{
  const pending=deferred();services.loadAcquisitionDocument=async target=>{if(target.partnerId===partner.id)await pending.promise;return real.loadAcquisitionDocument(target)}
  await click(button('Hotel'));await click(button('Cafe'));assert.equal(field('Betrieb').value,'Cafe')
  await act(async()=>pending.resolve());assert.equal(field('Betrieb').value,'Cafe')
 })
})

test('workspace setup is explicit and lost reply retries the same id',async()=>{
 await withApp({workspaces:[]}, {},async({services,real,fixture})=>{
  assert.equal(fixture.workspaces.size,0);assert.equal(button('Interessent anlegen').disabled,true)
  let id,first=true
  services.createAcquisitionWorkspace=async next=>{if(id)assert.equal(next,id);id=next;const result=await real.createAcquisitionWorkspace(next);if(first){first=false;throw new Error('Antwort verloren')}return result}
  await click(button('Arbeitsbereich einrichten'));assert.ok(document.querySelector('[role="alert"]'))
  await click(button('Arbeitsbereich einrichten'));assert.equal(fixture.workspaces.size,1);assert.equal(button('Interessent anlegen').disabled,false)
  assert.equal(field('Arbeitsbereich').value,id)
 })
})

test('filtered metrics exclude closed cases and reflect a saved follow-up',async()=>{
 await withApp({}, {},async()=>{
  await click(button('Hotel'));await fill('Kontaktstatus','contacted');await fill('Wiedervorlage','2026-10-17');await fill('Gesprächstermin','2026-10-20');await click(button('Speichern'));await click(button('Zur Übersicht'))
  const metric=name=>[...document.querySelectorAll('dl > div')].find(el=>el.querySelector('dt').textContent===name).querySelector('dd').textContent
  assert.equal(metric('Heute fällig'),'1');assert.equal(metric('Rückmeldung ausstehend'),'1');assert.equal(metric('Kommende Gespräche'),'1')
  await click(button('Hotel'));await fill('Kontaktstatus','accepted');await click(button('Speichern'));await click(button('Zur Übersicht'))
  assert.equal(metric('Heute fällig'),'0');assert.equal(metric('Rückmeldung ausstehend'),'0');assert.equal(metric('Kommende Gespräche'),'0')
 })
})

test('unsaved contacts and fields protect links and reload until abandonment is confirmed',async()=>{
 await withApp({}, {},async({fixture})=>{
  await click(button('Hotel'));await fill('Kontaktnotiz','Noch nicht übernommen')
  const event=new window.Event('beforeunload',{cancelable:true});window.dispatchEvent(event);assert.equal(event.defaultPrevented,true)
  window.confirm=()=>false
  const link=document.querySelector('a[href^="/partners?"]'),navigate=new window.MouseEvent('click',{bubbles:true,cancelable:true})
  await act(async()=>link.dispatchEvent(navigate));assert.equal(navigate.defaultPrevented,true)
  await click(button('Speichern'));assert.ok(document.querySelector('[role="alert"]'));assert.equal(fixture.pages.size,0)
  await click(button('Zur Übersicht'));assert.ok(field('Kontaktnotiz'))
  window.confirm=()=>true;await click(button('Zur Übersicht'));assert.ok(button('Hotel'));assert.equal(fixture.pages.size,0)
 })
})

test('confirmed conflict reload replaces draft only after successful document load',async()=>{
 await withApp({}, {},async({real,services})=>{
  await click(button('Hotel'));await fill('Nächster Schritt','Erster Stand');await click(button('Speichern'))
  const index=await real.loadAcquisitionIndex(),pageId=index.value.rows[0].pageId
  const current=await real.loadAcquisitionDocument({pageId});current.value.fields.nextStep='Anderer Bearbeiter';await real.saveAcquisitionDocument(current.value)
  await fill('Nächster Schritt','Mein Entwurf');await click(button('Speichern'));assert.match(document.body.textContent,/Versionskonflikt/)
  const load=services.loadAcquisitionDocument;services.loadAcquisitionDocument=async()=>{throw new Error('Offline')}
  await click(button('Aktuellen Stand laden'));assert.equal(field('Nächster Schritt').value,'Mein Entwurf')
  services.loadAcquisitionDocument=load;await click(button('Aktuellen Stand laden'));assert.equal(field('Nächster Schritt').value,'Anderer Bearbeiter')
 })
})

test('load and index errors are visible and can be retried',async()=>{
 await withApp({}, {},async({services,real})=>{
  services.loadAcquisitionDocument=async()=>{throw new Error('Offline')};await click(button('Hotel'));assert.ok(document.querySelector('[role="alert"]'));assert.ok(button('Hotel'))
  services.loadAcquisitionIndex=async()=>({ok:false,error:'Index nicht vollständig'});await click(button('Übersicht neu laden'));assert.match(document.querySelector('[role="alert"]').textContent,/Index nicht vollständig/)
  services.loadAcquisitionIndex=real.loadAcquisitionIndex;await click(button('Übersicht neu laden'));assert.equal(document.querySelector('[role="alert"]'),null)
 })
})

test('new document uses explicitly selected active workspace',async()=>{
 const second={...workspace,id:'00000000-0000-4000-8000-000000000009',title:'Zweiter Bereich'}
 await withApp({workspaces:[workspace,second]}, {},async({fixture})=>{
  await fill('Arbeitsbereich',second.id);await click(button('Interessent anlegen'));await fill('Betrieb','Zweite Akte');await click(button('Speichern'))
  assert.equal([...fixture.pages.values()][0].workspace_id,second.id)
 })
})

test('new contacts after an acknowledged save remain pending until their own save',async()=>{
 await withApp({}, {},async()=>{
  await click(button('Hotel'));await fill('Kontaktnotiz','Erster Kontakt');await click(button('Kontakt hinzufügen'));await click(button('Speichern'))
  await fill('Kontaktnotiz','Zweiter Kontakt');await click(button('Kontakt hinzufügen'))
  const entries=[...document.querySelectorAll('[aria-label="Kontaktverlauf"] li')]
  assert.doesNotMatch(entries[0].textContent,/Noch nicht gespeichert/)
  assert.match(entries[1].textContent,/Noch nicht gespeichert/)
  await click(button('Speichern'));assert.doesNotMatch(document.querySelector('[aria-label="Kontaktverlauf"]').textContent,/Noch nicht gespeichert/)
 })
})

test('cancelable native same-document traversal confirms before allowing history to leave',async()=>{
 const previous=Object.getOwnPropertyDescriptor(window,'navigation'),navigation=new window.EventTarget()
 Object.defineProperty(window,'navigation',{configurable:true,value:navigation})
 try{await withApp({}, {},async({remount})=>{
  await click(button('Hotel'));await fill('Nächster Schritt','Vor Zurück schützen')
  let prompts=0;window.confirm=()=>{prompts++;return false}
  const traversal=new window.Event('navigate',{cancelable:true})
  Object.assign(traversal,{navigationType:'traverse',destination:{sameDocument:true,url:'http://localhost/partners'}})
  await act(async()=>navigation.dispatchEvent(traversal))
  assert.equal(traversal.defaultPrevented,true);assert.equal(prompts,1);assert.equal(field('Nächster Schritt').value,'Vor Zurück schützen')
  window.confirm=()=>true
  const forward=new window.Event('navigate',{cancelable:true})
  Object.assign(forward,{navigationType:'traverse',destination:{sameDocument:true,url:'http://localhost/partners/example'}})
  await act(async()=>navigation.dispatchEvent(forward));assert.equal(forward.defaultPrevented,false)
  await remount();assert.equal(button('Entwurf wiederherstellen'),undefined)
 })}finally{if(previous)Object.defineProperty(window,'navigation',previous);else delete window.navigation}
})

test('unsupported same-document Back retains recoverable fields composer contacts and acknowledged baseline',async()=>{
 await withApp({}, {},async({leave,render,remount})=>{
  window.history.replaceState({},'','/partners');window.history.pushState({},'','/partners/acquisition')
  await click(button('Hotel'));await fill('Kontaktnotiz','Gespeichert');await click(button('Kontakt hinzufügen'));await click(button('Speichern'))
  await fill('Nächster Schritt','Entwurf nach Browser-Zurück');await fill('Kontaktnotiz','Zweiter Protokolleintrag');await click(button('Kontakt hinzufügen'))
  await fill('Kontaktkanal','phone');await fill('Kontaktnotiz','Unfertiger Kontakt')
  const back=new Promise(resolve=>window.addEventListener('popstate',resolve,{once:true}))
  await act(async()=>{window.history.back();await back;await leave()})
  assert.equal(window.location.pathname,'/partners')
  window.history.forward();await new Promise(resolve=>window.addEventListener('popstate',resolve,{once:true}))
  await render();assert.ok(button('Entwurf wiederherstellen'))
  await click(button('Entwurf wiederherstellen'))
  assert.equal(field('Nächster Schritt').value,'Entwurf nach Browser-Zurück');assert.equal(field('Kontaktnotiz').value,'Unfertiger Kontakt');assert.equal(field('Kontaktkanal').value,'phone')
  const entries=[...document.querySelectorAll('[aria-label="Kontaktverlauf"] li')]
  assert.doesNotMatch(entries[0].textContent,/Noch nicht gespeichert/);assert.match(entries[1].textContent,/Noch nicht gespeichert/)
  await click(button('Kontakt hinzufügen'));await click(button('Speichern'));await remount()
  assert.equal(button('Entwurf wiederherstellen'),undefined);await click(button('Hotel'))
  assert.equal(document.querySelectorAll('[aria-label="Kontaktverlauf"] li').length,3)
  assert.doesNotMatch(document.querySelector('[aria-label="Kontaktverlauf"]').textContent,/Noch nicht gespeichert/)
 })
})


test('noncancelable native traversal retains recovery and confirmed discard does not resurrect it',async()=>{
 const previous=Object.getOwnPropertyDescriptor(window,'navigation'),navigation=new window.EventTarget()
 Object.defineProperty(window,'navigation',{configurable:true,value:navigation})
 try{await withApp({}, {},async({leave,render,remount})=>{
  await click(button('Hotel'));await fill('Notizen','Nur im Arbeitsspeicher')
  let prompts=0;window.confirm=()=>{prompts++;return false}
  const traversal=new window.Event('navigate',{cancelable:false})
  Object.assign(traversal,{navigationType:'traverse',destination:{sameDocument:true,url:'http://localhost/partners'}})
  await act(async()=>navigation.dispatchEvent(traversal));assert.equal(prompts,0);assert.equal(traversal.defaultPrevented,false)
  await leave();await render();assert.ok(button('Entwurf wiederherstellen'))
  await click(button('Entwurf verwerfen'));assert.ok(button('Entwurf wiederherstellen'))
  window.confirm=()=>true;await click(button('Entwurf verwerfen'));await remount()
  assert.equal(button('Entwurf wiederherstellen'),undefined);assert.ok(button('Hotel'))
 })}finally{if(previous)Object.defineProperty(window,'navigation',previous);else delete window.navigation}
})
