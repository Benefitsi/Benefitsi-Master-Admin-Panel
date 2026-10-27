'use client'

import {useEffect, useRef, useState, useSyncExternalStore} from 'react'
import {
  acquisitionStatuses, acquisitionMetrics, filterAcquisitionRows, berlinDate, lastContactDate,
  type AcquisitionIndex, type AcquisitionDocument, type AcquisitionTarget,
} from '../../lib/acquisition/model'
import type {ActionResult} from '../../lib/workspace/model'
import {acquisitionServices, type AcquisitionServices} from './services'
import {readAcquisitionDraftRecovery, serverAcquisitionDraftRecovery, subscribeAcquisitionDraftRecovery, retainAcquisitionDraftRecovery, type AcquisitionDraftRecovery} from './draft-recovery'
import {AcquisitionEditor, acquisitionButton, acquisitionPrimaryButton, acquisitionInput} from './acquisition-editor'

export function AcquisitionApp({initial, services = acquisitionServices, today = berlinDate()}: {
  initial: ActionResult<AcquisitionIndex>
  services?: AcquisitionServices
  today?: string
}) {
  const retainedDraft = useSyncExternalStore(subscribeAcquisitionDraftRecovery, readAcquisitionDraftRecovery, serverAcquisitionDraftRecovery)
  const [restoredDraft, setRestoredDraft] = useState<AcquisitionDraftRecovery | null>(null)
  const [index, setIndex] = useState<AcquisitionIndex>(initial.ok ? initial.value : {rows:[],workspaces:[]})
  const [error, setError] = useState(initial.ok ? '' : initial.error)
  const [loading, setLoading] = useState(false)
  const [settingUp, setSettingUp] = useState(false)
  const [document, setDocument] = useState<AcquisitionDocument | null>(null)
  const [workspaceId, setWorkspaceId] = useState(initial.ok ? initial.value.workspaces.find(w=>!w.archived)?.id ?? '' : '')
  const [filters, setFilters] = useState({query:'',city:'',industry:'',status:''})
  const request = useRef(0)
  const mounted = useRef(true)
  const setupBusy = useRef(false)
  const setupId = useRef<string | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {mounted.current = false}
  }, [])
  const activeWorkspaces = index.workspaces.filter(workspace=>!workspace.archived)
  const rows = filterAcquisitionRows(index.rows, filters)
  const metrics = acquisitionMetrics(rows, today)

  async function open(target: AcquisitionTarget) {
    const token = ++request.current
    setLoading(true); setError('')
    try {
      const result = await services.loadAcquisitionDocument(target)
      if (!mounted.current || token!==request.current) return
      if (!result.ok) {setError(result.error); return}
      setRestoredDraft(null); setDocument(result.value)
    } catch { if (mounted.current && token===request.current) setError('Die Akquiseakte konnte nicht geladen werden. Bitte erneut versuchen.') }
    finally { if (mounted.current && token===request.current) setLoading(false) }
  }
  async function refresh() {
    const token = ++request.current
    setLoading(true); setError('')
    try {
      const result = await services.loadAcquisitionIndex()
      if (!mounted.current || token!==request.current) return
      if (!result.ok) {setError(result.error); return}
      setIndex(result.value)
      setWorkspaceId(current=>result.value.workspaces.some(w=>!w.archived && w.id===current) ? current : result.value.workspaces.find(w=>!w.archived)?.id ?? '')
    } catch { if (mounted.current && token===request.current) setError('Die Übersicht konnte nicht geladen werden. Bitte erneut versuchen.') }
    finally { if (mounted.current && token===request.current) setLoading(false) }
  }
  async function setup() {
    if (setupBusy.current) return
    setupBusy.current = true; setSettingUp(true); setError('')
    try {
      setupId.current ??= crypto.randomUUID()
      const result = await services.createAcquisitionWorkspace(setupId.current)
      if (!mounted.current) return
      if (!result.ok) {setError(result.error); return}
      setIndex(current=>({...current,workspaces:[...current.workspaces.filter(w=>w.id!==result.value.id),result.value]}))
      setWorkspaceId(result.value.id)
    } catch { if (mounted.current) setError('Arbeitsbereich konnte nicht eingerichtet werden. Bitte erneut versuchen.') }
    finally { setupBusy.current = false; if (mounted.current) setSettingUp(false) }
  }
  function saved(doc: AcquisitionDocument) {
    setIndex(current=>{
      const previous = current.rows.find(row=>row.pageId===doc.page.id || (!row.pageId && row.partnerId && row.partnerId===doc.page.partner_id))
      const row = {key:`page:${doc.page.id}`,pageId:doc.page.id,partnerId:doc.page.partner_id,fields:{...doc.fields},lastContactDate:lastContactDate(doc.contacts)}
      // The index's current partner projection keeps precedence for linked records.
      if (previous?.partnerId) for (const key of ['name','city','industry'] as const) if (previous.fields[key]) row.fields[key]=previous.fields[key]
      return {...current,rows:previous ? current.rows.map(item=>item===previous ? row : item) : [...current.rows,row]}
    })
  }
  if (document) return <AcquisitionEditor key={document.page.id} document={document} recovery={restoredDraft} services={services} today={today} onBack={()=>{request.current++;setDocument(null);setRestoredDraft(null);setError('')}} onSaved={saved}/>

  if (retainedDraft) return <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-label="Entwurf wiederherstellen">
    <h2 className="text-lg font-bold">Ungespeicherter Akquiseentwurf</h2>
    <p className="break-words text-sm">Für {retainedDraft.document.fields.name || 'einen neuen Interessenten'} ist in diesem Tab noch ein Entwurf vorhanden. Beim Verlaufwechsel konnte dieser Browser die Navigation nicht anhalten.</p>
    <p className="text-sm">Du kannst Felder, übernommene Kontakte und die unfertige Kontaktnotiz wiederherstellen. Der Entwurf bleibt nur bis zum vollständigen Neuladen oder Schließen dieses Dokuments im Arbeitsspeicher.</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" className={acquisitionPrimaryButton} onClick={()=>{setRestoredDraft(retainedDraft);setDocument(retainedDraft.document)}}>Entwurf wiederherstellen</button>
      <button type="button" className={acquisitionButton} onClick={()=>{if(window.confirm('Ungespeicherten Entwurf endgültig verwerfen?')) retainAcquisitionDraftRecovery(null)}}>Entwurf verwerfen</button>
    </div>
  </section>

  return <div className="min-w-0 space-y-5">
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-xl font-bold text-[#061829]">Akquise & Kontakte</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">Betriebe kennenlernen, Gespräche festhalten und zum passenden Zeitpunkt nachfassen.</p></div>
        <button type="button" className={acquisitionPrimaryButton} disabled={!workspaceId || settingUp} onClick={()=>void open({workspaceId})}>Interessent anlegen</button>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="grid w-full min-w-0 gap-1 text-sm font-medium sm:w-80"><span>Arbeitsbereich für neue Akten</span><select aria-label="Arbeitsbereich" className={acquisitionInput} value={workspaceId} onChange={event=>setWorkspaceId(event.target.value)} disabled={settingUp || !activeWorkspaces.length}>
          {!activeWorkspaces.length && <option value="">Kein aktiver Arbeitsbereich</option>}
          {activeWorkspaces.map(workspace=><option key={workspace.id} value={workspace.id}>{workspace.title}</option>)}
        </select></label>
        {!activeWorkspaces.length && <button type="button" disabled={settingUp || loading} className={acquisitionButton} onClick={()=>void setup()}>{settingUp ? 'Wird eingerichtet …' : 'Arbeitsbereich einrichten'}</button>}
        <button type="button" className={acquisitionButton} disabled={loading || settingUp} onClick={()=>void refresh()}>Übersicht neu laden</button>
      </div>
      {!activeWorkspaces.length && <p className="mt-3 text-sm text-amber-800">Zum Anlegen oder ersten Speichern einer Akte bitte ausdrücklich einen Arbeitsbereich einrichten.</p>}
      <p className="mt-3 text-xs leading-5 text-zinc-500">Bestandsbetriebe ohne Nachweis bleiben „Kontaktstatus nicht erfasst“. E-Mail-Entwürfe zählen nicht als Kontakt.</p>
    </section>
    {error && <p role="alert" className="break-words rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {loading && <p role="status" className="text-sm text-zinc-600">Wird geladen …</p>}
    <section aria-label="Betriebe filtern" className="grid min-w-0 gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="grid min-w-0 gap-1 text-sm font-medium"><span>Suche</span><input aria-label="Betriebe durchsuchen" type="search" className={acquisitionInput} placeholder="Betrieb, Kontakt, nächster Schritt …" value={filters.query} onChange={event=>setFilters(current=>({...current,query:event.target.value}))}/></label>
      {(['city','industry'] as const).map(key=><label key={key} className="grid min-w-0 gap-1 text-sm font-medium"><span>{key==='city' ? 'Stadt' : 'Branche'}</span><select aria-label={key==='city' ? 'Stadt filtern' : 'Branche filtern'} className={acquisitionInput} value={filters[key]} onChange={event=>setFilters(current=>({...current,[key]:event.target.value}))}><option value="">Alle</option>{[...new Set(index.rows.map(row=>row.fields[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de')).map(value=><option key={value} value={value}>{value}</option>)}</select></label>)}
      <label className="grid min-w-0 gap-1 text-sm font-medium"><span>Kontaktstatus</span><select aria-label="Status filtern" className={acquisitionInput} value={filters.status} onChange={event=>setFilters(current=>({...current,status:event.target.value}))}><option value="">Alle</option>{Object.entries(acquisitionStatuses).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
    </section>
    <dl aria-label="Kennzahlen zur gefilterten Auswahl" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {([['Heute fällig',metrics.dueToday],['Überfällig',metrics.overdue],['Rückmeldung ausstehend',metrics.awaitingReply],['Kommende Gespräche',metrics.upcomingMeetings]] as const).map(([label,count])=><div key={label} className="rounded-2xl border border-zinc-200 bg-white p-4"><dt className="text-xs font-medium leading-5 text-zinc-500">{label}</dt><dd className="mt-1 text-3xl font-bold tabular-nums text-[#061829]">{count}</dd></div>)}
    </dl>
    <section className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-label="Betriebsübersicht">
      <p className="px-4 py-3 text-sm text-zinc-500" role="status">{rows.length} von {index.rows.length} Betrieben</p>
      <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Akquisetabelle horizontal scrollen">
        <table className="w-full min-w-[680px] text-left text-sm">
          <caption className="sr-only">Akquise und tatsächliche Kontakte der gefilterten Betriebe</caption>
          <thead className="bg-zinc-50 text-xs text-zinc-500"><tr>{['Betrieb','Kontaktstatus','Letzter Kontakt','Nächster Schritt','Wiedervorlage'].map(label=><th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody>{rows.map(row=><tr key={row.key} className="border-t border-zinc-100 align-top hover:bg-[#f3f8ff]">
            <th scope="row" className="max-w-64 px-4 py-4"><button type="button" className="break-words text-left font-semibold text-[#0879df] underline decoration-[#118cff]/30 underline-offset-4 focus-visible:outline-2 focus-visible:outline-[#086fcc]" onClick={()=>void open(row.pageId ? {pageId:row.pageId} : {partnerId:row.partnerId!,...(workspaceId ? {workspaceId} : {})})}>{row.fields.name || 'Unbenannter Betrieb'}</button><span className="mt-1 block break-words text-xs font-normal text-zinc-500">{[row.fields.city,row.fields.industry].filter(Boolean).join(' · ') || 'Ort und Branche unbekannt'}</span>{!row.partnerId && <span className="mt-1 block text-xs font-normal text-zinc-500">Interessent</span>}</th>
            <td className="px-4 py-4"><span className="inline-block rounded-lg bg-[#eaf4ff] px-2 py-1 text-xs leading-5 text-[#075ba8]">{acquisitionStatuses[row.fields.status]}</span></td>
            <td className="whitespace-nowrap px-4 py-4 text-zinc-600">{row.lastContactDate || 'Nicht erfasst'}</td><td className="max-w-72 break-words px-4 py-4 text-zinc-600">{row.fields.nextStep || '—'}</td><td className="whitespace-nowrap px-4 py-4 text-zinc-600">{row.fields.followUpDate || '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!rows.length && <p className="p-6 text-sm text-zinc-500">Keine Betriebe für diese Auswahl. Filter anpassen oder einen Interessenten anlegen.</p>}
    </section>
  </div>
}
