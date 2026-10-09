'use client'
import { useEffect, useState } from 'react'
import { ArrowSquareOut } from '@phosphor-icons/react'
import { partnerLinks, type PartnerReference } from '@/lib/workspace/model'
import type { WorkspaceServices } from './services'
import { Button, Field, inputClass } from './ui'

export function PartnerContext({partnerId,onChange,services,preparedName}:{partnerId:string|null;onChange:(id:string|null)=>void|boolean;services:WorkspaceServices;preparedName?:string}){
  const [loadedPartner,setPartner]=useState<PartnerReference|null>(null),[query,setQuery]=useState(''),[options,setOptions]=useState<PartnerReference[]>([]),[error,setError]=useState(''),[choosing,setChoosing]=useState(!partnerId),[loading,setLoading]=useState(false)
  const partner=loadedPartner?.id===partnerId?loadedPartner:null
  useEffect(()=>{let active=true;if(partnerId){services.findWorkspacePartners('',partnerId).then(result=>{if(active){if(result.ok){setPartner(result.value[0]??null);setError(result.value.length?'':'Der verknüpfte Partner ist nicht mehr verfügbar.')}else setError(result.error)}}).catch(()=>{if(active)setError('Partner konnte nicht geladen werden.')})}return()=>{active=false}},[partnerId,services])
  useEffect(()=>{if(!choosing)return;let active=true;const timer=setTimeout(()=>{setLoading(true);services.findWorkspacePartners(query).then(result=>{if(active){if(result.ok){setOptions(result.value);setError('')}else setError(result.error)}}).catch(()=>{if(active)setError('Partnersuche fehlgeschlagen.')}).finally(()=>{if(active)setLoading(false)})},250);return()=>{active=false;clearTimeout(timer)}},[query,choosing,services])
  return <aside className="min-w-0 rounded-xl bg-[#f7f6f1] p-4">
    <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#697680]">Partner & Verwaltung</p>
    <h3 className="mt-2 break-words text-base font-bold">{preparedName??partner?.name?<span data-admin-i18n-ignore="true">{preparedName??partner?.name}</span>:(partnerId?'Partner wird geladen …':'Noch nicht verknüpft')}</h3>
    {partner?<><p className="mt-2 text-xs leading-5 text-[#526170]">Stammdaten unter A01 direkt bearbeiten. Weitere Bereiche hier öffnen.</p><div className="mt-4 grid gap-1">{partnerLinks(partner).map(l=><a key={l.title} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-lg py-2 text-xs font-semibold text-[#0671d1] hover:underline">{l.title}<ArrowSquareOut className="shrink-0" size={14}/></a>)}</div>{!partner.publicSlug?<p className="mt-3 text-xs leading-5 text-[#697680]">Öffentliche Seite noch nicht bestätigt. Die Microsite lässt sich über den Admin prüfen.</p>:null}</>:null}
    <Button className="mt-4 w-full text-xs" onClick={()=>setChoosing(v=>!v)}>{choosing?'Auswahl schließen':partnerId?'Partner wechseln':'Partner verknüpfen'}</Button>
    {choosing?<div className="mt-4 space-y-3"><Field label="Partner suchen"><input className={inputClass} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name des Betriebs"/></Field>{loading?<p role="status" className="text-xs">Suche …</p>:null}<div className="max-h-56 overflow-y-auto">{options.map(p=><button type="button" key={p.id} className="block w-full rounded px-2 py-2 text-left text-xs hover:bg-white" onClick={()=>{if(onChange(p.id)===false)return;setPartner(p);setChoosing(false)}}><span data-admin-i18n-ignore="true">{p.name}</span></button>)}</div>{!loading&&!options.length?<p className="text-xs text-[#697680]">Kein Partner gefunden. Die Akte kann vorerst ohne Verknüpfung bleiben.</p>:null}{options.length===50?<p className="text-xs">Erste 50 Treffer. Bitte die Suche eingrenzen.</p>:null}{partnerId?<Button className="w-full text-xs" onClick={()=>{if(onChange(null)===false)return;setPartner(null);setChoosing(false)}}>Verknüpfung lösen</Button>:null}</div>:null}
    {error?<p role="alert" className="mt-3 text-xs text-red-700">{error}</p>:null}
  </aside>
}
