import test from 'node:test'
import assert from 'node:assert/strict'
import {makePage,emptyContent} from '../lib/workspace/model.ts'
import {blankFields,encodeAcquisitionDocument,decodeAcquisitionDocument,lastContactDate,berlinDate,acquisitionMetrics,filterAcquisitionRows,buildAcquisitionRows,existingPartnerPageId,makeAcquisitionDocument} from '../lib/acquisition/model.ts'
const ws='00000000-0000-4000-8000-000000000001', partner='00000000-0000-4000-8000-000000000002'
const contact={id:'00000000-0000-4000-8000-000000000003',date:'2026-10-10',channel:'email',note:'Anfrage tatsächlich versendet'}
const document=()=>({page:makePage(ws,'partner'),fields:{...blankFields(),name:'Testhotel',status:'contacted'},contacts:[{...contact}]})

test('codec retains ordinary workspace notes, resources, questions, tasks and metadata',()=>{
  const doc=document();doc.page.tags=['bestehend'];doc.page.owner='Anna'
  doc.page.content={...emptyContent(),blocks:[{id:'existing-note',type:'paragraph',text:'Alte Vereinbarung',checked:false}],links:[{id:'menu',title:'Menü',url:'https://example.test/menu',category:'Menü',note:''}],tasks:[{id:'task',text:'Nachsehen',owner:'Anna',dueDate:'',done:false,evidence:''}]}
  const before=structuredClone(doc), stored=encodeAcquisitionDocument(doc), restored=decodeAcquisitionDocument(stored)
  assert.deepEqual(doc,before)
  assert.equal(stored.content.blocks.find(b=>b.id==='existing-note').text,'Alte Vereinbarung')
  assert.deepEqual(stored.content.links,before.page.content.links)
  assert.deepEqual(stored.content.tasks,before.page.content.tasks)
  assert.equal(stored.owner,'Anna');assert.ok(stored.tags.includes('bestehend'))
  assert.deepEqual(restored.fields,doc.fields);assert.deepEqual(restored.contacts,[contact])
  assert.ok(stored.content.blocks.some(b=>b.id==='acq-contact:2026-10-10:email:00000000-0000-4000-8000-000000000003'))
})
test('stock partners are unrecorded and have no fabricated last contact',()=>{
  const rows=buildAcquisitionRows([{id:partner,name:'Hotel',city:'Berlin',industry:'Hotel',email:'info@example.test',phone:'',website:''}],[])
  assert.equal(rows[0].fields.status,'unrecorded');assert.equal(rows[0].lastContactDate,'');assert.equal(rows[0].pageId,null)
})
test('last actual contact uses contact dates regardless of insertion order',()=>{
  assert.equal(lastContactDate([contact,{...contact,id:ws,date:'2026-10-08'}]),'2026-10-10')
})
test('Berlin day boundaries and open follow-ups distinguish due today from overdue',()=>{
  assert.equal(berlinDate(new Date('2026-10-16T22:30:00Z')),'2026-10-17')
  const row=(key,status,date,meeting='')=>({key,pageId:null,partnerId:null,fields:{...blankFields(),name:key,status,followUpDate:date,meetingDate:meeting},lastContactDate:''})
  const rows=[row('a','contacted','2026-10-16'),row('b','later','2026-10-17'),row('c','accepted','2026-10-16'),row('d','declined','2026-10-17'),row('e','meeting','','2026-10-19')]
  assert.deepEqual(acquisitionMetrics(rows,'2026-10-17'),{dueToday:1,overdue:1,awaitingReply:1,upcomingMeetings:1})
  assert.deepEqual(filterAcquisitionRows(rows,{query:'B',status:'later'}).map(r=>r.key),['b'])
})
test('linked rows use current partner display data and retain multiple historical files',()=>{
  const a=document();a.page.partner_id=partner
  const b=document();b.page.partner_id=partner
  const rows=buildAcquisitionRows([{id:partner,name:'Aktueller Name',city:'Berlin',industry:'Hotel'}],[a,b])
  assert.equal(rows.length,2);assert.equal(rows[0].fields.name,'Aktueller Name');assert.equal(rows[0].fields.city,'Berlin')
  assert.equal(new Set(rows.map(r=>r.key)).size,2)
})
test('existing partner page identities are stable namespaced UUIDs across callers',()=>{
  assert.equal(existingPartnerPageId(partner),'e1295c78-0181-5a77-a7be-e00603b2ce30')
  assert.equal(existingPartnerPageId(partner),existingPartnerPageId(partner.toUpperCase()))
  assert.match(existingPartnerPageId(partner),/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.notEqual(existingPartnerPageId(partner),partner);assert.notEqual(existingPartnerPageId(partner),existingPartnerPageId(ws))
})
for(const [label,patch] of [ ['enum',{status:'draft'}],['date',{followUpDate:'2026-02-30'}],['website',{website:'javascript:alert(1)'}],['credentials',{website:'https://user:secret@example.test'}],['email',{email:'bad'}],['text',{notes:'x'.repeat(10001)}] ])test(`codec rejects invalid ${label} rather than dropping it`,()=>{
  const doc=document();Object.assign(doc.fields,patch);assert.throws(()=>encodeAcquisitionDocument(doc))
})
test('codec rejects invalid IDs, undated contacts, changed reserved data and oversized documents',()=>{
  const doc=document();doc.contacts[0].id='bad';assert.throws(()=>encodeAcquisitionDocument(doc))
  doc.contacts=[{...contact,date:''}];assert.throws(()=>encodeAcquisitionDocument(doc))
  doc.contacts=[contact];const stored=encodeAcquisitionDocument(doc)
  stored.content.questions.find(q=>q.id==='acq:status').answer='fake';assert.throws(()=>decodeAcquisitionDocument(stored))
  const big=document();big.page.content.blocks=Array.from({length:40},(_,i)=>({id:`note-${i}`,type:'paragraph',text:'x'.repeat(18000),checked:false}));assert.throws(()=>encodeAcquisitionDocument(big),/groß/)
})

test('source ownership comes from partner values while completion survives the unchanged codec',()=>{
 const doc=makeAcquisitionDocument(ws,{id:partner,name:'',city:'Berlin',industry:''})
 doc.fields.name='Aus dem Kontakt';doc.fields.industry='Gastronomie'
 assert.deepEqual(doc.sourceOwnedFields,['city'])
 const stored=encodeAcquisitionDocument(doc),reloaded=decodeAcquisitionDocument(stored)
 assert.equal(reloaded.fields.name,'Aus dem Kontakt');assert.equal(reloaded.fields.industry,'Gastronomie')
 assert.equal('sourceOwnedFields' in reloaded,false);assert.equal('sourceOwnedFields' in stored,false)
 const withoutHint={...doc};delete withoutHint.sourceOwnedFields
 assert.deepEqual(stored,encodeAcquisitionDocument(withoutHint))
})
