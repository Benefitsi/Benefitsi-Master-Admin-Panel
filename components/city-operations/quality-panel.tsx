import type { DirectoryQualityData } from "@/lib/city-operations/quality-data"
import type { PlaceQualityIssue, SourceQualityIssue, SourceSchedule } from "@/lib/city-operations/quality"

const placeLabels: Record<PlaceQualityIssue, string> = {
  address: "Adresse fehlt", phone: "Telefon fehlt", source: "Beleg-URL fehlt/ungültig",
  opening: "Öffnungszeiten/Terminhinweis fehlt", never_verified: "Kein gültiges Prüfdatum",
  stale_verification: "Erneute Prüfung fällig",
}
const sourceLabels: Record<SourceQualityIssue, string> = {
  missing_check: "Kein passender M1-Beleg", stale_check: "Prüffenster verpasst", source_failed: "Abruf fehlgeschlagen",
  proof_changed: "Aktueller Feldzustand noch ungeprüft", unknown_state: "Aktueller Prüfstatus nicht verfügbar",
  source_changed: "Quelle geändert", stale_fields: "Feldbelege abgelaufen", unknown_fields: "Feldbelege fehlen",
}
const scheduleLabels: Record<SourceSchedule, string> = {
  due: "M1-Prüfung fällig", current: "Aktuelles Prüffenster erfasst", disabled: "Prüfung deaktiviert",
  external: "Anderer Prüfablauf", excluded: "Nicht für M1-Freshness freigegeben", unknown: "Aktueller M1-Prüfstatus unbekannt",
}
const comparisonLabels: Record<string, string> = { baseline: "Erster Quellenabgleich", unchanged: "Quelle unverändert", changed: "Quelle geändert", unverified: "Abruf unverifiziert" }
const linkStyle = "inline-flex min-h-10 items-center text-sm font-bold text-[#0b75d9] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value)) : "Kein gültiger Beleg"
}

