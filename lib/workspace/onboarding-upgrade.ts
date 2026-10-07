import original from './onboarding-v1.json'
import previous from './onboarding-v2.json'
import current from './onboarding.json'
import type { Block, Content, Question } from './model'

export const templateVersion='2026-10-07.3'
const v1='2026-10-05.1',v2='2026-10-06.2'
type DefaultQuestion = typeof previous[number]
const fields=['section','prompt','help','suggestion','answerType','options','core'] as const
type DefaultField = typeof fields[number]
const answerFields=['answer','change','agreement','reason'] as const
const combined:Record<string,string[]>={A01:['A01','A02','A03','A04'],C01:['C01','C02','C04'],D01:['D01','D02','D03'],G04:['G04','E05']}
const removed=new Set(['A02','A03','A04','A05','C02','C04','C05','C06','C07','D02','D03','D04','D06','D07','D08','E05','F04'])
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
const hasAnswer=(q:Question)=>answerFields.some(field=>q[field].length>0)
function fresh(q:DefaultQuestion):Question {
  return {...q,options:[...q.options],answerType:q.answerType as Question['answerType'],answer:'',change:'',agreement:'',reason:'',status:'open',hidden:false}
}
function updateDefaults(q:Question,before:DefaultQuestion|undefined,after:DefaultQuestion|undefined,custom?:ReadonlySet<DefaultField>):Question {
  if(!before||!after)return q
  return {...q,...Object.fromEntries(fields.filter(field=>!custom?.has(field)&&equal(q[field],before[field])).map(field=>[field,after[field]]))}
}
function addMissing(questions:Question[],catalog:DefaultQuestion[],ids:string[]):Question[] {
  const result=[...questions]
  for(const id of ids) {
    const q=catalog.find(value=>value.id===id)
    if(!q||result.some(value=>value.id===id))continue
    const last=result.findLastIndex(value=>value.section===q.section)
    result.splice(last<0?result.length:last+1,0,fresh(q))
  }
  return result
}
function archiveText(q:Question):string {
  const labels={answer:'Antwort',change:'Partnerwunsch',agreement:'Vereinbarung',reason:'Begründung'}
  return [`Frühere Frage ${q.id} · ${q.section}`,`Frage: ${q.prompt}`,q.help&&`Hilfe: ${q.help}`,q.suggestion&&`Vorschlag: ${q.suggestion}`,
    q.options.length&&`Optionen: ${q.options.join(' · ')}`,`Antworttyp: ${q.answerType} · Kernfrage: ${q.core?'Ja':'Nein'}`,
    `Status: ${q.status} · Ausgeblendet: ${q.hidden?'Ja':'Nein'}`,...answerFields.filter(field=>q[field].length>0).map(field=>`${labels[field]}:\n${q[field]}`)].filter(Boolean).join('\n\n')+'\n\n'
}
function fits(content:Content):boolean {
  return content.questions.length<=200&&content.blocks.length<=500&&content.blocks.every(b=>b.text.length<=20000)
    &&content.questions.every(q=>answerFields.every(field=>q[field].length<=10000))
    &&new TextEncoder().encode(JSON.stringify(content)).length<=512*1024
}

/** Upgrade known defaults atomically. Bespoke wording and every legacy answer survive. */
export function upgradeOnboarding(content:Content):Content {
  if(![v1,v2].includes(content.meeting.templateVersion))return content
  // Detect customization against the source version once. A bespoke v1 value
  // may equal a v2 default without becoming eligible for a later replacement.
  const sourceCatalog=content.meeting.templateVersion===v1?original:previous
  const customFields=new Map(content.questions.map(q=>{
    const before=sourceCatalog.find(value=>value.id===q.id)
    return [q.id,new Set(fields.filter(field=>!before||!equal(q[field],before[field])))] as const
  }))
  let questions=content.questions
  let blocks=[...content.blocks]
  if(content.meeting.templateVersion===v1) {
    questions=questions.map(q=>updateDefaults(q,original.find(value=>value.id===q.id),previous.find(value=>value.id===q.id),customFields.get(q.id)))
    questions=addMissing(questions,previous,previous.filter(q=>!original.some(old=>old.id===q.id)).map(q=>q.id))
    const originalNote='Für jedes Partnergespräch unter „Weitere Aktionen“ → „Vorlage verwenden“ ein eigenes Gespräch anlegen. Dort den Partner verknüpfen, Termin und Teilnehmende ergänzen und im Bereich „Gespräch“ die passenden Fragen durchgehen. Antworten, Änderungswünsche und Vereinbarungen getrennt festhalten. Über die Partnerlinks die zuständigen Admin-Editoren öffnen; Dokumente unter „Dateien“ verlinken und nächste Schritte unter „Aufgaben“ erfassen. Diese Vorlage enthält bewusst keine Partnerantworten.'
    blocks=blocks.map(block=>block.text===originalNote?{...block,text:block.text.replace('Antworten, Änderungswünsche und Vereinbarungen getrennt festhalten.','Vorbereitete Angaben gemeinsam prüfen; Bestätigungen und Korrekturen im Antwortfeld festhalten.')}:block)
  }
  const archived=new Set<string>()
  const archive=(q:Question)=>{
    if(archived.has(q.id))return
    archived.add(q.id)
    const text=archiveText(q)
    for(let offset=0,index=0;offset<text.length;offset+=20000,index++) {
      let id=`onboarding-v3-${q.id}-${index}`
      while(blocks.some(block=>block.id===id))id+='-'
      if(id.length>100)return false
      blocks.push({id,type:'paragraph',text:text.slice(offset,offset+20000),checked:false} satisfies Block)
    }
    return true
  }
  let safe=true
  const result=questions.filter(q=>!removed.has(q.id)).map(q=>{
    let updated=updateDefaults(q,previous.find(value=>value.id===q.id),current.find(value=>value.id===q.id),customFields.get(q.id))
    const ids=combined[q.id]
    if(!ids)return updated
    const sources=ids.flatMap(id=>questions.filter(value=>value.id===id))
    // A sole retained answer needs no reformatting or duplicate history.
    if(!sources.some(source=>source.id!==q.id&&hasAnswer(source)))return updated
    const values=new Set<string>()
    const answer=sources.map(source=>{
      const unique=answerFields.map(field=>source[field]).filter(value=>value.length>0&&!values.has(value)&&(values.add(value),true))
      return unique.length?`${source.id}\n${unique.join('\n\n')}`:''
    }).filter(Boolean).join('\n\n')
    if(answer.length<=10000) {
      updated={...updated,answer,change:'',agreement:'',reason:q.status==='irrelevant'?q.reason:''}
    } else {
      for(const source of sources.filter(hasAnswer))if(archive(source)===false)safe=false
    }
    return updated
  })
  for(const q of questions.filter(q=>removed.has(q.id))) {
    // Deleted answers, bespoke wording, and meaningful historical flags need a record.
    if(hasAnswer(q)||customFields.get(q.id)?.size||q.hidden||q.status!=='open')if(archive(q)===false)safe=false
  }
  questions=addMissing(result,current,current.filter(q=>!previous.some(old=>old.id===q.id)).map(q=>q.id))
  const upgraded={...content,blocks,questions,meeting:{...content.meeting,templateVersion}}
  return safe&&fits(upgraded)?upgraded:content
}
