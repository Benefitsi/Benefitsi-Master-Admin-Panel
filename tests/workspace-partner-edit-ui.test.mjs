import assert from 'node:assert/strict'
import test from 'node:test'
import React, {act} from 'react'
import {JSDOM} from 'jsdom'

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost/workspace',pretendToBeVisual:true})
const names=['window','self','document','Element','Text','Node','NodeFilter','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT']
const previous=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]))
for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]})
dom.window.confirm=()=>true
const {createRoot}=await import('react-dom/client')
const {PartnerDetailsEditor}=await import('../components/workspace/partner-details-editor.tsx')
test.after(()=>{dom.window.close();for(const name of names){if(previous[name])Object.defineProperty(globalThis,name,previous[name]);else delete globalThis[name]}})

const partnerId='00000000-0000-4000-8000-000000000001',otherId='00000000-0000-4000-8000-000000000002'
const details=(id=partnerId)=>({partnerId:id,profile:{id,name:id===partnerId?'Café Beispiel':'Anderer Betrieb',type:'Food & Drink',category:['Cafe'],description:'',address:'Beispielstraße 1',phone:null,email:null,website:null,updated_at:'2026-10-07T12:00:00Z'},socials:[{id:'00000000-0000-4000-8000-000000000003',partner_id:id,platform:'instagram',url:'https://example.org/cafe',handle:'cafe',sort_order:0}],hours:[{id:'00000000-0000-4000-8000-000000000004',partner_id:id,weekday:1,opens_at:'09:00:00',closes_at:'18:00:00',is_closed:false,label:null,sort_order:0}]})
const button=name=>[...document.querySelectorAll('button')].find(el=>(el.getAttribute('aria-label')??el.textContent).trim()===name)
const field=name=>[...document.querySelectorAll('input,select,textarea')].find(el=>el.getAttribute('aria-label')===name||el.closest('label')?.querySelector('span')?.textContent===name)
const wait=async predicate=>{for(let n=0;n<60;n++){if(predicate())return;await act(async()=>new Promise(resolve=>setTimeout(resolve,10)))}assert.ok(predicate(),'Timed out waiting for editor state')}
const click=async el=>{assert.ok(el,'Control exists');await act(async()=>el.click())}
const fill=async(el,value)=>{assert.ok(el,'Field exists');await act(async()=>{const prototype=el instanceof window.HTMLSelectElement?window.HTMLSelectElement.prototype:el instanceof window.HTMLTextAreaElement?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event(el instanceof window.HTMLSelectElement?'change':'input',{bubbles:true}))})}
const transport=()=>({loadWorkspacePartnerDetails:async id=>({ok:true,value:details(id)}),saveWorkspacePartnerDetail:async(id,input)=>({ok:true,value:{...input.row,...(input.column==='classification'?input.value:{[input.column]:input.value}),updated_at:'2026-10-07T12:01:00Z'}}),addWorkspacePartnerDetail:async(id,input)=>({ok:true,value:{...input.values,id:input.id,partner_id:id}})})
async function withEditor(services,run){
  const root=createRoot(document.getElementById('root')),states=[];let saved=0
  const render=async id=>act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(PartnerDetailsEditor,{partnerId:id,services,onDirtyChange:state=>states.push(state),onSaved:()=>saved++}))))
  try{await render(partnerId);await run({render,states,saved:()=>saved})}finally{await act(async()=>root.unmount());dom.window.confirm=()=>true}
}

test('name saves only explicitly with selected partner and original profile revision',async()=>{
  const services=transport(),calls=[]
  services.saveWorkspacePartnerDetail=async(id,input)=>{calls.push({id,input});return {ok:true,value:{...input.row,name:input.value,updated_at:'2026-10-07T12:01:00Z'}}}
  await withEditor(services,async({states,saved})=>{
    await wait(()=>field('Partnername'));await fill(field('Partnername'),'Neues Café')
    assert.equal(calls.length,0);assert.deepEqual(states.at(-1),{dirty:true,busy:false})
    await click(button('Partnername speichern'))
    assert.equal(calls.length,1);assert.equal(calls[0].id,partnerId)
    assert.equal(calls[0].input.kind,'profile');assert.equal(calls[0].input.column,'name');assert.equal(calls[0].input.value,'Neues Café')
    assert.equal(calls[0].input.row.updated_at,'2026-10-07T12:00:00Z')
    assert.equal(saved(),1);assert.deepEqual(states.at(-1),{dirty:false,busy:false})
    assert.ok(document.body.textContent.includes('Gespeichert'))
  })
})

