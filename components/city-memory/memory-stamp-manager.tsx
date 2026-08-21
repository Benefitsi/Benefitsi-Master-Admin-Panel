/* eslint-disable @next/next/no-img-element */

"use client"

import { useState } from "react"
import {
  statusLabels,
  type CityMediaAsset,
  type CityMediaAssignment,
  type CityMediaLibraryData,
} from "@/lib/city-media/contracts"
import type { CityMemoryAdminSlot } from "@/lib/city-memory/config"

type MemorySlotView = CityMemoryAdminSlot & {
  asset: CityMediaAsset | null
  assignment: CityMediaAssignment | null
}

type Props = {
  cityId: string
  cityName: string
  citySlug: string
  initialSlots: MemorySlotView[]
}

type Feedback = { tone: "success" | "error"; message: string } | null

type MetadataValues = {
  title: string
  altText: string
  photographer: string
  copyrightHolder: string
  license: string
  licenseUrl: string
  sourceUrl: string
  provenanceNote: string
}

export function CityMemoryStampManager({ cityId, cityName, citySlug, initialSlots }: Props) {
  const [slots, setSlots] = useState(initialSlots)
  const [busySlotId, setBusySlotId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)

  async function reload() {
    const response = await fetch("/api/media", { cache: "no-store" })
    if (!response.ok) throw new Error("Die Media Library konnte nicht aktualisiert werden.")
    const data = await response.json() as CityMediaLibraryData
    setSlots((currentSlots) => currentSlots.map((slot) => {
      const asset = data.assets.find((candidate) =>
        candidate.cityId === cityId && candidate.assignments.some((assignment) =>
          assignment.cityId === cityId &&
          assignment.entityType === "COLLECTION" &&
          assignment.entityKey === slot.id &&
          assignment.role === "CARD",
        ),
      ) ?? null
      const assignment = asset?.assignments.find((candidate) =>
        candidate.cityId === cityId &&
        candidate.entityType === "COLLECTION" &&
        candidate.entityKey === slot.id &&
        candidate.role === "CARD",
      ) ?? null
      return { ...slot, asset, assignment }
    }))
  }

  async function upload(slot: MemorySlotView, file: File, values: MetadataValues) {
    setBusySlotId(slot.id)
    setFeedback(null)
    try {
      const formData = new FormData()
      formData.set("citySlug", citySlug)
      formData.set("file", file)
      formData.set("title", values.title)
      formData.set("altText", values.altText)
      formData.set("photographer", values.photographer)
      formData.set("copyrightHolder", values.copyrightHolder)
      formData.set("license", values.license)
      formData.set("licenseUrl", values.licenseUrl)
      formData.set("sourceUrl", values.sourceUrl)
      formData.set("provenanceNote", values.provenanceNote)
      formData.set("sourceType", "MANUAL_UPLOAD")
      formData.set("status", "DRAFT")

      const uploadResponse = await fetch("/api/media", { method: "POST", body: formData })
      const uploadResult = await uploadResponse.json().catch(() => ({})) as { error?: string; asset?: { id?: string } }
      if (!uploadResponse.ok || !uploadResult.asset?.id) {
        throw new Error(mediaError(uploadResult.error))
      }

      const assignmentResponse = await fetch(`/api/media/${uploadResult.asset.id}/assignments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType: "COLLECTION",
          role: "CARD",
          cityId,
          entityKey: slot.id,
          sortOrder: slot.number,
          isPrimary: true,
          manualLock: true,
        }),
      })
      const assignmentResult = await assignmentResponse.json().catch(() => ({})) as { error?: string }
      if (!assignmentResponse.ok) {
        await fetch(`/api/media/${uploadResult.asset.id}`, { method: "DELETE" })
        throw new Error(mediaError(assignmentResult.error))
      }

      await reload()
      setFeedback({
        tone: "success",
        message: `${memoryCode(slot.cityCode, slot.number)} ${slot.displayName} als Entwurf gespeichert.`,
      })
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Upload fehlgeschlagen." })
    } finally {
      setBusySlotId(null)
    }
  }

  async function update(slot: MemorySlotView, action: string, values: Partial<MetadataValues> = {}) {
    setBusySlotId(slot.id)
    setFeedback(null)
    try {
      const response = await fetch(`/api/city-pages/${encodeURIComponent(citySlug)}/memory-stamps`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memoryId: slot.id, action, ...values }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(memoryError(result.error))
      await reload()
      setFeedback({ tone: "success", message: actionSuccess(action, slot.displayName) })
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Aktion fehlgeschlagen." })
    } finally {
      setBusySlotId(null)
    }
  }

  return (
    <div className="space-y-5">
      {feedback ? (
        <div role={feedback.tone === "error" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          {feedback.message}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,.44fr)]">
        <div className="rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_18px_50px_rgba(6,24,41,.04)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Manuelles Artwork</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">Zehn feste Memory-Slots</h2>
            </div>
            <span className="rounded-full bg-[#e9f8f8] px-3 py-1.5 text-xs font-black text-[#087f84]">{cityName}</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#617080]">Lade pro Ort ein passendes Stamp-Motiv hoch. Das Bild wird automatisch in der bestehenden City Media Library angelegt, mit dem Memory-Slot verknüpft und zunächst als Entwurf gespeichert.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <WorkflowStep number="1" title="Bild hochladen" text="JPG, PNG, WebP oder AVIF · max. 10 MB" />
            <WorkflowStep number="2" title="Metadaten prüfen" text="Alt-Text, Urheber und Quelle ergänzen" />
            <WorkflowStep number="3" title="Freigeben" text="Prüfung und Veröffentlichung getrennt" />
          </div>
        </div>
        <aside className="rounded-3xl border border-[#e6d4a7] bg-[#fff8df] p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#946500]">Schutzregel</p>
          <h2 className="mt-2 text-xl font-black text-[#5f4817]">ANN · 10 bleibt reserviert</h2>
          <p className="mt-2 text-sm leading-6 text-[#765f26]">Bahnhof Annweiler kann intern als Entwurf vorbereitet werden. Ohne echte Place-Relation bleiben Review, Veröffentlichung, Link und Kartenmarker gesperrt.</p>
          <div className="mt-4 rounded-2xl border border-[#e6d4a7] bg-white/60 px-3.5 py-3 text-xs font-bold leading-5 text-[#765f26]">Die Sperre gilt zusätzlich in der allgemeinen Media-API.</div>
        </aside>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {slots.map((slot) => (
          <MemoryStampSlotCard
            key={`${slot.id}:${slot.asset?.id ?? "empty"}:${slot.asset?.updatedAt ?? ""}`}
            slot={slot}
            busy={busySlotId === slot.id}
            onUpload={upload}
            onUpdate={update}
          />
        ))}
      </section>
    </div>
  )
}

function MemoryStampSlotCard({
  slot,
  busy,
  onUpload,
  onUpdate,
}: {
  slot: MemorySlotView
  busy: boolean
  onUpload: (slot: MemorySlotView, file: File, values: MetadataValues) => Promise<void>
  onUpdate: (slot: MemorySlotView, action: string, values?: Partial<MetadataValues>) => Promise<void>
}) {
  const [title, setTitle] = useState(slot.asset?.title ?? `${slot.cityCode} · ${slot.displayName}`)
  const [altText, setAltText] = useState(slot.asset?.altText ?? `Memory Stamp Artwork für ${slot.displayName}`)
  const [photographer, setPhotographer] = useState(slot.asset?.photographer ?? "")
  const [copyrightHolder, setCopyrightHolder] = useState(slot.asset?.copyrightHolder ?? "")
  const [license, setLicense] = useState(slot.asset?.license ?? "")
  const [licenseUrl, setLicenseUrl] = useState(slot.asset?.licenseUrl ?? "")
  const [sourceUrl, setSourceUrl] = useState(slot.asset?.sourceUrl ?? "")
  const [provenanceNote, setProvenanceNote] = useState(slot.asset?.provenanceNote ?? "")

  const pending = slot.status === "PENDING_PLACE_RELATION"
  const asset = slot.asset
  const values = { title, altText, photographer, copyrightHolder, license, licenseUrl, sourceUrl, provenanceNote }
  const canSubmitReview = Boolean(asset && !pending && ["DRAFT", "REJECTED"].includes(asset.status))
  const canPublish = Boolean(asset && !pending && asset.status === "REVIEW")
  const canArchive = Boolean(asset && asset.status !== "ARCHIVED")

  return (
    <article className={`overflow-hidden rounded-3xl border bg-white shadow-[0_12px_35px_rgba(6,24,41,.05)] ${pending ? "border-dashed border-[#c7d0c9]" : "border-[#061829]/10"}`}>
      <div className="relative aspect-[1.55] overflow-hidden bg-[#edf2ef]">
        {asset ? <img src={asset.publicUrl} alt={asset.altText ?? ""} className="size-full object-cover" /> : <div className="grid size-full place-items-center bg-[radial-gradient(circle_at_35%_28%,#fffdf8_0%,#f5ead8_56%,#e3c89e_100%)] text-[#9a6f32]"><StampIcon className="size-14" /></div>}
        <div className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-[.12em] text-[#061829]">{slot.cityCode} · {String(slot.number).padStart(2, "0")}</div>
        <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-black ${pending ? "bg-[#f0f2ef]/95 text-[#6f7b74]" : asset?.status === "PUBLISHED" ? "bg-emerald-100/95 text-emerald-800" : "bg-amber-100/95 text-amber-900"}`}>
          {pending ? "Bald verfügbar" : asset ? statusLabels[asset.status] : "Kein Bild"}
        </span>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[10px] font-black uppercase tracking-[.14em] ${pending ? "text-[#7b8780]" : "text-[#9a6f32]"}`}>{slot.cityCode} · {String(slot.number).padStart(2, "0")}</p>
              <h3 className="mt-1 text-lg font-black leading-tight tracking-[-.025em] text-[#061829]">{slot.displayName}</h3>
            </div>
            {slot.placeCanonicalSlug ? <span className="rounded-full bg-[#f3f8ff] px-2 py-1 text-[10px] font-black text-[#0b75d9]">Place verknüpft</span> : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-[#617080]">{slot.description}</p>
        </div>

        {pending ? <p className="rounded-xl border border-dashed border-[#c7d0c9] bg-[#f4f6f3] px-3 py-2 text-xs font-bold leading-5 text-[#6f7b74]">Nur interner Entwurf möglich · keine Veröffentlichung ohne echte Place-Relation.</p> : null}

        <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-[.08em] text-[#71808b]">
          Bild auswählen oder ersetzen
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void onUpload(slot, file, values)
            }}
            className="min-h-11 rounded-xl border border-dashed border-[#118cff]/35 bg-[#f7fbff] px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-[#526170] file:mr-3 file:rounded-lg file:border-0 file:bg-[#118cff] file:px-2.5 file:py-1.5 file:text-xs file:font-black file:text-white"
          />
        </label>

        <div className="grid gap-3">
          <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-[.08em] text-[#71808b]">Titel<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} className={inputClass} /></label>
          <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-[.08em] text-[#71808b]">Alt-Text<input value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={400} className={inputClass} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-[.08em] text-[#71808b]">Fotograf<input value={photographer} onChange={(event) => setPhotographer(event.target.value)} maxLength={240} placeholder="z. B. Benefitsi" className={inputClass} /></label>
            <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-[.08em] text-[#71808b]">Urheber<input value={copyrightHolder} onChange={(event) => setCopyrightHolder(event.target.value)} maxLength={240} placeholder="z. B. Benefitsi" className={inputClass} /></label>
            <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-[.08em] text-[#71808b]">Lizenz<input value={license} onChange={(event) => setLicense(event.target.value)} maxLength={160} placeholder="z. B. eigene Illustration" className={inputClass} /></label>
            <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-[.08em] text-[#71808b]">Lizenz-URL<input value={licenseUrl} onChange={(event) => setLicenseUrl(event.target.value)} type="url" placeholder="https://…" className={inputClass} /></label>
          </div>
          <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-[.08em] text-[#71808b]">Quell-URL<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} type="url" placeholder="https://…" className={inputClass} /></label>
          <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-[.08em] text-[#71808b]">Herkunftsnotiz<textarea value={provenanceNote} onChange={(event) => setProvenanceNote(event.target.value)} rows={2} maxLength={2000} placeholder="Was ist belegt, was ist unbekannt?" className={`${inputClass} py-2`} /></label>
          <button type="button" disabled={busy || !asset} onClick={() => void onUpdate(slot, "save", values)} className={secondaryButton}>{busy ? "Speichern …" : "Metadaten speichern"}</button>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[#061829]/10 pt-4">
          {canSubmitReview ? <button type="button" disabled={busy} onClick={() => void onUpdate(slot, "submit_review")} className={primaryButton}>{busy ? "Bitte warten …" : "Zur Prüfung geben"}</button> : null}
          {canPublish ? <button type="button" disabled={busy} onClick={() => void onUpdate(slot, "publish")} className={primaryButton}>{busy ? "Bitte warten …" : "Veröffentlichen"}</button> : null}
          {canArchive ? <button type="button" disabled={busy} onClick={() => void onUpdate(slot, "archive")} className={archiveButton}>Archivieren</button> : null}
          {!asset ? <span className="inline-flex min-h-10 items-center rounded-xl bg-[#f8faf9] px-3 text-xs font-bold text-[#71808b]">Noch kein Asset</span> : null}
        </div>
      </div>
    </article>
  )
}

function WorkflowStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="rounded-2xl border border-[#061829]/10 bg-[#f8faf9] p-3"><span className="grid size-7 place-items-center rounded-full bg-[#118cff] text-xs font-black text-white">{number}</span><p className="mt-2 text-xs font-black text-[#061829]">{title}</p><p className="mt-1 text-[11px] leading-5 text-[#71808b]">{text}</p></div>
}

function actionSuccess(action: string, title: string) {
  const labels: Record<string, string> = {
    save: "Metadaten gespeichert",
    submit_review: "Zur Prüfung eingereicht",
    publish: "Memory-Bild veröffentlicht",
    archive: "Memory-Bild archiviert",
  }
  return `${title}: ${labels[action] ?? "Änderung gespeichert"}.`
}

function memoryCode(cityCode: string, number: number) {
  return `${cityCode} · ${String(number).padStart(2, "0")}`
}

function mediaError(error?: string) {
  return ({
    city_and_file_required: "Stadt und Bilddatei sind erforderlich.",
    unsupported_media_type: "Nur JPG, PNG, WebP oder AVIF sind erlaubt.",
    file_too_large: "Das Bild ist größer als 10 MB.",
    file_empty: "Bitte wähle eine nicht leere Bilddatei aus.",
    invalid_image: "Die Datei ist kein gültiges Bild.",
    city_not_found: "Die Stadt wurde nicht gefunden.",
    duplicate_asset: "Dieses Bild ist für die Stadt bereits vorhanden.",
    storage_upload_failed: "Der Upload in Supabase Storage ist fehlgeschlagen.",
    pending_place_relation: "ANN · 10 bleibt bis zur echten Bahnhof-Place-Relation intern.",
  } as Record<string, string>)[error ?? ""] || "Upload fehlgeschlagen."
}

function memoryError(error?: string) {
  return ({
    invalid_memory_action: "Die Aktion ist nicht gültig.",
    memory_slot_not_found: "Der Memory-Slot wurde nicht gefunden.",
    memory_asset_not_found: "Für diesen Slot ist noch kein Asset zugewiesen.",
    asset_not_found: "Das Asset wurde nicht gefunden.",
    asset_city_mismatch: "Das Asset gehört zu einer anderen Stadt.",
    pending_place_relation: "Dieser Slot bleibt bis zur echten Place-Relation unveröffentlicht.",
    memory_asset_update_failed: "Das Memory-Asset konnte nicht gespeichert werden.",
    no_memory_changes: "Es gibt keine Änderungen zu speichern.",
  } as Record<string, string>)[error ?? ""] || "Aktion fehlgeschlagen."
}

function StampIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}><circle cx="32" cy="32" r="25" stroke="currentColor" strokeWidth="3" strokeDasharray="3 4" /><path d="m21 33 7 7 15-17" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

const inputClass = "min-h-10 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"
const primaryButton = "inline-flex min-h-10 items-center justify-center rounded-xl bg-[#118cff] px-3.5 text-xs font-black text-white transition hover:bg-[#0878df] disabled:cursor-not-allowed disabled:opacity-50"
const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-xl border border-[#061829]/15 bg-white px-3.5 text-xs font-black text-[#061829] transition hover:border-[#118cff]/40 hover:bg-[#f3f8ff] disabled:cursor-not-allowed disabled:opacity-50"
const archiveButton = "inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-200 bg-white px-3.5 text-xs font-black text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
