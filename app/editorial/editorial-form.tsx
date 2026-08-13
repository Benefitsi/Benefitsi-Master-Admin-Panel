"use client"

import { useState } from "react"
import Link from "next/link"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import type {
  EditorialAudience,
  EditorialPost,
  EditorialScope,
  EditorialStatus,
  EditorialTarget,
} from "@/lib/editorial-types"

type EditorialAction = (formData: FormData) => void | Promise<void>

type EditorialFormProps = {
  action: EditorialAction
  initial?: EditorialPost | null
  cities: EditorialTarget[]
  partners: EditorialTarget[]
}

const defaultContent = [
  {
    heading: "Der wichtigste Gedanke",
    paragraphs: ["Hier steht der erste Absatz des Beitrags.", "Hier kann ein zweiter Absatz ergänzen."],
  },
]

const defaultSources = [{ label: "Interner Link", url: "/so-funktionierts" }]
const defaultRelatedLinks = [{ label: "Mehr bei Benefitsi", href: "/blog" }]

function jsonValue(value: unknown, fallback: unknown) {
  return JSON.stringify(value ?? fallback, null, 2)
}

function dateTimeLocalValue(value: string | null | undefined) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase("de")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none transition placeholder:text-[#8995a0] focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#061829]/15 bg-white px-4 text-sm font-black text-[#061829] transition hover:border-[#118cff]/40 hover:bg-[#f3f8ff]"

export function EditorialForm({ action, initial, cities, partners }: EditorialFormProps) {
  const [scope, setScope] = useState<EditorialScope>(initial?.scope ?? "global")
  const [title, setTitle] = useState(initial?.title ?? "")
  const [slug, setSlug] = useState(initial?.slug ?? "")
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug))
  const [audience, setAudience] = useState<EditorialAudience>(initial?.audience ?? "benefitsi")
  const [status, setStatus] = useState<EditorialStatus>(initial?.status ?? "draft")

  return (
    <form action={action} className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white shadow-[0_18px_50px_rgba(6,24,41,.05)]">
      {initial ? <input type="hidden" name="postId" value={initial.id} /> : null}

      <div className="border-b border-[#061829]/10 p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Beitrag bearbeiten</p>
        <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">Inhalt, Ziel und Veröffentlichung</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#617080]">
          Ein Beitrag wird erst öffentlich sichtbar, wenn der Status auf „Aktiv“ steht und ein Veröffentlichungszeitpunkt gesetzt ist.
        </p>
      </div>

      <div className="grid gap-5 p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Bereich" helper="Wo soll der Beitrag erscheinen?">
            <select
              name="scope"
              value={scope}
              onChange={(event) => setScope(event.target.value as EditorialScope)}
              className={inputClass}
            >
              <option value="global">Benefitsi Magazin</option>
              <option value="city">Stadtmagazin</option>
              <option value="partner">Partner-Magazin</option>
            </select>
          </Field>
          <Field label="Zielstadt" helper={scope === "city" ? "Pflicht für Stadtbeiträge" : "Nur bei Stadtbeiträgen benötigt"}>
            <select name="cityId" disabled={scope !== "city"} defaultValue={initial?.city_id ?? ""} className={`${inputClass} disabled:bg-[#f3f6f7] disabled:text-[#8995a0]`}>
              <option value="">Stadt auswählen</option>
              {cities.map((city) => <option key={city.id} value={city.id}>{city.name} · /{city.slug}</option>)}
            </select>
          </Field>
          <Field label="Zielpartner" helper={scope === "partner" ? "Pflicht für Partnerbeiträge" : "Nur bei Partnerbeiträgen benötigt"}>
            <select name="partnerId" disabled={scope !== "partner"} defaultValue={initial?.partner_id ?? ""} className={`${inputClass} disabled:bg-[#f3f6f7] disabled:text-[#8995a0]`}>
              <option value="">Partner auswählen</option>
              {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name} · /{partner.slug}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <Field label="Titel" required helper="Konkrete Suchfrage oder klarer Nutzen statt allgemeiner Überschrift.">
            <input name="title" required minLength={3} maxLength={180} value={title} onChange={(event) => { const next = event.target.value; setTitle(next); if (!slugTouched) setSlug(slugify(next)) }} placeholder="z. B. Die besten lokalen Vorteile im August" className={inputClass} />
          </Field>
          <Field label="Slug" required helper="Nur Kleinbuchstaben und Bindestriche.">
            <input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={180} value={slug} onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)) }} placeholder="lokale-vorteile-august" className={inputClass} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Eyebrow">
            <input name="eyebrow" maxLength={120} defaultValue={initial?.eyebrow ?? "Magazin"} className={inputClass} />
          </Field>
          <Field label="Kategorie">
            <input name="category" maxLength={120} defaultValue={initial?.category ?? "Editorial"} className={inputClass} />
          </Field>
          <Field label="Zielgruppe">
            <select name="audience" value={audience} onChange={(event) => setAudience(event.target.value as EditorialAudience)} className={inputClass}>
              <option value="benefitsi">Für Benefitsi-Nutzer</option>
              <option value="partner">Für Partner</option>
            </select>
          </Field>
        </div>

        <Field label="Kurzbeschreibung" required helper="20–500 Zeichen. Wird auf der Magazinübersicht und als SEO-Beschreibung verwendet.">
          <textarea name="excerpt" required minLength={20} maxLength={500} rows={4} defaultValue={initial?.excerpt ?? ""} placeholder="Welche konkrete Frage beantwortet dieser Beitrag?" className={`${inputClass} min-h-28 py-3 leading-6`} />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Titelbild URL" helper="Optional. Nur http:// oder https://.">
            <input name="imageUrl" type="url" maxLength={2000} defaultValue={initial?.image_url ?? ""} placeholder="https://…" className={inputClass} />
          </Field>
          <Field label="Bildbeschreibung">
            <input name="imageAlt" maxLength={300} defaultValue={initial?.image_alt ?? ""} placeholder="Beschreibung für Barrierefreiheit" className={inputClass} />
          </Field>
        </div>

        <Field label="Beitragsinhalt" required helper="Als JSON mit Abschnitten. Die Vorschau nutzt daraus Überschrift und Absätze.">
          <textarea name="contentJson" required rows={16} defaultValue={jsonValue(initial?.content, defaultContent)} className={`${inputClass} min-h-80 py-3 font-mono text-xs leading-6`} />
        </Field>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Quellen und weiterführende Seiten" helper="Array mit label und url. Interne Pfade wie /fuer-partner sind erlaubt.">
            <textarea name="sourcesJson" rows={8} defaultValue={jsonValue(initial?.sources, defaultSources)} className={`${inputClass} min-h-48 py-3 font-mono text-xs leading-6`} />
          </Field>
          <Field label="Verwandte Links" helper="Array mit label und href für die interne Verlinkung.">
            <textarea name="relatedLinksJson" rows={8} defaultValue={jsonValue(initial?.related_links, defaultRelatedLinks)} className={`${inputClass} min-h-48 py-3 font-mono text-xs leading-6`} />
          </Field>
        </div>

        <details className="rounded-2xl border border-[#061829]/10 bg-[#f7f9fa] px-4 py-3 text-sm text-[#526170]">
          <summary className="cursor-pointer font-black text-[#061829]">JSON-Struktur anzeigen</summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5">{`Inhalt:\n[{ "heading": "Überschrift", "paragraphs": ["Absatz 1", "Absatz 2"] }]\n\nQuelle:\n[{ "label": "Für Partner", "url": "/fuer-partner" }]\n\nVerwandter Link:\n[{ "label": "Annweiler entdecken", "href": "/stadt/annweiler" }]`}</pre>
        </details>

        <div className="grid gap-4 md:grid-cols-[220px_220px_1fr] md:items-end">
          <Field label="Status">
            <select name="status" value={status} onChange={(event) => setStatus(event.target.value as EditorialStatus)} className={inputClass}>
              <option value="draft">Entwurf</option>
              <option value="needs_review">Prüfung erforderlich</option>
              <option value="active">Aktiv veröffentlichen</option>
              <option value="archived">Archiviert</option>
            </select>
          </Field>
          <Field label="Veröffentlichung">
            <input name="publishedAt" type="datetime-local" defaultValue={dateTimeLocalValue(initial?.published_at)} className={inputClass} />
          </Field>
          <p className="rounded-xl bg-[#eef8f8] px-3 py-3 text-xs font-semibold leading-5 text-[#22666a]">
            Aktiv bedeutet: Der Beitrag darf auf der öffentlichen Website erscheinen. Entwürfe bleiben ausschließlich im Admin Panel.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#061829]/10 pt-5">
          <Link href="/editorial" className={secondaryButton}>Abbrechen</Link>
          <PendingSubmitButton pendingLabel="Wird gespeichert…" className="min-h-11 rounded-xl bg-[#118cff] px-5 text-sm font-black text-white transition hover:bg-[#0878df]">
            Beitrag speichern
          </PendingSubmitButton>
        </div>
      </div>
    </form>
  )
}

function Field({ label, helper, required, children }: { label: string; helper?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-[#526170]">
      <span className="flex items-center gap-1 text-[#061829]">{label}{required ? <span className="text-[#118cff]">*</span> : null}</span>
      {children}
      {helper ? <span className="text-[11px] font-medium leading-4 text-[#7a8791]">{helper}</span> : null}
    </label>
  )
}