test('failed save retains draft and dirty state with a visible error',async()=>{
  const services=transport();services.saveWorkspacePartnerDetail=async()=>({ok:false,error:'Speichern fehlgeschlagen'})
  await withEditor(services,async({states,saved})=>{
    await wait(()=>field('Partnername'));await fill(field('Partnername'),'Entwurf');await click(button('Partnername speichern'))
    assert.equal(field('Partnername').value,'Entwurf');assert.ok(document.body.textContent.includes('Speichern fehlgeschlagen'))
    assert.deepEqual(states.at(-1),{dirty:true,busy:false});assert.equal(saved(),0)
  })
})

test('late old partner loads cannot reveal old editable controls',async()=>{
  const services=transport(),pending=[];services.loadWorkspacePartnerDetails=id=>new Promise(resolve=>pending.push({id,resolve}))
  await withEditor(services,async({render})=>{
    await render(otherId);assert.equal(field('Partnername'),undefined)
    await act(async()=>pending.filter(p=>p.id===otherId).forEach(p=>p.resolve({ok:true,value:details(otherId)})))
    assert.equal(field('Partnername').value,'Anderer Betrieb')
    await act(async()=>pending.filter(p=>p.id===partnerId).forEach(p=>p.resolve({ok:true,value:details()})))
    assert.equal(field('Partnername').value,'Anderer Betrieb')
  })
})

test('confirmed name save preserves another draft and uses fresh revision for its later save',async()=>{
  const services=transport(),calls=[];let finish
  services.saveWorkspacePartnerDetail=(id,input)=>{calls.push(input);return new Promise(resolve=>{finish=()=>resolve({ok:true,value:{...input.row,[input.column]:input.value,updated_at:'2026-10-07T12:01:00Z'}})})}
  await withEditor(services,async({states})=>{
    await wait(()=>field('Partnername'));await fill(field('Partnername'),'Neuer Name');await fill(field('Adresse'),'Andere Adresse')
    await click(button('Partnername speichern'));assert.equal(button('Adresse speichern').disabled,true);assert.equal(states.at(-1).busy,true)
    await act(async()=>finish());assert.equal(field('Adresse').value,'Andere Adresse');assert.equal(states.at(-1).dirty,true)
    await click(button('Adresse speichern'));assert.equal(calls[1].row.name,'Neuer Name');assert.equal(calls[1].row.updated_at,'2026-10-07T12:01:00Z')
    await act(async()=>finish())
  })
})

test('late save for old partner cannot refresh or change the newly selected partner',async()=>{
  const services=transport();let finish
  services.saveWorkspacePartnerDetail=(id,input)=>new Promise(resolve=>{finish=()=>resolve({ok:true,value:{...input.row,name:input.value,updated_at:'2026-10-07T12:01:00Z'}})})
  await withEditor(services,async({render,saved,states})=>{
    await wait(()=>field('Partnername'));await fill(field('Partnername'),'Alter Entwurf');await click(button('Partnername speichern'))
    await render(otherId);await wait(()=>field('Partnername')?.value==='Anderer Betrieb');await act(async()=>finish())
    assert.equal(field('Partnername').value,'Anderer Betrieb');assert.equal(saved(),0);assert.deepEqual(states.at(-1),{dirty:false,busy:false})
  })
})

test('wrong partner load and save responses never become editable or confirmed',async()=>{
  const services=transport();services.loadWorkspacePartnerDetails=async()=>({ok:true,value:details(otherId)})
  await withEditor(services,async()=>{await wait(()=>document.querySelector('[role="alert"]'));assert.equal(field('Partnername'),undefined)})
  services.loadWorkspacePartnerDetails=async()=>({ok:true,value:details()})
  services.saveWorkspacePartnerDetail=async()=>({ok:true,value:details(otherId).profile})
  await withEditor(services,async({saved})=>{
    await wait(()=>field('Partnername'));await fill(field('Partnername'),'Mein Entwurf');await click(button('Partnername speichern'))
    assert.equal(field('Partnername').value,'Mein Entwurf');assert.equal(saved(),0);assert.ok(document.querySelector('[role="alert"]'))
  })
})

