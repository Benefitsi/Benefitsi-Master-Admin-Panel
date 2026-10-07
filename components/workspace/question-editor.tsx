'use client'
import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, ArrowRight } from '@phosphor-icons/react'
import { newId, questionStatuses, type Question, questionAnswer, answerQuestion, questionWithStatus } from '@/lib/workspace/model'
import type { PartnerBrief } from '@/lib/workspace/partner-brief'
import { choiceOptions } from '@/lib/workspace/choice-answers'
import type { WorkspaceServices } from './services'
import { PartnerDetailsEditor } from './partner-details-editor'
import { ChoiceAnswerEditor } from './choice-answer-editor'
import { featureGuides } from '@/lib/workspace/templates'
import { Button, Field, inputClass, moveItem } from './ui'

type BriefState={brief:PartnerBrief|null;loading:boolean;error:string;refresh:()=>void}
export function QuestionEditor({questions,onChange,partnerId=null,partnerBrief,services,onPartnerEditStateChange,partnerEditKey=0,partnerEditPending=false,canLeavePartnerEdit=()=>true}:{questions:Question[];onChange:(questions:Question[])=>void;partnerId?:string|null;partnerBrief?:BriefState;services?:WorkspaceServices;partnerEditKey?:number;partnerEditPending?:boolean;onPartnerEditStateChange?:(state:{dirty:boolean;busy:boolean})=>void;canLeavePartnerEdit?:()=>boolean}) {
  const [section,setSection]=useState(questions[0]?.section??'Eigene Fragen')
  const [core,setCore]=useState(false),[open,setOpen]=useState(false),[showHidden,setShowHidden]=useState(false)
  const [editing,setEditing]=useState<string|null>(null)
  const matching=questions.filter(q=>(!core||q.core)&&(!open||['open','clarify'].includes(q.status)||q.id===editing||q.id==='A01'&&partnerEditPending)&&(showHidden?q.hidden:!q.hidden))
  const sections=Array.from(new Set(matching.map(q=>q.section)))
  const current=section===''?'':sections.includes(section)?section:sections[0]??''
  const visible=matching.filter(q=>!current||q.section===current)
  const progress={answered:matching.filter(q=>['answered','agreed'].includes(q.status)).length,open:matching.filter(q=>['open','clarify'].includes(q.status)).length}
  const changeView=(change:()=>void)=>{if(canLeavePartnerEdit()){setEditing(null);change()}}
  const patch=(id:string,changes:Partial<Question>)=>{if(id==='A01'&&partnerEditPending&&['section','core','hidden'].some(key=>Object.hasOwn(changes,key))&&!canLeavePartnerEdit())return;onChange(questions.map(q=>q.id===id?{...q,...changes}:q))}
  const answer=(id:string,value:string)=>onChange(questions.map(q=>q.id===id?answerQuestion(q,value):q))
  const nextOpen=()=>{const next=matching.find(q=>['open','clarify'].includes(q.status)&&q.section!==current)??matching.find(q=>['open','clarify'].includes(q.status));if(next)changeView(()=>{setSection(next.section);setOpen(true);window.requestAnimationFrame(()=>document.getElementById(`question-${next.id}`)?.scrollIntoView({block:'start',behavior:'smooth'}))})}
  return <div>
    <div className="mb-6 rounded-xl bg-[#f3f8ff] p-4">
      <div className="flex flex-wrap items-center gap-3"><h3 className="mr-auto text-sm font-bold">Vorbereitete Angaben gemeinsam prüfen</h3>{partnerId?<Button disabled={partnerBrief?.loading} onClick={partnerBrief?.refresh}>Admin-Daten aktualisieren</Button>:null}</div>
      <p className="mt-2 text-sm leading-6 text-[#526170]">{partnerId?'Die Angaben stammen aus der Partnerverwaltung. Prüft die Angaben gemeinsam. Stammdaten lassen sich unter A01 direkt bearbeiten; Antworten und Interessen werden im Gespräch festgehalten.':'Verknüpfe den Partner unter „Partner & Verwaltung“, um die bereits hinterlegten Angaben zu sehen.'}</p>
      {partnerBrief?.loading?<p role="status" className="mt-2 text-xs">Admin-Daten werden geladen …</p>:null}
      {partnerBrief?.error?<p role="alert" className="mt-2 text-sm text-red-700">{partnerBrief.error}</p>:null}
    </div>
    <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-[#061829]/10 pb-4">
      <p className="mr-auto text-sm"><strong>{visible.length} von {questions.length} Fragen</strong> <span className="text-[#697680]">· {progress.answered} geprüft / beantwortet</span> <span className="text-[#697680]">· {progress.open} offen</span></p>
      <Button onClick={nextOpen} disabled={!progress.open}>Nächste offene Frage<ArrowRight size={16}/></Button>
    </div>
    <div className="mb-5 flex flex-wrap gap-4 text-xs font-medium text-[#526170]">
      <label className="flex items-center gap-2"><input type="checkbox" checked={core} onChange={e=>changeView(()=>{setCore(e.target.checked);setSection('')})}/>Nur Kernfragen</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={open} onChange={e=>changeView(()=>{setOpen(e.target.checked);setSection('')})}/>Nur offene Fragen</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={showHidden} onChange={e=>changeView(()=>{setShowHidden(e.target.checked);setSection('')})}/>Nur ausgeblendete Fragen</label>
    </div>
    <div className="grid min-w-0 gap-6 xl:grid-cols-[165px_minmax(0,1fr)]">
      <nav aria-label="Gesprächsthemen" className="flex gap-1 overflow-x-auto xl:sticky xl:top-24 xl:block xl:self-start"><button type="button" onClick={()=>changeView(()=>setSection(''))} aria-current={!current?'step':undefined} className="shrink-0 rounded-lg px-3 py-3 text-left text-xs font-semibold text-[#0671d1] xl:w-full">Alle Themen ({matching.length})</button>{sections.map(s=><button key={s} type="button" onClick={()=>changeView(()=>setSection(s))} aria-current={current===s?'step':undefined} className={`shrink-0 rounded-lg px-3 py-3 text-left text-xs font-semibold xl:mb-1 xl:w-full ${current===s?'bg-[#edf5fd] text-[#0671d1]':'text-[#526170] hover:bg-zinc-50'}`}>{s} ({matching.filter(q=>q.section===s).length})</button>)}</nav>
      <div className="min-w-0 space-y-6">
        {!visible.length?<p className="py-6 text-sm text-[#526170]">Keine Fragen für diese Auswahl. Ändere den Filter oder ergänze eine eigene Frage.</p>:null}
        {visible.map(q=>{const index=questions.findIndex(item=>item.id===q.id),facts=partnerBrief?.brief?.partnerId===partnerId?partnerBrief.brief.facts[q.id]??[]:[],prepared=facts.map(f=>`${f.label}: ${f.value}`).join('\n'),value=questionAnswer(q);return <section id={`question-${q.id}`} key={q.id} onFocusCapture={()=>setEditing(q.id)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setEditing(null)}} className={`scroll-mt-24 border-b border-[#061829]/10 pb-7 ${q.hidden?'opacity-60':''}`}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#697680]"><span>{q.id.startsWith('custom-')?'Eigene Frage':q.id}</span>{q.core?<span className="rounded bg-[#edf5fd] px-2 py-1 text-[#0671d1]">Kernfrage</span>:null}<span className="ml-auto">{questionStatuses[q.status]}</span></div>
          <h3 className="mb-3 text-base font-bold leading-6">{q.prompt||'Neue Frage'}</h3>
          <details className="mb-4 text-xs text-[#526170]"><summary className="cursor-pointer py-1">Frage anpassen & Hilfe</summary><div className="mt-3 grid gap-3">
            <Field label="Fragetext"><textarea className={inputClass} value={q.prompt} maxLength={2000} onChange={e=>patch(q.id,{prompt:e.target.value})}/></Field>
            <Field label="Thema"><input className={inputClass} value={q.section} maxLength={120} onChange={e=>patch(q.id,{section:e.target.value})}/></Field>
            <Field label="Warum / Eingabehilfe"><textarea className={inputClass} value={q.help} maxLength={4000} onChange={e=>patch(q.id,{help:e.target.value})}/></Field>
            <Field label="Antworttyp"><select className={inputClass} value={q.answerType} onChange={e=>patch(q.id,{answerType:e.target.value as Question['answerType']})}>{Object.entries({text:'Freitext',number:'Zahl',choice:'Auswahl',date:'Datum',url:'Link'}).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
            {q.answerType==='choice'?<Field label="Auswahlmöglichkeiten, eine je Zeile"><textarea className={inputClass} value={q.options.join('\n')} onChange={e=>patch(q.id,{options:e.target.value.split('\n')})}/></Field>:null}
            <Field label="Eigener Gesprächshinweis"><textarea className={inputClass} value={q.suggestion} maxLength={4000} onChange={e=>patch(q.id,{suggestion:e.target.value})}/></Field>
            <label className="flex items-center gap-2"><input type="checkbox" checked={q.core} onChange={e=>patch(q.id,{core:e.target.checked})}/>Kernfrage</label>
            <div className="flex flex-wrap gap-2"><Button disabled={index===0} onClick={()=>onChange(moveItem(questions,index,-1))}><ArrowUp size={14}/>Nach oben</Button><Button disabled={index===questions.length-1} onClick={()=>onChange(moveItem(questions,index,1))}><ArrowDown size={14}/>Nach unten</Button><Button onClick={()=>changeView(()=>patch(q.id,{hidden:!q.hidden}))}>{q.hidden?'Einblenden':'Ausblenden'}</Button></div>
          </div></details>
          {q.id==='E01'&&facts.length?<div className="mb-4">{facts.map(fact=><a key={fact.href} href={fact.href} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#0671d1] underline underline-offset-4">{fact.label} ↗</a>)}</div>:facts.length?<div className="mb-4 rounded-xl border border-[#118cff]/20 bg-[#f3f8ff] p-4"><p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#0671d1]">Im Admin hinterlegt · gemeinsam prüfen</p><dl className="space-y-3">{facts.map((fact,i)=><div key={`${fact.label}-${i}`}><dt className="text-xs font-semibold text-[#526170]">{fact.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{fact.value}</dd></div>)}</dl><div className="mt-3 flex flex-wrap items-center gap-3">{!choiceOptions[q.id]?<Button disabled={Boolean(value.trim())||prepared.length>10000} onClick={()=>onChange(questions.map(item=>item.id===q.id?{...answerQuestion(item,prepared),status:'agreed'}:item))}>Stimmt so</Button>:null}{q.id!=='A01'?<a href={facts[0].href} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#0671d1] underline underline-offset-4">Angebote / Inhalte verwalten ↗</a>:null}</div>{value.trim()?<p className="mt-2 text-xs text-[#697680]">Deine Antwort bleibt beim Aktualisieren der Admin-Daten erhalten.</p>:prepared.length>10000?<p className="mt-2 text-xs text-[#697680]">Bitte den umfangreichen Stand in der Antwort kurz zusammenfassen.</p>:null}</div>:null}
          {q.id==='A01'&&partnerId&&services&&onPartnerEditStateChange?<details className="mb-5 rounded-xl border border-[#061829]/15 p-4"><summary className="cursor-pointer text-sm font-semibold text-[#0671d1]">Angaben hier bearbeiten</summary><div className="mt-4"><PartnerDetailsEditor key={partnerEditKey} partnerId={partnerId} services={services} onDirtyChange={onPartnerEditStateChange} onSaved={()=>partnerBrief?.refresh()}/></div></details>:null}
          {!facts.length&&partnerBrief?.brief&&['A01','C01','D01','E01','E02','E04','F02','F07','G01'].includes(q.id)?<p className="mb-4 text-xs leading-5 text-[#697680]">Für diesen Punkt sind keine Angaben hinterlegt. Gemeinsam klären.</p>:null}
          {q.suggestion?<p className="mb-4 whitespace-pre-wrap text-sm leading-6 text-[#526170]"><strong>Gesprächshinweis: </strong>{q.suggestion}</p>:null}
          {choiceOptions[q.id]?<ChoiceAnswerEditor questionId={q.id} answer={q.answer} legacyNotes={questionAnswer({...q,answer:'',reason:q.reason===q.answer?'':q.reason})} help={q.help} onChange={value=>answer(q.id,value)}/>:<Field label={`Antwort · ${q.id}`} hint={q.status==='irrelevant'?'Bitte kurz begründen, warum dieser Punkt nicht relevant ist.':q.help}>
            <textarea className={inputClass} value={value} rows={3} maxLength={10000} onChange={e=>answer(q.id,e.target.value)} placeholder={facts.length?'Bestätigung, Korrektur oder Ergänzung des Partners':'Was sagt der Partner?'} />
          </Field>}
          <div className="mt-4 max-w-xs"><Field label={`Status · ${q.id}`}><select className={inputClass} value={q.status} onChange={e=>onChange(questions.map(item=>item.id===q.id?questionWithStatus(item,e.target.value as Question['status']):item))}>{Object.entries(questionStatuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field></div>
        </section>})}
        <Button disabled={questions.length>=200} onClick={()=>changeView(()=>{const group=current||'Eigene Fragen';onChange([...questions,{id:`custom-${newId()}`,section:group,prompt:'Eigene Frage',help:'',suggestion:'',answerType:'text',options:[],answer:'',change:'',agreement:'',status:'open',reason:'',core:false,hidden:false}]);setSection(group);setCore(false);setOpen(false);setShowHidden(false)})}><Plus size={16}/>Eigene Frage hinzufügen</Button>
      </div>
    </div>
    <details className="mt-8 rounded-xl bg-[#f7f6f1] p-4"><summary className="cursor-pointer text-sm font-bold">Features im Gespräch erklären</summary><div className="mt-4 grid gap-5 md:grid-cols-2">{featureGuides.map(g=><div key={g.title}><h4 className="text-sm font-bold">{g.title}</h4><p className="mt-1 text-sm leading-6 text-[#526170]">{g.text}</p></div>)}</div><p className="mt-4 text-xs text-[#697680]">Leistungsgrundlage 2026-10-03.1 · Aktuelle Rechte und Preise in „Tarif & Module“ prüfen.</p></details>
  </div>
}
