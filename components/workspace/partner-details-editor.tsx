'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { partnerTypeOptions } from '@/lib/partner-categories'
import { partnerSocialPlatformOptions, MAX_PARTNER_SOCIALS } from '@/lib/partner-config'
import { newId, safeLink, type ActionResult } from '@/lib/workspace/model'
import type { EditRow, PartnerDetails, PartnerDetailChange } from '@/lib/workspace/partner-edit'
import { Button, Field, inputClass } from './ui'

export type DetailServices = {
  loadWorkspacePartnerDetails(id: string): Promise<ActionResult<PartnerDetails>>
  saveWorkspacePartnerDetail(id: string, input: PartnerDetailChange): Promise<ActionResult<EditRow>>
  addWorkspacePartnerDetail(id: string, input: {kind: 'social' | 'hour'; id: string; values: EditRow}): Promise<ActionResult<EditRow>>
}
type Props = {partnerId: string; services: DetailServices; onDirtyChange: (state: {dirty: boolean; busy: boolean}) => void; onSaved: () => void}
type Draft = string | boolean
type Addition = {kind: 'social' | 'hour'; id: string; values: EditRow; submitted?: EditRow; error?: string}
const weekdays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const profileFields = [
  ['name', 'Partnername'], ['type', 'Betriebsart'], ['category', 'Kategorien'], ['description', 'Beschreibung'],
  ['address', 'Adresse'], ['phone', 'Telefon · öffentlicher Geschäftskontakt'], ['email', 'E-Mail · öffentlicher Geschäftskontakt'], ['website', 'Website'],
] as const
const failure = 'Die Änderung konnte nicht bestätigt werden. Deine Eingabe bleibt erhalten. Bitte erneut versuchen.'
const keyFor = (kind: PartnerDetailChange['kind'], row: EditRow, column: string) => `${kind}:${row.id}:${column}`
const rowKey = (kind: PartnerDetailChange['kind'], row: EditRow) => `${kind}:${row.id}`
function displayValue(column: string, value: EditRow[string]): Draft {
  if (column === 'is_closed') return value === true
  if (column === 'category') return Array.isArray(value) ? value.join(', ') : String(value ?? '')
  if (column === 'opens_at' || column === 'closes_at') return String(value ?? '').slice(0, 5)
  return String(value ?? '')
}
function saveValue(column: string, value: Draft) {
  return column === 'category' ? [...new Set(String(value).split(',').map(item => item.trim()).filter(Boolean))] : value
}
function validDetails(value: PartnerDetails, partnerId: string) {
  return value?.partnerId === partnerId && value.profile?.id === partnerId &&
    Array.isArray(value.socials) && Array.isArray(value.hours) &&
    [...value.socials, ...value.hours].every(row => typeof row.id === 'string' && row.partner_id === partnerId)
}
function confirmedValue(column: string, value: Draft, saved: EditRow) {
  const expected = saveValue(column, value)
  if (column === 'category') return JSON.stringify(saved[column]) === JSON.stringify(expected)
  if (typeof expected === 'boolean') return saved[column] === expected
  const normalized = String(expected).trim()
  if ((column === 'url' || column === 'website') && normalized) return safeLink(normalized) === saved[column]
  return displayValue(column, saved[column]) === normalized || (!normalized && saved[column] === null)
}
function additionError(addition: Addition) {
  if (addition.kind === 'social') {
    if (!safeLink(String(addition.values.url))) return 'Bitte eine gültige HTTP(S)-Adresse ohne Zugangsdaten eingeben.'
  } else if (addition.values.is_closed !== true && (!addition.values.opens_at || !addition.values.closes_at)) {
    return 'Bitte Öffnungs- und Schließzeit angeben oder den Eintrag als geschlossen markieren.'
  }
  return null
}

/** A partner switch immediately discards the old render; its late requests cannot affect this editor. */
export function PartnerDetailsEditor(props: Props) {
  return <PartnerEditorSession key={props.partnerId} {...props}/>
}

