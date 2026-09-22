import Link from "next/link"
import type { ReactNode } from "react"
import type { BusinessAnalyticsFilters } from "@/lib/analytics/contracts"
import type { CityConversion, CityMeasurementResult, CityMeasurementScope, CityMeasurementSource, CityObservationRow, CityWebOperations, CityWebRouteKind, MeasurementCity } from "@/lib/analytics/city-measurement-contracts"
import { cityMeasurementHref } from "@/lib/analytics/city-measurement-filters"
import { cityVitalAssessment } from "@/lib/analytics/city-measurement-normalize"

const environmentLabels = { production: "Produktion", staging: "Staging · Testdaten", test: "Test · Testdaten" }
const count = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("de-DE").format(value)
const date = (value: string) => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value))
const timestamp = (value: string | null) => value === null ? "Nicht nachgewiesen" : new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value))
const panelClass = "rounded-2xl border border-[#061829]/10 bg-white p-4 sm:p-5"
const linkClass = "inline-flex min-h-11 items-center rounded-xl border border-[#061829]/15 px-3 py-2 text-sm font-semibold text-[#0872c6] hover:bg-[#f3f8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff]"
const coverageLabels = { observed_subset: "Einwilligungsgebundene Beobachtungen", no_observations: "Keine Beobachtungen im Zeitraum", partial_retention: "Teilweise Daten durch Aufbewahrungsgrenze", outside_retention: "Zeitraum außerhalb der Aufbewahrung" }
const stageLabels: Record<string, string> = {
  city_page_views: "Stadt-Routenaufrufe", partner_form_views: "Partnerformular angesehen", partner_submissions_observed: "Partneranfrage beobachtet",
  app_entry_clicks: "App-Einstieg angeklickt", today_selections: "Heute-Auswahl", newsletter_confirmations_observed: "Newsletter-Bestätigung beobachtet",
  other_city_ctas: "Weitere Stadtaktionen", benefit_views: "Vorteil angesehen", benefit_selections: "Vorteil ausgewählt", partner_views: "Partner angesehen",
  searches: "Suche", newsletter_signups_observed: "Newsletter-Antrag beobachtet", other_web_observations: "Weitere Web-Beobachtungen",
}
const channelLabels: Record<string, string> = { direct: "Direkt", organic_search: "Organische Suche", organic_social: "Social Media · organisch", paid_search: "Suchanzeigen", paid_social: "Social Media · Anzeigen", referral: "Verweis", email: "E-Mail", other: "Sonstige", unknown: "Nicht zugeordnet" }
const routeLabels: Record<CityWebRouteKind, string> = {
  city_home: "Stadtstart", city_guides: "Guide-Übersicht", city_guide: "Guide", city_places: "Orte-Übersicht", city_place: "Ort",
  city_events: "Veranstaltungsübersicht", city_event: "Veranstaltung", city_meetups: "Treffpunktübersicht", city_meetup: "Treffpunkt",
  city_stays: "Unterkünfte", city_stay: "Unterkunft", city_memories: "Erinnerungen", city_downloads: "Downloads", city_newsletter: "Newsletter",
  city_businesses: "Unternehmen", city_magazine: "Magazin", city_article: "Artikel", city_service: "Stadtservice", city_other: "Weitere Stadtseite",
  partner: "Partnerseite", marketing: "Öffentliche Website", api_public: "Öffentliche Schnittstelle",
}

