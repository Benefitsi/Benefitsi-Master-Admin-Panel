import { canonicalPartnerSlug } from '../partner-paths'
import { upgradeOnboarding } from './onboarding-upgrade'

export const pageKinds = { note: 'Notiz', idea: 'Idee', partner: 'Partnerakte', conversation: 'Gespräch', template: 'Vorlage' } as const
export const pageStatuses = { open: 'Offen', active: 'In Arbeit', blocked: 'Zu klären', done: 'Abgeschlossen' } as const
export const questionStatuses = { open: 'Offen', answered: 'Beantwortet', clarify: 'Zu klären', agreed: 'Bestätigt', irrelevant: 'Nicht relevant' } as const
export type PageKind = keyof typeof pageKinds
export type PageStatus = keyof typeof pageStatuses
export type Block = { id: string; type: 'paragraph'|'heading'|'bullet'|'number'|'todo'|'callout'; text: string; checked: boolean }
export type Question = { id: string; section: string; prompt: string; help: string; suggestion: string; answerType: 'text'|'number'|'choice'|'date'|'url'; options: string[]; answer: string; change: string; agreement: string; status: keyof typeof questionStatuses; reason: string; core: boolean; hidden: boolean }
export type ResourceLink = { id: string; title: string; url: string; category: string; note: string }
export type WorkspaceTask = { id: string; text: string; owner: string; dueDate: string; done: boolean; evidence: string }
export type Content = { blocks: Block[]; questions: Question[]; links: ResourceLink[]; tasks: WorkspaceTask[]; meeting: {date: string; participants: string; summary: string; templateVersion: string} }
export type Workspace = { id: string; title: string; description: string; revision: number; archived: boolean; created_at: string; updated_at: string }
export type PageMeta = { id: string; workspace_id: string; parent_id: string|null; partner_id: string|null; kind: PageKind; title: string; status: PageStatus; tags: string[]; owner: string; due_date: string|null; revision: number; archived: boolean; created_at: string; updated_at: string }
export type WorkspacePage = PageMeta & { content: Content }
export type PartnerReference = { id: string; name: string; slug: string|null; publicSlug: string|null }
export type PageVersion = { revision: number; created_at: string; snapshot: WorkspacePage }
export type ActionResult<T> = {ok: true; value: T} | {ok: false; error: string; conflict?: WorkspacePage}

