import { findAssignmentPlace, publicMediaPreviewHref, type MediaInventoryData } from "@/lib/city-media/inventory"

const statusLabels: Record<string, string> = {
  PUBLISHED: "Veröffentlicht", REVIEW: "In Prüfung", DRAFT: "Entwurf", ARCHIVED: "Archiviert", REJECTED: "Abgelehnt",
}
const sourceLabels: Record<string, string> = {
  MANUAL_UPLOAD: "Manueller Upload", PARTNER_UPLOAD: "Partner-Upload", OFFICIAL_SOURCE: "Offizielle Quelle",
  TOURISM_SOURCE: "Tourismusquelle", AGENT_DISCOVERED: "Agent-Fund", EXISTING_ASSET: "Bestandsbild", FALLBACK: "Ersatzbild",
}

export function MediaInventory({ data, query = "", cityId = "", status = "" }: {
  data: MediaInventoryData; query?: string; cityId?: string; status?: string
}) {
  const sources = [
    ["Bilder", data.assets.state], ["Zuordnungen", data.assignments.state],
    ["Städte", data.cities.state], ["Orte", data.places.state],
  ] as const
  const cityFilter = data.cities.rows.some(city => city.id === cityId) ? cityId : ""
  const statusFilter = Object.hasOwn(statusLabels, status) ? status : ""
  const search = query.trim().toLocaleLowerCase("de")
  const visible = data.assets.rows.filter(asset => {
    const usages = data.assignments.rows.filter(item => item.assetId === asset.id)
    return (!cityFilter || asset.cityId === cityFilter || usages.some(item => item.cityId === cityFilter))
      && (!statusFilter || asset.status === statusFilter)
      && (!search || `${asset.title} ${asset.altText || ""}`.toLocaleLowerCase("de").includes(search))
  })
  return <div className="space-y-5">
    <section className="rounded-3xl bg-[#061829] p-6 text-white">
      <p className="text-xs font-bold uppercase tracking-widest text-[#79c5ff]">Medienbestand</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight">Bilder und ihre Zuordnungen prüfen</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">Die Ansicht liest den vorhandenen Bestand. Die öffentlichen Links führen zum Einsatzort für CARD oder HERO. Welche Aufnahme dort erscheint, hängt auch von Freigabe, Bildauswahl, Seitenfilter und Cache ab.</p>
      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-white/10 px-4 py-2">{data.assets.state === "unavailable" ? "Bildbestand unbekannt" : `${data.assets.rows.length} Bilder geladen`}</span>
        <span className="rounded-full bg-white/10 px-4 py-2">{data.assignments.state === "unavailable" ? "Zuordnungen unbekannt" : `${data.assignments.rows.length} Zuordnungen geladen`}</span>
      </div>
      <p className="mt-4 text-xs text-white/60">Abgerufen: <time dateTime={data.checkedAt}>{data.checkedAt}</time></p>
    </section>
    {sources.filter(([, state]) => state !== "ok").map(([name, state]) => <p key={name} role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      {state === "unavailable" ? `${name}: derzeit nicht verfügbar. Der Bestand ist unbekannt.` : `${name}: begrenzter Ausschnitt geladen. Die Anzahl ist keine Gesamtzahl; weitere Einträge können fehlen.`}
    </p>)}
    <form action="/media" method="get" className="grid gap-3 rounded-2xl border border-[#061829]/10 bg-white p-4 sm:grid-cols-4">
      <label className="text-xs font-bold text-[#526778]">Titel oder Bildbeschreibung
        <input name="q" defaultValue={query} maxLength={200} className="mt-1 w-full rounded-xl border border-[#061829]/20 p-2.5 text-sm font-normal text-[#061829]" />
      </label>
      <label className="text-xs font-bold text-[#526778]">Stadt
        <select name="city" defaultValue={cityFilter} disabled={data.cities.state === "unavailable"} className="mt-1 w-full rounded-xl border border-[#061829]/20 p-2.5 text-sm font-normal text-[#061829]">
          <option value="">Alle geladenen Städte</option>{data.cities.rows.map(city => <option value={city.id} key={city.id}>{city.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-[#526778]">Bildstatus
        <select name="status" defaultValue={statusFilter} className="mt-1 w-full rounded-xl border border-[#061829]/20 p-2.5 text-sm font-normal text-[#061829]">
          <option value="">Alle Status</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      <button type="submit" className="self-end rounded-xl bg-[#118cff] px-4 py-3 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#061829]">Filtern</button>
    </form>
    {data.assets.state !== "unavailable" && visible.length === 0 ? <p className="rounded-2xl border border-[#061829]/10 bg-white p-6 text-sm text-[#526778]">Keine passenden Bilder im geladenen Bestand.</p> : null}
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {visible.map(asset => {
        const city = data.cities.rows.find(item => item.id === asset.cityId)
        const usages = data.assignments.rows.filter(item => item.assetId === asset.id)
        return <article key={asset.id} className="overflow-hidden rounded-2xl border border-[#061829]/10 bg-white">
          <div className="flex flex-col gap-4 p-5 sm:flex-row">
            {asset.thumbnail ? (
              // URL is restricted by the server loader to this project's public
              // image bucket. Direct loading avoids a server image proxy fetch.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.thumbnail} alt={asset.altText || asset.title} width={160} height={120} loading="lazy" referrerPolicy="no-referrer" className="h-32 w-full shrink-0 rounded-xl bg-[#f1f5f8] object-contain sm:w-40" />
            ) : <div className="flex h-32 w-full shrink-0 items-center justify-center rounded-xl bg-[#f1f5f8] px-4 text-center text-xs text-[#526778] sm:w-40">Keine geprüfte Bildvorschau</div>}
            <div className="min-w-0">
              <h3 className="break-words text-lg font-black text-[#061829]">{asset.title}</h3>
              <p className="mt-1 text-sm text-[#526778]">{asset.cityId ? city?.name || "Stadt nicht verifiziert" : "Stadtübergreifendes Bild"}</p>
              <p className="mt-2 text-xs font-bold text-[#086fcc]">{statusLabels[asset.status] || "Status unbekannt"} · {sourceLabels[asset.sourceType] || "Quelle unbekannt"}</p>
              <p className="mt-2 break-words text-xs text-[#526778]">{asset.altText ? `Bildbeschreibung: ${asset.altText}` : "Bildbeschreibung fehlt"}</p>
            </div>
          </div>
          <div className="border-t border-[#061829]/10 px-5 py-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#526778]">Zuordnungen</h4>
            {data.assignments.state === "unavailable" ? <p className="mt-2 text-sm text-amber-900">Verwendung unbekannt.</p> : usages.length ? <ul className="mt-3 space-y-3">
              {usages.map(assignment => {
                const assignmentCity = data.cities.rows.find(item => item.id === assignment.cityId)
                const place = findAssignmentPlace(assignment, data.places.rows)
                const href = publicMediaPreviewHref({ asset, assignment, city: assignmentCity, place })
                return <li key={assignment.id} className="rounded-xl bg-[#f7f8fa] p-3 text-sm">
                  <p className="font-bold text-[#061829]">{assignmentCity?.name || "Stadt nicht verifiziert"} · {place?.name || `${assignment.entityType}: Ziel nicht geprüft`} · {assignment.role}</p>
                  <p className="mt-1 text-xs text-[#526778]">{assignment.isPrimary ? "Als primär markiert" : "Weitere Zuordnung"}{assignment.manualLock ? " · Manuell gesperrt" : ""}</p>
                  {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block min-h-8 font-bold text-[#086fcc] underline underline-offset-4">Öffentlichen {assignment.role}-Einsatzort prüfen</a> : <p className="mt-2 text-xs text-[#526778]">Öffentliches Vorschauziel nicht verifiziert.</p>}
                </li>
              })}
            </ul> : <p className="mt-2 text-sm text-[#526778]">{data.assignments.state === "limited" ? "Keine Zuordnung im geladenen Ausschnitt." : "Keine Zuordnung hinterlegt."}</p>}
          </div>
        </article>
      })}
    </div>
  </div>
}
