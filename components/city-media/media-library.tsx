/* eslint-disable @next/next/no-img-element */

"use client"

import {
  useMemo,
  useState,
  type FormEvent,
} from "react"
import {
  entityTypeLabels,
  mediaEntityTypes,
  mediaRoles,
  mediaStatuses,
  mediaSourceTypes,
  roleLabels,
  sourceLabels,
  statusLabels,
  type CityMediaAsset,
  type CityMediaAssignment,
  type CityMediaEntityType,
  type CityMediaLibraryData,
  type CityMediaRole,
  type CityMediaStatus,
  type CityMediaSourceType,
} from "@/lib/city-media/contracts"

type Props = {
  initialData: CityMediaLibraryData
  initialCitySlug?: string
  initialEntityType?: string
  initialEntityId?: string
  initialEntityKey?: string
}

type Feedback = { tone: "success" | "error"; message: string } | null

export function CityMediaLibrary({
  initialData,
  initialCitySlug,
  initialEntityType,
  initialEntityId,
  initialEntityKey,
}: Props) {
  const [data, setData] = useState(initialData)
  const [selectedId, setSelectedId] = useState<string | null>(initialData.assets[0]?.id ?? null)
  const [query, setQuery] = useState("")
  const [cityFilter, setCityFilter] = useState(initialCitySlug ?? "")
  const [entityFilter, setEntityFilter] = useState<CityMediaEntityType | "">(
    isEntityType(initialEntityType) ? initialEntityType : "",
  )
  const [roleFilter, setRoleFilter] = useState<CityMediaRole | "">("")
  const [sourceFilter, setSourceFilter] = useState<CityMediaSourceType | "">("")
  const [statusFilter, setStatusFilter] = useState<CityMediaStatus | "">("")
  const [missingOnly, setMissingOnly] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState(false)

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de")
    return data.assets.filter((asset) => {
      if (cityFilter && asset.citySlug !== cityFilter) return false
      if (entityFilter && !asset.assignments.some((assignment) => assignment.entityType === entityFilter)) return false
      if (roleFilter && !asset.assignments.some((assignment) => assignment.role === roleFilter)) return false
      if (sourceFilter && asset.sourceType !== sourceFilter) return false
      if (statusFilter && asset.status !== statusFilter) return false
      if (missingOnly && asset.altText && asset.provenanceNote && asset.license) return false
      if (!needle) return true
      const haystack = [
        asset.title,
        asset.altText,
        asset.cityName,
        asset.citySlug,
        asset.sourceUrl,
        asset.provenanceNote,
        ...asset.assignments.flatMap((assignment) => [
          assignment.entityLabel,
          assignment.entityKey,
          assignment.entityId,
          assignment.entityType,
          assignment.role,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de")
      return haystack.includes(needle)
    })
  }, [cityFilter, data.assets, entityFilter, missingOnly, query, roleFilter, sourceFilter, statusFilter])

  const selectedAsset = data.assets.find((asset) => asset.id === selectedId) ?? null

  async function reload(preferredId = selectedId) {
    const response = await fetch("/api/media", { cache: "no-store" })
    if (!response.ok) throw new Error("Die Media Library konnte nicht aktualisiert werden.")
    const nextData = (await response.json()) as CityMediaLibraryData
    setData(nextData)
    if (preferredId && nextData.assets.some((asset) => asset.id === preferredId)) setSelectedId(preferredId)
    else setSelectedId(nextData.assets[0]?.id ?? null)
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setFeedback(null)
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      const response = await fetch("/api/media", { method: "POST", body: form })
      const result = await response.json().catch(() => ({})) as { error?: string; asset?: CityMediaAsset }
      if (!response.ok) throw new Error(uploadError(result.error))
      await reload(result.asset?.id ?? null)
      formElement.reset()
      setFeedback({ tone: "success", message: "Asset hochgeladen. Du kannst es jetzt einer Entity-Rolle zuweisen." })
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Upload fehlgeschlagen." })
    } finally {
      setBusy(false)
    }
  }

  async function requestJson(url: string, init: RequestInit, successMessage: string, preferredId = selectedId) {
    setBusy(true)
    setFeedback(null)
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      })
      const result = await response.json().catch(() => ({})) as { error?: string; assignments?: unknown[] }
      if (!response.ok) {
        if (result.error === "asset_in_use") throw new Error("Dieses Asset wird noch verwendet. Entferne zuerst alle Zuweisungen.")
        throw new Error(apiError(result.error))
      }
      await reload(preferredId)
      setFeedback({ tone: "success", message: successMessage })
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Aktion fehlgeschlagen." })
    } finally {
      setBusy(false)
    }
  }

  async function archiveAsset() {
    if (!selectedAsset || selectedAsset.status === "ARCHIVED" || !window.confirm("Asset wirklich archivieren?")) return
    await requestJson(
      `/api/media/${selectedAsset.id}`,
      { method: "PATCH", body: JSON.stringify({ status: "ARCHIVED" }) },
      "Asset archiviert.",
    )
  }

  async function deleteAsset() {
    if (!selectedAsset || selectedAsset.assignments.length) return
    if (!window.confirm("Asset endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return
    await requestJson(`/api/media/${selectedAsset.id}`, { method: "DELETE" }, "Asset endgültig gelöscht.", null)
  }

  return (
    <div className="space-y-5">
      {feedback ? (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,.44fr)]">
        <div className="rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_18px_50px_rgba(6,24,41,.05)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Media Library</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">Assets hochladen und kuratieren</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#617080]">
                Eine Datei kann mehreren Rollen zugeordnet werden. Die Sperre gilt immer nur für die konkrete Entity-Rolle.
              </p>
            </div>
            <span className="rounded-full bg-[#e9f8f8] px-3 py-1.5 text-xs font-black text-[#087f84]">{data.assets.length} Assets</span>
          </div>

          <form onSubmit={upload} className="mt-5 grid gap-4 rounded-2xl border border-dashed border-[#118cff]/35 bg-[#f7fbff] p-4 sm:grid-cols-2">
            <label className="grid gap-2 text-xs font-bold text-[#526170] sm:col-span-2">
              Bilddatei
              <input name="file" type="file" required accept="image/jpeg,image/png,image/webp,image/avif" className="min-h-12 rounded-xl border border-[#061829]/15 bg-white px-3 py-3 text-sm" />
              <span className="font-medium text-[#7a8793]">JPG, PNG, WebP oder AVIF · maximal 10 MB</span>
            </label>
            <label className="grid gap-2 text-xs font-bold text-[#526170]">
              Stadt
              <select name="citySlug" required defaultValue={initialCitySlug ?? data.cities[0]?.slug ?? ""} className={inputClass}>
                {data.cities.map((city) => <option key={city.id} value={city.slug}>{city.name}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-xs font-bold text-[#526170]">
              Status
              <select name="status" defaultValue="PUBLISHED" className={inputClass}>
                {mediaStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-xs font-bold text-[#526170]">
              Titel (optional)
              <input name="title" maxLength={240} placeholder="z. B. Reichsburg Trifels bei Sonnenlicht" className={inputClass} />
            </label>
            <label className="grid gap-2 text-xs font-bold text-[#526170]">
              Alt-Text (optional)
              <input name="altText" maxLength={400} placeholder="Was ist auf dem Bild zu sehen?" className={inputClass} />
            </label>
            <label className="grid gap-2 text-xs font-bold text-[#526170]">
              Quelle (optional)
              <input name="sourceUrl" type="url" placeholder="https://…" className={inputClass} />
            </label>
            <label className="grid gap-2 text-xs font-bold text-[#526170]">
              Source Type
              <select name="sourceType" defaultValue="MANUAL_UPLOAD" className={inputClass}>
                {mediaSourceTypes.map((source) => <option key={source} value={source}>{sourceLabels[source]}</option>)}
              </select>
            </label>
            <div className="flex items-end sm:col-span-2">
              <button type="submit" disabled={busy} className={`${primaryButton} w-full sm:w-auto`}>
                {busy ? "Bitte warten …" : "Asset hochladen"}
              </button>
            </div>
          </form>
        </div>

        <aside className="rounded-3xl border border-[#061829]/10 bg-[#061829] p-5 text-white sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#17d4d7]">Priorität</p>
          <h2 className="mt-2 text-xl font-black">Manuelle Auswahl bleibt führend</h2>
          <ol className="mt-4 space-y-2 text-sm leading-6 text-white/72">
            <li><strong className="text-white">1.</strong> Gesperrte manuelle Rolle</li>
            <li><strong className="text-white">2.</strong> Manuelle Auswahl</li>
            <li><strong className="text-white">3.</strong> Verifiziertes Entity-/Partnerbild</li>
            <li><strong className="text-white">4.</strong> Offizielle/Tourismusquelle</li>
            <li><strong className="text-white">5.</strong> Agent-Vorschlag</li>
            <li><strong className="text-white">6.</strong> Neutraler Fallback</li>
          </ol>
        </aside>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(15rem,.36fr)_minmax(0,1fr)]">
        <div className="rounded-3xl border border-[#061829]/10 bg-white p-4 shadow-[0_18px_50px_rgba(6,24,41,.04)] sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Bibliothek</p>
              <h2 className="mt-1 text-xl font-black">Suchen & filtern</h2>
            </div>
            <span className="text-xs font-bold text-[#617080]">{filteredAssets.length} Treffer</span>
          </div>
          <div className="mt-4 grid gap-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titel, Entity, Quelle …" className={inputClass} />
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} className={inputClass}>
              <option value="">Alle Städte</option>
              {data.cities.map((city) => <option key={city.id} value={city.slug}>{city.name}</option>)}
            </select>
            <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value as CityMediaEntityType | "")} className={inputClass}>
              <option value="">Alle Entity-Typen</option>
              {mediaEntityTypes.map((type) => <option key={type} value={type}>{entityTypeLabels[type]}</option>)}
            </select>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as CityMediaRole | "")} className={inputClass}>
              <option value="">Alle Rollen</option>
              {mediaRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
            </select>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as CityMediaSourceType | "")} className={inputClass}>
              <option value="">Alle Quellen</option>
              {mediaSourceTypes.map((source) => <option key={source} value={source}>{sourceLabels[source]}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CityMediaStatus | "")} className={inputClass}>
              <option value="">Alle Status</option>
              {mediaStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
            </select>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#061829]/12 bg-[#f8faf9] px-3 text-xs font-bold text-[#526170]">
              <input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} className="size-4 accent-[#118cff]" />
              Fehlende Metadaten
            </label>
          </div>
          <div className="mt-4 max-h-[42rem] space-y-2 overflow-y-auto pr-1">
            {filteredAssets.length ? filteredAssets.map((asset) => (
              <button key={asset.id} type="button" onClick={() => setSelectedId(asset.id)} className={`flex w-full gap-3 rounded-2xl border p-2 text-left transition ${asset.id === selectedId ? "border-[#118cff] bg-[#f3f8ff] shadow-[0_0_0_3px_rgba(17,140,255,.1)]" : "border-[#061829]/10 bg-white hover:border-[#118cff]/40"}`}>
                <img src={asset.publicUrl} alt="" className="size-16 shrink-0 rounded-xl bg-[#e9eef0] object-cover" />
                <span className="min-w-0 py-1">
                  <strong className="block truncate text-sm font-black text-[#061829]">{asset.title || asset.altText || "Unbenanntes Asset"}</strong>
                  <span className="mt-1 block truncate text-xs text-[#617080]">{asset.cityName || "Global"} · {asset.assignments.length} Verwendung{asset.assignments.length === 1 ? "" : "en"}</span>
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${asset.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{statusLabels[asset.status]}</span>
                </span>
              </button>
            )) : <p className="rounded-2xl border border-dashed border-[#061829]/15 p-5 text-center text-sm text-[#617080]">Keine Assets passen zu den Filtern.</p>}
          </div>
        </div>

        {selectedAsset ? (
          <AssetInspector
            key={selectedAsset.id}
            asset={selectedAsset}
            data={data}
            busy={busy}
            initialEntityType={initialEntityType}
            initialEntityId={initialEntityId}
            initialEntityKey={initialEntityKey}
            onRequest={requestJson}
            onArchive={archiveAsset}
            onDelete={deleteAsset}
          />
        ) : (
          <div className="grid min-h-96 place-items-center rounded-3xl border border-dashed border-[#061829]/15 bg-white p-8 text-center text-sm text-[#617080]">Wähle ein Asset aus oder lade ein neues Bild hoch.</div>
        )}
      </section>
    </div>
  )
}

