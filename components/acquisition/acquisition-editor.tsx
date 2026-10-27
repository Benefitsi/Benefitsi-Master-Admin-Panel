'use client'

import {useEffect, useRef, useState} from 'react'
import {
  acquisitionStatuses, mediaStatuses, contactChannels, validateAcquisitionFields, validateAcquisitionContacts,
  type AcquisitionDocument, type AcquisitionFields, type ContactChannel,
} from '../../lib/acquisition/model'
import type {AcquisitionServices} from './services'
import {retainAcquisitionDraftRecovery, type AcquisitionDraftRecovery} from './draft-recovery'

export const acquisitionInput = 'min-h-11 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-[#061829] focus:outline-2 focus:outline-[#086fcc] disabled:bg-zinc-100'
const buttonBase = 'min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#086fcc] disabled:cursor-wait disabled:opacity-50'
export const acquisitionButton = `${buttonBase} border-zinc-300 bg-white text-[#061829] hover:bg-zinc-50`
export const acquisitionPrimaryButton = `${buttonBase} border-[#086fcc] bg-[#086fcc] text-white hover:bg-[#0879df]`
const snapshot = (doc: AcquisitionDocument) => JSON.stringify([doc.fields, doc.contacts])
const discardMessage = 'Ungespeicherte Änderungen verwerfen?'