test('lost social add response retries the same ID and payload without a duplicate row',async()=>{
  const services=transport(),calls=[],rows=new Map()
  services.addWorkspacePartnerDetail=async(id,input)=>{calls.push(structuredClone(input));rows.set(input.id,{...input.values,id:input.id,partner_id:id});if(calls.length===1)throw new Error('Lost response');return {ok:true,value:rows.get(input.id)}}
  await withEditor(services,async({states,saved})=>{
    await wait(()=>field('Partnername'));await click(button('Social-Link hinzufügen'));await fill(field('Neue Social-Adresse'),'https://example.org/new')
    await fill(field('Neue Plattform'),'youtube');await click(button('Neuen Social-Link speichern'))
    assert.equal(saved(),0);assert.equal(states.at(-1).dirty,true);assert.equal(field('Neue Social-Adresse').value,'https://example.org/new')
    await click(button('Neuen Social-Link speichern'))
    assert.equal(calls.length,2);assert.match(calls[0].id,/^[0-9a-f-]{36}$/);assert.deepEqual(calls[1],calls[0]);assert.equal(rows.size,1)
    assert.equal(calls[0].values.platform,'youtube');assert.equal(calls[0].values.handle,null);assert.equal(calls[0].values.sort_order,1)
    assert.equal(saved(),1);assert.equal(field('Neue Social-Adresse'),undefined);assert.equal(states.at(-1).dirty,false)
  })
})

test('one opening time save does not change closure or other time fields and new hour is explicit',async()=>{
  const services=transport(),calls=[]
  services.saveWorkspacePartnerDetail=async(id,input)=>{calls.push(input);return {ok:true,value:{...input.row,[input.column]:input.value}}}
  services.addWorkspacePartnerDetail=async(id,input)=>{calls.push(input);return {ok:true,value:{...input.values,id:input.id,partner_id:id}}}
  await withEditor(services,async()=>{
    await wait(()=>field('Öffnet · Montag 1'));await fill(field('Öffnet · Montag 1'),'10:30');await click(button('Öffnet · Montag 1 speichern'))
    assert.equal(calls[0].column,'opens_at');assert.equal(calls[0].value,'10:30');assert.equal(calls[0].row.closes_at,'18:00:00');assert.equal(calls[0].row.is_closed,false)
    assert.equal(field('Schließt · Montag 1').value,'18:00');assert.equal(field('Geschlossen · Montag 1').checked,false)
    await click(button('Öffnungszeit hinzufügen'));await fill(field('Neuer Wochentag'),'2');await fill(field('Neue Öffnungszeit'),'11:00');await fill(field('Neue Schließzeit'),'17:00')
    assert.equal(calls.length,1);await click(button('Neue Öffnungszeit speichern'));assert.equal(calls[1].kind,'hour');assert.equal(calls[1].values.weekday,2);assert.equal(calls[1].values.opens_at,'11:00');assert.equal(calls[1].values.closes_at,'17:00');assert.equal(calls[1].values.is_closed,false)
  })
})

test('canceling drafts requires confirmation and never writes business data',async()=>{
  const services=transport();let writes=0;services.saveWorkspacePartnerDetail=async()=>{writes++;throw new Error('Unexpected write')}
  await withEditor(services,async({states})=>{
    await wait(()=>field('Partnername'));await fill(field('Partnername'),'Verwerfen')
    dom.window.confirm=()=>false;await click(button('Änderungen verwerfen'));assert.equal(field('Partnername').value,'Verwerfen')
    dom.window.confirm=()=>true;await click(button('Änderungen verwerfen'));assert.equal(field('Partnername').value,'Café Beispiel');assert.equal(states.at(-1).dirty,false);assert.equal(writes,0)
  })
})

test('normalized URL confirmation clears a draft after the transport confirms its canonical value',async()=>{
  const services=transport();services.saveWorkspacePartnerDetail=async(id,input)=>({ok:true,value:{...input.row,website:'https://example.org/',updated_at:'2026-10-07T12:01:00Z'}})
  await withEditor(services,async({states,saved})=>{
    await wait(()=>field('Website'));await fill(field('Website'),'https://example.org');await click(button('Website speichern'))
    assert.equal(field('Website').value,'https://example.org/');assert.equal(states.at(-1).dirty,false);assert.equal(saved(),1)
  })
})