export function CityMeasurementDashboard({ result, filters, showFilters = false }: {
  result: CityMeasurementResult
  filters: BusinessAnalyticsFilters
  showFilters?: boolean
}) {
  return (
    <section id="city-measurement" aria-labelledby="city-measurement-heading" className="scroll-mt-5 space-y-4 rounded-3xl border border-[#118cff]/20 bg-[#f3f8ff] p-4 sm:p-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#0872c6]">Stadtbetrieb</p>
        <h2 id="city-measurement-heading" className="mt-1 text-xl font-bold text-[#061829]">Stadtmessung & Web-Betrieb</h2>
        <p className="mt-2 text-sm leading-6 text-[#526170]">Nutzung, Anfragen und technische Beobachtungen mit ihrer jeweiligen Datenquelle.</p>
      </header>
      {result.state === "forbidden" ? <Notice>Für diese Daten ist zusätzlich zum Admin-Zugang die Berechtigung zur Unternehmensanalyse erforderlich.</Notice>
        : result.state === "setup_required" ? <Notice>Die Berechtigungsquelle ist noch nicht verfügbar. Es werden keine Ersatzwerte angezeigt.</Notice>
          : result.state === "unavailable" ? <Notice>Die Stadtmessung konnte nicht geladen werden. Bitte später erneut versuchen; fehlende Daten sind keine Nullwerte.</Notice>
            : <>
              {(showFilters || result.state !== "loaded") && <CityFilters cities={result.cities} filters={filters} />}
              {result.state === "selection_required" ? <Notice>Wähle eine Stadt, um die zugehörigen Quellen und Messungen zu öffnen.</Notice>
                : result.state === "invalid_scope" ? <>
                  <Notice>{scopeIssue(result.reason)}</Notice>
                  {filters.cityId && result.cities.some(city => city.id === filters.cityId) && <Link className={linkClass} href={cityMeasurementHref(filters, filters.cityId, true)}>Letzte 30 Tage ohne Zusatzfilter öffnen</Link>}
                </> : <>
                  <ScopeSummary scope={result.scope} />
                  <ConversionPanel source={result.conversion} />
                  <WebOperationsPanel source={result.operations} scope={result.scope} />
                  <nav aria-label="Stadtbetrieb prüfen" className="flex flex-wrap gap-2">
                    <Link className={linkClass} href={`/city-operations?city=${encodeURIComponent(result.scope.city.slug)}`}>Quellenprüfung öffnen</Link>
                    <Link className={linkClass} href={`/automation?city=${result.scope.city.id}&status=needs_human`}>Wartende Prüfungen</Link>
                    <Link className={linkClass} href={`/automation?city=${result.scope.city.id}&status=failed`}>Fehlgeschlagene Aufträge</Link>
                  </nav>
                </>}
              <GoogleSources />
            </>}
    </section>
  )
}

