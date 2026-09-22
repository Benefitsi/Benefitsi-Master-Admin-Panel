import Link from "next/link"
import type { AgentControlData, CityControl } from "@/lib/agent-control-data"
import type { AgentProfile } from "@/lib/agent-control"

const dateTime = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value))
  : "Nicht nachgewiesen"

const flow = ["Auftrag", "Recherche", "Prüfung", "Freigabe", "Veröffentlichung"]

export function AgentOverview({ data }: { data: AgentControlData }) {
  const profiles = data.runtime.snapshot?.profiles ?? []
  const benefitsi = profiles.filter(profile => profile.scope === "benefitsi")
  const others = profiles.filter(profile => profile.scope !== "benefitsi")
  const scheduled = profiles.filter(profile => profile.automation === "scheduled").length
  const allUnavailable = data.runtime.state === "unavailable" && data.cities.state === "unavailable" && data.citySchedules.state === "unavailable" && data.pipeline.state === "unavailable"

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-3xl bg-[#061829] p-6 text-white shadow-sm sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#17d4d7]">Beobachtete Konfiguration</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Agenten, Pläne und Freigaben</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">Diese Übersicht zeigt belegte Profile und Metadaten. Konfiguration, nicht gleichzeitig aktive Prozesse. Ein technischer Erfolg ersetzt keine menschliche Freigabe.</p>
        </div>
        <div className="space-y-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-xs text-white/70"><p>M1 beobachtet: {dateTime(data.runtime.snapshot?.observedAt ?? null)}</p><p>Admin abgefragt: {dateTime(data.checkedAt)} · Europe/Berlin</p></div>
      </div>
    </section>

    {data.runtime.state !== "fresh" ? <Notice state={data.runtime.state} /> : null}
    {allUnavailable ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"><h2 className="font-bold">Keine belastbaren Agentendaten verfügbar</h2><p className="mt-2 text-sm leading-6">Die privaten Beobachtungsquellen sind derzeit nicht lesbar. Es werden deshalb keine Profile oder Gesundheitswerte angenommen.</p></section> : null}

    <section aria-label="Zusammenfassung" className="grid gap-3 sm:grid-cols-3">
      <Metric value={data.runtime.snapshot ? profiles.length : null} label="beobachtete Profile" />
      <Metric value={data.runtime.snapshot ? benefitsi.length : null} label="Benefitsi zugeordnet" />
      <Metric value={data.runtime.snapshot ? scheduled : null} label="automatisch geplant" />
    </section>

    <section aria-labelledby="workflow-heading" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 id="workflow-heading" className="text-lg font-bold">Vom Auftrag bis zur Veröffentlichung</h2>
      <ol className="mt-5 grid gap-2 sm:grid-cols-5">
        {flow.map((step, index) => <li key={step} className="relative rounded-xl bg-slate-50 p-4 text-sm font-semibold"><span className="mr-2 text-teal-700">{index + 1}.</span>{step}</li>)}
      </ol>
      <p className="mt-4 text-sm leading-6 text-slate-600">Recherche und technische Prüfung dürfen vorbereitet werden. Inhalte werden erst nach einer ausdrücklichen menschlichen Freigabe veröffentlicht.</p>
    </section>

    {benefitsi.length > 0 ? <ProfileSection headingId="benefitsi-profiles-heading" title="Benefitsi-Profile" profiles={benefitsi} /> : null}
    {others.length > 0 ? <ProfileSection headingId="other-profiles-heading" title="Weitere beobachtete Profile" profiles={others} /> : null}

    <CityOperations data={data} />
  </div>
}

function Notice({ state }: { state: AgentControlData["runtime"]["state"] }) {
  const text = state === "stale" ? "Die letzte M1-Beobachtung ist älter als 90 Minuten. Profile bleiben sichtbar, gelten aber als veraltet." : state === "invalid" ? "Der letzte Snapshot erfüllt den sicheren Datenvertrag nicht und wird nicht angezeigt." : "Der M1-Snapshot ist derzeit nicht verfügbar. Fehlende Daten gelten nicht als gesund."
  return <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">{text}</p>
}

function Metric({ value, label }: { value: number | null; label: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-3xl font-black tabular-nums text-[#061829]">{value ?? "—"}</p><p className="mt-1 text-sm text-slate-600">{value === null ? `${label} · Quelle unbekannt` : label}</p></div>
}

function ProfileSection({ headingId, title, profiles }: { headingId: string; title: string; profiles: AgentProfile[] }) {
  return <section aria-labelledby={headingId} className="space-y-3">
    <h2 id={headingId} className="text-xl font-bold tracking-tight">{title}</h2>
    <div className="grid gap-4 xl:grid-cols-2">{profiles.map(profile => <ProfileCard key={profile.id} profile={profile} />)}</div>
  </section>
}

function ProfileCard({ profile }: { profile: AgentProfile }) {
  const contextText = profile.contextHealth === "over_limit" ? "Kontextlimit überschritten" : profile.contextHealth === "missing" ? "Kontextdatei fehlt" : profile.contextHealth === "ok" ? "Kontext vollständig beobachtet" : "Kontext unbekannt"
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-lg font-bold">{profile.id}</p><p className="mt-1 text-sm leading-6 text-slate-600">{profile.purpose}</p></div><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">{automationLabel(profile.automation)}</span></div>
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Info label="Provider" value={profile.provider} /><Info label="Modell" value={profile.model} /><Info label="Laufnachweis" value={runtimeLabel(profile.runtimeHealth)} /><Info label="Kontext" value={contextText} /></dl>
    <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-teal-600">Technische Einzelheiten zu {profile.id}</summary><div className="mt-4 space-y-4 text-sm">
      <div><h3 className="font-semibold">Zeitpläne</h3>{profile.schedules.length ? <ul className="mt-2 space-y-2">{profile.schedules.map(schedule => <li key={`${schedule.source}-${schedule.id}`} className="rounded-lg bg-white p-3"><span className="font-medium">{schedule.id}</span><span className="block text-slate-600">{schedule.cadence ?? "Takt unbekannt"} · {schedule.enabled === true ? "aktiviert" : schedule.enabled === false ? "deaktiviert" : "Aktivierung unbekannt"}</span><span className="block text-xs text-slate-500">Letzter Status: {schedule.lastStatus ?? "nicht nachgewiesen"} · {dateTime(schedule.lastRunAt)}</span></li>)}</ul> : <p className="mt-1 text-slate-500">Kein Zeitplan im Snapshot.</p>}</div>
      <div><h3 className="font-semibold">Kontextdateien</h3>{profile.contextFiles.length ? <ul className="mt-2 space-y-2">{profile.contextFiles.map(file => <li key={file.path} className="rounded-lg bg-white p-3"><span className="break-all font-medium">{file.path}</span><span className="block text-slate-600">{file.exists ? sizeLabel(file.chars, file.limit) : "Fehlt"} · geladen: {loadedByLabel(file.loadedBy)}</span><span className="block text-xs text-slate-500">Geändert: {dateTime(file.modifiedAt)}</span></li>)}</ul> : <p className="mt-1 text-slate-500">Keine Kontextmetadaten beobachtet.</p>}</div>
    </div></details>
  </article>
}

function CityOperations({ data }: { data: AgentControlData }) {
  const controls = data.cities.items
  return <section aria-labelledby="city-heading" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="city-heading" className="text-xl font-bold">Stadtbetrieb</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Technische Aktualität und Inhaltsfreigabe werden getrennt bewertet. Ein partieller Lauf mit offener Redaktion ist kein generischer Absturz.</p></div><div className="flex flex-wrap gap-2"><Link href="/city-operations" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold hover:border-teal-500">Städte-Review</Link><Link href="/automation" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold hover:border-teal-500">Automation Control</Link></div></div>
    {data.cities.truncated || data.citySchedules.truncated ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Die Ansicht hat das sichere Leselimit erreicht. Weitere Städte oder Zeitpläne sind in dieser Abfrage nicht enthalten.</p> : null}
    {data.cities.state === "unavailable" ? <p className="mt-5 text-sm text-amber-800">Stadtsteuerung derzeit nicht lesbar.</p> : controls.length === 0 ? <p className="mt-5 text-sm text-slate-500">Keine Stadtsteuerung nachgewiesen.</p> : <div className="mt-5 grid gap-3 lg:grid-cols-2">{controls.map(city => <CityCard key={city.cityId} city={city} data={data} />)}</div>}
  </section>
}

function CityCard({ city, data }: { city: CityControl; data: AgentControlData }) {
  const pipeline = data.pipeline.item?.cityId === city.cityId ? data.pipeline.item : null
  const schedules = data.citySchedules.items.filter(item => item.cityId === city.cityId)
  return <article className="rounded-xl bg-slate-50 p-4"><h3 className="font-bold">{city.cityName ?? `Unbekannte Stadt · ${city.cityId}`}</h3><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><Info label="Technischer Status" value={cityTechnicalStatus(pipeline, data.checkedAt)} /><Info label="Veröffentlichungskonfiguration" value={publicationConfiguration(city.autoPublishEnabled)} /><Info label="Redaktionelle Prüfung" value={editorialReviewStatus(pipeline?.editorialReviewPending ?? null)} /><Info label="Letzte Recherche" value={dateTime(pipeline?.researchCheckedAt ?? null)} /><Info label="Beobachtete Pläne" value={data.citySchedules.state === "unavailable" ? null : String(schedules.length)} /></dl></article>
}

function Info({ label, value }: { label: string; value: string | null }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium text-slate-800">{value ?? "Nicht nachgewiesen"}</dd></div> }
function automationLabel(value: AgentProfile["automation"]) { return value === "scheduled" ? "Automatisch geplant" : value === "manual" ? "Manuell" : "Planung unbekannt" }
function runtimeLabel(value: AgentProfile["runtimeHealth"]) { return value === "ok" ? "Letzter Lauf aktuell erfolgreich" : value === "failed" ? "Technische Prüfung nötig" : "Kein aktueller Laufnachweis" }
function loadedByLabel(value: AgentProfile["contextFiles"][number]["loadedBy"]) { return value === "system" ? "automatisch" : value === "reference" ? "bei Bedarf" : "unbekannt" }
function sizeLabel(chars: number | null, limit: number | null) { return chars === null ? "Größe unbekannt" : `${chars.toLocaleString("de-DE")} Zeichen${limit === null ? "" : ` / Limit ${limit.toLocaleString("de-DE")}`}` }
function publicationConfiguration(value: boolean | null) { return value === true ? "Automatische Veröffentlichung aktiviert" : value === false ? "Automatische Veröffentlichung deaktiviert" : "Nicht nachgewiesen" }
function editorialReviewStatus(value: boolean | null) { return value === true ? "Menschliche Prüfung ausstehend" : value === false ? "Keine ausstehende Prüfung gemeldet" : "Nicht nachgewiesen" }
function cityTechnicalStatus(pipeline: AgentControlData["pipeline"]["item"], checkedAt: string) {
  if (pipeline?.technicalOk !== true) return pipeline?.technicalOk === false ? "Technische Prüfung nötig" : "Nicht nachgewiesen"
  const evidenceAt = pipeline.researchCheckedAt ?? pipeline.lastRunAt
  const age = evidenceAt ? Date.parse(checkedAt) - Date.parse(evidenceAt) : Number.NaN
  if (!Number.isFinite(age) || age < 0) return "Nicht nachgewiesen"
  return age > 48 * 60 * 60 * 1000 ? "Technische Daten veraltet" : "Technisch in Ordnung"
}
