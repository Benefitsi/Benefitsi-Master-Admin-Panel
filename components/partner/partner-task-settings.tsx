'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { Gift, ShieldCheck } from 'lucide-react'
import { confirmPartnerTaskAction, previewPartnerTaskAction, reloadPartnerTaskSettings, savePartnerTaskAction, type TaskActionResult } from '@/app/partner/task-actions'
import { validTaskToken, type EligibleTaskDeal, type PartnerTask, type PartnerTaskSettingsRead, type TaskConfirmationPreview, type TaskStatus } from '@/lib/partners/tasks'

const control = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50'
const secondary = 'min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-[#0874d1] hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-400'
const primary = 'min-h-12 rounded-xl bg-[#118CFF] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0874d1] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500'
const statuses: Record<TaskStatus, string> = { draft: 'Entwurf', active: 'Aktiv', paused: 'Pausiert', ended: 'Beendet' }
type Draft = { title: string; description: string; status: TaskStatus; reward_deal_id: string; starts_at: string; ends_at: string; max_participants: string }
function localDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
function displayDate(value: string) { return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function taskDraft(task?: PartnerTask, status?: TaskStatus): Draft {
  return { title: task?.title ?? '', description: task?.description ?? '', status: status ?? task?.status ?? 'draft', reward_deal_id: task?.reward_deal_id ?? '', starts_at: task ? localDate(task.starts_at) : '', ends_at: task ? localDate(task.ends_at) : '', max_participants: task?.max_participants?.toString() ?? '' }
}
function scopeForm(partnerId: string, actorId: string) {
  const form = new FormData()
  form.set('partner_id', partnerId)
  form.set('actor_id', actorId)
  return form
}
async function actionResult(request: () => Promise<TaskActionResult>): Promise<TaskActionResult> {
  try { return await request() }
  catch { return { ok: false, code: 'failed', message: 'Die Anfrage konnte nicht bestätigt werden. Bitte erneut laden oder erneut versuchen. Dein Entwurf bleibt erhalten.' } }
}
function Message({ result }: { result: TaskActionResult | null }) {
  if (!result?.message) return null
  return <p role={result.ok ? 'status' : 'alert'} className={`rounded-xl p-3 text-sm leading-6 ${result.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>{result.message}</p>
}

export function PartnerTaskSettings(props: { partnerId: string; initial: PartnerTaskSettingsRead; confirmationOnly?: boolean }) {
  const { partnerId, initial } = props
  // Actor/partner/rights changes discard drafts and confirmation state; deal reloads do not.
  return <TaskSettingsContent key={`${partnerId}:${initial.actorId}:${initial.available}:${initial.canConfirm}`} {...props} />
}
function TaskSettingsContent({ partnerId, initial, confirmationOnly = false }: { partnerId: string; initial: PartnerTaskSettingsRead; confirmationOnly?: boolean }) {
  const [selection, setSelection] = useState<{ id: string | null; status?: TaskStatus } | null>(null)
  const [saved, setSaved] = useState<PartnerTask[]>([])
  const [result, setResult] = useState<TaskActionResult | null>(null)
  const tasks = (initial.settings?.tasks ?? []).map(task => {
    const updated = saved.find(item => item.id === task.id)
    return updated && updated.revision > task.revision ? updated : task
  }).concat(saved.filter(task => !initial.settings?.tasks.some(item => item.id === task.id)))
  const selected = selection?.id ? tasks.find(task => task.id === selection.id) : undefined
  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-[#061829] shadow-sm" aria-label="Aufgaben und Belohnungen">
    <header className="flex items-start gap-3 border-b border-slate-100 p-5 sm:p-6"><Gift aria-hidden="true" className="mt-1 shrink-0 text-[#118CFF]" /><div><h2 className="text-xl font-bold">Aufgaben &amp; Belohnungen</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Gäste können freiwillig an einer Aufgabe teilnehmen. Berechtigtes Team bestätigt die tatsächliche Erfüllung vor Ort; danach erhält der Gast einen persönlichen Vorteil. Besuchsfeedback bleibt eigenständig.</p></div></header>
    <div className="space-y-6 p-5 sm:p-6">
      <Message result={result} />
      {!confirmationOnly && (initial.available && initial.settings && initial.actorId ? <>
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Deine Aufgaben</h3><button type="button" className={secondary} onClick={() => { setSelection({ id: null }); setResult(null) }}>Aufgabe erstellen</button></div>
        {tasks.length === 0 ? <p role="status" className="text-sm text-slate-600">Noch keine Aufgaben. Erstelle eine Aufgabe mit Anleitung und einem geeigneten Vorteil.</p> : <ul className="grid gap-3 sm:grid-cols-2">
          {tasks.map(task => <li key={task.id} className="min-w-0 rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h4 className="break-words font-bold">{task.title}</h4><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{statuses[task.status]}</span></div><p className="mt-2 whitespace-pre-line break-words text-sm text-slate-600">{task.description}</p><p className="mt-3 text-sm">Belohnung: {task.reward_offer?.title ?? 'Bisheriger Vorteil derzeit nicht geeignet'}</p><p className="mt-2 text-xs leading-5 text-slate-500">{displayDate(task.starts_at)} bis {displayDate(task.ends_at)}{task.remaining_places !== null ? ` · ${task.remaining_places} freie Plätze` : ''}</p>
            {(task.started_count !== undefined || task.completed_count !== undefined || task.reward_count !== undefined || task.redeemed_count !== undefined) && <dl className="mt-3 flex flex-wrap gap-3 text-xs">{(['started_count', 'completed_count', 'reward_count', 'redeemed_count'] as const).map((key, index) => task[key] !== undefined ? <div key={key}><dt>{['Starts', 'Abschlüsse', 'Belohnungen', 'Einlösungen'][index]}</dt><dd className="font-bold">{task[key]}</dd></div> : null)}</dl>}
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={secondary} onClick={() => { setSelection({ id: task.id }); setResult(null) }}>Bearbeiten</button>{task.status === 'active' && <button type="button" className={secondary} onClick={() => setSelection({ id: task.id, status: 'paused' })}>Pausieren</button>}{task.status !== 'ended' && <button type="button" className={secondary} onClick={() => setSelection({ id: task.id, status: 'ended' })}>Beenden</button>}</div>
          </li>)}
        </ul>}
        {selection && <TaskEditor key={`${selection.id ?? 'new'}:${selection.status ?? 'edit'}`} partnerId={partnerId} actorId={initial.actorId} task={selected} initialStatus={selection.status} deals={initial.settings.available_deals} onCancel={() => setSelection(null)} onSaved={(task, response) => {
          setSaved(previous => [...previous.filter(item => item.id !== task.id), task])
          setResult(response)
          setSelection(null)
        }} />}
      </> : <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{initial.reason === 'backend_missing' ? 'Aufgaben sind für diesen Betrieb noch nicht verfügbar.' : initial.reason === 'entitlements_unavailable' ? 'Die Aufgaben-Rechte sind derzeit nicht verfügbar. Bitte erneut laden.' : 'Aufgaben verwalten benötigt Pro und das passende Verwaltungsrecht. Bereits zugesagte Aufgaben können vom berechtigten Team weiterhin bestätigt werden.'}</p>)}
      {initial.canConfirm && initial.actorId ? <TaskConfirmation partnerId={partnerId} actorId={initial.actorId} /> : <p className="text-sm text-slate-600">Für Aufgabenbestätigungen ist ein aktives Verwaltungsrecht erforderlich.</p>}
    </div>
  </section>
}

function TaskEditor({ partnerId, actorId, task, initialStatus, deals, onCancel, onSaved }: { partnerId: string; actorId: string; task?: PartnerTask; initialStatus?: TaskStatus; deals: EligibleTaskDeal[]; onCancel: () => void; onSaved: (task: PartnerTask, result: TaskActionResult) => void }) {
  const id = useId()
  const [base, setBase] = useState(task)
  const [sourceTimes] = useState(() => task ? { starts_at: { display: localDate(task.starts_at), instant: task.starts_at }, ends_at: { display: localDate(task.ends_at), instant: task.ends_at } } : null)
  const [draft, setDraft] = useState(() => taskDraft(task, initialStatus))
  const [reviewed, setReviewed] = useState<string | null>(null)
  const [result, setResult] = useState<TaskActionResult | null>(null)
  const [conflict, setConflict] = useState(false)
  const [serverTask, setServerTask] = useState<PartnerTask | null>(null)
  const [serverDeals, setServerDeals] = useState<EligibleTaskDeal[]>([])
  const [reconciledDeals, setReconciledDeals] = useState<{ previous: EligibleTaskDeal[]; current: EligibleTaskDeal[] } | null>(null)
  const [pending, start] = useTransition()
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const availableDeals = reconciledDeals?.previous === deals ? reconciledDeals.current : deals
  const selected = availableDeals.find(deal => deal.id === draft.reward_deal_id)
  const toUTC = (key: 'starts_at' | 'ends_at') => {
    if (!Number.isFinite(Date.parse(draft[key]))) return ''
    const source = sourceTimes?.[key]
    return new Date(source?.display === draft[key] ? source.instant : draft[key]).toISOString()
  }
  const utcStart = toUTC('starts_at'), utcEnd = toUTC('ends_at')
  const stoppingExisting = !!base && ['paused', 'ended'].includes(draft.status) && draft.reward_deal_id === base.reward_deal_id
  const valid = draft.title.trim().length > 0 && draft.title.trim().length <= 120 && draft.description.trim().length > 0 && draft.description.trim().length <= 1000 && !!utcStart && !!utcEnd && Date.parse(utcEnd) > Date.parse(utcStart) && (draft.max_participants === '' || /^[1-9]\d*$/.test(draft.max_participants) && Number.isSafeInteger(Number(draft.max_participants))) && (!!selected || stoppingExisting)
  const signature = JSON.stringify({ draft, utcStart, utcEnd, revision: base?.revision, selected: selected ?? null })
  const previewCurrent = valid && reviewed === signature && !conflict
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft(previous => ({ ...previous, [key]: value })); setReviewed(null); setResult(null) }
  const submit = () => {
    if (!previewCurrent || pending) return
    const form = scopeForm(partnerId, actorId)
    if (base) { form.set('id', base.id); form.set('revision', String(base.revision)) }
    form.set('kind', 'partner_confirmed')
    for (const [key, value] of Object.entries(draft)) form.set(key, value)
    form.set('starts_at', utcStart)
    form.set('ends_at', utcEnd)
    start(async () => {
      const response = await actionResult(() => savePartnerTaskAction({ ok: false }, form))
      if (!live.current || response.actorId && response.actorId !== actorId) return
      setResult(response)
      if (response.ok && response.task?.partner_id === partnerId) { onSaved(response.task, response); return }
      setReviewed(null)
      if (response.code === 'revision_conflict') setConflict(true)
    })
  }
  return <div className="rounded-2xl border border-sky-100 bg-[#f4f9ff] p-4 sm:p-5"><h3 className="mb-5 text-lg font-bold">{base ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</h3>
    <div className="grid gap-6 lg:grid-cols-2"><form className="space-y-4" onSubmit={event => { event.preventDefault(); submit() }}>
      <input type="hidden" name="partner_id" value={partnerId} /><input type="hidden" name="actor_id" value={actorId} /><input type="hidden" name="id" value={base?.id ?? ''} /><input type="hidden" name="revision" value={base?.revision ?? ''} /><input type="hidden" name="kind" value="partner_confirmed" />
      <div><label htmlFor={`${id}-title`} className="mb-2 block text-sm font-semibold">Titel</label><input id={`${id}-title`} name="title" value={draft.title} onChange={event => change('title', event.target.value)} onInput={event => change('title', event.currentTarget.value)} maxLength={120} required disabled={pending} className={control} /></div>
      <div><label htmlFor={`${id}-description`} className="mb-2 block text-sm font-semibold">Anleitung für Gäste</label><textarea id={`${id}-description`} name="description" value={draft.description} onChange={event => change('description', event.target.value)} onInput={event => change('description', event.currentTarget.value)} maxLength={1000} required disabled={pending} rows={4} className={control} /></div>
      <p className="text-sm text-slate-600">Aufgabenart: Teilnahme vor Ort, vom berechtigten Team bestätigt.</p>
      <div><label htmlFor={`${id}-reward`} className="mb-2 block text-sm font-semibold">Belohnung</label><select id={`${id}-reward`} name="reward_deal_id" value={draft.reward_deal_id} onChange={event => change('reward_deal_id', event.target.value)} required disabled={pending} className={control}><option value="">Geeigneten Vorteil auswählen</option>{draft.reward_deal_id && !selected && <option value={draft.reward_deal_id}>Bisheriger Vorteil derzeit nicht geeignet</option>}{availableDeals.map(deal => <option key={deal.id} value={deal.id}>{deal.title}</option>)}</select><p className="mt-2 text-xs leading-5 text-slate-600">Geeignet sind die vom Server freigegebenen aktiven Rabatte oder Gratisartikel. Einlösebedingungen gelten weiter.</p>{!selected && <p className="mt-2 text-sm text-amber-900">Lege einen geeigneten Vorteil an oder lade die Vorteile neu. Eine bestehende Aufgabe kann mit ihrem bisherigen Vorteil pausiert oder beendet werden.</p>}</div>
      <div className="grid gap-4 sm:grid-cols-2">{(['starts_at', 'ends_at'] as const).map((key, index) => <div key={key}><label htmlFor={`${id}-${key}`} className="mb-2 block text-sm font-semibold">{index === 0 ? 'Beginn' : 'Ende / Abschlussfrist'}</label><input id={`${id}-${key}`} name={key} type="datetime-local" value={draft[key]} onChange={event => change(key, event.target.value)} onInput={event => change(key, event.currentTarget.value)} required disabled={pending} className={control} /></div>)}</div>
      <div><label htmlFor={`${id}-cap`} className="mb-2 block text-sm font-semibold">Maximale Teilnehmerzahl (optional)</label><input id={`${id}-cap`} name="max_participants" type="number" min={1} step={1} value={draft.max_participants} onChange={event => change('max_participants', event.target.value)} onInput={event => change('max_participants', event.currentTarget.value)} disabled={pending} className={control} /><p className="mt-2 text-xs leading-5 text-slate-600">Ein bewusster Start reserviert einen Platz. Bereits reservierte Plätze dürfen nicht verdrängt werden.</p></div>
      <div><label htmlFor={`${id}-status`} className="mb-2 block text-sm font-semibold">Status</label><select id={`${id}-status`} name="status" value={draft.status} onChange={event => change('status', event.target.value as TaskStatus)} disabled={pending} className={control}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <p className="text-xs leading-5 text-slate-600">Pausieren und Beenden verhindern neue Starts. Bereits gestartete Aufgaben behalten ihre gespeicherten Bedingungen und Abschlussfrist; verdiente Vorteile bleiben zugesagt.</p>
      <Message result={result} />
      {conflict && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><button type="button" disabled={pending} className={secondary} onClick={() => start(async () => {
        const response = await actionResult(() => reloadPartnerTaskSettings({ ok: false }, scopeForm(partnerId, actorId)))
        if (!live.current || response.actorId && response.actorId !== actorId) return
        const current = response.initial?.settings?.tasks.find(item => item.id === base?.id)
        if (response.ok && current) { setServerTask(current); setServerDeals(response.initial?.settings?.available_deals ?? []) }
        else setResult({ ok: false, message: response.message ?? 'Der aktuelle Serverstand konnte nicht geladen werden.' })
      })}>Aktuellen Serverstand laden</button>{serverTask && <><div className="text-sm leading-6"><p className="font-semibold">Aktueller Serverstand: {serverTask.title}</p><p className="whitespace-pre-line break-words">{serverTask.description}</p><p>{statuses[serverTask.status]} · Belohnung: {serverTask.reward_offer?.title ?? 'Vorteil derzeit nicht geeignet'} · {displayDate(serverTask.starts_at)} bis {displayDate(serverTask.ends_at)} · Teilnehmerzahl: {serverTask.max_participants ?? 'unbegrenzt'}</p><p>Deine eingegebenen Felder bleiben erhalten. Nach dem Abgleich musst du die Gästevorschau erneut prüfen.</p></div><button type="button" className={secondary} disabled={pending} onClick={() => { setBase(serverTask); setReconciledDeals({ previous: deals, current: serverDeals }); setServerTask(null); setConflict(false); setReviewed(null); setResult(null) }}>Serverstand abgleichen, Entwurf behalten</button></>}</div>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={!valid || conflict || pending} className={secondary} onClick={() => { setReviewed(signature); setResult(null) }}>Gästevorschau prüfen</button><button type="submit" className={primary} disabled={!previewCurrent || pending}>{pending ? 'Wird gespeichert …' : 'Aufgabe speichern'}</button><button type="button" className={secondary} onClick={onCancel} disabled={pending}>Abbrechen</button></div>
    </form>
      {previewCurrent ? <aside aria-label="Vorschau für deine Gäste" className="self-start rounded-2xl border border-sky-100 bg-white p-5"><p className="text-xs font-semibold text-slate-500">Vorschau für deine Gäste · {statuses[draft.status]}</p><h4 className="mt-3 break-words text-xl font-bold">{draft.title.trim()}</h4><p className="mt-3 whitespace-pre-line break-words text-sm leading-6">{draft.description.trim()}</p>{selected ? <><p className="mt-4 font-bold">Belohnung: {selected.title}</p><p className="mt-2 whitespace-pre-line break-words text-sm">{selected.description}</p><p className="mt-3 whitespace-pre-line break-words text-sm">{selected.terms}</p><p className="mt-4 text-xs leading-5 text-slate-600">Einmal pro Person und Aufgabe. Der persönliche Vorteil ist ab Start bis zu 30 Tage gültig{selected.expires_at ? `, spätestens bis ${displayDate(selected.expires_at)}` : ''}. Die konkrete Frist wird Gästen vor ihrem Start angezeigt.</p></> : <p className="mt-4 text-sm leading-6">Keine neuen Starts. Bereits gespeicherte persönliche Zusagen und Einlösebedingungen bleiben erhalten.</p>}<p className="mt-4 text-sm leading-6">Zeitraum: {displayDate(utcStart)} bis {displayDate(utcEnd)}. Die Erfüllung muss spätestens bis zum Aufgabenende oder früheren Ablauf des persönlichen Vorteils bestätigt werden.</p><p className="mt-3 flex gap-2 text-xs leading-5 text-slate-600"><ShieldCheck aria-hidden="true" className="size-5 shrink-0" />Das Team bestätigt die tatsächliche Erfüllung. Die Bestätigung erzeugt keinen Besuch und keine Stempel. Den erhaltenen Vorteil löst du separat per QR in der App ein.</p></aside> : <p className="self-start text-sm leading-6 text-slate-600">Prüfe die Gästevorschau vor dem Speichern. Jede Änderung an Aufgabe, Vorteil oder Serverstand erfordert eine neue Prüfung.</p>}
    </div>
  </div>
}

function TaskConfirmation({ partnerId, actorId }: { partnerId: string; actorId: string }) {
  const id = useId()
  const [token, setToken] = useState('')
  const [preview, setPreview] = useState<TaskConfirmationPreview | null>(null)
  const [result, setResult] = useState<TaskActionResult | null>(null)
  const [pending, start] = useTransition()
  const generation = useRef(0)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const request = (confirm: boolean) => {
    if (pending || !validTaskToken(token) || confirm && !preview) return
    const current = ++generation.current, form = scopeForm(partnerId, actorId)
    form.set('token', token)
    if (confirm && preview) form.set('participation_id', preview.participation_id)
    start(async () => {
      const response = await actionResult(() => confirm ? confirmPartnerTaskAction({ ok: false }, form) : previewPartnerTaskAction({ ok: false }, form))
      if (!live.current || current !== generation.current || response.actorId && response.actorId !== actorId) return
      setResult(response)
      if (response.ok && response.preview?.partner_id === partnerId) setPreview(response.preview)
      else if (!response.ok) setPreview(null)
      if (response.ok && response.summary?.partner_id === partnerId) setPreview(null)
    })
  }
  return <section className="space-y-4 border-t border-slate-200 pt-6" aria-label="Aufgabenerfüllung bestätigen"><h3 className="font-bold">Aufgabenerfüllung bestätigen</h3><p className="text-sm leading-6 text-slate-600">Füge den persönlichen Bestätigungscode des Gastes ein. Prüfe zuerst die Aufgabe und bestätige nur die tatsächlich erfüllte Teilnahme. Scannen mit der Kamera bleibt in der Benefitsi App.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); request(false) }}><div className="min-w-0 flex-1 basis-64"><label htmlFor={`${id}-token`} className="mb-2 block text-sm font-semibold">Aufgaben-Bestätigungscode</label><input id={`${id}-token`} name="token" value={token} onChange={event => { generation.current++; setToken(event.target.value); setPreview(null); setResult(null) }} onInput={event => { generation.current++; setToken(event.currentTarget.value); setPreview(null); setResult(null) }} autoComplete="off" spellCheck={false} className={control} placeholder="benefitsi-task:…" /></div><button type="submit" className={secondary} disabled={pending || !validTaskToken(token)}>{pending ? 'Wird geprüft …' : 'Bestätigung prüfen'}</button></form>
    <Message result={result} />
    {preview && <div className="space-y-3 rounded-2xl border border-[#17D4D7] bg-cyan-50 p-4" data-task-confirm><h4 className="break-words font-bold">{preview.task_title}</h4><p className="whitespace-pre-line break-words text-sm leading-6">{preview.task_description}</p><p className="text-sm">Belohnung: {preview.reward_title}</p><p className="text-xs leading-5">{preview.status === 'completed' ? 'Bereits bestätigt. Eine erneute Bestätigung prüft den gespeicherten Erfolg und vergibt keine zweite Belohnung.' : `Bestätigungscode gültig bis ${displayDate(preview.expires_at)}.`}</p><button type="button" className={primary} disabled={pending} onClick={() => request(true)}>{preview.status === 'completed' ? 'Gespeicherte Bestätigung prüfen' : 'Erfüllung bestätigen'}</button><p className="text-xs leading-5 text-slate-600">Hier bestätigst du die Aufgabe. Die spätere Einlösung des Vorteils ist eine eigene Handlung.</p></div>}
  </section>
}