export const newId = () => crypto.randomUUID()
// Old documents keep their original fields on disk until the answer is edited.
// Rendering and exports combine them without truncation or discarding earlier notes.
export function questionAnswer(q:Question):string {
  return [...new Set([q.answer,q.change,q.agreement,q.reason].filter(value=>value.trim()))].join('\n\n')
}
export function answerQuestion(q:Question,answer:string):Question {
  return {...q,answer,change:'',agreement:'',reason:q.status==='irrelevant'?answer:'',status:answer&&q.status==='open'?'answered':q.status}
}
export function questionWithStatus(q:Question,status:Question['status']):Question {
  const answer=questionAnswer(q)
  if(answer.length<=10000)return {...answerQuestion(q,answer),status,reason:status==='irrelevant'?answer:''}
  // Older fields can each contain 10,000 characters. Status-only changes must
  // preserve that larger historical record while retaining the wire limits.
  return {...q,status,reason:status==='irrelevant'?([q.reason,q.answer,q.change,q.agreement].find(value=>value.trim())??''):q.reason}
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validId(value: unknown): value is string { return typeof value === 'string' && uuidPattern.test(value) }
export function safeLink(value: string): string|null {
  try {
    const url = new URL(value)
    return ['https:','http:'].includes(url.protocol) && !url.username && !url.password && !/[\u0000-\u001f\\]/.test(value) ? url.href : null
  } catch { return null }
}
export function emptyContent(): Content { return {blocks:[],questions:[],links:[],tasks:[],meeting:{date:'',participants:'',summary:'',templateVersion:''}} }
export function makePage(workspace_id: string, kind: PageKind, parent?: PageMeta): WorkspacePage {
  const names = {note:'Neue Notiz',idea:'Neue Idee',partner:'Neue Partnerakte',conversation:'Onboarding-Gespräch',template:'Neue Vorlage'}
  return {id:newId(),workspace_id,parent_id:parent?.id??null,partner_id:parent?.partner_id??null,kind,title:names[kind],status:'open',tags:[],owner:'',due_date:null,content:emptyContent(),revision:0,archived:false,created_at:'',updated_at:''}
}
export function pageFromTemplate(source: WorkspacePage, workspaceId: string, kind: PageKind): WorkspacePage {
  const content = structuredClone(source.content)
  content.questions = content.questions.map(q => ({...q,answer:'',change:'',agreement:'',status:'open',reason:''}))
  content.meeting = {...content.meeting,date:'',participants:'',summary:''}
  content.blocks = content.blocks.map(b => ({...b,checked:false}))
  content.tasks = content.tasks.map(t => ({...t,owner:'',dueDate:'',done:false,evidence:''}))
  content.links = []
  return {...makePage(workspaceId,kind),title:source.title,content,tags:[...source.tags]}
}
export function pageProgress(content: Content) {
  return {answered:content.questions.filter(q => !q.hidden && ['answered','agreed'].includes(q.status)).length,
    open:content.questions.filter(q => !q.hidden && ['open','clarify'].includes(q.status)).length,
    agreed:content.questions.filter(q => !q.hidden && q.status==='agreed').length,
    completedTasks:content.tasks.filter(t => t.done).length,totalTasks:content.tasks.length}
}
export function partnerLinks(partner: PartnerReference) {
  const path = `/partners?partner=${encodeURIComponent(partner.id)}`
  const links = [
    {title:'Partnerdetails',url:`${path}&tab=details`}, {title:'Deals & Stempelkarte',url:`${path}&tab=deals`},
    {title:'Menü & Leistungen',url:`${path}&tab=menu`}, {title:'Team & Zugänge',url:`${path}&tab=access`},
    {title:'Besuche & Einlösungen',url:`${path}&tab=activity`}, {title:'Tarif & Module',url:`${path}&tab=plan`},
    {title:'Microsite bearbeiten',url:`${path}&view=microsite`},
  ]
  if(partner.publicSlug) links.unshift({title:'Öffentliche Partnerseite',url:`https://benefitsi.de/partner/${encodeURIComponent(canonicalPartnerSlug(partner.publicSlug))}`})
  return links
}
function object(input: unknown, label: string): Record<string, unknown> {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error(`${label} ist ungültig.`)
  return input as Record<string,unknown>
}
function str(value: unknown, label: string, max=10000): string {
  if(typeof value!=='string' || value.length>max) throw new Error(`${label}: maximal ${max} Zeichen.`)
  return value
}
function flag(value: unknown, label: string): boolean { if(typeof value!=='boolean') throw new Error(`${label} ist ungültig.`); return value }
function list(value: unknown, label: string, max: number): unknown[] { if(!Array.isArray(value)||value.length>max) throw new Error(`${label}: maximal ${max} Einträge.`);return value }
function choice<T extends string>(value: unknown, values: readonly T[], label: string): T { if(!values.includes(value as T)) throw new Error(`${label} ist ungültig.`);return value as T }
function id(value: unknown, label: string): string { if(!validId(value)) throw new Error(`${label} ist ungültig.`);return value }
function date(value: unknown, label: string): string {
  const text=str(value,label,40)
  if(text && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0,10)!==text)) throw new Error(`${label} ist ungültig.`)
  return text
}
export function validateContent(input: unknown): Content {
  const c=object(input,'Inhalt'), m=object(c.meeting,'Gespräch')
  const content:Content = {
    blocks:list(c.blocks,'Blöcke',500).map(v=>{const b=object(v,'Block');return {id:str(b.id,'Block-ID',100),type:choice(b.type,['paragraph','heading','bullet','number','todo','callout'],'Blocktyp'),text:str(b.text,'Notiz',20000),checked:flag(b.checked,'Checkliste')}}),
    questions:list(c.questions,'Fragen',200).map(v=>{const q=object(v,'Frage'); const status=choice(q.status,Object.keys(questionStatuses) as (keyof typeof questionStatuses)[],'Fragenstatus');const reason=str(q.reason,'Begründung');if(status==='irrelevant'&&!reason.trim())throw new Error('Bitte begründe „Nicht relevant“.');return {id:str(q.id,'Fragen-ID',100),section:str(q.section,'Thema',120),prompt:str(q.prompt,'Frage',2000),help:str(q.help,'Hilfe',4000),suggestion:str(q.suggestion,'Vorschlag',4000),answerType:choice(q.answerType,['text','number','choice','date','url'],'Antworttyp'),options:list(q.options,'Antwortoptionen',30).map(x=>str(x,'Option',200)),answer:str(q.answer,'Antwort'),change:str(q.change,'Partnerwunsch'),agreement:str(q.agreement,'Vereinbarung'),status,reason,core:flag(q.core,'Kernfrage'),hidden:flag(q.hidden,'Ausgeblendet')}}),
    links:list(c.links,'Links',100).map(v=>{const l=object(v,'Link');const raw=str(l.url,'URL',4000),url=raw?safeLink(raw):'';if(url===null)throw new Error('Dateilinks benötigen eine gültige HTTP(S)-Adresse ohne Zugangsdaten.');return {id:str(l.id,'Link-ID',100),title:str(l.title,'Linktitel',200),url:str(url,'URL',4000),category:str(l.category,'Kategorie',100),note:str(l.note,'Linknotiz',4000)}}),
    tasks:list(c.tasks,'Aufgaben',200).map(v=>{const t=object(v,'Aufgabe');return {id:str(t.id,'Aufgaben-ID',100),text:str(t.text,'Aufgabe',2000),owner:str(t.owner,'Zuständigkeit',200),dueDate:date(t.dueDate,'Aufgabentermin'),done:flag(t.done,'Erledigt'),evidence:str(t.evidence,'Nachweis',4000)}}),
    meeting:{date:str(m.date,'Gesprächsdatum',40),participants:str(m.participants,'Teilnehmende',2000),summary:str(m.summary,'Zusammenfassung',20000),templateVersion:str(m.templateVersion,'Vorlagenversion',100)},
  }
  for(const entries of [content.blocks,content.questions,content.links,content.tasks]) if(entries.some(x=>!x.id) || new Set(entries.map(x=>x.id)).size!==entries.length) throw new Error('Inhalt enthält doppelte oder fehlende IDs.')
  if(new TextEncoder().encode(JSON.stringify(content)).length>512*1024)throw new Error('Die Seite ist zu groß. Bitte teile sie in Unterseiten auf.')
  return upgradeOnboarding(content)
}
export function validatePage(input: unknown): WorkspacePage {
  const p=object(input,'Seite'), title=str(p.title,'Titel',200).trim()
  if(!title)throw new Error('Bitte gib einen Titel ein.')
  if(!Number.isInteger(p.revision) || Number(p.revision)<0)throw new Error('Seitenversion ist ungültig.')
  return {id:id(p.id,'Seite'),workspace_id:id(p.workspace_id,'Arbeitsbereich'),parent_id:p.parent_id===null?null:id(p.parent_id,'Übergeordnete Seite'),partner_id:p.partner_id===null?null:id(p.partner_id,'Partner'),kind:choice(p.kind,Object.keys(pageKinds) as PageKind[],'Seitentyp'),title,status:choice(p.status,Object.keys(pageStatuses) as PageStatus[],'Status'),tags:[...new Set(list(p.tags,'Tags',20).map(x=>str(x,'Tag',60).trim()).filter(Boolean))],owner:str(p.owner,'Zuständigkeit',200),due_date:p.due_date===null?null:date(p.due_date,'Termin')||null,revision:Number(p.revision),archived:flag(p.archived,'Archivierung'),content:validateContent(p.content),created_at:typeof p.created_at==='string'?p.created_at:'',updated_at:typeof p.updated_at==='string'?p.updated_at:''}
}
export function pagePayload(page: WorkspacePage) {
  const {workspace_id,parent_id,partner_id,kind,title,status,tags,owner,due_date,content,archived}=validatePage(page)
  return {workspace_id,parent_id,partner_id,kind,title,status,tags,owner,due_date,content,archived}
}
export function pageFingerprint(page: WorkspacePage) { const {revision,created_at,updated_at,...draft}=page;void revision;void created_at;void updated_at;return JSON.stringify(draft) }
