"use client"

import { AdminDate } from "@/components/admin-format"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { loadConfigurationHistory, loadInternalContact, loadPartnerBadges, saveInternalContact, savePartnerBadge } from "@/app/partner-configuration-actions"
import type { ConfigurationResult, InternalContact, PartnerBadge } from "@/lib/partner-configuration"

const inputClass = "mt-1 block min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
const buttonClass = "min-h-10 rounded-lg bg-[#118cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"

function useProtectedData<T>(partnerId: string, load: (id: string) => Promise<ConfigurationResult<T>>) {
  const [result, setResult] = useState<ConfigurationResult<T> | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let cancelled = false
    load(partnerId).then(value => { if (!cancelled) setResult(value) }).catch(() => { if (!cancelled) setResult({ ok: false, message: "Der interne Bereich konnte nicht geladen werden." }) })
    return () => { cancelled = true }
  }, [partnerId, load, revision])
  const reload = useCallback(() => { setResult(null); setRevision(value => value + 1) }, [])
  return { result, setResult, reload }
}
function Notice({ message, ok = false }: { message: string; ok?: boolean }) {
  return message ? <p role={ok ? "status" : "alert"} className={`text-sm ${ok ? "text-emerald-700" : "text-rose-700"}`}>{message}</p> : null
}
function LoadNotice({ result, reload }: { result: ConfigurationResult<unknown> | null; reload: () => void }) {
  return <div className="space-y-2"><p role="status" className="text-sm text-zinc-600">{result?.message || "Wird geladen…"}</p>{result && <button type="button" className="text-sm font-semibold text-[#0874d1] underline" onClick={reload}>Erneut laden</button>}</div>
}

export function PartnerInternalContact({ partnerId }: { partnerId: string }) {
  const { result, setResult, reload } = useProtectedData(partnerId, loadInternalContact)
  return <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4"><h3 className="font-semibold">Interner Rückfragekontakt</h3><p className="text-sm text-zinc-600">Nur für das Benefitsi-Team sichtbar. Dieser Kontakt wird nicht im öffentlichen Profil angezeigt.</p>
    {result?.ok ? <Notice ok message={result.message} /> : null}
    {result?.ok && result.data ? <InternalContactForm key={result.data.updated_at || "new"} contact={result.data} onSaved={setResult} /> : <LoadNotice result={result} reload={reload} />}
  </section>
}
function InternalContactForm({ contact, onSaved }: { contact: InternalContact; onSaved: (value: ConfigurationResult<InternalContact>) => void }) {
  const [email, setEmail] = useState(contact.email || ""), [mobile, setMobile] = useState(contact.mobile || "")
  const [message, setMessage] = useState(""), [pending, startTransition] = useTransition()
  const submitting = useRef(false)
  return <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (pending || submitting.current) return; submitting.current = true; startTransition(async () => {
    try {
      const result = await saveInternalContact(contact.partner_id, { email, mobile, updated_at: contact.updated_at })
      setMessage(result.message)
      if (result.ok) onSaved(result)
    } catch { setMessage("Der Speicherstatus konnte nicht bestätigt werden. Deine Eingaben bleiben erhalten. Bitte versuche es erneut.") }
    finally { submitting.current = false }
  }) }}><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Interne E-Mail<input className={inputClass} type="email" maxLength={320} value={email} onChange={event => setEmail(event.target.value)} disabled={pending} autoComplete="off" /></label><label className="text-sm">Interne Mobilnummer<input className={inputClass} type="tel" maxLength={80} value={mobile} onChange={event => setMobile(event.target.value)} disabled={pending} autoComplete="off" /></label></div><Notice message={message} /><button className={buttonClass} disabled={pending}>{pending ? "Speichert…" : "Internen Kontakt speichern"}</button></form>
}

