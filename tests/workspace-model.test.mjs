import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyContent, validatePage, safeLink, pageFromTemplate, pageProgress, partnerLinks, makePage } from '../lib/workspace/model.ts'
import { onboardingContent } from '../lib/workspace/templates.ts'
import { exportMarkdown } from '../lib/workspace/export.ts'

const workspace = '00000000-0000-4000-8000-000000000001'
test('links accept ordinary https files but reject executable URLs and credentials', () => {
  assert.equal(safeLink('https://example.org/menu.pdf'), 'https://example.org/menu.pdf')
  for (const value of ['javascript:alert(1)', 'data:text/html,Hi', 'file:///etc/passwd', 'https://user:secret@example.org', '//example.org']) assert.equal(safeLink(value), null)
})
test('validation refuses malformed documents and excessive question counts without truncation', () => {
  const page = makePage(workspace, 'note')
  assert.equal(validatePage(page).title, 'Neue Notiz')
  assert.throws(() => validatePage({...page, title: ' '}), /Titel/)
  assert.throws(() => validatePage({...page, content: {...emptyContent(), questions: Array(201).fill({})}}), /Fragen/)
  assert.throws(() => validatePage({...page, workspace_id: 'bad'}), /Arbeitsbereich/)
})
test('comma-separated tags normalize whitespace and ignore empty values for exact matching',()=>{
  const page=makePage(workspace,'note')
  page.tags=['Kaffee',' Sommer','', 'Sommer']
  assert.deepEqual(validatePage(page).tags,['Kaffee','Sommer'])
})
test('international file URLs are normalized for the database and backslashes are rejected', () => {
  const page = makePage(workspace, 'note')
  page.content.links = [{id:'menu',title:'Speisekarte',url:'https://münchen.example/menü.pdf',category:'Datei',note:''}]
  assert.equal(validatePage(page).content.links[0].url, 'https://xn--mnchen-3ya.example/men%C3%BC.pdf')
  assert.equal(safeLink('https://example.org\\path'), null)
  assert.deepEqual(validatePage(validatePage(page)),validatePage(page))
  page.content.links[0].url='https://example.test/'+'ä'.repeat(700)
  assert.throws(()=>validatePage(page),/URL.*4000/)
})
test('onboarding provides forty-two distinct questions and twenty-three core questions with empty answers', () => {
  const content = onboardingContent()
  assert.equal(content.questions.length, 42)
  assert.equal(new Set(content.questions.map(q => q.id)).size, 42)
  assert.equal(content.questions.filter(q => q.core).length, 23)
  assert.ok(content.questions.every(q => q.answer === '' && q.agreement === '' && q.status === 'open'))
  content.questions[0].answer = 'Only this meeting'
  assert.equal(onboardingContent().questions[0].answer, '')
})
test('reusable templates reset meeting, answers, decisions, completed tasks and partner association', () => {
  const source = makePage(workspace, 'conversation')
  source.content = onboardingContent()
  source.partner_id = workspace
  source.content.questions[0] = {...source.content.questions[0],answer:'Old answer',change:'Old wish',agreement:'Old deal',status:'agreed'}
  source.content.meeting = {...source.content.meeting,date:'2026-10-05T12:00',participants:'Old participant',summary:'Secret'}
  source.content.tasks = [{id:'task',text:'Get logo',owner:'Old owner',dueDate:'2026-10-10',done:true,evidence:'done'}]
  const fresh = pageFromTemplate(source, workspace, 'conversation')
  assert.notEqual(fresh.id, source.id)
  assert.equal(fresh.partner_id, null)
  assert.equal(fresh.content.questions[0].answer,'')
  assert.equal(fresh.content.questions[0].agreement,'')
  assert.equal(fresh.content.questions[0].change,'')
  assert.equal(fresh.content.questions[0].status,'open')
  assert.equal(fresh.content.meeting.participants,'')
  assert.equal(fresh.content.tasks[0].done,false)
  assert.equal(fresh.content.tasks[0].evidence,'')
  assert.equal(fresh.content.tasks[0].dueDate,'')
})
test('irrelevant and hidden questions are not answered; implementation tracks tasks separately', () => {
  const content = onboardingContent()
  content.questions[0] = {...content.questions[0],answer:'Yes',status:'answered'}
  content.questions[1] = {...content.questions[1],status:'irrelevant',reason:'No team'}
  content.questions[2] = {...content.questions[2],hidden:true}
  const progress = pageProgress(content)
  assert.equal(progress.answered,1)
  assert.equal(progress.open,39)
  assert.equal(progress.completedTasks,0)
})
test('partner editor links target the selected partner; unpublished pages have no public URL', () => {
  const links = partnerLinks({id:workspace,name:'Cafe',slug:'cafe',publicSlug:null})
  assert.ok(links.find(l => l.title === 'Deals & Stempelkarte').url.includes(`partner=${workspace}&tab=deals`))
  assert.equal(links.some(l => l.title === 'Öffentliche Partnerseite'),false)
  assert.equal(partnerLinks({id:workspace,name:'Cafe',slug:'cafe',publicSlug:'cafe'}).find(l => l.title==='Öffentliche Partnerseite').url,'https://benefitsi.de/partner/cafe')
})
test('Markdown export includes answers, decisions, tasks and links as text without HTML execution', () => {
  const page = makePage(workspace,'conversation')
  page.content.questions = [{...onboardingContent().questions[0],answer:'Partner answer',agreement:'Agreed'}]
  page.content.links = [{id:'l',title:'Speisekarte',url:'https://example.org/menu.pdf',category:'Datei',note:'Current'}]
  page.content.tasks = [{id:'t',text:'Get logo',owner:'Patrick',dueDate:'',done:false,evidence:''}]
  const output = exportMarkdown(page)
  for (const expected of ['Partner answer','Agreed','https://example.org/menu.pdf','Get logo','Patrick']) assert.ok(output.includes(expected))
})
