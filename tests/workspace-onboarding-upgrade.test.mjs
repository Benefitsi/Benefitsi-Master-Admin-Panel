import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {upgradeOnboarding} from '../lib/workspace/onboarding-upgrade.ts'
import {emptyContent, questionAnswer, validateContent} from '../lib/workspace/model.ts'
import {onboardingContent} from '../lib/workspace/templates.ts'

const readCatalog=name=>JSON.parse(readFileSync(new URL(`../lib/workspace/${name}.json`,import.meta.url),'utf8'))
function legacy(version='2026-10-06.2') {
  return {...emptyContent(),meeting:{...emptyContent().meeting,templateVersion:version},questions:readCatalog(version==='2026-10-05.1'?'onboarding-v1':'onboarding-v2').map(q=>({...q,answer:'',change:'',agreement:'',reason:'',status:'open',hidden:false}))}
}
const removed=['A02','A03','A04','A05','C02','C04','C05','C06','C07','D02','D03','D04','D06','D07','D08','E05','F04']
test('v2 consolidates every legacy answer, archives deleted answers and custom wording, and upgrades once',()=>{
  const source=legacy()
  for(const id of ['A01','A02','A03','A04','C01','C02','C04','D01','D02','D03','A05']) {
    Object.assign(source.questions.find(q=>q.id===id),{answer:`${id} Antwort`,change:`${id} Wunsch`,agreement:`${id} Vereinbarung`,reason:`${id} Begründung`,status:'agreed'})
  }
  source.questions.find(q=>q.id==='A02').prompt='Eigene Frage zum Ansprechpartner'
  Object.assign(source.questions.find(q=>q.id==='A01'),{prompt:'Eigene Stammdatenfrage',hidden:true,status:'clarify'})
  const custom={...source.questions[0],id:'custom-local',prompt:'Meine zusätzliche Frage',answer:'Zusatzantwort'}
  source.questions.push(custom)
  const upgraded=upgradeOnboarding(source)
  assert.equal(upgraded.meeting.templateVersion,'2026-10-07.3')
  assert.ok(removed.every(id=>!upgraded.questions.some(q=>q.id===id)))
  for(const [target,ids] of [['A01',['A01','A02','A03','A04']],['C01',['C01','C02','C04']],['D01',['D01','D02','D03']]]) {
    const text=questionAnswer(upgraded.questions.find(q=>q.id===target))
    for(const id of ids) for(const value of ['Antwort','Wunsch','Vereinbarung','Begründung']) assert.ok(text.includes(`${id} ${value}`),`${id} ${value} survives consolidation`)
  }
  const notes=upgraded.blocks.map(b=>b.text).join('')
  for(const value of ['A05 Antwort','A05 Wunsch','A05 Vereinbarung','A05 Begründung','Eigene Frage zum Ansprechpartner']) assert.ok(notes.includes(value))
  assert.equal(upgraded.questions.find(q=>q.id==='A01').prompt,'Eigene Stammdatenfrage')
  assert.equal(upgraded.questions.find(q=>q.id==='A01').hidden,true)
  assert.equal(upgraded.questions.find(q=>q.id==='A01').status,'clarify')
  assert.deepEqual(upgraded.questions.find(q=>q.id==='custom-local'),custom)
  assert.deepEqual(upgradeOnboarding(upgraded),upgraded)
  assert.deepEqual(validateContent(upgraded),upgraded)
})
test('v1 upgrades through v2 and empty defaults produce only the compact catalog without archives',()=>{
  const upgraded=upgradeOnboarding(legacy('2026-10-05.1'))
  assert.deepEqual(upgraded.questions,onboardingContent().questions)
  assert.equal(upgraded.blocks.length,0)
  assert.deepEqual(upgradeOnboarding(upgraded),upgraded)
})
test('long merged answers survive completely in ordinary chunks without exceeding wire limits',()=>{
  const source=legacy()
  const values=['A01','A02','A03','A04'].map((id,i)=>`${id}-`+String(i).repeat(9996))
  values.forEach((answer,i)=>Object.assign(source.questions.find(q=>q.id===`A0${i+1}`),{answer,status:'answered'}))
  source.questions.find(q=>q.id==='A05').help='Eigene Erläuterung '+ 'ü'.repeat(3900)
  const upgraded=upgradeOnboarding(source)
  const notes=upgraded.blocks.map(b=>b.text).join('')
  for(const value of values) assert.ok(notes.includes(value),'the complete value survives')
  assert.ok(notes.includes('Eigene Erläuterung '+ 'ü'.repeat(3900)))
  assert.ok(upgraded.blocks.every(b=>b.text.length<=20000))
  assert.ok(upgraded.questions.every(q=>q.answer.length<=10000))
  assert.deepEqual(validateContent(upgraded),upgraded)
})
test('migration retains the original document intact when archives or added questions cannot fit',()=>{
  const source=legacy()
  source.questions.find(q=>q.id==='A05').answer='Unbedingt behalten'
  source.blocks=Array.from({length:500},(_,i)=>({id:`existing-${i}`,type:'paragraph',text:'Notiz',checked:false}))
  assert.ok(upgradeOnboarding(source)===source,'block overflow keeps the original object')
  const many=legacy()
  while(many.questions.length<200) many.questions.push({...many.questions[0],id:`custom-${many.questions.length}`})
  // Removed catalog entries free capacity; custom entries must not be discarded.
  for(const id of removed) many.questions=many.questions.filter(q=>q.id!==id)
  while(many.questions.length<200) many.questions.push({...many.questions[0],id:`extra-${many.questions.length}`})
  assert.ok(upgradeOnboarding(many)===many,'question overflow keeps the original object')
})
test('migration refuses total-size overflow without truncating existing notes',()=>{
  const source=legacy()
  source.questions.find(q=>q.id==='A05').answer='Archive this answer'
  // Already omitted defaults free no additional bytes in this partial legacy document.
  source.questions=source.questions.filter(q=>!removed.includes(q.id)||q.id==='A05')
  source.blocks=Array.from({length:25},(_,i)=>({id:`existing-${i}`,type:'paragraph',text:'x'.repeat(20000),checked:false}))
  const bytes=()=>new TextEncoder().encode(JSON.stringify(source)).length
  source.blocks.push({id:'near-limit',type:'paragraph',text:'',checked:false})
  source.blocks.at(-1).text='x'.repeat(512*1024-bytes()-1)
  assert.ok(bytes()<=512*1024)
  assert.ok(upgradeOnboarding(source)===source,'total-size overflow keeps the original object')
})
test('deleted questions with multiple maximum-length fields use complete consecutive blocks',()=>{
  const source=legacy()
  const q=source.questions.find(q=>q.id==='A05')
  for(const [i,key] of ['answer','change','agreement','reason'].entries()) q[key]=`${key}:`+String(i).repeat(10000-key.length-1)
  const upgraded=upgradeOnboarding(source)
  const notes=upgraded.blocks.map(b=>b.text).join('')
  for(const key of ['answer','change','agreement','reason']) assert.ok(notes.includes(q[key]))
  assert.ok(upgraded.blocks.length>=3)
  assert.ok(upgraded.blocks.every(b=>b.text.length<=20000))
  assert.deepEqual(validateContent(upgraded),upgraded)
})
test('v1 custom wording, removed hidden flags, and answers with an omitted merge target survive',()=>{
  const source=legacy('2026-10-05.1')
  source.questions=source.questions.filter(q=>q.id!=='A01')
  Object.assign(source.questions.find(q=>q.id==='A02'),{answer:'Kontakt aus ursprünglichem Gespräch',help:'Eigener Kontaktleitfaden',hidden:true})
  Object.assign(source.questions.find(q=>q.id==='B01'),{prompt:'Eigene Zielfrage',answer:'Gäste binden',hidden:true,status:'agreed'})
  const upgraded=upgradeOnboarding(source)
  const notes=upgraded.blocks.map(b=>b.text).join('')
  assert.ok(notes.includes('Kontakt aus ursprünglichem Gespräch'))
  assert.ok(notes.includes('Eigener Kontaktleitfaden'))
  assert.ok(notes.includes('Ausgeblendet: Ja'))
  assert.equal(upgraded.questions.find(q=>q.id==='B01').prompt,'Eigene Zielfrage')
  assert.equal(upgraded.questions.find(q=>q.id==='B01').answer,'Gäste binden')
  assert.equal(upgraded.questions.find(q=>q.id==='B01').hidden,true)
  assert.equal(upgraded.questions.find(q=>q.id==='B01').status,'agreed')
  assert.deepEqual(validateContent(upgraded),upgraded)
})
test('removed open answers and nonempty whitespace fields retain a complete archival record',()=>{
  const source=legacy()
  Object.assign(source.questions.find(q=>q.id==='A02'),{answer:'Offene Kontaktantwort',change:'  '})
  const upgraded=upgradeOnboarding(source)
  const archive=upgraded.blocks.find(b=>b.text.includes('Frühere Frage A02'))
  assert.ok(archive,'a removed answered question is archived even when its status is open')
  assert.ok(archive.text.includes('Offene Kontaktantwort'))
  assert.ok(archive.text.includes('Partnerwunsch:\n  \n\n'))
})