export function DirectoryQualityPanel({ data }: { data: DirectoryQualityData }) {
  const { quality, coverage, warnings } = data
  const { counts } = quality
  return (
    <details className="group rounded-3xl border border-[#061829]/10 bg-white">
      <summary className="cursor-pointer rounded-3xl px-5 py-4 text-[#061829] focus-visible:outline-2 focus-visible:outline-[#118cff]">
        <span className="font-black">Datenqualität & Quellenfrische</span>
        <span className="ml-2 text-sm text-[#617080]">{data.scopeLabel}</span>
        <span className="mt-1 block text-sm text-[#526170]">
          {coverage !== "ready" ? "Unvollständige Auswertung · " : ""}
          {coverage === "unavailable" ? "Daten nicht verfügbar" : `${counts.placesNeedingAttention} Einträge mit Prüfbedarf · ${counts.sourcesNeedingAttention} Quellen mit Hinweisen · ${counts.dueSources} M1-Prüfungen fällig`}
        </span>
      </summary>
      <div className="border-t border-[#061829]/10 p-4 md:p-5">
        <p className="text-sm leading-6 text-[#617080]">
          Ort und Region gelten auch hier. Suche, Inhalt und Status filtern nur die Review-Queue.
          Ein erfolgreicher HTTP-Abruf bestätigt keine Feldangaben. Einträge werden nach 30 Tagen oder zum Ablaufdatum erneut vorgelegt; M1 nutzt feste 72-Stunden-Fenster. Zeiten: Europe/Berlin.
        </p>
        {warnings.map((warning) => <p key={warning} role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{warning}</p>)}
        {coverage !== "unavailable" && <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <section aria-label="Verzeichniseinträge mit Prüfbedarf" className="min-w-0">
            <h3 className="font-black">Verzeichnis · {counts.totalPlaces} geladene Einträge</h3>
            <p className="mt-1 text-xs text-[#617080]">{counts.missingFields} fehlende Angaben · {counts.unverifiedPlaces} ohne Prüfdatum · {counts.stalePlaces} erneut fällig</p>
            <ul className="mt-3 max-h-[34rem] divide-y divide-[#061829]/10 overflow-y-auto">
              {quality.places.map((place) => <li key={place.id} className="py-3 first:pt-0">
                <p className="break-words text-sm font-bold">{place.title} <span className="font-normal text-[#617080]">· {place.cityName}</span></p>
                <p className="mt-1 text-sm text-amber-900">{place.issues.map((issue) => placeLabels[issue]).join(" · ")}</p>
                <p className="mt-1 text-xs leading-5 text-[#617080]">Letzte redaktionelle Prüfung: {date(place.lastVerifiedAt)}<br />Fällig: {place.dueAt ? date(place.dueAt) : "Jetzt Beleg prüfen"}</p>
                <div className="flex flex-wrap gap-x-4">
                  {place.editorHref && <a href={place.editorHref} className={linkStyle}>Eintrag bearbeiten</a>}
                  {place.sourceUrl && <a href={place.sourceUrl} target="_blank" rel="noreferrer noopener" className={linkStyle}>Originalquelle</a>}
                </div>
              </li>)}
            </ul>
            {!quality.places.length && <p className="mt-3 text-sm text-[#617080]">{data.placesAvailable ? counts.totalPlaces ? "Keine Lücken nach diesen Regeln in den geladenen Einträgen." : "Keine Verzeichniseinträge im gewählten Bereich." : "Verzeichnisprüfung nicht verfügbar."}</p>}
            {quality.omittedPlaces > 0 && <p role="status" className="mt-3 text-sm font-semibold">{quality.omittedPlaces} weitere Einträge mit Prüfbedarf. Ort oder Region eingrenzen; die Zähler umfassen alle geladenen Einträge.</p>}
          </section>
          <section aria-label="Quellen und letzte Prüfbelege" className="min-w-0">
            <h3 className="font-black">Quellen · {counts.totalSources} registriert</h3>
            <p className="mt-1 text-xs text-[#617080]">{counts.disabledSources} deaktiviert · nur Belege zur aktuellen Quellenrevision</p>
            {!data.checksAvailable && <p role="status" className="mt-3 text-sm font-semibold text-amber-900">Prüfbelege unvollständig: letzter Stand und Fälligkeit können nicht abschließend beurteilt werden.</p>}
            <ul className="mt-3 max-h-[34rem] divide-y divide-[#061829]/10 overflow-y-auto">
              {quality.sources.map((source) => <li key={source.id} className="py-3 first:pt-0">
                <p className="break-words text-sm font-bold">{source.title} <span className="font-normal text-[#617080]">· {source.cityName}</span></p>
                <p className="mt-1 break-words text-xs text-[#617080]">Zuständig: {source.owner} · Ablauf: {source.cadenceOwner}</p>
                <p className="mt-1 text-sm font-semibold">{scheduleLabels[source.schedule]}{source.dueAt && ` · Fällig: ${date(source.dueAt)}`}</p>
                {!!source.issues.length && <p className="mt-1 text-sm text-amber-900">{source.issues.map((issue) => sourceLabels[issue]).join(" · ")}</p>}
                {source.latestCheck ? <details className="mt-2 text-xs text-[#617080]">
                  <summary className="cursor-pointer leading-5">Letzter passender Beleg: {date(source.latestCheck.checkedAt)} · {comparisonLabels[source.latestCheck.comparison] ?? "Unbekannt"}{source.latestCheck.httpStatus !== null && ` · HTTP ${source.latestCheck.httpStatus}`}</summary>
                  <dl className="mt-2 grid gap-1 break-all leading-5">
                    <div><dt className="inline font-bold">Prüfbeleg: </dt><dd className="inline">{source.latestCheck.id}</dd></div>
                    {source.latestCheck.sha256 && <div><dt className="inline font-bold">SHA-256: </dt><dd className="inline">{source.latestCheck.sha256}</dd></div>}
                    {source.latestCheck.errorCode && <div><dt className="inline font-bold">Abruffehler: </dt><dd className="inline">{source.latestCheck.errorCode}</dd></div>}
                    {!!source.latestCheck.staleFields.length && <div><dt className="inline font-bold">Abgelaufene Felder: </dt><dd className="inline">{source.latestCheck.staleFields.join(", ")}</dd></div>}
                    {!!source.latestCheck.unknownFields.length && <div><dt className="inline font-bold">Unbelegte Felder: </dt><dd className="inline">{source.latestCheck.unknownFields.join(", ")}</dd></div>}
                    {source.latestCheck.reviewJobId && <div><dt className="inline font-bold">Automation-Auftrag: </dt><dd className="inline">{source.latestCheck.reviewJobId}</dd></div>}
                  </dl>
                </details> : <p className="mt-1 text-xs text-[#617080]">Kein passender M1-Prüfbeleg geladen.</p>}
                <div className="flex flex-wrap gap-x-4">
                  <a href={source.reviewHref} className={linkStyle}>Automation prüfen</a>
                  {source.editorHref && <a href={source.editorHref} className={linkStyle}>Eintrag bearbeiten</a>}
                  {source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer noopener" className={linkStyle}>Originalquelle</a>}
                </div>
              </li>)}
            </ul>
            {!quality.sources.length && <p className="mt-3 text-sm text-[#617080]">{coverage === "ready" ? "Keine registrierten Quellen im gewählten Bereich." : "Keine Quellen geladen; siehe Ladehinweise."}</p>}
            {quality.omittedSources > 0 && <p role="status" className="mt-3 text-sm font-semibold">{quality.omittedSources} weitere Quellen. Ort oder Region eingrenzen; die Zähler umfassen alle geladenen Quellen.</p>}
          </section>
        </div>}
      </div>
    </details>
  )
}
