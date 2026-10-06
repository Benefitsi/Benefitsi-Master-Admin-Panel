'use client'
import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, ArrowRight } from '@phosphor-icons/react'
import { newId, questionStatuses, type Question, pageProgress, emptyContent } from '@/lib/workspace/model'
import { featureGuides } from '@/lib/workspace/templates'
import { Button, Field, inputClass, moveItem } from './ui'

export function QuestionEditor({questions,onChange}:{questions:Question[];onChange:(questions:Question[])=>void}) {
  const [section,setSection]=useState(questions[0]?.section??'Eigene Fragen')
  const [core,setCore]=useState(false),[open,setOpen]=useState(false),[showHidden,setShowHidden]=useState(false)
  const sections=Array.from(new Set(questions.map(q=>q.section)))
  const current=sections.includes(section)?section:sections[0]
  const visible=questions.filter(q=>(!current||q.section===current)&&(!core||q.core)&&(!open||['open','clarify'].includes(q.status))&&(showHidden||!q.hidden))
  const progress=pageProgress({...emptyContent(),questions})
  const patch=(id:string,changes:Partial<Question>)=>onChange(questions.map(q=>q.id===id?{...q,...changes}:q))
  const nextOpen=()=>{const next=questions.find(q=>!q.hidden&&['open','clarify'].includes(q.status)&&q.section!==current)??questions.find(q=>!q.hidden&&['open','clarify'].includes(q.status));if(next){setSection(next.section);setCore(false);setOpen(true);requestAnimationFrame(()=>document.getElementById(`question-${next.id}`)?.scrollIntoView({block:'start',behavior:'smooth'}))}}
  return <div>
    <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-[#061829]/10 pb-4">
      <p className="mr-auto text-sm"><strong>{progress.answered}</strong> beantwortet <span className="text-[#697680]">· {progress.open} offen · {progress.agreed} vereinbart</span></p>
      <Button onClick={nextOpen} disabled={!progress.open}>Nächste offene Frage<ArrowRight size={16}/></Button>
    </div>
    <div className="mb-5 flex flex-wrap gap-4 text-xs font-medium text-[#526170]">
      <label className="flex items-center gap-2"><input type="checkbox" checked={core} onChange={e=>setCore(e.target.checked)}/>Nur Kernfragen</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={open} onChange={e=>setOpen(e.target.checked)}/>Nur offene Fragen</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={showHidden} onChange={e=>setShowHidden(e.target.checked)}/>Ausgeblendete zeigen</label>
    </div>
    <div className="grid min-w-0 gap-6 xl:grid-cols-[165px_minmax(0,1fr)]">
      <nav aria-label="Gesprächsthemen" className="flex gap-1 overflow-x-auto xl:sticky xl:top-24 xl:block xl:self-start">{sections.map(s=><button key={s} type="button" onClick={()=>setSection(s)} aria-current={current===s?'step':undefined} className={`shrink-0 rounded-lg px-3 py-3 text-left text-xs font-semibold xl:mb-1 xl:w-full ${current===s?'bg-[#edf5fd] text-[#0671d1]':'text-[#526170] hover:bg-zinc-50'}`}>{s}</button>)}</nav>
      <div className="min-w-0 space-y-6">
        {!visible.length?<p className="py-6 text-sm text-[#526170]">Keine Fragen für diese Auswahl. Ändere den Filter oder ergänze eine eigene Frage.</p>:null}
        {visible.map(q=>{const index=questions.findIndex(item=>item.id===q.id);return <section id={`question-${q.id}`} key={q.id} className={`scroll-mt-24 border-b border-[#061829]/10 pb-7 ${q.hidden?'opacity-60':''}`}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#697680]"><span>{q.id.startsWith('custom-')?'Eigene Frage':q.id}</span>{q.core?<span className="rounded bg-[#edf5fd] px-2 py-1 text-[#0671d1]">Kernfrage</span>:null}<span className="ml-auto">{questionStatuses[q.status]}</span></div>
          <h3 className="mb-3 text-base font-bold leading-6">{q.prompt||'Neue Frage'}</h3>
          <details className="mb-4 text-xs text-[#526170]"><summary className="cursor-pointer py-1">Frage anpassen & Hilfe</summary><div className="mt-3 grid gap-3">
            <Field label="Fragetext"><textarea className={inputClass} value={q.prompt} maxLength={2000} onChange={e=>patch(q.id,{prompt:e.target.value})}/></Field>
            <Field label="Thema"><input className={inputClass} value={q.section} maxLength={120} onChange={e=>patch(q.id,{section:e.target.value})}/></Field>
            <Field label="Warum / Eingabehilfe"><textarea className={inputClass} value={q.help} maxLength={4000} onChange={e=>patch(q.id,{help:e.target.value})}/></Field>
            <Field label="Antworttyp"><select className={inputClass} value={q.answerType} onChange={e=>patch(q.id,{answerType:e.target.value as Question['answerType']})}>{Object.entries({text:'Freitext',number:'Zahl',choice:'Auswahl',date:'Datum',url:'Link'}).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
            {q.answerType==='choice'?<Field label="Auswahlmöglichkeiten, eine je Zeile"><textarea className={inputClass} value={q.options.join('\n')} onChange={e=>patch(q.id,{options:e.target.value.split('\n')})}/></Field>:null}
            <Field label="Vorschlag von Benefitsi"><textarea className={inputClass} value={q.suggestion} maxLength={4000} onChange={e=>patch(q.id,{suggestion:e.target.value})}/></Field>
            <label className="flex items-center gap-2"><input type="checkbox" checked={q.core} onChange={e=>patch(q.id,{core:e.target.checked})}/>Kernfrage</label>
            <div className="flex flex-wrap gap-2"><Button disabled={index===0} onClick={()=>onChange(moveItem(questions,index,-1))}><ArrowUp size={14}/>Nach oben</Button><Button disabled={index===questions.length-1} onClick={()=>onChange(moveItem(questions,index,1))}><ArrowDown size={14}/>Nach unten</Button><Button onClick={()=>patch(q.id,{hidden:!q.hidden})}>{q.hidden?'Einblenden':'Ausblenden'}</Button></div>
          </div></details>
          {q.suggestion?<div className="mb-4 border-l-2 border-[#118cff]/40 pl-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-[#0671d1]">Vorschlag · noch nicht vereinbart</p><p className="mt-1 text-sm leading-6 text-[#526170]">{q.suggestion}</p><button type="button" className="mt-2 text-xs font-semibold text-[#0671d1] underline underline-offset-4" onClick={()=>patch(q.id,{agreement:q.suggestion})}>In Vereinbarung übernehmen</button></div>:null}
          <Field label={`Antwort · ${q.id}`} hint={q.help}>
            {q.answerType==='choice'?<select className={inputClass} value={q.answer} onChange={e=>patch(q.id,{answer:e.target.value,status:e.target.value&&q.status==='open'?'answered':q.status})}><option value="">Noch keine Antwort</option>{q.options.map((o,i)=><option key={`${o}-${i}`} value={o}>{o}</option>)}{q.answer&&!q.options.includes(q.answer)?<option value={q.answer}>{q.answer}</option>:null}</select>:q.answerType==='text'?<textarea className={inputClass} value={q.answer} rows={3} maxLength={10000} onChange={e=>patch(q.id,{answer:e.target.value,status:e.target.value&&q.status==='open'?'answered':q.status})} placeholder="Was sagt der Partner?"/>:<input className={inputClass} type={q.answerType==='number'?'number':q.answerType==='date'?'date':'url'} value={q.answer} onChange={e=>patch(q.id,{answer:e.target.value,status:e.target.value&&q.status==='open'?'answered':q.status})}/>}
          </Field>
          <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label={`Änderungswunsch · ${q.id}`}><textarea className={inputClass} value={q.change} maxLength={10000} rows={2} onChange={e=>patch(q.id,{change:e.target.value})} placeholder="Was möchte der Partner anders?"/></Field><Field label={`Vereinbart · ${q.id}`}><textarea className={inputClass} value={q.agreement} maxLength={10000} rows={2} onChange={e=>patch(q.id,{agreement:e.target.value})} placeholder="Gemeinsam festgelegte Fassung"/></Field></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label={`Status · ${q.id}`}><select className={inputClass} value={q.status} onChange={e=>patch(q.id,{status:e.target.value as Question['status']})}>{Object.entries(questionStatuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field><Field label={q.status==='irrelevant'?`Begründung erforderlich · ${q.id}`:`Zusätzliche Notiz · ${q.id}`}><input className={inputClass} value={q.reason} maxLength={10000} onChange={e=>patch(q.id,{reason:e.target.value})}/></Field></div>
        </section>})}
        <Button disabled={questions.length>=200} onClick={()=>{const group=current||'Eigene Fragen';onChange([...questions,{id:`custom-${newId()}`,section:group,prompt:'Eigene Frage',help:'',suggestion:'',answerType:'text',options:[],answer:'',change:'',agreement:'',status:'open',reason:'',core:false,hidden:false}]);setCore(false);setOpen(false)}}><Plus size={16}/>Eigene Frage hinzufügen</Button>
      </div>
    </div>
    <details className="mt-8 rounded-xl bg-[#f7f6f1] p-4"><summary className="cursor-pointer text-sm font-bold">Features im Gespräch erklären</summary><div className="mt-4 grid gap-5 md:grid-cols-2">{featureGuides.map(g=><div key={g.title}><h4 className="text-sm font-bold">{g.title}</h4><p className="mt-1 text-sm leading-6 text-[#526170]">{g.text}</p></div>)}</div><p className="mt-4 text-xs text-[#697680]">Leistungsgrundlage 2026-10-03.1 · Aktuelle Rechte und Preise in „Tarif & Module“ prüfen.</p></details>
  </div>
}
