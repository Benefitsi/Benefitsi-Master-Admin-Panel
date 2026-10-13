import Link from "next/link"
import { AgentProfileControls } from "./agent-controls"
import { BenefitsiKnowledgeEntry } from "@/components/knowledge/benefitsi-knowledge-entry"
import { KNOWLEDGE_PROFILES, type KnowledgeProfile } from "@/lib/benefitsi-knowledge-controls"
import { Brain, Calculator, CaretDown, ChartLineUp, FileText, MapPin, Robot, Storefront } from "@phosphor-icons/react/dist/ssr"
import type { AgentControlData, CityControl } from "@/lib/agent-control-data"
import type { AgentProfile } from "@/lib/agent-control"
import { agentProfileAnchor, benefitsiAgentInventory, type AgentSummary } from "@/lib/ecosystem/agent-summaries"

const dateTime = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value))
  : "Nicht nachgewiesen"
const roles: Record<string, { name: string; role: string; Icon: typeof Robot; color: string }> = {
  ben: { name: "Ben", role: "Koordination", Icon: Brain, color: "bg-[#061829] text-[#17d4d7]" },
  "benefitsi-content": { name: "Content", role: "Redaktion", Icon: FileText, color: "bg-blue-50 text-blue-600" },
  "benefitsi-finance": { name: "Finanzen", role: "Buchhaltung & Steuern", Icon: Calculator, color: "bg-amber-50 text-amber-700" },
  "benefitsi-seo": { name: "SEO", role: "Sichtbarkeit", Icon: ChartLineUp, color: "bg-cyan-50 text-cyan-700" },
  "city-annweiler": { name: "Annweiler", role: "Stadtinhalte", Icon: MapPin, color: "bg-sky-50 text-sky-700" },
  "benefitsi-menu": { name: "Menü", role: "Menüimport", Icon: Storefront, color: "bg-teal-50 text-teal-700" },
}
const flow = ["Auftrag", "Recherche", "Prüfung", "Freigabe", "Veröffentlichung"]