test('invalid new social URL remains correctable without any transport write',async()=>{
  const services=transport();let writes=0
  services.addWorkspacePartnerDetail=async()=>{writes++;return {ok:false,error:'Ungültiger Link'}}
  await withEditor(services,async()=>{
    await wait(()=>field('Partnername'));await click(button('Social-Link hinzufügen'));await fill(field('Neue Social-Adresse'),'javascript:alert(1)');await click(button('Neuen Social-Link speichern'))
    assert.equal(writes,0);assert.equal(field('Neue Social-Adresse').matches(':disabled'),false);assert.ok(document.querySelector('[role="alert"]'))
    await fill(field('Neue Social-Adresse'),'https://example.org/valid');await click(button('Neuen Social-Link speichern'));assert.equal(writes,1)
  })
})

test('invalid new opening times remain correctable before submission',async()=>{
  const services=transport();let writes=0;services.addWorkspacePartnerDetail=async()=>{writes++;return {ok:false,error:'Ungültige Zeiten'}}
  await withEditor(services,async()=>{
    await wait(()=>field('Partnername'));await click(button('Öffnungszeit hinzufügen'));await click(button('Neue Öffnungszeit speichern'))
    assert.equal(writes,0);assert.equal(field('Neue Öffnungszeit').matches(':disabled'),false)
    await fill(field('Neue Öffnungszeit'),'10:00');await fill(field('Neue Schließzeit'),'19:00');await click(button('Neue Öffnungszeit speichern'));assert.equal(writes,1)
  })
})

test('Sunday opening hours use the backend weekday value seven',async()=>{
  const services=transport(),calls=[];const value=details();value.hours[0].weekday=7
  services.loadWorkspacePartnerDetails=async()=>({ok:true,value})
  services.addWorkspacePartnerDetail=async(id,input)=>{calls.push(input);return {ok:true,value:{...input.values,id:input.id,partner_id:id}}}
  await withEditor(services,async()=>{
    await wait(()=>field('Partnername'));assert.ok(field('Öffnet · Sonntag 1'))
    await click(button('Öffnungszeit hinzufügen'));await fill(field('Neuer Wochentag'),'7');await fill(field('Neue Öffnungszeit'),'10:00');await fill(field('Neue Schließzeit'),'19:00');await click(button('Neue Öffnungszeit speichern'))
    assert.equal(calls[0].values.weekday,7)
  })
})

test('explicit reload after a conflict retains drafts and provides the current revision for retry',async()=>{
  const services=transport(),calls=[];let loads=0
  services.loadWorkspacePartnerDetails=async()=>{loads++;const value=details();if(loads>2){value.profile.name='Andere Adminfassung';value.profile.updated_at='2026-10-07T12:02:00Z'}return {ok:true,value}}
  services.saveWorkspacePartnerDetail=async(id,input)=>{calls.push(input);return calls.length===1?{ok:false,error:'Eintrag inzwischen geändert. Bitte neu laden.'}:{ok:true,value:{...input.row,name:input.value,updated_at:'2026-10-07T12:03:00Z'}}}
  await withEditor(services,async()=>{
    await wait(()=>field('Partnername'));await fill(field('Partnername'),'Eigener Entwurf');await click(button('Partnername speichern'));await click(button('Partnerangaben neu laden'))
    await wait(()=>field('Partnername'));assert.equal(field('Partnername').value,'Eigener Entwurf');await click(button('Partnername speichern'));assert.equal(calls[1].row.updated_at,'2026-10-07T12:02:00Z')
  })
})

test('typing a newer value during save keeps the newer draft after the older value is confirmed',async()=>{
  const services=transport();let finish
  services.saveWorkspacePartnerDetail=(id,input)=>new Promise(resolve=>{finish=()=>resolve({ok:true,value:{...input.row,name:input.value,updated_at:'2026-10-07T12:01:00Z'}})})
  await withEditor(services,async({states})=>{
    await wait(()=>field('Partnername'));await fill(field('Partnername'),'Erster Entwurf');await click(button('Partnername speichern'));await fill(field('Partnername'),'Neuerer Entwurf');await act(async()=>finish())
    assert.equal(field('Partnername').value,'Neuerer Entwurf');assert.equal(states.at(-1).dirty,true);assert.ok(button('Partnername speichern'));assert.ok(!document.body.textContent.includes('Gespeichert'))
  })
})