export function PartnerBadgeManager({ partnerId }: { partnerId: string }) {
  const { result, setResult, reload } = useProtectedData(partnerId, loadPartnerBadges)
  return <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4"><h3 className="font-semibold">Partner-Abzeichen</h3><p className="text-sm text-zinc-600">Darstellung und Aktivierung der vorhandenen Abzeichen bearbeiten. Die hinterlegte Besuchsregel bleibt erhalten.</p>
    {result?.ok ? <Notice ok message={result.message} /> : null}
    {result?.ok && result.data ? result.data.length ? result.data.map(badge => <BadgeEditor key={`${badge.id}-${badge.updated_at}`} badge={badge} onSaved={saved => setResult({ ok: true, message: "Abzeichen gespeichert.", data: result.data!.map(row => row.id === saved.id ? saved : row) })} />) : <p className="text-sm text-zinc-500">Für diesen Betrieb ist noch kein Abzeichen hinterlegt.</p> : <LoadNotice result={result} reload={reload} />}
  </section>
}
function BadgeEditor({ badge, onSaved }: { badge: PartnerBadge; onSaved: (badge: PartnerBadge) => void }) {
  const [message, setMessage] = useState(""), [pending, startTransition] = useTransition()
  const submitting = useRef(false)
  const configuredActive = badge.configured_active ?? badge.active
  return <details className="rounded-lg border border-zinc-200 p-3"><summary className="cursor-pointer font-medium"><span data-admin-i18n-ignore="true">{badge.title}</span> <span className="text-xs font-normal text-zinc-500">· {configuredActive ? badge.active ? "Aktiv" : "Bei aktivem Betrieb verfügbar" : "Pausiert"}</span></summary><p className="my-3 text-xs text-zinc-600">Besuchsregel: {badge.requirement_type === "partner_visit_count" ? `${badge.target_count} bestätigte ${badge.target_count === 1 ? "Besuch" : "Besuche"}` : `${badge.requirement_type} · ${badge.target_count}`}</p>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (pending || submitting.current) return; submitting.current = true; const form = new FormData(event.currentTarget); const input: Record<string, unknown> = {}
      for (const key of ["title", "short_title", "description", "criteria", "icon_key", "accent_key", "rarity"]) input[key] = String(form.get(key) || "").trim() || null
      for (const key of ["sort_order", "layer_count"]) input[key] = String(form.get(key) || "").trim() ? Number(form.get(key)) : null
      input.active = form.get("active") === "on"
      startTransition(async () => {
        try {
          const result = await savePartnerBadge(badge.partner_id, badge.id, input, badge.updated_at)
          setMessage(result.message)
          if (result.ok && result.data) onSaved(result.data)
        } catch { setMessage("Der Speicherstatus konnte nicht bestätigt werden. Deine Eingaben bleiben erhalten. Bitte versuche es erneut.") }
        finally { submitting.current = false }
      })
    }}><fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
      {([ ["title", "Titel", 160], ["short_title", "Kurztitel", 80], ["description", "Beschreibung", 4000], ["criteria", "Erklärung der Bedingung", 2000], ["icon_key", "Symbol", 80], ["accent_key", "Farbe", 80], ["rarity", "Seltenheit", 80] ] as const).map(([key, label, maxLength]) => <label className="text-sm" key={key}>{label}<input className={inputClass} name={key} defaultValue={badge[key] || ""} maxLength={maxLength} required={key === "title" || key === "icon_key"} /></label>)}
      {([ ["sort_order", "Reihenfolge", 0], ["layer_count", "Ebenen", 1] ] as const).map(([key, label, min]) => <label className="text-sm" key={key}>{label}<input className={inputClass} type="number" name={key} min={min} step="1" defaultValue={badge[key] ?? ""} required /></label>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={configuredActive} />Aktiviert</label>
    </fieldset><Notice message={message} /><button className={buttonClass} disabled={pending}>{pending ? "Speichert…" : "Abzeichen speichern"}</button></form>
  </details>
}

export function PartnerConfigurationHistory({ partnerId }: { partnerId: string }) {
  const { result, reload } = useProtectedData(partnerId, loadConfigurationHistory)
  return <details className="rounded-xl border border-zinc-200 bg-white p-4"><summary className="cursor-pointer font-semibold">Änderungsverlauf</summary><p className="my-3 text-sm text-zinc-600">Letzte gespeicherte Änderungen an Vorteilen und Stempelprogrammen.</p>
    {result?.ok && result.data ? <><ol className="space-y-3">{result.data.map(change => { const row = change.after_value || change.before_value || {}; const title = String(row.public_title || row.title || row.reward_item || (change.entity_type === "partners" ? "Stempelprogramm" : change.entity_type === "deals" ? "Vorteil" : "Stempelbelohnung")); return <li key={change.id} className="border-b border-zinc-100 pb-3 text-sm"><p data-admin-i18n-ignore={Boolean(row.public_title || row.title || row.reward_item)} className="font-medium">{title}</p><p className="text-xs text-zinc-500"><AdminDate value={change.created_at} /> · {({ snapshot: "Sicherungsstand", insert: "Erstellt", update: "Geändert", delete: "Entfernt" } as Record<string, string>)[change.operation] || "Gespeichert"}</p></li> })}</ol>{!result.data.length && <p className="text-sm text-zinc-500">Noch keine Änderungen vorhanden.</p>}<button type="button" className="mt-3 text-sm font-semibold text-[#0874d1] underline" onClick={reload}>Verlauf aktualisieren</button></> : <LoadNotice result={result} reload={reload} />}
  </details>
}