function PartnerEditorSession({partnerId, services, onDirtyChange, onSaved}: Props) {
  const [details, setDetails] = useState<PartnerDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [messages, setMessages] = useState<Record<string, {error?: string; saved?: boolean}>>({})
  const [busyRows, setBusyRows] = useState<Record<string, boolean>>({})
  const [addition, setAddition] = useState<Addition | null>(null)
  const locks = useRef(new Set<string>())
  const pendingFields = useRef(new Set<string>())
  const epoch = useRef(0)
  const callbacks = useRef({services, onDirtyChange, onSaved})
  callbacks.current = {services, onDirtyChange, onSaved}
  const dirty = Object.keys(drafts).length > 0 || addition !== null
  const busy = loading || Object.values(busyRows).some(Boolean)

  useEffect(() => {
    const request = ++epoch.current
    let active = true
    void (async () => {
      try {
        const result = await callbacks.current.services.loadWorkspacePartnerDetails(partnerId)
        if (!active || request !== epoch.current) return
        if (!result.ok) throw new Error(result.error)
        if (!validDetails(result.value, partnerId)) throw new Error('Die geladenen Angaben gehören nicht zum ausgewählten Partner. Bitte neu laden.')
        setDetails(result.value)
      } catch (error) {
        if (active && request === epoch.current) setLoadError(error instanceof Error ? error.message : 'Die Partnerangaben konnten nicht geladen werden.')
      } finally {
        if (active && request === epoch.current) setLoading(false)
      }
    })()
    return () => {active = false; epoch.current = request + 1}
  }, [partnerId, reload])
  useEffect(() => {callbacks.current.onDirtyChange({dirty, busy})}, [dirty, busy])
  useEffect(() => () => {callbacks.current.onDirtyChange({dirty: false, busy: false})}, [])

  function patch(kind: PartnerDetailChange['kind'], row: EditRow, column: string, value: Draft) {
    const key = keyFor(kind, row, column)
    // The old row is about to change, so returning to its value is still a newer edit.
    const preservePendingEdit = pendingFields.current.has(key)
    setDrafts(current => {
      const next = {...current}
      if (value === displayValue(column, row[column]) && !preservePendingEdit) delete next[key]
      else next[key] = value
      return next
    })
    setMessages(current => {const next = {...current}; delete next[key]; return next})
  }
  async function save(kind: PartnerDetailChange['kind'], row: EditRow, column: string) {
    const key = keyFor(kind, row, column), lock = rowKey(kind, row), value = drafts[key]
    if (value === undefined || loading || locks.current.has(lock)) return
    const request = epoch.current
    locks.current.add(lock)
    pendingFields.current.add(key)
    setBusyRows(current => ({...current, [lock]: true}))
    setMessages(current => ({...current, [key]: {}}))
    try {
      const result = await callbacks.current.services.saveWorkspacePartnerDetail(partnerId, {kind, row, column, value: saveValue(column, value)})
      if (request !== epoch.current) return
      if (!result.ok) throw new Error(result.error)
      const saved = result.value
      if (saved.id !== row.id || (kind === 'profile' ? saved.id !== partnerId || typeof saved.updated_at !== 'string' || !Number.isFinite(Date.parse(saved.updated_at)) : saved.partner_id !== partnerId) || !confirmedValue(column, value, saved)) throw new Error(failure)
      setDetails(current => {
        if (!current) return current
        if (kind === 'profile') return {...current, profile: saved}
        const collection = kind === 'social' ? 'socials' : 'hours'
        return {...current, [collection]: current[collection].map(item => item.id === saved.id ? saved : item)}
      })
      // Edits made while this request was pending remain drafts.
      setDrafts(current => {
        if (current[key] !== value) return current
        const next = {...current}; delete next[key]; return next
      })
      setMessages(current => ({...current, [key]: {saved: true}}))
      callbacks.current.onSaved()
    } catch (error) {
      if (request === epoch.current) setMessages(current => ({...current, [key]: {error: error instanceof Error ? error.message : failure}}))
    } finally {
      locks.current.delete(lock)
      pendingFields.current.delete(key)
      if (request === epoch.current) setBusyRows(current => ({...current, [lock]: false}))
    }
  }
  function beginAdd(kind: Addition['kind']) {
    if (!details || addition) return
    const rows = kind === 'social' ? details.socials : details.hours
    const sort_order = Math.max(-1, ...rows.map(row => typeof row.sort_order === 'number' ? row.sort_order : -1)) + 1
    setAddition({kind, id: newId(), values: kind === 'social' ? {platform: 'instagram', url: '', handle: null, sort_order} : {weekday: 1, opens_at: '', closes_at: '', is_closed: false, label: null, sort_order}})
  }
  function patchAddition(column: string, value: EditRow[string]) {
    setAddition(current => current && !current.submitted ? {...current, values: {...current.values, [column]: value}, error: undefined} : current)
  }
  async function add() {
    if (!addition || locks.current.has('addition')) return
    const error = additionError(addition)
    if (error) {setAddition({...addition, error}); return}
    const pending = addition, values = pending.submitted ?? {...pending.values}, request = epoch.current
    locks.current.add('addition')
    setBusyRows(current => ({...current, addition: true}))
    // Freeze the first submitted payload as well as its UUID until confirmation.
    setAddition({...pending, submitted: values, error: undefined})
    try {
      const result = await callbacks.current.services.addWorkspacePartnerDetail(partnerId, {kind: pending.kind, id: pending.id, values})
      if (request !== epoch.current) return
      if (!result.ok) throw new Error(result.error)
      if (result.value.id !== pending.id || result.value.partner_id !== partnerId) throw new Error(failure)
      const collection = pending.kind === 'social' ? 'socials' : 'hours'
      setDetails(current => current ? {...current, [collection]: [...current[collection].filter(row => row.id !== pending.id), result.value]} : current)
      setAddition(null)
      callbacks.current.onSaved()
    } catch (error) {
      if (request === epoch.current) setAddition(current => current?.id === pending.id ? {...current, error: error instanceof Error ? error.message : failure} : current)
    } finally {
      locks.current.delete('addition')
      if (request === epoch.current) setBusyRows(current => ({...current, addition: false}))
    }
  }
  function reset() {
    if (busy || !dirty || !window.confirm('Ungespeicherte Änderungen verwerfen? Bereits gesendete Angaben können gespeichert sein und werden dann neu geladen.')) return
    const refresh = addition?.submitted !== undefined
    setDrafts({}); setMessages({}); setAddition(null)
    if (refresh) reloadDetails()
  }
  function reloadDetails() {
    setDetails(null); setLoadError(''); setLoading(true); setReload(current => current + 1)
  }
  function editField(kind: PartnerDetailChange['kind'], row: EditRow, column: string, label: string, control?: 'textarea' | 'select') {
    const key = keyFor(kind, row, column), value = drafts[key] ?? displayValue(column, row[column]), changed = Object.hasOwn(drafts, key), message = messages[key]
    let input: ReactNode
    if (column === 'is_closed') input = <input aria-label={label} type="checkbox" className="size-5 accent-[#118cff]" checked={value === true} onChange={event => patch(kind, row, column, event.target.checked)}/>
    else if (control === 'textarea') input = <textarea className={inputClass} value={String(value)} maxLength={4000} onChange={event => patch(kind, row, column, event.target.value)}/>
    else if (control === 'select') input = <select className={inputClass} value={String(value)} onChange={event => patch(kind, row, column, event.target.value)}>{!partnerTypeOptions.some(option => option.value === value) ? <option value={String(value)}>{String(value) || 'Bitte wählen'}</option> : null}{partnerTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    else input = <input className={inputClass} type={column.endsWith('_at') ? 'time' : column === 'email' ? 'email' : column === 'website' || column === 'url' ? 'url' : column === 'phone' ? 'tel' : 'text'} value={String(value)} maxLength={column === 'website' || column === 'url' ? 4000 : 500} onChange={event => patch(kind, row, column, event.target.value)}/>
    return <div key={key} className="min-w-0 space-y-2"><Field label={label} hint={column === 'category' ? 'Mehrere Kategorien mit Komma trennen.' : undefined}>{input}</Field>{changed ? <Button aria-label={`${label} speichern`} disabled={Boolean(busyRows[rowKey(kind, row)])} onClick={() => void save(kind, row, column)}>{busyRows[rowKey(kind, row)] ? 'Wird gespeichert …' : 'Speichern'}</Button> : null}{message?.error ? <p role="alert" className="text-sm text-red-700">{message.error}</p> : message?.saved && !changed ? <p role="status" className="text-xs text-emerald-700">Gespeichert</p> : null}</div>
  }

  if (loading) return <p role="status" className="text-sm text-[#526170]">Partnerangaben werden geladen …</p>
  if (loadError || !details) return <div className="space-y-3"><p role="alert" className="text-sm text-red-700">{loadError || 'Keine Partnerangaben verfügbar.'}</p><div className="flex flex-wrap gap-3"><Button onClick={reloadDetails}>Partnerangaben neu laden</Button>{dirty ? <Button disabled={busy} onClick={reset}>Änderungen verwerfen</Button> : null}</div></div>
  return <div className="space-y-6">
    <p className="text-sm leading-6 text-[#526170]">Betriebsangaben direkt bearbeiten. Jede Änderung einzeln speichern.</p>
    <section aria-label="Profil und Geschäftskontakt" className="space-y-3"><h4 className="text-sm font-bold">Profil und Geschäftskontakt</h4><div className="grid gap-4 sm:grid-cols-2">{profileFields.map(([column, label]) => editField('profile', details.profile, column, label, column === 'description' ? 'textarea' : column === 'type' ? 'select' : undefined))}</div></section>
    <section aria-label="Social-Links" className="space-y-4"><h4 className="text-sm font-bold">Social-Links</h4>{details.socials.length ? details.socials.map((row, index) => editField('social', row, 'url', `${partnerSocialPlatformOptions.find(option => option.value === row.platform)?.label ?? row.platform} · Link ${index + 1}`)) : <p className="text-sm text-[#526170]">Noch keine Social-Links hinterlegt.</p>}<Button disabled={Boolean(addition) || details.socials.length >= MAX_PARTNER_SOCIALS} onClick={() => beginAdd('social')}>Social-Link hinzufügen</Button></section>
    <section aria-label="Öffnungszeiten" className="space-y-4"><h4 className="text-sm font-bold">Öffnungszeiten</h4>{details.hours.length ? details.hours.map((row, index) => {const name = `${weekdays[Number(row.weekday) - 1] ?? 'Wochentag'} ${index + 1}`; return <div key={String(row.id)} className="grid gap-4 border-b border-[#061829]/10 pb-4 sm:grid-cols-2">{editField('hour', row, 'opens_at', `Öffnet · ${name}`)}{editField('hour', row, 'closes_at', `Schließt · ${name}`)}{editField('hour', row, 'label', `Hinweis · ${name}`)}{editField('hour', row, 'is_closed', `Geschlossen · ${name}`)}</div>}) : <p className="text-sm text-[#526170]">Noch keine Öffnungszeiten hinterlegt.</p>}<Button disabled={Boolean(addition)} onClick={() => beginAdd('hour')}>Öffnungszeit hinzufügen</Button></section>
    {addition ? <section aria-label={addition.kind === 'social' ? 'Neuer Social-Link' : 'Neue Öffnungszeit'} className="space-y-3 rounded-lg border border-[#118cff]/25 bg-[#f3f8ff] p-4"><h4 className="text-sm font-bold">{addition.kind === 'social' ? 'Neuer Social-Link' : 'Neue Öffnungszeit'}</h4><fieldset disabled={Boolean(addition.submitted) || Boolean(busyRows.addition)} className="grid min-w-0 gap-3 sm:grid-cols-2">
      {addition.kind === 'social' ? <><Field label="Neue Plattform"><select className={inputClass} value={String(addition.values.platform)} onChange={event => patchAddition('platform', event.target.value)}>{partnerSocialPlatformOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Neue Social-Adresse"><input type="url" className={inputClass} value={String(addition.values.url)} maxLength={4000} onChange={event => patchAddition('url', event.target.value)}/></Field></> : <><Field label="Neuer Wochentag"><select className={inputClass} value={Number(addition.values.weekday)} onChange={event => patchAddition('weekday', Number(event.target.value))}>{weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></Field><Field label="Neuer Hinweis"><input className={inputClass} value={String(addition.values.label ?? '')} maxLength={500} onChange={event => patchAddition('label', event.target.value || null)}/></Field><Field label="Neue Öffnungszeit"><input type="time" className={inputClass} value={String(addition.values.opens_at)} onChange={event => patchAddition('opens_at', event.target.value)}/></Field><Field label="Neue Schließzeit"><input type="time" className={inputClass} value={String(addition.values.closes_at)} onChange={event => patchAddition('closes_at', event.target.value)}/></Field><Field label="Neuer Eintrag geschlossen"><input type="checkbox" className="size-5 accent-[#118cff]" checked={addition.values.is_closed === true} onChange={event => patchAddition('is_closed', event.target.checked)}/></Field></>}
    </fieldset>{addition.error ? <p role="alert" className="text-sm text-red-700">{addition.error} Erneut speichern bestätigt denselben Eintrag.</p> : null}<Button aria-label={addition.kind === 'social' ? 'Neuen Social-Link speichern' : 'Neue Öffnungszeit speichern'} disabled={Boolean(busyRows.addition)} onClick={() => void add()}>{busyRows.addition ? 'Wird gespeichert …' : addition.submitted ? 'Erneut speichern' : 'Speichern'}</Button></section> : null}
    <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={reloadDetails}>Partnerangaben neu laden</Button>{dirty ? <Button disabled={busy} onClick={reset}>Änderungen verwerfen</Button> : null}</div>
  </div>
}
