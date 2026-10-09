'use client'
import { useState, type ReactNode } from 'react'
import { translateValue, useAdminLocale } from '@/app/admin-language'
import { choiceOptions, decodeChoiceAnswer, encodeChoiceAnswer, type ChoiceAnswer } from '@/lib/workspace/choice-answers'
import { Field, inputClass } from './ui'
export function ChoiceAnswerEditor({questionId,answer,legacyNotes,help,onChange}:{questionId:string;answer:string;legacyNotes:string;help:ReactNode;onChange:(value:string)=>void}){
  const language = useAdminLocale() === 'de-DE' ? 'de' : 'en'
  const [error,setError]=useState('')
  const value=decodeChoiceAnswer(answer)
  if(legacyNotes&&!value.notes.includes(legacyNotes))value.notes=[value.notes,legacyNotes].filter(Boolean).join('\n\n')
  const update=(next:ChoiceAnswer)=>{try{onChange(encodeChoiceAnswer(next));setError('')}catch(e){setError(e instanceof Error?e.message:'Die Antwort konnte nicht übernommen werden.')}}
  return <fieldset className="min-w-0 space-y-3">
    <legend className="mb-2 text-sm font-semibold">{questionId==='D05'?'Nutzungsregeln festhalten':'Interesse festhalten'}</legend>
    <p className="mb-4 text-xs leading-5 text-[#697680]">{help}</p>
    {choiceOptions[questionId].map(option=>{const state=value.choices[option.id]??{selected:false,note:''};return <div key={option.id} className={`rounded-xl border p-3 ${state.selected?'border-[#118cff]/30 bg-[#f3f8ff]':'border-[#061829]/10'}`}>
      <label className="flex cursor-pointer items-start gap-3"><input aria-label={option.label} className="mt-1 shrink-0" type="checkbox" checked={state.selected} onChange={e=>update({...value,choices:{...value.choices,[option.id]:{...state,selected:e.target.checked}}})}/><span><span className="block text-sm font-semibold">{option.label}</span><span className="mt-1 block text-xs leading-5 text-[#526170]">{option.description}</span></span></label>
      {state.selected?<div className="mt-3"><Field label={`Details · ${translateValue(option.label, language)}`}><textarea aria-label={`Details · ${translateValue(option.label, language)}`} className={inputClass} value={state.note} maxLength={2000} rows={2} placeholder={option.placeholder??'Gewünschter Vorteil, Artikel und wichtige Details'} onChange={e=>update({...value,choices:{...value.choices,[option.id]:{...state,note:e.target.value}}})}/></Field></div>:null}
    </div>})}
    <Field label={`Weitere Gesprächsnotizen · ${questionId}`}><textarea aria-label={`Weitere Gesprächsnotizen · ${questionId}`} className={inputClass} value={value.notes} maxLength={10000} rows={3} onChange={e=>update({...value,notes:e.target.value})} placeholder="Ergänzungen, Rückfragen oder bisherige Antworten"/></Field>
    {error?<p role="alert" className="text-sm text-red-700">{error}</p>:null}
  </fieldset>
}