function CityFilters({ cities, filters }: { cities: MeasurementCity[]; filters: BusinessAnalyticsFilters }) {
  const control = "min-h-11 w-full rounded-lg border border-[#061829]/20 bg-white px-3 text-sm text-[#061829] focus-visible:outline-2 focus-visible:outline-[#118cff]"
  return (
    <form action="/analytics#city-measurement" method="get" aria-label="Stadtmessung filtern" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_auto] lg:items-end">
      <label className="grid gap-1 text-xs font-semibold">Stadt<select className={control} name="city" defaultValue={filters.cityId ?? ""} required><option value="">Stadt auswählen</option>{cities.map(city => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold">Von<input className={control} type="date" name="from" defaultValue={filters.dateFrom} max={filters.dateTo} required /></label>
      <label className="grid gap-1 text-xs font-semibold">Bis<input className={control} type="date" name="to" defaultValue={filters.dateTo} required /></label>
      <label className="grid gap-1 text-xs font-semibold">Umgebung<select className={control} name="environment" defaultValue={filters.environment}>{Object.entries(environmentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="min-h-11 rounded-lg bg-[#0872c6] px-4 text-sm font-bold text-white hover:bg-[#065b9f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff]">Anzeigen</button>
      <p className="text-xs leading-5 text-[#526170] sm:col-span-2 lg:col-span-5">Maximal 90 Kalendertage. Diese Auswahl verwendet Stadt, Zeitraum und Umgebung.</p>
    </form>
  )
}

function ScopeSummary({ scope }: { scope: CityMeasurementScope }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm">
    <div><p className="font-bold text-[#061829]">{scope.city.name} · {environmentLabels[scope.environment]}</p><p className="mt-1 text-[#526170]">{date(scope.dateFrom)} – {date(scope.dateTo)} · Europe/Berlin · EUR</p></div>
    <p className="text-xs leading-5 text-[#526170]">Abfrage: {timestamp(scope.checkedAt)}<br />Abfragezeit und letzte Beobachtung sind getrennt.</p>
    {scope.environment !== "production" && <p className="basis-full font-semibold text-amber-900">Testumgebung: Diese Werte gehören nicht zur Produktionsmessung.</p>}
  </div>
}

function ConversionPanel({ source }: { source: CityMeasurementSource<CityConversion> }) {
  if (!hasData(source)) return <section className={panelClass} aria-labelledby="city-conversion-heading"><h3 id="city-conversion-heading" className="text-lg font-bold">Stadtnutzung & Anfragen</h3><SourceUnavailable state={source.state} name="Stadtquelle" /></section>
  const data = source.data
  const web = data.web
  const metrics = [
    { label: "Beobachtete Stadtaufrufe", value: web?.cityViews ?? null, detail: "Alle Stadt-Routen, einschließlich Detailseiten." },
    { label: "Beobachtete Actors", value: web?.cityActors ?? null, detail: "Pseudonyme Actors mit Stadtaufruf; keine Personenzählung." },
    { label: "Partneranfragen", value: data.partnerRequests.submitted, detail: "Operativ eingegangene Kontaktanfragen." },
    { label: "Qualifizierte Partneranfragen", value: data.partnerRequests.qualified, detail: "Davon mit dem Status qualifiziert." },
    { label: "Bestätigte Besuche", value: data.confirmedVisits, detail: "Serverbestätigte Besuche mit Mess-Einwilligung." },
    { label: "Bestätigte Einlösungen", value: data.confirmedRedemptions, detail: "Serverbestätigt, mit Mess-Einwilligung, nicht rückgängig." },
  ]
  return <section className={panelClass} aria-labelledby="city-conversion-heading">
    <div className="flex flex-wrap justify-between gap-2"><h3 id="city-conversion-heading" className="text-lg font-bold">Stadtnutzung & Anfragen</h3><span className="text-xs text-[#526170]">{web ? coverageLabels[web.coverage] : "Web-Messung nicht verfügbar"}</span></div>
    <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(metric => <div key={metric.label} className="rounded-xl border border-[#061829]/10 p-4"><dt className="text-sm font-semibold text-[#526170]">{metric.label}</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-[#061829]">{count(metric.value)}</dd><p className="mt-2 text-xs leading-5 text-[#526170]">{metric.value === null ? "Die Quelle liefert hierfür noch keine Messung." : metric.detail}</p></div>)}</dl>
    <p className="mt-4 text-xs leading-5 text-[#526170]">Web-Messung erfolgt mit Einwilligung und nach den Testausschlüssen der Quelle. 0 beobachtet belegt keine vollständige Besucherzahl. Operative Anfragen und beobachtete Formularaufrufe haben unterschiedliche Messgrundlagen. Installationen und eine stadtbezogene Gesamt-Conversion sind noch nicht messbar.</p>
    {web && <>
      <div className="mt-4 grid gap-4 xl:grid-cols-2"><ObservationTable title="Beobachtete Schritte" rows={web.stages} labels={stageLabels} /><ObservationTable title="Beobachtete Herkunft" rows={web.channels} labels={channelLabels} /></div>
      <div className="mt-4 rounded-xl bg-[#f3f8ff] p-4"><h4 className="text-sm font-bold">Zustellung gespeicherter Web-Beobachtungen</h4><p className="mt-2 text-sm">{count(web.providerDelivery.delivered)} zugestellt · {count(web.providerDelivery.pending)} ausstehend · {count(web.providerDelivery.failed)} fehlgeschlagen</p><p className="mt-2 text-xs leading-5 text-[#526170]">Ein Zustellfehler entfernt die intern gespeicherte Beobachtung nicht. Gateway-Ablehnungen vor der Speicherung sind hier nicht messbar.</p></div>
    </>}
    <p className="mt-4 break-words text-xs leading-5 text-[#526170]">Quelle: city_conversion_readout · Letzte Web-Beobachtung: {timestamp(web?.lastObservedAt ?? null)}</p>
  </section>
}

function ObservationTable({ title, rows, labels }: { title: string; rows: CityObservationRow[]; labels: Record<string, string> }) {
  return <div><h4 className="text-sm font-bold">{title}</h4>{rows.length === 0 ? <p className="mt-2 text-sm text-[#526170]">Keine Beobachtungen für diese Aufteilung.</p> : <Table label={title}><thead><tr><Th>Schritt / Kanal</Th><Th>Ereignisse</Th><Th>Actors</Th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><Td>{labels[row.key] ?? row.key}</Td><Td>{count(row.events)}</Td><Td>{count(row.actors)}</Td></tr>)}</tbody></Table>}</div>
}

function WebOperationsPanel({ source, scope }: { source: CityMeasurementSource<CityWebOperations>; scope: CityMeasurementScope }) {
  return <section id="web-operations" className={`${panelClass} scroll-mt-5`} aria-labelledby="web-operations-heading">
    <div className="flex flex-wrap items-start justify-between gap-2"><h3 id="web-operations-heading" className="text-lg font-bold">Web-Betrieb</h3>{hasData(source) && <nav aria-label="Technische Messungen" className="flex gap-3 text-sm text-[#0872c6]"><a href="#web-vitals">Ladezeiten</a><a href="#web-errors">Fehler</a><a href="#web-alerts">Alarme</a></nav>}</div>
    {!hasData(source) ? <SourceUnavailable state={source.state} name="Technische Messquelle" /> : <>
      <p className="mt-2 text-sm text-[#526170]">{source.data.coverage === "no_observations" ? "Noch keine Beobachtungen im ausgewählten Zeitraum. Daraus lässt sich kein gesunder Betrieb ableiten." : "Technische Beobachtungen im ausgewählten Zeitraum; keine vollständige Messung aller Aufrufe."}</p>
      <VitalsTable data={source.data} />
      <section id="web-errors" className="mt-6 scroll-mt-5" aria-labelledby="web-errors-heading"><h4 id="web-errors-heading" className="font-bold">Beobachtete Fehler</h4>
        {source.data.errors.length === 0 ? <p className="mt-2 text-sm leading-6 text-[#526170]">Keine Fehlerbeobachtungen in dieser Quelle; das ist kein Nachweis für fehlerfreien Betrieb.</p> : <Table label="Beobachtete Fehler"><thead><tr><Th>Art</Th><Th>Fehlercode</Th><Th>Seite</Th><Th>Anzahl</Th><Th>Zuletzt</Th></tr></thead><tbody>{source.data.errors.map(row => <tr key={`${row.kind}:${row.code}:${row.routeKind}`}><Td>{{ client_error: "Browserfehler", unhandled_rejection: "Unbehandelter Ablauf", server_error: "Serverfehler" }[row.kind]}</Td><Td>{row.code}</Td><Td>{routeLabel(row.routeKind)}</Td><Td>{count(row.count)}</Td><Td>{timestamp(row.lastObservedAt)}</Td></tr>)}</tbody></Table>}
      </section>
      <section id="web-alerts" className="mt-6 scroll-mt-5" aria-labelledby="web-alerts-heading"><h4 id="web-alerts-heading" className="font-bold">Alarme</h4>
        {source.data.alerts.length === 0 ? <p className="mt-2 text-sm leading-6 text-[#526170]">Keine Alarm-Einträge in dieser Quelle. Ohne Messnachweis ist dies keine Entwarnung.</p> : <ul className="mt-3 space-y-2">{source.data.alerts.map(alert => <li key={alert.key} className="rounded-xl border border-[#061829]/15 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold">{alert.title}</p><span className={`text-xs font-bold ${alert.state === "resolved" ? "text-[#526170]" : alert.severity === "critical" ? "text-red-800" : "text-amber-900"}`}>{alert.state === "resolved" ? "Behoben" : alert.severity === "critical" ? "Kritisch · offen" : "Prüfung nötig · offen"}</span></div>
          <p className="mt-2 text-xs leading-5 text-[#526170]">Letzter Nachweis: {timestamp(alert.lastObservedAt)}{alert.sampleCount === null ? "" : ` · ${count(alert.sampleCount)} Beobachtungen`}</p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm font-semibold text-[#0872c6]">
            <a href="#web-vitals" className="underline underline-offset-4">Messwerte öffnen</a>
            <a href="#web-errors" className="underline underline-offset-4">Fehlerbeobachtungen öffnen</a>
            <Link href={`/automation?city=${scope.city.id}&status=needs_human`} className="underline underline-offset-4">Prüfwarteschlange öffnen</Link>
          </div>
        </li>)}</ul>}
      </section>
      {source.data.limitations.length > 0 && <ul className="mt-4 list-disc space-y-1 pl-5 text-xs leading-5 text-[#526170]">{source.data.limitations.map((text, index) => <li key={index}>{text}</li>)}</ul>}
      <p className="mt-4 break-words text-xs leading-5 text-[#526170]">Quelle: city_web_operations_readout · Auswertung: {timestamp(source.data.generatedAt)} · Letzte Beobachtung: {timestamp(source.data.lastObservedAt)}</p>
    </>}
  </section>
}

function VitalsTable({ data }: { data: CityWebOperations }) {
  const assessmentLabels = { unknown: "Noch nicht messbar", provisional: "Vorläufig", good: "Im guten Bereich", attention: "Prüfen", measured: "Gemessen" }
  return <section id="web-vitals" className="mt-6 scroll-mt-5" aria-labelledby="web-vitals-heading"><h4 id="web-vitals-heading" className="font-bold">Ladezeiten & Core Web Vitals</h4><p className="mt-2 text-xs leading-5 text-[#526170]">p75 je Gerät und Seitentyp. Unter 100 Stichproben bleibt die Einordnung vorläufig. Gute Grenzen: LCP ≤ 2.500 ms, INP ≤ 200 ms, CLS ≤ 0,1. TTFB und FCP ergänzen die Ladezeitdiagnose.</p>
    {data.vitals.length === 0 ? <p className="mt-3 text-sm text-[#526170]">Noch keine Messstichprobe verfügbar.</p> : <Table label="Web-Vitals-Stichproben"><thead><tr><Th>Metrik</Th><Th>Gerät</Th><Th>Seite</Th><Th>p75</Th><Th>Stichprobe</Th><Th>Einordnung</Th><Th>Zuletzt</Th></tr></thead><tbody>{data.vitals.map(metric => {
      const state = cityVitalAssessment(metric)
      return <tr key={`${metric.metric}:${metric.device}:${metric.routeKind}`}><Td>{metric.metric}</Td><Td>{{ mobile: "Mobil", desktop: "Desktop", unknown: "Unbekannt" }[metric.device]}</Td><Td>{routeLabel(metric.routeKind)}</Td><Td>{metric.p75 === null ? "—" : `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: metric.metric === "CLS" ? 3 : 0 }).format(metric.p75)}${metric.metric === "CLS" ? "" : " ms"}`}</Td><Td>{count(metric.sampleCount)}</Td><Td><span className={state === "attention" ? "font-semibold text-amber-900" : state === "good" ? "text-emerald-800" : "text-[#526170]"}>{assessmentLabels[state]}</span></Td><Td>{timestamp(metric.lastObservedAt)}</Td></tr>
    })}</tbody></Table>}
  </section>
}

function GoogleSources() {
  return <section id="google-measurement" className={panelClass} aria-labelledby="google-measurement-heading"><h3 id="google-measurement-heading" className="font-bold">Google-Auswertung</h3><p className="mt-2 text-sm leading-6 text-[#526170]">GA4 und Search Console sind verknüpft. Der Statistikabruf über die Google-APIs ist in diesem Admin noch nicht verbunden. Hier werden keine Google-Messwerte als importiert dargestellt.</p><div className="mt-3 flex flex-wrap gap-2"><a className={linkClass} href="https://analytics.google.com/analytics/web/#/p516005474/reports/intelligenthome" target="_blank" rel="noopener noreferrer">GA4 öffnen</a><a className={linkClass} href="https://search.google.com/search-console?resource_id=https%3A%2F%2Fbenefitsi.de%2F" target="_blank" rel="noopener noreferrer">Search Console öffnen</a></div></section>
}

function scopeIssue(reason: string) {
  if (reason === "unsupported_filters") return "Partner-, Kanal- und Planfilter werden von der Stadtmessung nicht unterstützt. Entferne diese Zusatzfilter für eine übereinstimmende Messgrundlage."
  if (reason === "window_too_long") return "Die Stadtmessung unterstützt höchstens 90 Kalendertage. Wähle einen kürzeren Zeitraum."
  if (reason === "unknown_city") return "Die ausgewählte Stadt ist für diese Abfrage nicht verfügbar. Wähle eine der verfügbaren Städte."
  return "Der gewählte Zeitraum ist für die Stadtmessung ungültig. Bitte die Datumswerte prüfen."
}
function hasData<T>(source: CityMeasurementSource<T>): source is { state: "ready" | "empty"; data: T } { return "data" in source }
function routeLabel(value: CityWebRouteKind) { return routeLabels[value] }
function SourceUnavailable({ state, name }: { state: "setup_required" | "unavailable"; name: string }) {
  return <p role="status" className="mt-3 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">{name} {state === "setup_required" ? "noch nicht verfügbar. Die Anbindung ist noch einzurichten oder zu prüfen." : "vorübergehend nicht verfügbar. Bitte später erneut versuchen."} Fehlende Messwerte werden nicht als 0 dargestellt.</p>
}
function Notice({ children }: { children: ReactNode }) { return <p role="status" className="rounded-xl bg-white p-4 text-sm leading-6 text-[#526170]">{children}</p> }
function Table({ label, children }: { label: string; children: ReactNode }) { return <div className="mt-3 overflow-x-auto rounded-lg border border-[#061829]/10" role="region" aria-label={label} tabIndex={0}><table className="w-full text-left text-xs"><caption className="sr-only">{label}</caption>{children}</table></div> }
function Th({ children }: { children: ReactNode }) { return <th scope="col" className="whitespace-nowrap bg-[#f3f8ff] px-3 py-2 font-semibold">{children}</th> }
function Td({ children }: { children: ReactNode }) { return <td className="border-t border-[#061829]/10 px-3 py-3 tabular-nums">{children}</td> }