export function AcquisitionEditor({document: initial, recovery, services, today, onBack, onSaved}: {
  document: AcquisitionDocument
  recovery?: AcquisitionDraftRecovery | null
  services: AcquisitionServices
  today: string
  onBack(): void
  onSaved(document: AcquisitionDocument): void
}) {
  const [draft, setDraft] = useState(initial)
  const [saved, setSaved] = useState(() => recovery?.acknowledgedSnapshot ?? snapshot(initial))
  const [acknowledgedContacts, setAcknowledgedContacts] = useState(() => new Set(recovery?.acknowledgedContactIds ?? initial.contacts.map(entry=>entry.id)))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState('')
  const [contact, setContact] = useState(recovery?.contact ?? {date: today, channel: 'email' as ContactChannel, note: ''})
  const busy = useRef(false)
  const alive = useRef(true)
  const approvedExit = useRef(false)
  const latestRecovery = useRef<AcquisitionDraftRecovery | null>(null)
  const dirty = snapshot(draft) !== saved || !!contact.note.trim()

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (!approvedExit.current && latestRecovery.current) retainAcquisitionDraftRecovery(latestRecovery.current)
    }
  }, [])
  useEffect(() => {
    approvedExit.current = false
    latestRecovery.current = dirty ? {document: draft, acknowledgedSnapshot: saved, acknowledgedContactIds: [...acknowledgedContacts], contact} : null
    if (!dirty) retainAcquisitionDraftRecovery(null)
  }, [draft, saved, acknowledgedContacts, contact, dirty])
  useEffect(() => {
    function confirmExit() {
      const approved = window.confirm(discardMessage)
      approvedExit.current = approved
      if (approved) retainAcquisitionDraftRecovery(null)
      return approved
    }
    function beforeUnload(event: BeforeUnloadEvent) {
      if (dirty || busy.current) { event.preventDefault(); event.returnValue = '' }
    }
    function followLink(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (target && !event.metaKey && !event.ctrlKey && !event.shiftKey && target.getAttribute('target') !== '_blank' && (dirty || busy.current) && !confirmExit()) {
        event.preventDefault(); event.stopPropagation()
      }
    }
    // Unlike popstate, a cancelable native traversal fires before URL commit
    // and before Next's popstate listener. Never rewrite the router's history.
    type TraverseEvent = Event & {navigationType?: string; destination?: {sameDocument?: boolean}}
    const navigation = (window as Window & {navigation?: EventTarget}).navigation
    function traverse(event: TraverseEvent) {
      if (event.navigationType !== 'traverse' || !event.destination?.sameDocument || !(dirty || busy.current)) return
      if (event.cancelable) {
        if (!confirmExit()) event.preventDefault()
      } else if (latestRecovery.current) retainAcquisitionDraftRecovery(latestRecovery.current)
    }
    function canceledNavigation() { approvedExit.current = false }
    navigation?.addEventListener('navigate', traverse)
    navigation?.addEventListener('navigateerror', canceledNavigation)
    window.addEventListener('beforeunload', beforeUnload)
    window.document.addEventListener('click', followLink, true)
    return () => {
      navigation?.removeEventListener('navigate', traverse)
      navigation?.removeEventListener('navigateerror', canceledNavigation)
      window.removeEventListener('beforeunload', beforeUnload)
      window.document.removeEventListener('click', followLink, true)
    }
  }, [dirty])

  function update<K extends keyof AcquisitionFields>(key: K, value: AcquisitionFields[K]) {
    if (draft.sourceOwnedFields?.some(field=>field===key)) return
    setDraft(current => ({...current, fields: {...current.fields, [key]: value}}))
    setNotice('')
  }
  function addContact() {
    try {
      const next = {...contact, id: crypto.randomUUID()}
      validateAcquisitionContacts([...draft.contacts, next])
      setDraft(current => ({...current, contacts: [...current.contacts, next]}))
      setContact(current => ({...current, note: ''})); setError(''); setNotice('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Kontakt konnte nicht ergänzt werden.') }
  }
  async function save() {
    if (busy.current) return
    if (contact.note.trim()) { setError('Bitte den ausgefüllten Kontakt zuerst mit „Kontakt hinzufügen“ übernehmen.'); return }
    try { validateAcquisitionFields(draft.fields); validateAcquisitionContacts(draft.contacts) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Bitte die Eingaben prüfen.'); return }
    busy.current = true; setPending(true); setError(''); setNotice('')
    try {
      const result = await services.saveAcquisitionDocument(structuredClone(draft))
      if (!alive.current) return
      if (!result.ok) { setError(result.error); setConflict(!!result.conflict); return }
      setDraft(result.value); setSaved(snapshot(result.value)); setAcknowledgedContacts(new Set(result.value.contacts.map(entry=>entry.id))); setConflict(false); setNotice('Gespeichert.'); onSaved(result.value)
    } catch { if (alive.current) setError('Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten. Bitte erneut versuchen.') }
    finally { busy.current = false; if (alive.current) setPending(false) }
  }
  async function reload() {
    if (busy.current || !window.confirm(discardMessage)) return
    busy.current = true; setPending(true); setError('')
    try {
      const result = await services.loadAcquisitionDocument({pageId: draft.page.id})
      if (!alive.current) return
      if (!result.ok) { setError(result.error); return }
      setDraft(result.value); setSaved(snapshot(result.value)); setAcknowledgedContacts(new Set(result.value.contacts.map(entry=>entry.id))); setContact(current => ({...current, note: ''})); setConflict(false); setNotice('Aktueller Stand geladen.')
    } catch { if (alive.current) setError('Aktueller Stand konnte nicht geladen werden. Der Entwurf bleibt erhalten.') }
    finally { busy.current = false; if (alive.current) setPending(false) }
  }
  function back() {
    if (busy.current) return
    if (!dirty || window.confirm(discardMessage)) {
      approvedExit.current = true
      retainAcquisitionDraftRecovery(null)
      onBack()
    }
  }
  const textFields: {key: keyof AcquisitionFields; label: string; type?: string; max: number}[] = [
    {key:'name',label:'Betrieb',max:200},{key:'city',label:'Stadt',max:200},{key:'industry',label:'Branche',max:200},
    {key:'contactName',label:'Ansprechpartner',max:200},{key:'email',label:'E-Mail',type:'email',max:320},
    {key:'phone',label:'Telefon',type:'tel',max:200},{key:'website',label:'Website',type:'url',max:4000},
  ]
  return <section className="min-w-0 space-y-5" aria-label="Akquiseakte">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" aria-label="Zur Übersicht" className={acquisitionButton} onClick={back} disabled={pending}>← <span>Zur Übersicht</span></button>
      <span className="text-sm text-zinc-500">{dirty ? 'Ungespeicherte Änderungen' : `Revision ${draft.page.revision}`}</span>
    </header>
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
      <h2 className="break-words text-xl font-bold text-[#061829]">{draft.fields.name || 'Neuer Interessent'}</h2>
      <p className="mt-1 text-sm text-zinc-500">Interne Akquiseakte · {draft.page.partner_id ? 'Mit Partner verknüpft' : 'Unverknüpfter Interessent'}</p>
      <form className="mt-5 space-y-6" onSubmit={event => {event.preventDefault(); void save()}}>
        <fieldset disabled={pending} className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <legend className="mb-3 font-semibold">Betrieb & Kontakt</legend>
          {draft.page.partner_id && <p id="acquisition-partner-source" className="text-sm font-normal text-zinc-600 sm:col-span-2 xl:col-span-3">Bekannte Angaben zu Betrieb, Stadt und Branche werden in der <a className="font-semibold text-[#0879df] underline" href={`/partners?partner=${encodeURIComponent(draft.page.partner_id)}`}>Partnerverwaltung</a> gepflegt und sind hier schreibgeschützt. Fehlende Angaben kannst du für diese Akquiseakte ergänzen.</p>}
          {textFields.map(({key,label,type,max}) => <label key={key} className="grid min-w-0 gap-1 text-sm font-medium"><span>{label}</span>
            <input aria-label={label} readOnly={draft.sourceOwnedFields?.some(field=>field===key) ?? false} aria-describedby={draft.page.partner_id && ['name','city','industry'].includes(key) ? 'acquisition-partner-source' : undefined} className={`${acquisitionInput} read-only:bg-zinc-100`} type={type || 'text'} required={key==='name'} maxLength={max} value={draft.fields[key]} onChange={event=>update(key,event.target.value)} />
          </label>)}
        </fieldset>
        <fieldset disabled={pending} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-semibold">Nachfassen & Termine</legend>
          <label className="grid min-w-0 gap-1 text-sm font-medium"><span>Kontaktstatus</span><select aria-label="Kontaktstatus" className={acquisitionInput} value={draft.fields.status} onChange={event=>update('status',event.target.value as AcquisitionFields['status'])}>{Object.entries(acquisitionStatuses).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
          <label className="grid min-w-0 gap-1 text-sm font-medium"><span>Nächster Schritt</span><input aria-label="Nächster Schritt" className={acquisitionInput} maxLength={2000} value={draft.fields.nextStep} onChange={event=>update('nextStep',event.target.value)}/></label>
          {([['followUpDate','Wiedervorlage'],['meetingDate','Gesprächstermin']] as const).map(([key,label])=><label key={key} className="grid min-w-0 gap-1 text-sm font-medium"><span>{label}</span><input type="date" aria-label={label} className={acquisitionInput} value={draft.fields[key]} onChange={event=>update(key,event.target.value)}/></label>)}
        </fieldset>
        <fieldset disabled={pending} className="grid min-w-0 gap-4 sm:grid-cols-3">
          <legend className="mb-1 font-semibold">Medieninteresse</legend>
          <p className="text-sm text-zinc-500 sm:col-span-3">Interner Arbeitsstand. Es werden keine Medien veröffentlicht.</p>
          {([['panorama','360°'],['food','Speisenfotos'],['drone','Drohne']] as const).map(([key,label])=><label key={key} className="grid min-w-0 gap-1 text-sm font-medium"><span>{label}</span><select aria-label={label} className={acquisitionInput} value={draft.fields[key]} onChange={event=>update(key,event.target.value as AcquisitionFields[typeof key])}>{Object.entries(mediaStatuses).map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>)}
        </fieldset>
        <label className="grid gap-1 text-sm font-medium"><span>Notizen</span><textarea disabled={pending} aria-label="Notizen" className={acquisitionInput} rows={4} maxLength={10000} value={draft.fields.notes} onChange={event=>update('notes',event.target.value)}/></label>
        {error && <p role="alert" className="break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}{conflict && <span className="mt-1 block">Versionskonflikt: Dein Entwurf bleibt erhalten. Du kannst den aktuellen Stand bewusst neu laden.</span>}</p>}
        {conflict && <button type="button" className={acquisitionButton} disabled={pending} onClick={()=>void reload()}>Aktuellen Stand laden</button>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={acquisitionPrimaryButton}>{pending ? 'Wird gespeichert …' : 'Speichern'}</button>
          <span role="status" className="text-sm text-teal-700">{notice}</span>
        </div>
        <p className="text-xs leading-5 text-zinc-500">Kontaktstatus und Entwürfe versenden keine Nachricht und ändern keine Partnerfreigabe.</p>
      </form>
    </div>
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6" aria-label="Kontaktverlauf">
      <h3 className="text-lg font-bold">Kontaktverlauf</h3>
      <p className="mt-1 text-sm text-zinc-500">Tatsächliche Kontakte mit Datum erfassen. Übernommene Einträge bleiben unverändert; neue Einträge werden mit der Akte gespeichert.</p>
      {draft.contacts.length ? <ol className="mt-4 space-y-3">{draft.contacts.map(entry=><li key={entry.id} className="break-words rounded-xl border border-zinc-200 p-3 text-sm"><p className="font-semibold"><time dateTime={entry.date}>{entry.date}</time> · {contactChannels[entry.channel]}{!acknowledgedContacts.has(entry.id) ? ' · Noch nicht gespeichert' : ''}</p><p className="mt-1 whitespace-pre-wrap">{entry.note}</p></li>)}</ol> : <p className="mt-4 text-sm text-zinc-500">Noch kein tatsächlicher Kontakt erfasst.</p>}
    </section>
    <fieldset disabled={pending} className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
      <legend className="px-1 font-bold">Kontakt ergänzen</legend>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1 text-sm font-medium"><span>Kontaktdatum</span><input aria-label="Kontaktdatum" type="date" className={acquisitionInput} value={contact.date} onChange={event=>setContact(current=>({...current,date:event.target.value}))}/></label>
        <label className="grid min-w-0 gap-1 text-sm font-medium"><span>Kontaktkanal</span><select aria-label="Kontaktkanal" className={acquisitionInput} value={contact.channel} onChange={event=>setContact(current=>({...current,channel:event.target.value as ContactChannel}))}>{Object.entries(contactChannels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="grid min-w-0 gap-1 text-sm font-medium sm:col-span-2"><span>Kontaktnotiz</span><textarea aria-label="Kontaktnotiz" rows={3} maxLength={20000} className={acquisitionInput} value={contact.note} onChange={event=>setContact(current=>({...current,note:event.target.value}))}/></label>
      </div>
      <button type="button" className={`${acquisitionButton} mt-4`} onClick={addContact}>Kontakt hinzufügen</button>
    </fieldset>
    <footer className="flex flex-wrap gap-4 text-sm font-semibold text-[#0879df]">
      {draft.page.partner_id && <a className="underline" href={`/partners?partner=${encodeURIComponent(draft.page.partner_id)}`}>Partner verwalten</a>}
      {draft.page.revision>0 && <a className="underline" href={`/workspace?page=${encodeURIComponent(draft.page.id)}`}>Workspace-Akte öffnen</a>}
    </footer>
  </section>
}