test('reverting to the original value during an outstanding save remains dirty and can be saved against its acknowledgement',async()=>{
  const services=transport(),calls=[];let finish
  services.saveWorkspacePartnerDetail=(id,input)=>{calls.push(input);return new Promise(resolve=>{finish=()=>resolve({ok:true,value:{...input.row,name:input.value,updated_at:'2026-10-07T12:01:00Z'}})})}
  await withEditor(services,async({states})=>{
    await wait(()=>field('Partnername'));assert.deepEqual(states.at(-1),{dirty:false,busy:false})
    await fill(field('Partnername'),'Gesendeter Name');await click(button('Partnername speichern'))
    assert.deepEqual(states.at(-1),{dirty:true,busy:true})
    await fill(field('Partnername'),'Café Beispiel');assert.equal(field('Partnername').value,'Café Beispiel');assert.deepEqual(states.at(-1),{dirty:true,busy:true})
    await act(async()=>finish())
    assert.equal(field('Partnername').value,'Café Beispiel');assert.deepEqual(states.at(-1),{dirty:true,busy:false});assert.ok(!document.body.textContent.includes('Gespeichert'))
    await click(button('Partnername speichern'));assert.equal(calls[1].value,'Café Beispiel');assert.equal(calls[1].row.name,'Gesendeter Name');assert.equal(calls[1].row.updated_at,'2026-10-07T12:01:00Z')
    await act(async()=>finish());assert.equal(field('Partnername').value,'Café Beispiel');assert.deepEqual(states.at(-1),{dirty:false,busy:false})
  })
})

test('a failed reload still exposes confirmed discard for its retained draft',async()=>{
  const services=transport();let failed=false
  services.loadWorkspacePartnerDetails=async id=>failed?{ok:false,error:'Erneuter Abruf fehlgeschlagen'}:{ok:true,value:details(id)}
  await withEditor(services,async({states})=>{
    await wait(()=>field('Partnername'));await fill(field('Partnername'),'Zurückbehaltener Entwurf');failed=true;await click(button('Partnerangaben neu laden'))
    await wait(()=>document.body.textContent.includes('Erneuter Abruf fehlgeschlagen'));assert.deepEqual(states.at(-1),{dirty:true,busy:false});assert.equal(field('Partnername'),undefined)
    dom.window.confirm=()=>false;await click(button('Änderungen verwerfen'));assert.deepEqual(states.at(-1),{dirty:true,busy:false})
    dom.window.confirm=()=>true;await click(button('Änderungen verwerfen'));assert.deepEqual(states.at(-1),{dirty:false,busy:false})
    failed=false;await click(button('Partnerangaben neu laden'));await wait(()=>field('Partnername'));assert.equal(field('Partnername').value,'Café Beispiel')
  })
})

test('type and categories save atomically while preserving an independent profile draft',async()=>{
  const services=transport(),calls=[]
  services.saveWorkspacePartnerDetail=async(id,input)=>{calls.push({id,input});return {ok:true,value:{...input.row,type:'Services',category:['Hotel'],updated_at:'2026-10-07T12:01:00Z'}}}
  await withEditor(services,async({states})=>{
    await wait(()=>field('Betriebsart'));await fill(field('Betriebsart'),'Services');await fill(field('Kategorien'),'Hotel');await fill(field('Adresse'),'Unabhängiger Entwurf')
    assert.equal(calls.length,0);assert.ok(!button('Betriebsart speichern'));assert.ok(!button('Kategorien speichern'))
    await click(button('Betriebsart & Kategorien speichern'))
    assert.equal(calls.length,1);assert.equal(calls[0].id,partnerId);assert.equal(calls[0].input.kind,'profile');assert.equal(calls[0].input.column,'classification')
    assert.deepEqual(calls[0].input.value,{type:'Services',category:['Hotel']});assert.equal(calls[0].input.row.updated_at,'2026-10-07T12:00:00Z')
    assert.equal(field('Adresse').value,'Unabhängiger Entwurf');assert.equal(states.at(-1).dirty,true);assert.equal(button('Betriebsart & Kategorien speichern'),undefined)
  })
})

