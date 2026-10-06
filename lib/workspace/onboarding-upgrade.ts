import original from './onboarding-v1.json'
import current from './onboarding.json'
import type { Content, Question } from './model'

export const templateVersion='2026-10-06.2'

/** Upgrade only untouched defaults. IDs, custom wording, answers, order and hidden flags survive. */
export function upgradeOnboarding(content:Content):Content {
  if(content.meeting.templateVersion!=='2026-10-05.1')return content
  const questions=content.questions.map(q=>{
    const before=original.find(v=>v.id===q.id),after=current.find(v=>v.id===q.id)
    if(!before||!after)return q
    return {...q,...Object.fromEntries(['prompt','help','suggestion'].filter(key=>q[key as keyof Question]===before[key as keyof typeof before]).map(key=>[key,after[key as keyof typeof after]]))}
  })
  const additions=current.filter(q=>!original.some(old=>old.id===q.id)&&!questions.some(existing=>existing.id===q.id))
    .map(q=>({...q,answerType:q.answerType as Question['answerType'],answer:'',change:'',agreement:'',status:'open' as const,reason:'',hidden:false}))
  if(questions.length+additions.length>200)return content
  const last=questions.findLastIndex(q=>q.section==='B. Ziele und Besuchsverhalten')
  questions.splice(last<0?questions.length:last+1,0,...additions)
  const originalNote='Für jedes Partnergespräch unter „Weitere Aktionen“ → „Vorlage verwenden“ ein eigenes Gespräch anlegen. Dort den Partner verknüpfen, Termin und Teilnehmende ergänzen und im Bereich „Gespräch“ die passenden Fragen durchgehen. Antworten, Änderungswünsche und Vereinbarungen getrennt festhalten. Über die Partnerlinks die zuständigen Admin-Editoren öffnen; Dokumente unter „Dateien“ verlinken und nächste Schritte unter „Aufgaben“ erfassen. Diese Vorlage enthält bewusst keine Partnerantworten.'
  const blocks=content.blocks.map(block=>block.text===originalNote?{...block,text:block.text.replace('Antworten, Änderungswünsche und Vereinbarungen getrennt festhalten.','Vorbereitete Angaben gemeinsam prüfen; Bestätigungen und Korrekturen im Antwortfeld festhalten.')}:block)
  return {...content,blocks,questions,meeting:{...content.meeting,templateVersion}}
}
