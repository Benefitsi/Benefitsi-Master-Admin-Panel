import assert from 'node:assert/strict'
import test from 'node:test'
test('choice answers retain old prose, selected details and deselected drafts across round trips',async()=>{
  const {decodeChoiceAnswer,encodeChoiceAnswer,formatChoiceAnswer}=await import('../lib/workspace/choice-answers.ts')
  const value=decodeChoiceAnswer('Schon besprochen: nur dienstags')
  value.choices.two_for_one={selected:true,note:'Pizza, ohne Getränke'}
  value.choices.discount={selected:false,note:'Später 10 % prüfen'}
  const stored=encodeChoiceAnswer(value)
  assert.deepEqual(decodeChoiceAnswer(stored),value)
  const readable=formatChoiceAnswer(stored)
  assert.match(readable,/2 für 1: Pizza, ohne Getränke/)
  assert.match(readable,/Schon besprochen: nur dienstags/)
  assert.match(readable,/Nicht ausgewählt.*Rabatt.*Später 10 % prüfen/s)
  assert.ok(!readable.includes('benefitsi-choice-v1'))
  assert.throws(()=>encodeChoiceAnswer({...value,notes:'x'.repeat(10001)}),/lang/)
})
test('status changes and exports preserve selected choices instead of flattening their state',async()=>{
  const {decodeChoiceAnswer,encodeChoiceAnswer}=await import('../lib/workspace/choice-answers.ts')
  const {questionWithStatus,makePage,questionAnswer}=await import('../lib/workspace/model.ts')
  const {onboardingContent}=await import('../lib/workspace/templates.ts')
  const {exportMarkdown}=await import('../lib/workspace/export.ts')
  const value=decodeChoiceAnswer('Alte Notiz');value.choices.two_for_one={selected:true,note:'Pizza'}
  const q={...onboardingContent().questions.find(q=>q.id==='D01'),answer:encodeChoiceAnswer(value),status:'answered'}
  const changed=questionWithStatus(q,'agreed')
  assert.deepEqual(decodeChoiceAnswer(changed.answer),value)
  const page=makePage('00000000-0000-4000-8000-000000000011','conversation');page.content.questions=[changed]
  const markdown=exportMarkdown(page)
  assert.match(markdown,/2 für 1: Pizza/);assert.ok(!markdown.includes('benefitsi-choice-v1'))
  assert.equal(questionAnswer(changed).split('Alte Notiz').length-1,1)
})