test('category-only classification acknowledges canonical categories with unchanged type fallback',async()=>{
  const services=transport(),calls=[]
  services.saveWorkspacePartnerDetail=async(id,input)=>{calls.push(input);return {ok:true,value:{...input.row,type:'Food & Drink',category:['Cafe'],updated_at:'2026-10-07T12:01:00Z'}}}
  await withEditor(services,async({states,saved})=>{
    await wait(()=>field('Kategorien'));await fill(field('Kategorien'),'Café');await click(button('Betriebsart & Kategorien speichern'))
    assert.deepEqual(calls[0].value,{type:'Food & Drink',category:['Café']});assert.equal(field('Kategorien').value,'Cafe');assert.deepEqual(states.at(-1),{dirty:false,busy:false});assert.equal(saved(),1)
    assert.ok(document.body.textContent.includes('Gespeichert'))
  })
})

test('classification keeps later reverted type and category drafts and retries using its confirmed revision',async()=>{
  const services=transport(),calls=[];let finish
  services.saveWorkspacePartnerDetail=(id,input)=>{calls.push(input);return new Promise(resolve=>{finish=()=>resolve({ok:true,value:{...input.row,...input.value,updated_at:'2026-10-07T12:01:00Z'}})})}
  await withEditor(services,async({states})=>{
    await wait(()=>field('Betriebsart'));await fill(field('Betriebsart'),'Services');await fill(field('Kategorien'),'Hotel');await click(button('Betriebsart & Kategorien speichern'))
    await fill(field('Betriebsart'),'Food & Drink');await fill(field('Kategorien'),'Cafe');assert.deepEqual(states.at(-1),{dirty:true,busy:true});await act(async()=>finish())
    assert.equal(field('Betriebsart').value,'Food & Drink');assert.equal(field('Kategorien').value,'Cafe');assert.deepEqual(states.at(-1),{dirty:true,busy:false});assert.ok(!document.body.textContent.includes('Gespeichert'))
    await click(button('Betriebsart & Kategorien speichern'));assert.deepEqual(calls[1].value,{type:'Food & Drink',category:['Cafe']});assert.equal(calls[1].row.type,'Services');assert.deepEqual(calls[1].row.category,['Hotel']);assert.equal(calls[1].row.updated_at,'2026-10-07T12:01:00Z')
    await act(async()=>finish());assert.deepEqual(states.at(-1),{dirty:false,busy:false})
  })
})

test('classification error retains both drafts and offers categories for the current draft type',async()=>{
  const services=transport();services.saveWorkspacePartnerDetail=async()=>({ok:false,error:'Klassifizierung konnte nicht gespeichert werden'})
  await withEditor(services,async({states,saved})=>{
    await wait(()=>field('Betriebsart'));await fill(field('Betriebsart'),'Services');await fill(field('Kategorien'),'Hotel')
    const suggestions=document.getElementById(field('Kategorien').getAttribute('list'))
    assert.ok(suggestions);assert.ok([...suggestions.querySelectorAll('option')].some(option=>option.value==='Hotel'));assert.ok(![...suggestions.querySelectorAll('option')].some(option=>option.value==='Pizza'))
    await click(button('Betriebsart & Kategorien speichern'));assert.equal(field('Betriebsart').value,'Services');assert.equal(field('Kategorien').value,'Hotel');assert.equal(saved(),0);assert.deepEqual(states.at(-1),{dirty:true,busy:false});assert.ok(document.body.textContent.includes('Klassifizierung konnte nicht gespeichert werden'))
  })
})

test('classification rejects missing or mismatched categories before writing and allows correction',async()=>{
  const services=transport(),calls=[]
  services.saveWorkspacePartnerDetail=async(id,input)=>{calls.push(input);return {ok:true,value:{...input.row,...input.value,updated_at:'2026-10-07T12:01:00Z'}}}
  await withEditor(services,async({states})=>{
    await wait(()=>field('Kategorien'));await fill(field('Kategorien'),'');await click(button('Betriebsart & Kategorien speichern'));assert.equal(calls.length,0);assert.ok(document.querySelector('[role="alert"]'));assert.equal(states.at(-1).dirty,true)
    await fill(field('Kategorien'),'Cafe, Hotel');await click(button('Betriebsart & Kategorien speichern'));assert.equal(calls.length,0);assert.equal(field('Kategorien').value,'Cafe, Hotel')
    await fill(field('Kategorien'),'Restaurant');await click(button('Betriebsart & Kategorien speichern'));assert.equal(calls.length,1);assert.equal(states.at(-1).dirty,false)
  })
})
