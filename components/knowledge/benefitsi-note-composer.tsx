'use client'
import { useRef, useState, type FormEvent } from 'react'
import { useAdminLanguage } from '@/app/admin-language'
import { KNOWLEDGE_PROFILES, KnowledgeControlError, knowledgeErrorMessage, parseKnowledgeCreate, parseKnowledgeReceipt, type KnowledgeKind, type KnowledgeProfile, type KnowledgeReceipt } from '@/lib/benefitsi-knowledge-controls'
const names: Record<KnowledgeProfile, string> = { ben: 'Ben', 'benefitsi-content': 'Content', 'benefitsi-finance': 'Finanzen', 'benefitsi-seo': 'SEO', 'city-annweiler': 'Annweiler', 'benefitsi-menu': 'Menü' }
const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-60'
export function BenefitsiNoteComposer({ profileId, onSaved }: { profileId?: KnowledgeProfile; onSaved?: (receipt: KnowledgeReceipt) => void }) {
  const { tr } = useAdminLanguage()
  const [kind, setKind] = useState<KnowledgeKind>('task')
  const [title, setTitle] = useState(''), [content, setContent] = useState('')
  const [profile, setProfile] = useState<KnowledgeProfile | ''>(profileId ?? '')
  const [dueDate, setDueDate] = useState('')
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null), [receipt, setReceipt] = useState<KnowledgeReceipt | null>(null)
  const attempt = useRef<{ signature: string; id: string } | null>(null)
  function edit() { setError(null); setReceipt(null) }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || receipt) return
    const values = { schemaVersion: 1, action: 'note-create', kind, title, content, ...(profile ? { profileId: profile } : {}), ...(kind === 'task' && dueDate ? { dueDate } : {}) }
    const signature = JSON.stringify(values)
    if (!attempt.current || attempt.current.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() }
    setPending(true); setError(null)
    try {
      const input = parseKnowledgeCreate({ ...values, requestId: attempt.current.id })
      const response = await fetch('/api/knowledge/notes', { method: 'POST', credentials: 'same-origin', mode: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
      const result: unknown = await response.json()
      if (!response.ok) {
        const code = result && typeof result === 'object' && 'error' in result ? result.error : null
        throw new KnowledgeControlError(code === 'conflict' || code === 'permission_denied' || code === 'invalid_request' || code === 'limit_exceeded' || code === 'invalid_response' ? code : 'unavailable')
      }
      const saved = parseKnowledgeReceipt(result, input)
      setReceipt(saved); onSaved?.(saved)
    } catch (failure) { setError(failure instanceof KnowledgeControlError ? failure.message : knowledgeErrorMessage('unavailable')) }
    finally { setPending(false) }
  }
  return <details className="rounded-xl border border-slate-200 bg-white">
    <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-blue-700">{tr('Wissen ergänzen')}</summary>
    <form onSubmit={save} className="space-y-3 border-t border-slate-100 p-4">
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">{tr('Art')}<select name="kind" className={field} value={kind} disabled={pending} onChange={event => { setKind(event.target.value as KnowledgeKind); edit() }}><option value="task">{tr('Aufgabe')}</option><option value="decision">{tr('Entscheidung')}</option><option value="result">{tr('Ergebnis')}</option></select></label>
        <label className="text-xs font-medium">{tr('Agent zuordnen')}<select name="profileId" className={field} value={profile} disabled={pending} onChange={event => { setProfile(event.target.value as KnowledgeProfile | ''); edit() }}><option value="">{tr('Ohne Zuordnung')}</option>{KNOWLEDGE_PROFILES.map(id => <option key={id} value={id} translate="no">{names[id]}</option>)}</select></label></div>
      <label className="block text-xs font-medium">{tr('Titel')}<input name="title" className={field} maxLength={140} required value={title} disabled={pending} data-admin-i18n-ignore="true" onChange={event => { setTitle(event.target.value); edit() }} /></label>
      <label className="block text-xs font-medium">{tr('Inhalt')}<textarea name="content" className={field} rows={4} maxLength={12000} required value={content} disabled={pending} data-admin-i18n-ignore="true" onChange={event => { setContent(event.target.value); edit() }} /></label>
      {kind === 'task' ? <label className="block text-xs font-medium">{tr('Termin (optional)')}<input name="dueDate" type="date" className={field} value={dueDate} disabled={pending} onChange={event => { setDueDate(event.target.value); edit() }} /></label> : null}
      <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={pending || Boolean(receipt) || !title.trim() || !content.trim()} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{tr(pending ? 'Wird gespeichert …' : receipt ? 'Gespeichert' : 'In Obsidian speichern')}</button><span className="text-xs text-slate-500">{tr('Neue Notiz; der Wissensspiegel wird separat aktualisiert.')}</span></div>
      {error ? <p role="alert" className="text-sm text-amber-800">{tr(error)}</p> : null}
      {receipt ? <div role="status" className="space-y-1 rounded-lg bg-teal-50 p-3 text-sm text-teal-900"><p>{tr('In Obsidian gespeichert; Wissensspiegel wird separat aktualisiert.')}</p><code translate="no" className="block break-all text-xs">{receipt.path}</code>{receipt.id ? <a href={`/wissen?note=${encodeURIComponent(receipt.id)}`} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">{tr('Gespeicherte Notiz lesen')}</a> : null}</div> : null}
    </form>
  </details>
}