export function AgentOverview({ data, selectedAgentId }: { data: AgentControlData; selectedAgentId?: string }) {
  const inventory = benefitsiAgentInventory(data)
  const selected = inventory.agents.find(agent => agent.id === selectedAgentId)
  const profiles = new Map((data.runtime.snapshot?.profiles ?? []).map(profile => [profile.id, profile]))
  return <div className="space-y-5">
    <section className="flex flex-col gap-4 rounded-3xl bg-[#061829] p-6 text-white sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#17d4d7]">Dein Benefitsi-Team</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Dein Team im Überblick</h2><p className="mt-2 text-sm leading-6 text-white/70">Profile, letzte belegte Läufe und Freigaben.</p></div>
      <div className="text-xs leading-6 text-white/70"><p>M1 beobachtet: {dateTime(inventory.observedAt)}</p><p>Admin abgefragt: {dateTime(data.checkedAt)} · Europe/Berlin</p></div>
    </section>
    {inventory.state !== "fresh" ? <Notice state={inventory.state} /> : null}
    <section aria-label="Zusammenfassung" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Metric value={inventory.configuredCount} label="Konfiguriert" />
      <Metric value={inventory.observedCount} label="Beobachtete Benefitsi-Profile" />
      <Metric value={null} label="Aktive Läufe" />
    </section>
    <p className="text-xs leading-5 text-slate-500">Die Profilbeobachtung weist keine aktuell laufenden Prozesse nach.</p>
    {selectedAgentId && !selected ? <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Kein passendes Benefitsi-Profil nachgewiesen.</p> : null}
    <section aria-labelledby="benefitsi-profiles-heading"><h2 id="benefitsi-profiles-heading" className="sr-only">Benefitsi-Profile</h2><div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{inventory.agents.map(summary => <ProfileCard key={summary.id} summary={summary} profile={summary.evidence === "observed" ? profiles.get(summary.id) : undefined} selected={summary.id === selectedAgentId} />)}</div></section>
    <section aria-labelledby="workflow-heading" className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 id="workflow-heading" className="text-base font-bold">Vom Auftrag bis zur Veröffentlichung</h2>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5">{flow.map((step, index) => <li key={step} className="rounded-xl bg-slate-50 px-3 py-3 text-xs font-semibold"><span className="mr-2 text-teal-700">{index + 1}.</span>{step}</li>)}</ol>
      <p className="mt-3 text-xs leading-5 text-slate-600">Inhalte werden erst nach einer ausdrücklichen menschlichen Freigabe veröffentlicht.</p>
    </section>
    <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Statusübersicht und Datenstand</summary><dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{([["ok", "Letzter Stand OK"], ["attention", "Prüfen"], ["stale", "Beobachtung veraltet"], ["unknown", "Unbestätigt"]] as const).map(([status,label]) => <div key={status} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-xl font-bold">{inventory.agents.filter(agent => agent.status === status).length}</dd></div>)}</dl><p className="mt-3 text-xs leading-5 text-slate-500">Letzte beobachtete Ergebnisse; kein Nachweis aktuell laufender Prozesse.</p></details>
    <CityOperations data={data} />
  </div>
}

function Notice({ state }: { state: AgentControlData["runtime"]["state"] }) {
  const text = state === "stale" ? "Die letzte M1-Beobachtung ist älter als 90 Minuten. Profile bleiben sichtbar, gelten aber als veraltet." : state === "invalid" ? "Der letzte Snapshot erfüllt den sicheren Datenvertrag nicht und wird nicht angezeigt." : "Der M1-Snapshot ist derzeit nicht verfügbar. Fehlende Daten gelten nicht als gesund."
  return <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">{text}</p>
}

function Metric({ value, label }: { value: number | null; label: string }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"><strong className="text-2xl font-bold tabular-nums text-[#061829]">{value ?? "—"}</strong><div><p className="text-xs font-semibold text-slate-600">{label}</p>{value === null ? <p className="mt-1 text-xs text-slate-500">Nicht nachgewiesen</p> : null}</div></div>
}

function ProfileCard({ profile, summary, selected }: { profile?: AgentProfile; summary: AgentSummary; selected: boolean }) {
  const role = roles[summary.id]
  const Icon = role?.Icon ?? Robot
  const contextText = profile?.contextHealth === "over_limit" ? "Kontextlimit überschritten" : profile?.contextHealth === "missing" ? "Kontextdatei fehlt" : profile?.contextHealth === "ok" ? "Kontext vollständig beobachtet" : "Kontext unbekannt"
  return <article id={agentProfileAnchor(summary.id) ?? undefined} data-selected={selected ? "true" : undefined} className={`min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border bg-white transition-colors ${selected ? "border-teal-500 ring-2 ring-teal-500/20" : "border-slate-200 hover:border-blue-300"}`}>
    <div className="p-5"><div className="flex items-center gap-3"><span data-agent-icon={summary.id} className={`grid size-11 shrink-0 place-items-center rounded-2xl ${role?.color ?? "bg-blue-50 text-blue-600"}`}><Icon size={25} weight="duotone" aria-hidden="true" /></span><div className="min-w-0"><h3 data-admin-i18n-ignore="true" className="break-words text-lg font-bold text-[#061829]">{role?.name ?? summary.name}</h3><p className="mt-0.5 text-xs text-slate-500">{role?.role ?? summary.purpose}</p></div></div>
      <div className="mt-4 flex items-start gap-2 text-xs leading-5"><span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${summary.status === "attention" ? "bg-amber-500" : summary.status === "ok" ? "bg-blue-500" : "bg-slate-300"}`} /><p className="text-slate-600">{summary.mode === "Auf Abruf" && summary.lastRunAt === null ? "Auf Abruf · kein Laufnachweis" : summary.statusLabel}</p></div>
    </div>
    <details open={selected} className="group border-t border-slate-100">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-xs font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">Profil-Details <CaretDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180" /></summary>
      <div className="space-y-5 border-t border-slate-100 bg-slate-50 p-5 text-sm">
        <p className="text-sm leading-6 text-slate-600">{summary.purpose}</p>
        {summary.mode === "Auf Abruf" ? <p className="text-xs leading-5 text-slate-500">Auf Abruf: startet durch einen passenden Auftrag im Admin.</p> : null}
        <dl className="grid gap-3 text-sm sm:grid-cols-2"><Info label="Ausführung" value={summary.mode} /><Info label="Takt" value={summary.cadence} /><Info label="Laufnachweis" value={summary.lastRunLabel} /><Info label="Letzter Lauf" value={dateTime(summary.lastRunAt)} /><Info label="Beobachtung" value={`${summary.freshnessLabel} · ${dateTime(summary.observedAt)}`} /><Info opaque label="Provider" value={profile?.provider ?? null} /><Info opaque label="Modell" value={profile?.model ?? null} /><Info label="Kontext" value={contextText} /></dl>
        {!profile ? <p className="text-xs leading-5 text-slate-500">Konfiguriert · ohne verfügbare Profilbeobachtung. Kein Laufnachweis.</p> : null}
        <div><h4 className="font-semibold">Zeitpläne</h4>{profile?.schedules.length ? <ul className="mt-2 space-y-2">{profile.schedules.map(schedule => <li key={`${schedule.source}-${schedule.id}`} className="rounded-lg bg-white p-3"><span data-admin-i18n-ignore="true" className="break-words font-medium">{schedule.id}</span><span className="block text-slate-600">{schedule.cadence ?? "Takt unbekannt"} · {schedule.enabled === true ? "aktiviert" : schedule.enabled === false ? "deaktiviert" : "Aktivierung unbekannt"}</span><span className="block text-xs text-slate-500">Letzter Status: <span data-admin-i18n-ignore="true">{schedule.lastStatus ?? "—"}</span> · {dateTime(schedule.lastRunAt)}</span></li>)}</ul> : <p className="mt-1 text-xs text-slate-500">Kein Zeitplan im Snapshot.</p>}</div>
        <div><h4 className="font-semibold">Kontextdateien</h4>{profile?.contextFiles.length ? <ul className="mt-2 space-y-2">{profile.contextFiles.map(file => <li key={file.path} className="rounded-lg bg-white p-3"><span data-admin-i18n-ignore="true" className="break-all font-medium">{file.path}</span><span className="block text-xs text-slate-600">{file.exists ? sizeLabel(file.chars, file.limit) : "Fehlt"} · geladen: {loadedByLabel(file.loadedBy)}</span><span className="block text-xs text-slate-500">Geändert: {dateTime(file.modifiedAt)}</span></li>)}</ul> : <p className="mt-1 text-xs text-slate-500">Keine Kontextmetadaten beobachtet.</p>}</div>
        {(KNOWLEDGE_PROFILES as readonly string[]).includes(summary.id) ? <><AgentProfileControls profileId={summary.id} initialProvider={profile?.provider ?? null} initialModel={profile?.model ?? null} /><details className="rounded-xl border border-slate-200 bg-white p-3"><summary className="min-h-11 cursor-pointer text-xs font-semibold">Aufgabe oder Wissen speichern</summary><BenefitsiKnowledgeEntry profileId={summary.id as KnowledgeProfile} /></details></> : null}
        {summary.workspaceHref ? <Link href={summary.workspaceHref} prefetch={false} className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-blue-700 hover:border-blue-300">{summary.id === "benefitsi-menu" ? "Menüimport in der Partnerverwaltung" : "Zugehörigen Arbeitsbereich öffnen"}</Link> : null}
      </div>
    </details>
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
  return <article className="rounded-xl bg-slate-50 p-4"><h3 data-admin-i18n-ignore="true" className="font-bold">{city.cityName ?? `Unbekannte Stadt · ${city.cityId}`}</h3><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><Info label="Technischer Status" value={cityTechnicalStatus(pipeline, data.checkedAt)} /><Info label="Veröffentlichungskonfiguration" value={publicationConfiguration(city.autoPublishEnabled)} /><Info label="Redaktionelle Prüfung" value={editorialReviewStatus(pipeline?.editorialReviewPending ?? null)} /><Info label="Letzte Recherche" value={dateTime(pipeline?.researchCheckedAt ?? null)} /><Info label="Beobachtete Pläne" value={data.citySchedules.state === "unavailable" ? null : String(schedules.length)} /></dl></article>
}

function Info({ label, value, opaque = false }: { label: string; value: string | null; opaque?: boolean }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd data-admin-i18n-ignore={opaque && value !== null ? "true" : undefined} className="mt-1 break-words font-medium text-slate-800">{value ?? "Nicht nachgewiesen"}</dd></div> }
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
