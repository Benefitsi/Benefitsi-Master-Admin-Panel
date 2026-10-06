import assert from 'node:assert/strict'
import test from 'node:test'

const partnerId='00000000-0000-4000-8000-000000000011'
const otherId='00000000-0000-4000-8000-000000000012'

test('prepared facts use the selected partner, retain inactive status and never invent missing contacts',async()=>{
  const {buildPartnerBrief}=await import('../lib/workspace/partner-brief.ts')
  const brief=buildPartnerBrief({partner:{id:partnerId,name:'Bistro Beispiel',type:'Restaurant',category:['Pizza'],stamp_target:10},
    deals:[{id:'own',partner_id:partnerId,public_title:'Mittagsangebot',active:false,discount_type:'percentage',discount_value:10,terms:'Nur vor Ort'},
      {id:'foreign',partner_id:otherId,public_title:'Nicht dieser Partner',active:true}],
    rewards:[{partner_id:partnerId,title:'Kaffee',required_stamps:5,active:true}],hours:[],holidays:[],socials:[],menus:[],staff:[],owner:null,microsite:null})
  assert.ok(brief.facts.A01.some(f=>f.value==='Bistro Beispiel'))
  assert.ok(!brief.facts.A02?.some(f=>f.value.includes('Bistro Beispiel')))
  assert.ok(brief.facts.D01.some(f=>f.value.includes('Mittagsangebot')&&f.value.includes('Im Admin deaktiviert')))
  assert.ok(!JSON.stringify(brief).includes('Nicht dieser Partner'))
  assert.ok(brief.facts.C04.some(f=>f.value.includes('5')&&f.value.includes('Kaffee')))
  assert.ok(brief.facts.D06.some(f=>f.value.includes('Nur vor Ort')))
  assert.ok(!JSON.stringify(brief).includes('undefined'))
})

test('prepared benefits distinguish free items, two-for-one and the stored number of bonus stamps',async()=>{
  const {buildPartnerBrief}=await import('../lib/workspace/partner-brief.ts')
  const source={partner:{id:partnerId,name:'Beispiel'},owner:null,microsite:null,deals:[],rewards:[],hours:[],holidays:[],socials:[],menus:[],staff:[]}
  source.rewards=[{partner_id:partnerId,reward_type:'item',reward_item:'Kaffee',required_stamps:5,active:true},{partner_id:partnerId,reward_type:'2for1',reward_item:'Kaffee',required_stamps:10,active:true}]
  source.deals=[{partner_id:partnerId,type:'bonus_stamp',reward_format:'bonus_stamp',benefit_count:3,active:true,valid_until:'2020-01-01'}]
  const brief=buildPartnerBrief(source)
  assert.ok(brief.facts.C02.some(f=>f.value.includes('Gratis Kaffee')))
  assert.ok(brief.facts.C02.some(f=>f.value.includes('2 für 1 Kaffee')))
  assert.ok(brief.facts.D03.some(f=>f.value.includes('+3 Bonusstempel')))
  assert.ok(brief.facts.D07.every(f=>f.value.includes('Im Admin aktiviert')))
})

test('old onboarding content gains current review prompts and discovery questions without losing custom edits or answers',async()=>{
  const {validateContent,emptyContent}=await import('../lib/workspace/model.ts')
  const {default:original}=await import('../lib/workspace/onboarding-v1.json',{with:{type:'json'}})
  const content={...emptyContent(),meeting:{...emptyContent().meeting,templateVersion:'2026-10-05.1'},questions:original.map(q=>({...q,answer:'',change:'',agreement:'',status:'open',reason:'',hidden:false}))}
  content.questions[0].answer='Schon bestätigt'
  content.questions[1].prompt='Eigene wichtige Frage'
  content.questions[2].hidden=true
  const migrated=validateContent(content)
  assert.match(migrated.questions[0].prompt,/prüfen/i)
  assert.equal(migrated.questions[0].answer,'Schon bestätigt')
  assert.equal(migrated.questions[1].prompt,'Eigene wichtige Frage')
  assert.equal(migrated.questions[2].hidden,true)
  assert.deepEqual(migrated.questions.filter(q=>['B05','B06','B07'].includes(q.id)).map(q=>q.id),['B05','B06','B07'])
  assert.equal(validateContent(migrated).questions.length,migrated.questions.length)
  assert.equal(migrated.questions[0].id,'A01')
})

test('one-answer export preserves all legacy content without presenting three answer fields',async()=>{
  const {makePage,emptyContent}=await import('../lib/workspace/model.ts')
  const {exportMarkdown}=await import('../lib/workspace/export.ts')
  const page=makePage(partnerId,'conversation')
  page.content={...emptyContent(),questions:[{id:'A01',section:'A',prompt:'Name prüfen',help:'',suggestion:'',answerType:'text',options:[],answer:'Name eins',change:'Name zwei',agreement:'Name drei',status:'answered',reason:'',core:true,hidden:false}]}
  const text=exportMarkdown(page)
  for(const value of ['Name eins','Name zwei','Name drei'])assert.ok(text.includes(value))
  assert.ok(!text.includes('Änderungswunsch:'))
  assert.ok(!text.includes('Vereinbart:'))
})

test('status-only changes retain long legacy answers and use a nonblank reason',async()=>{
  const {questionAnswer,questionWithStatus,validateContent}=await import('../lib/workspace/model.ts')
  const {onboardingContent}=await import('../lib/workspace/templates.ts')
  const content=onboardingContent()
  Object.assign(content.questions[0],{answer:'A'.repeat(6000),change:'B'.repeat(6000),reason:'   '})
  const before=questionAnswer(content.questions[0])
  for(const status of ['irrelevant','agreed','answered']){
    content.questions[0]=questionWithStatus(content.questions[0],status)
    assert.equal(questionAnswer(content.questions[0]),before)
    assert.doesNotThrow(()=>validateContent(content))
  }
})

test('an irrelevant answer is exported once without a duplicate reason field',async()=>{
  const {makePage,answerQuestion}=await import('../lib/workspace/model.ts')
  const {onboardingContent}=await import('../lib/workspace/templates.ts')
  const {exportMarkdown}=await import('../lib/workspace/export.ts')
  const page={...makePage(partnerId,'conversation'),content:onboardingContent()}
  page.content.questions=[answerQuestion({...page.content.questions[0],status:'irrelevant'},'Diese Angabe trifft nicht zu')]
  assert.equal(exportMarkdown(page).split('Diese Angabe trifft nicht zu').length-1,1)
})