function AssetInspector({
  asset,
  data,
  busy,
  initialEntityType,
  initialEntityId,
  initialEntityKey,
  onRequest,
  onArchive,
  onDelete,
}: {
  asset: CityMediaAsset
  data: CityMediaLibraryData
  busy: boolean
  initialEntityType?: string
  initialEntityId?: string
  initialEntityKey?: string
  onRequest: (url: string, init: RequestInit, successMessage: string, preferredId?: string | null) => Promise<void>
  onArchive: () => Promise<void>
  onDelete: () => Promise<void>
}) {
  const initialAssignment = asset.assignments.find((assignment) => (
    (!initialEntityType || assignment.entityType === initialEntityType) &&
    (!initialEntityId || assignment.entityId === initialEntityId) &&
    (!initialEntityKey || assignment.entityKey === initialEntityKey)
  )) ?? asset.assignments[0]
  const initialEntityTypeValue = isEntityType(initialEntityType)
    ? initialEntityType
    : initialAssignment?.entityType ?? "PLACE"
  const [cityId, setCityId] = useState(asset.cityId ?? initialAssignment?.cityId ?? data.cities[0]?.id ?? "")
  const [entityType, setEntityType] = useState<CityMediaEntityType>(initialEntityTypeValue)
  const [entityRef, setEntityRef] = useState(initialEntityId || initialEntityKey || initialAssignment?.entityId || initialAssignment?.entityKey || "")
  const [role, setRole] = useState<CityMediaRole>(initialAssignment?.role ?? "HERO")
  const [isPrimary, setIsPrimary] = useState(initialAssignment?.isPrimary ?? true)
  const [manualLock, setManualLock] = useState(initialAssignment?.manualLock ?? true)
  const [focalX, setFocalX] = useState(initialAssignment?.focalX ?? 0.5)
  const [focalY, setFocalY] = useState(initialAssignment?.focalY ?? 0.5)
  const [altText, setAltText] = useState(asset.altText ?? "")
  const [title, setTitle] = useState(asset.title ?? "")
  const [photographer, setPhotographer] = useState(asset.photographer ?? "")
  const [copyrightHolder, setCopyrightHolder] = useState(asset.copyrightHolder ?? "")
  const [license, setLicense] = useState(asset.license ?? "")
  const [licenseUrl, setLicenseUrl] = useState(asset.licenseUrl ?? "")
  const [sourceUrl, setSourceUrl] = useState(asset.sourceUrl ?? "")
  const [provenanceNote, setProvenanceNote] = useState(asset.provenanceNote ?? "")
  const [sourceType, setSourceType] = useState<CityMediaSourceType>(asset.sourceType)
  const [status, setStatus] = useState<CityMediaStatus>(asset.status)
  const city = data.cities.find((item) => item.id === cityId)
  const entityOptions = data.entityOptions.filter((option) => option.cityId === cityId && option.entityType === entityType)
  const usesManualEntityKey = entityType === "COLLECTION" || entityType === "HUB" || entityOptions.length === 0
  const selectedEntity = entityOptions.find((option) => option.id === entityRef || option.key === entityRef) ?? (
    usesManualEntityKey && entityRef.trim()
      ? { cityId, entityType, key: entityRef.trim(), label: `${entityTypeLabels[entityType]} · ${entityRef.trim()}` }
      : undefined
  )

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onRequest(`/api/media/${asset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title, altText, photographer, copyrightHolder, license, licenseUrl, sourceUrl, provenanceNote, sourceType, status }),
    }, "Metadaten gespeichert.")
  }

  const metadataDirty = [
    title !== (asset.title ?? ""),
    altText !== (asset.altText ?? ""),
    photographer !== (asset.photographer ?? ""),
    copyrightHolder !== (asset.copyrightHolder ?? ""),
    license !== (asset.license ?? ""),
    licenseUrl !== (asset.licenseUrl ?? ""),
    sourceUrl !== (asset.sourceUrl ?? ""),
    provenanceNote !== (asset.provenanceNote ?? ""),
    sourceType !== asset.sourceType,
    status !== asset.status,
  ].some(Boolean)

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedEntity || !city) return
    await onRequest(`/api/media/${asset.id}/assignments`, {
      method: "POST",
      body: JSON.stringify({ cityId: city.id, entityType, entityId: selectedEntity.id, entityKey: selectedEntity.key, role, isPrimary, manualLock, focalX, focalY }),
    }, `${roleLabels[role]} für ${selectedEntity.label} gespeichert.`)
  }

  async function updateAssignment(assignment: CityMediaAssignment, patch: Record<string, unknown>, message: string) {
    await onRequest(`/api/media/assignments/${assignment.id}`, { method: "PATCH", body: JSON.stringify(patch) }, message)
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_18px_50px_rgba(6,24,41,.05)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Asset Inspector</p>
            <h2 className="mt-1 truncate text-2xl font-black tracking-[-0.035em]">{asset.title || "Unbenanntes Asset"}</h2>
            <p className="mt-1 text-sm text-[#617080]">{asset.cityName || "Global"} · {asset.mimeType} · {asset.width && asset.height ? `${asset.width} × ${asset.height}px` : "Dimension unbekannt"} · {formatBytes(asset.fileSizeBytes)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#e9f8f8] px-3 py-1.5 text-xs font-black text-[#087f84]">{sourceLabels[asset.sourceType]}</span>
            <span className={`rounded-full px-3 py-1.5 text-xs font-black ${asset.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{statusLabels[asset.status]}</span>
            <button type="button" disabled={busy || asset.status === "ARCHIVED"} onClick={onArchive} className="min-h-9 rounded-xl border border-amber-200 px-3 text-xs font-black text-amber-800 transition hover:bg-amber-50">{asset.status === "ARCHIVED" ? "Bereits archiviert" : "Archivieren"}</button>
            {asset.assignments.length ? (
              <span title="Entferne zuerst alle Zuweisungen, bevor das Asset dauerhaft gelöscht werden kann." className="inline-flex min-h-9 items-center rounded-xl border border-[#061829]/10 bg-[#f8faf9] px-3 text-[11px] font-black text-[#617080]">Löschen nach Zuweisung</span>
            ) : (
              <button type="button" disabled={busy} onClick={onDelete} className="min-h-9 rounded-xl border border-rose-200 px-3 text-xs font-black text-rose-700 transition hover:bg-rose-50">Löschen</button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Preview title="Hero Desktop" src={asset.publicUrl} alt={asset.altText ?? ""} className="aspect-[16/7]" objectPosition={`${focalX * 100}% ${focalY * 100}%`} />
          <Preview title="Hero Mobile" src={asset.publicUrl} alt={asset.altText ?? ""} className="mx-auto aspect-[9/14] w-2/3 md:w-full" objectPosition={`${focalX * 100}% ${focalY * 100}%`} />
          <Preview title="Card" src={asset.publicUrl} alt={asset.altText ?? ""} className="aspect-[4/3]" objectPosition={`${focalX * 100}% ${focalY * 100}%`} />
        </div>
        {asset.assignments.length && asset.status !== "PUBLISHED" ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900" role="status">Zugewiesen, aber noch nicht veröffentlicht. Öffentliche City-Flächen verwenden nur veröffentlichte Assets.</p> : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={saveMetadata} className="rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_18px_50px_rgba(6,24,41,.04)] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Provenance & Accessibility</p>
          <h3 className="mt-1 text-xl font-black">Metadaten</h3>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-2 text-xs font-bold text-[#526170]">Titel<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} className={inputClass} /></label>
            <label className="grid gap-2 text-xs font-bold text-[#526170]">Alt-Text<input value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={400} placeholder="Keine Keyword-Texte; Motiv klar beschreiben." className={inputClass} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-bold text-[#526170]">Fotograf<input value={photographer} onChange={(event) => setPhotographer(event.target.value)} maxLength={240} placeholder="UNKNOWN, wenn unbekannt" className={inputClass} /></label>
              <label className="grid gap-2 text-xs font-bold text-[#526170]">Copyright<input value={copyrightHolder} onChange={(event) => setCopyrightHolder(event.target.value)} maxLength={240} placeholder="UNKNOWN, wenn unbekannt" className={inputClass} /></label>
              <label className="grid gap-2 text-xs font-bold text-[#526170]">Lizenz<input value={license} onChange={(event) => setLicense(event.target.value)} maxLength={160} placeholder="z. B. CC BY-SA 4.0" className={inputClass} /></label>
              <label className="grid gap-2 text-xs font-bold text-[#526170]">Lizenz-URL<input value={licenseUrl} onChange={(event) => setLicenseUrl(event.target.value)} type="url" className={inputClass} /></label>
            </div>
            <label className="grid gap-2 text-xs font-bold text-[#526170]">Quell-URL<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} type="url" className={inputClass} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-bold text-[#526170]">Source Type<select value={sourceType} onChange={(event) => setSourceType(event.target.value as CityMediaSourceType)} className={inputClass}>{mediaSourceTypes.map((source) => <option key={source} value={source}>{sourceLabels[source]}</option>)}</select></label>
              <label className="grid gap-2 text-xs font-bold text-[#526170]">Verifizierungsstatus<select value={status} onChange={(event) => setStatus(event.target.value as CityMediaStatus)} className={inputClass}>{mediaStatuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label>
            </div>
            <label className="grid gap-2 text-xs font-bold text-[#526170]">Herkunftsnotiz<textarea value={provenanceNote} onChange={(event) => setProvenanceNote(event.target.value)} rows={3} maxLength={2000} placeholder="Was ist belegt, was ist unbekannt?" className={`${inputClass} py-3`} /></label>
            {metadataDirty ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900" role="status">Ungespeicherte Änderungen</p> : <p className="text-xs font-bold text-[#71808b]" role="status">Alle Metadaten gespeichert</p>}
            <button type="submit" disabled={busy || !metadataDirty} className={primaryButton}>{busy ? "Speichern …" : "Metadaten speichern"}</button>
          </div>
        </form>

        <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_18px_50px_rgba(6,24,41,.04)] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Assignment</p>
          <h3 className="mt-1 text-xl font-black">Rolle zuweisen</h3>
          <form onSubmit={assign} className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-bold text-[#526170]">Stadt<select value={cityId} onChange={(event) => { setCityId(event.target.value); setEntityRef("") }} className={inputClass}>{data.cities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="grid gap-2 text-xs font-bold text-[#526170]">Entity-Typ<select value={entityType} onChange={(event) => { setEntityType(event.target.value as CityMediaEntityType); setEntityRef("") }} className={inputClass}>{mediaEntityTypes.map((type) => <option key={type} value={type}>{entityTypeLabels[type]}</option>)}</select></label>
            </div>
            <label className="grid gap-2 text-xs font-bold text-[#526170]">
              Entity
              {usesManualEntityKey ? (
                <input value={entityRef} onChange={(event) => setEntityRef(event.target.value)} placeholder="Entity-Schlüssel, z. B. sehenswuerdigkeiten" className={inputClass} />
              ) : (
                <select value={entityRef} onChange={(event) => setEntityRef(event.target.value)} className={inputClass}>
                  <option value="">Entity auswählen</option>
                  {entityOptions.map((option) => <option key={`${option.entityType}:${option.id ?? option.key}`} value={option.id ?? option.key}>{option.label}</option>)}
                </select>
              )}
              {usesManualEntityKey ? <span className="font-medium text-[#7a8793]">Für Collections/Hubs oder noch nicht katalogisierte Entities. Der Schlüssel muss zur öffentlichen Resolver-Konfiguration passen.</span> : null}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-bold text-[#526170]">Rolle<select value={role} onChange={(event) => setRole(event.target.value as CityMediaRole)} className={inputClass}>{mediaRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></label>
              <label className="flex min-h-12 items-center gap-2 self-end rounded-xl border border-[#061829]/12 bg-[#f8faf9] px-3 text-xs font-bold text-[#526170]"><input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} className="size-4 accent-[#118cff]" /> Primär</label>
            </div>
            <div className="grid gap-3 rounded-2xl border border-[#118cff]/20 bg-[#f7fbff] p-3 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-bold text-[#526170]">Focal X <input type="range" min="0" max="1" step="0.01" value={focalX} onChange={(event) => setFocalX(Number(event.target.value))} /></label>
              <output className="text-right text-xs font-black text-[#0b75d9]">{Math.round(focalX * 100)}%</output>
              <label className="grid gap-2 text-xs font-bold text-[#526170]">Focal Y <input type="range" min="0" max="1" step="0.01" value={focalY} onChange={(event) => setFocalY(Number(event.target.value))} /></label>
              <output className="text-right text-xs font-black text-[#0b75d9]">{Math.round(focalY * 100)}%</output>
            </div>
            <label className="flex min-h-12 items-center gap-2 rounded-xl border border-[#061829]/12 bg-[#f8faf9] px-3 text-xs font-bold text-[#526170]"><input type="checkbox" checked={manualLock} onChange={(event) => setManualLock(event.target.checked)} className="size-4 accent-[#118cff]" /> Manuelle Auswahl für diese Rolle sperren</label>
            <button type="submit" disabled={busy || !selectedEntity} className={primaryButton}>Zuweisung speichern</button>
          </form>
        </section>
      </div>

      <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_18px_50px_rgba(6,24,41,.04)] sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Verwendung</p><h3 className="mt-1 text-xl font-black">Verwendet bei</h3></div>
          <p className="text-sm text-[#617080]">{asset.assignments.length} Zuweisung{asset.assignments.length === 1 ? "" : "en"}</p>
        </div>
        {asset.assignments.length ? <div className="mt-4 grid gap-2">{[...asset.assignments].sort((a, b) => a.sortOrder - b.sortOrder).map((assignment, index, list) => <AssignmentRow key={`${assignment.id}:${assignment.role}:${assignment.sortOrder}:${assignment.focalX}:${assignment.focalY}`} assignment={assignment} citySlug={asset.citySlug} publicBaseUrl={data.publicBaseUrl} first={index === 0} last={index === list.length - 1} busy={busy} onUpdate={updateAssignment} onRequest={onRequest} />)}</div> : <p className="mt-4 rounded-2xl border border-dashed border-[#061829]/15 p-5 text-sm text-[#617080]">Noch keiner Entity zugewiesen. Das Asset bleibt ungenutzt.</p>}
      </section>
    </div>
  )
}

function AssignmentRow({ assignment, citySlug, publicBaseUrl, first, last, busy, onUpdate, onRequest }: { assignment: CityMediaAssignment; citySlug?: string; publicBaseUrl?: string; first: boolean; last: boolean; busy: boolean; onUpdate: (assignment: CityMediaAssignment, patch: Record<string, unknown>, message: string) => Promise<void>; onRequest: (url: string, init: RequestInit, successMessage: string, preferredId?: string | null) => Promise<void> }) {
  const [role, setRole] = useState<CityMediaRole>(assignment.role)
  const [focalX, setFocalX] = useState(assignment.focalX)
  const [focalY, setFocalY] = useState(assignment.focalY)
  const changed = role !== assignment.role || focalX !== assignment.focalX || focalY !== assignment.focalY
  const previewHref = publicPreviewHref(publicBaseUrl, citySlug, assignment)

  return <div className="grid gap-3 rounded-2xl border border-[#061829]/10 bg-[#f8faf9] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm font-black text-[#061829]">{assignment.entityLabel || assignment.entityKey || assignment.entityId}</strong><span className="rounded-full bg-[#e9f8f8] px-2 py-0.5 text-[10px] font-black text-[#087f84]">{roleLabels[assignment.role]}</span>{assignment.manualLock ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">Gesperrt</span> : null}</div>
      <p className="mt-1 text-xs text-[#617080]">{entityTypeLabels[assignment.entityType]} · Fokus {Math.round(assignment.focalX * 100)}% / {Math.round(assignment.focalY * 100)}%</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
        <label className="grid gap-1 text-[10px] font-black uppercase tracking-[.08em] text-[#71808b]">Rolle<select value={role} onChange={(event) => setRole(event.target.value as CityMediaRole)} className="min-h-9 rounded-lg border border-[#061829]/15 bg-white px-2 text-xs font-bold normal-case tracking-normal text-[#061829]">{mediaRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></label>
        <label className="grid gap-1 text-[10px] font-black uppercase tracking-[.08em] text-[#71808b]">Focal X <input type="range" min="0" max="1" step="0.01" value={focalX} onChange={(event) => setFocalX(Number(event.target.value))} /></label>
        <label className="grid gap-1 text-[10px] font-black uppercase tracking-[.08em] text-[#71808b]">Focal Y <input type="range" min="0" max="1" step="0.01" value={focalY} onChange={(event) => setFocalY(Number(event.target.value))} /></label>
        <button type="button" disabled={busy || !changed} onClick={() => onUpdate(assignment, { role, focalX, focalY }, "Rolle und Focal Point gespeichert.")} className={smallButton}>Speichern</button>
      </div>
    </div>
    <div className="flex flex-wrap gap-2 md:justify-end">
      {previewHref ? <a href={previewHref} target="_blank" rel="noreferrer" className={smallButton}>Öffentliche Vorschau ↗</a> : null}
      <button type="button" disabled={busy || first} onClick={() => onUpdate(assignment, { sortOrder: Math.max(0, assignment.sortOrder - 1) }, "Galerie-Reihenfolge aktualisiert.")} className={smallButton}>↑</button><button type="button" disabled={busy || last} onClick={() => onUpdate(assignment, { sortOrder: assignment.sortOrder + 1 }, "Galerie-Reihenfolge aktualisiert.")} className={smallButton}>↓</button><button type="button" disabled={busy} onClick={() => onUpdate(assignment, { manualLock: !assignment.manualLock }, assignment.manualLock ? "Manuelle Sperre aufgehoben." : "Manuelle Sperre gesetzt.")} className={smallButton}>{assignment.manualLock ? "Unlock" : "Lock"}</button><button type="button" disabled={busy} onClick={() => onRequest(`/api/media/assignments/${assignment.id}`, { method: "DELETE" }, "Zuweisung entfernt.")} className={`${smallButton} border-rose-200 text-rose-700 hover:bg-rose-50`}>Entfernen</button>
    </div>
  </div>
}

function publicPreviewHref(baseUrl: string | undefined, citySlug: string | undefined, assignment: CityMediaAssignment) {
  if (!baseUrl || !citySlug) return null
  const base = `${baseUrl.replace(/\/$/, "")}/stadt/${encodeURIComponent(citySlug)}`
  const reference = assignment.entityKey || assignment.entityId
  if (assignment.entityType === "CITY" || assignment.entityType === "CITY_HOMEPAGE" || assignment.entityType === "HUB") return base
  if (!reference) return null
  const encodedReference = encodeURIComponent(reference)
  if (assignment.entityType === "PLACE" && assignment.role === "CARD") return `${base}/sehenswuerdigkeiten#place-${encodedReference}`
  if (assignment.entityType === "PLACE") return `${base}/entdecken/ort/${encodedReference}`
  if (assignment.entityType === "EVENT") return `${base}/entdecken/event/${encodedReference}`
  if (assignment.entityType === "ROUTE") return `${base}/entdecken/route/${encodedReference}`
  if (assignment.entityType === "GUIDE") return `${base}/${encodedReference}`
  if (assignment.entityType === "BUSINESS" || assignment.entityType === "PARTNER_LOCATION") return `${base}/essen-trinken/${encodedReference}`
  if (assignment.entityType === "COLLECTION") return ["sehenswuerdigkeiten", "essen-trinken"].includes(reference) ? `${base}/${encodedReference}` : `${base}/entdecken/${encodedReference}`
  return null
}

function Preview({ title, src, alt, className, objectPosition }: { title: string; src: string; alt: string; className: string; objectPosition: string }) {
  return <div><p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-[#617080]">{title}</p><div className={`relative overflow-hidden rounded-2xl bg-[#e9eef0] ${className}`}><img src={src} alt={alt} className="absolute inset-0 size-full object-cover" style={{ objectPosition }} /></div></div>
}

function isEntityType(value: unknown): value is CityMediaEntityType {
  return typeof value === "string" && mediaEntityTypes.includes(value as CityMediaEntityType)
}

function formatBytes(value: number | null) {
  if (!value) return "Größe unbekannt"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function uploadError(error?: string) {
  return ({
    city_and_file_required: "Stadt und Bilddatei sind erforderlich.",
    unsupported_media_type: "Nur JPG, PNG, WebP oder AVIF sind erlaubt.",
    file_too_large: "Das Bild ist größer als 10 MB.",
    city_not_found: "Die Stadt wurde nicht gefunden.",
    duplicate_asset: "Dieses Bild ist für die Stadt bereits vorhanden.",
    file_empty: "Bitte wähle eine nicht leere Bilddatei aus.",
    invalid_image: "Die Datei ist kein gültiges Bild oder der Dateityp stimmt nicht mit dem Inhalt überein.",
    storage_upload_failed: "Der Upload in Supabase Storage ist fehlgeschlagen.",
  } as Record<string, string>)[error ?? ""] || "Upload fehlgeschlagen."
}

function apiError(error?: string) {
  return ({
    invalid_assignment: "Entity, Stadt und Rolle prüfen.",
    asset_city_mismatch: "Das Asset gehört zu einer anderen Stadt.",
    assignment_save_failed: "Die Zuweisung konnte nicht gespeichert werden.",
    assignment_update_failed: "Die Zuweisung konnte nicht aktualisiert werden.",
    assignment_delete_failed: "Die Zuweisung konnte nicht entfernt werden.",
    asset_archive_failed: "Das Asset konnte nicht archiviert werden.",
    asset_delete_failed: "Das Asset konnte nicht dauerhaft gelöscht werden.",
  } as Record<string, string>)[error ?? ""] || "Aktion fehlgeschlagen."
}

const inputClass = "min-h-12 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"
const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#118cff] px-4 text-sm font-black text-white transition hover:bg-[#0878df] disabled:cursor-not-allowed disabled:opacity-50"
const smallButton = "inline-flex min-h-9 items-center justify-center rounded-lg border border-[#061829]/15 bg-white px-2.5 text-xs font-black text-[#061829] transition hover:border-[#118cff]/40 hover:bg-[#f3f8ff] disabled:cursor-not-allowed disabled:opacity-45"
