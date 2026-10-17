import test from 'node:test'
import assert from 'node:assert/strict'
import {createAcquisitionData} from '../lib/acquisition/data.ts'
import {blankFields,encodeAcquisitionDocument,existingPartnerPageId} from '../lib/acquisition/model.ts'
import {acquisitionFixture,workspaceId,partnerId,workspace,partner} from './helpers/acquisition-fixture.mjs'
const service=f=>createAcquisitionData(f.client,f.services)
const draft=f=>({page:f.newPage(),fields:{...blankFields(),name:'Interessent'},contacts:[]})

test('read-only index shows current partner city and never creates an acquisition file',async()=>{
 const f=acquisitionFixture(),result=await service(f).loadAcquisitionIndex()
 assert.equal(result.ok,true);assert.equal(result.value.rows[0].fields.city,'Berlin');assert.equal(result.value.rows[0].fields.status,'unrecorded');assert.equal(result.value.rows[0].lastContactDate,'');assert.equal(f.pages.size,0)
 assert.deepEqual(f.reads.find(r=>r.table==='partners').columns.split(','),['id','name','city_id','type','email','phone','website'])
})
test('save and reload reconstruct fields, contact history and media statuses in one revision',async()=>{
 const f=acquisitionFixture(),s=service(f),doc=draft(f);doc.fields.food='interested';doc.fields.nextStep='Zurückrufen';doc.contacts=[{id:partnerId,date:'2026-10-10',channel:'phone',note:'Gesprochen'}]
 const saved=await s.saveAcquisitionDocument(doc);assert.equal(saved.ok,true)
 const loaded=await s.loadAcquisitionDocument({pageId:doc.page.id});assert.equal(loaded.ok,true);assert.deepEqual(loaded.value.fields,doc.fields);assert.deepEqual(loaded.value.contacts,doc.contacts);assert.equal(f.versions.get(doc.page.id).length,1)
})
test('existing partners receive the same unsaved ID without GET writes',async()=>{
 const f=acquisitionFixture(),s=service(f),a=await s.loadAcquisitionDocument({partnerId,workspaceId}),b=await s.loadAcquisitionDocument({partnerId,workspaceId})
 assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(a.value.page.id,existingPartnerPageId(partnerId));assert.equal(a.value.page.id,b.value.page.id);assert.equal(a.value.fields.status,'unrecorded');assert.equal(f.pages.size,0)
})
test('pagination failure returns an error instead of a plausible incomplete index',async()=>{
 const f=acquisitionFixture({partners:Array.from({length:200},(_,i)=>({...partner,id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`})),failRange:(table,from)=>table==='partners'&&from===200})
 const result=await service(f).loadAcquisitionIndex();assert.equal(result.ok,false);assert.equal('value' in result,false)
})

test('invalid targets and document inputs are rejected before querying or saving',async()=>{
 const f=acquisitionFixture(),s=service(f)
 for(const target of [{pageId:'bad'},{partnerId:'bad'},{workspaceId:'bad'},null])assert.equal((await s.loadAcquisitionDocument(target)).ok,false)
 const doc=draft(f);doc.page.id='bad';assert.equal((await s.saveAcquisitionDocument(doc)).ok,false)
 assert.equal((await s.createAcquisitionWorkspace('bad')).ok,false);assert.equal(f.reads.length,0);assert.equal(f.pages.size,0)
})
test('stale revisions preserve the caller draft and return a conflict without a new history entry',async()=>{
 const f=acquisitionFixture(),s=service(f),doc=draft(f),saved=await s.saveAcquisitionDocument(doc)
 assert.equal(saved.ok,true);const second=structuredClone(saved.value);second.fields.nextStep='Anderer Admin';await s.saveAcquisitionDocument(second)
 const local=structuredClone(saved.value);local.fields.nextStep='Mein Entwurf';const before=structuredClone(local),result=await s.saveAcquisitionDocument(local)
 assert.equal(result.ok,false);assert.ok(result.conflict);assert.deepEqual(local,before);assert.equal(f.versions.get(doc.page.id).length,2)
})
test('contacts cannot be removed, edited or reordered by changing their stable identity',async()=>{
 const f=acquisitionFixture(),s=service(f),doc=draft(f);doc.contacts=[{id:partnerId,date:'2026-10-10',channel:'email',note:'Gesendet'}]
 const saved=await s.saveAcquisitionDocument(doc);assert.equal(saved.ok,true)
 for(const contacts of [[],[{...doc.contacts[0],note:'Umgeschrieben'}],[{...doc.contacts[0],date:'2026-10-11'}]])assert.equal((await s.saveAcquisitionDocument({...saved.value,contacts})).ok,false)
 assert.equal(f.versions.get(doc.page.id).length,1)
})
test('an ordinary page cannot be relabeled or moved into an acquisition identity',async()=>{
 const f=acquisitionFixture(),s=service(f),ordinary=f.newPage();ordinary.revision=1;f.pages.set(ordinary.id,ordinary)
 const doc={...draft(f),page:ordinary};assert.equal((await s.saveAcquisitionDocument(doc)).ok,false);assert.deepEqual(f.pages.get(ordinary.id).tags,[])
 const saved=await s.saveAcquisitionDocument(draft(f));assert.equal(saved.ok,true)
 assert.equal((await s.saveAcquisitionDocument({...saved.value,page:{...saved.value.page,partner_id:partnerId}})).ok,false)
})
test('saved foreign content is authoritative even if a caller submits stale foreign notes',async()=>{
 const f=acquisitionFixture(),s=service(f),doc=draft(f)
 doc.page.content.blocks=[{id:'note',type:'paragraph',text:'Erhalten',checked:false}]
 const saved=await s.saveAcquisitionDocument(doc);assert.equal(saved.ok,true)
 const local=structuredClone(saved.value);local.page.content.blocks.find(b=>b.id==='note').text='Versehentlich verändert';local.fields.nextStep='Anrufen'
 const result=await s.saveAcquisitionDocument(local);assert.equal(result.ok,true);assert.equal(result.value.page.content.blocks.find(b=>b.id==='note').text,'Erhalten');assert.equal(result.value.fields.nextStep,'Anrufen')
})
test('a retry after an acknowledged-late create returns one saved page and one history version',async()=>{
 const f=acquisitionFixture(),s=service(f),doc=draft(f)
 assert.equal((await s.saveAcquisitionDocument(doc)).ok,true);assert.equal((await s.saveAcquisitionDocument(doc)).ok,true)
 assert.equal(f.pages.size,1);assert.equal(f.versions.get(doc.page.id).length,1)
 const different=structuredClone(doc);different.fields.nextStep='Änderung';assert.equal((await s.saveAcquisitionDocument(different)).ok,false)
})
test('existing linked documents are found first and duplicate historical records require explicit choice',async()=>{
 const f=acquisitionFixture(),s=service(f),doc=draft(f);doc.page.partner_id=partnerId;doc.page.id=existingPartnerPageId(partnerId)
 const saved=await s.saveAcquisitionDocument(doc);assert.equal(saved.ok,true)
 const found=await s.loadAcquisitionDocument({partnerId});assert.equal(found.ok,true);assert.equal(found.value.page.id,doc.page.id)
 const historic=encodeAcquisitionDocument({...draft(f),page:{...f.newPage(),partner_id:partnerId,revision:1}});f.pages.set(historic.id,historic)
 assert.equal((await s.loadAcquisitionDocument({partnerId})).ok,false)
 assert.equal((await s.loadAcquisitionDocument({pageId:historic.id})).ok,true)
})
test('creating a partner file cannot bypass a historic linked file with a different ID',async()=>{
 const f=acquisitionFixture(),s=service(f),historic=encodeAcquisitionDocument({...draft(f),page:{...f.newPage(),partner_id:partnerId,revision:1}});f.pages.set(historic.id,historic)
 const doc=draft(f);doc.page.partner_id=partnerId;doc.page.id=existingPartnerPageId(partnerId)
 assert.equal((await s.saveAcquisitionDocument(doc)).ok,false);assert.equal(f.pages.size,1)
})
test('workspace setup with a stable caller ID is idempotent after a lost response and rejects foreign rows',async()=>{
 const f=acquisitionFixture({workspaces:[]}),s=service(f)
 const first=await s.createAcquisitionWorkspace(workspaceId),again=await s.createAcquisitionWorkspace(workspaceId)
 assert.equal(first.ok,true);assert.equal(again.ok,true);assert.equal(again.value.revision,1);assert.equal(f.workspaces.size,1)
 f.workspaces.set(partnerId,{...workspace,id:partnerId,title:'Anderer Bereich'})
 assert.equal((await s.createAcquisitionWorkspace(partnerId)).ok,false)
})
test('all four Server Actions enforce requireAdmin before reaching the data boundary',async()=>{
 const {loadTypescript}=await import('./helpers/load-typescript.mjs')
 for(const name of ['loadAcquisitionIndex','loadAcquisitionDocument','saveAcquisitionDocument','createAcquisitionWorkspace']){
  const f=acquisitionFixture();const handlers=loadTypescript('app/partners/acquisition/actions.ts',{'@/lib/admin':{requireAdmin:async()=>{throw new Error('admin required')}},'@/lib/acquisition/data':{createAcquisitionData},'@/app/workspace/actions':f.services})
  await assert.rejects(()=>handlers[name]({}),/admin required/);assert.equal(f.reads.length,0);assert.equal(f.pages.size,0)
 }
})

test('existing contact order is retained while new contacts can be appended',async()=>{
 const f=acquisitionFixture(),s=service(f),doc=draft(f)
 doc.contacts=[{id:partnerId,date:'2026-10-10',channel:'phone',note:'Gespräch'},{id:workspaceId,date:'2026-10-08',channel:'email',note:'Gesendet'}]
 const saved=await s.saveAcquisitionDocument(doc);assert.equal(saved.ok,true)
 const reordered={...saved.value,contacts:[...saved.value.contacts].reverse()}
 assert.equal((await s.saveAcquisitionDocument(reordered)).ok,false)
 assert.equal(f.versions.get(doc.page.id).length,1)
})
test('failed save keeps local input and existing history untouched',async()=>{
 const f=acquisitionFixture(),doc=draft(f),before=structuredClone(doc)
 const s=createAcquisitionData(f.client,{...f.services,saveWorkspacePage:async()=>({ok:false,error:'Netzwerkfehler. Entwurf erhalten.'})})
 const result=await s.saveAcquisitionDocument(doc)
 assert.equal(result.ok,false);assert.deepEqual(doc,before);assert.equal(f.pages.size,0)
})
test('an unreadable stored acquisition field fails the entire index instead of inventing defaults',async()=>{
 const f=acquisitionFixture(),doc=draft(f),page=encodeAcquisitionDocument(doc)
 page.content.questions.find(q=>q.id==='acq:status').answer='unknown';f.pages.set(page.id,page)
 const result=await service(f).loadAcquisitionIndex();assert.equal(result.ok,false);assert.equal('value' in result,false)
})
test('lost setup response is recovered using the exact stable caller ID',async()=>{
 const f=acquisitionFixture({workspaces:[]})
 const s=createAcquisitionData(f.client,{...f.services,saveWorkspace:async input=>{await f.services.saveWorkspace(input);return {ok:false,error:'Antwort verloren'}}})
 const result=await s.createAcquisitionWorkspace(workspaceId)
 assert.equal(result.ok,true);assert.equal(result.value.id,workspaceId);assert.equal(f.workspaces.size,1)
})
test('all authorized Server Actions use the session client and real acquisition transport',async()=>{
 const {loadTypescript}=await import('./helpers/load-typescript.mjs'),f=acquisitionFixture()
 const handlers=loadTypescript('app/partners/acquisition/actions.ts',{'@/lib/admin':{requireAdmin:async()=>({supabase:f.client})},'@/lib/acquisition/data':{createAcquisitionData},'@/app/workspace/actions':f.services})
 const index=await handlers.loadAcquisitionIndex();assert.equal(index.ok,true);assert.equal(index.value.rows[0].fields.name,'Hotel')
 const loaded=await handlers.loadAcquisitionDocument({workspaceId});assert.equal(loaded.ok,true);loaded.value.fields.name='Neuer Kontakt'
 const saved=await handlers.saveAcquisitionDocument(loaded.value);assert.equal(saved.ok,true);assert.equal(f.pages.size,1)
 const created=await handlers.createAcquisitionWorkspace(partnerId);assert.equal(created.ok,true);assert.equal(f.workspaces.size,2)
})

test('partners with an unknown stored name can receive an explicit acquisition name',async()=>{
 const f=acquisitionFixture({partners:[{...partner,name:null}]}),s=service(f)
 const loaded=await s.loadAcquisitionDocument({partnerId,workspaceId});assert.equal(loaded.ok,true)
 loaded.value.fields.name='Name aus Kontaktgespräch'
 const saved=await s.saveAcquisitionDocument(loaded.value);assert.equal(saved.ok,true)
 assert.equal(saved.value.fields.name,'Name aus Kontaktgespräch')
})

test('reordered field and contact properties save successfully and retry without another revision',async()=>{
 const f=acquisitionFixture(),s=service(f),doc=draft(f)
 doc.fields=Object.fromEntries(Object.entries({...doc.fields,nextStep:'Zurückrufen',food:'interested'}).reverse())
 doc.contacts=[{note:'Tatsächlich gesprochen',channel:'phone',date:'2026-10-10',id:partnerId}]
 const before=structuredClone(doc),saved=await s.saveAcquisitionDocument(doc)
 assert.equal(saved.ok,true);assert.deepEqual(saved.value.fields,doc.fields);assert.deepEqual(saved.value.contacts,doc.contacts)
 const retried=await s.saveAcquisitionDocument(doc)
 assert.equal(retried.ok,true);assert.equal(retried.value.page.revision,1);assert.equal(f.pages.size,1);assert.equal(f.versions.get(doc.page.id).length,1)
 assert.deepEqual(doc,before)
})
test('uppercase contact UUIDs save as canonical UUIDs and identical retries remain idempotent',async()=>{
 const f=acquisitionFixture(),s=service(f),doc=draft(f)
 doc.contacts=[{id:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',date:'2026-10-10',channel:'email',note:'Anfrage gesendet'}]
 const before=structuredClone(doc),saved=await s.saveAcquisitionDocument(doc)
 assert.equal(saved.ok,true);assert.equal(saved.value.contacts[0].id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
 const retried=await s.saveAcquisitionDocument(doc)
 assert.equal(retried.ok,true);assert.equal(retried.value.contacts[0].id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');assert.equal(retried.value.page.revision,1)
 assert.equal(f.pages.size,1);assert.equal(f.versions.get(doc.page.id).length,1);assert.deepEqual(doc,before)
})
for(const [label,alter] of [
 ['field',page=>{page.content.questions.find(q=>q.id==='acq:nextStep').answer='Andere Aufgabe'}],
 ['contact',page=>{page.content.blocks.find(b=>b.id.startsWith('acq-contact:')).text='Andere Kontaktnotiz'}],
 ['missing contact',page=>{page.content.blocks=page.content.blocks.filter(b=>!b.id.startsWith('acq-contact:'))}],
 ['identity',page=>{page.id=partnerId}],
])test(`an altered ${label} acknowledgment is rejected despite a successful transport save`,async()=>{
 const f=acquisitionFixture(),doc=draft(f)
 doc.fields.nextStep='Anrufen';doc.contacts=[{id:partnerId,date:'2026-10-10',channel:'phone',note:'Gesprochen'}]
 const before=structuredClone(doc),s=createAcquisitionData(f.client,{...f.services,saveWorkspacePage:async page=>{
  const saved=await f.services.saveWorkspacePage(page)
  assert.equal(saved.ok,true);alter(saved.value);return saved
 }})
 const result=await s.saveAcquisitionDocument(doc)
 assert.equal(result.ok,false);assert.match(result.error,/Speicherantwort/);assert.equal('value' in result,false)
 assert.equal(f.pages.size,1);assert.equal(f.versions.get(doc.page.id).length,1);assert.deepEqual(doc,before)
})
