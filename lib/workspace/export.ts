import { type WorkspacePage, pageKinds, pageStatuses, questionStatuses, questionAnswer, safeLink } from './model'
const text = (s: string) => s.replace(/</g,'&lt;').replace(/>/g,'&gt;')
export function exportMarkdown(page: WorkspacePage): string {
  const c=page.content
  const lines=[`# ${text(page.title)}`,'',`${pageKinds[page.kind]} · ${pageStatuses[page.status]} · Version ${page.revision}`,`Tags: ${page.tags.map(text).join(', ')}`,`Verantwortlich: ${text(page.owner)}`,`Termin: ${page.due_date??''}`,'']
  if(c.meeting.date||c.meeting.participants)lines.push(`Gespräch: ${text(c.meeting.date)}`,`Teilnehmende: ${text(c.meeting.participants)}`,'')
  for(const b of c.blocks)lines.push(`${b.type==='heading'?'## ':b.type==='todo'?`- [${b.checked?'x':' '}] `:b.type==='bullet'?'- ':b.type==='number'?'1. ':b.type==='callout'?'> ':''}${text(b.text)}`,'')
  for(const q of c.questions) lines.push(`## ${text(q.id)} · ${text(q.prompt)}`,`Thema: ${text(q.section)} · ${questionStatuses[q.status]}${q.hidden?' · Ausgeblendet':''}`,'',...(q.suggestion?[`Gesprächshinweis: ${text(q.suggestion)}`]:[]),`Antwort: ${text(questionAnswer(q))}`,'')
  if(c.links.length)lines.push('## Dateien & Links','')
  for(const l of c.links)lines.push(`- ${text(l.title)}: ${safeLink(l.url)??'(Link noch offen)'} — ${text(l.note)}`)
  if(c.tasks.length)lines.push('','## Nächste Schritte','')
  for(const t of c.tasks)lines.push(`- [${t.done?'x':' '}] ${text(t.text)} — ${text(t.owner)} ${t.dueDate} — ${text(t.evidence)}`)
  if(c.meeting.summary)lines.push('','## Zusammenfassung','',text(c.meeting.summary))
  return lines.join('\n')+'\n'
}
