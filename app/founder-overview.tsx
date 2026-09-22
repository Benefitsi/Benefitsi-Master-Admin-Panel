import Link from "next/link"
import { cityRunHealth, founderActions, pipelineHealth, type FounderSnapshot } from "@/lib/founder-overview"

const dateTime = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value))
  : "Nicht nachgewiesen"
const statusText = { ok: "Aktuell", failed: "Prüfung nötig", stale: "Veraltet", unknown: "Nicht nachgewiesen" }

export function FounderOverview({ snapshot }: { snapshot: FounderSnapshot }) {
  const actions = founderActions(snapshot)
  const metrics = [
    { label: "Freigeschaltete Partnerprofile", count: snapshot.activePartners, href: "/#partners", detail: "Datenbankstatus aktiv · keine Aussage zu Verträgen oder Nutzung" },
    { label: "Fehlgeschlagene Aufträge", count: snapshot.failedJobs, href: "/automation", detail: "Alle Aufträge mit Status fehlgeschlagen" },
    { label: "Warten auf Prüfung", count: snapshot.pendingReviews, href: "/automation", detail: "Aufträge mit Status needs_human" },
    { label: "Fällige Stadtquellen", count: snapshot.overdueSources, href: "/city-operations", detail: "Aktive Quellen mit überschrittenem Prüftermin" },
  ]
  return (
    <section id="overview" aria-labelledby="founder-heading" className="scroll-mt-24 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-800">Benefitsi · Tagesübersicht</p>
          <h2 id="founder-heading" className="mt-2 text-2xl font-semibold tracking-tight">Deine nächsten Schritte</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Aus den verfügbaren Betriebsdaten priorisiert. Partnergespräche, Gründung und persönliche Termine ergänzt du weiterhin im Fahrplan.</p>
        </div>
        <p className="text-xs text-slate-500">Abgefragt: {dateTime(snapshot.checkedAt)} · Berlin</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {actions.map((action, index) => <Link key={action.id} href={action.href} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
          <span className="flex size-8 items-center justify-center rounded-full bg-[#061829] text-sm font-semibold text-white">{index + 1}</span>
          <h3 className="mt-4 font-semibold">{action.title} <span aria-hidden="true" className="text-teal-700">↗</span></h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{action.detail}</p>
        </Link>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => <Link key={metric.label} href={metric.href} className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600">
          <p className="text-sm font-medium text-slate-600">{metric.label}</p>
          <p className={`my-2 text-3xl font-semibold tabular-nums ${metric.count.unavailable ? "text-amber-700" : "text-[#061829]"}`}>{metric.count.unavailable ? "—" : metric.count.value}</p>
          <p className="text-xs leading-5 text-slate-500">{metric.count.unavailable ? "Quelle derzeit nicht lesbar" : metric.detail}</p>
        </Link>)}
      </div>
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2">
        <div>
          <h3 className="font-semibold">M1 · Annweiler</h3>
          <p className="mt-1 text-sm">{statusText[pipelineHealth(snapshot)]}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">Heartbeat: {dateTime(snapshot.pipeline?.lastRunAt ?? null)}<br />Recherche: {dateTime(snapshot.pipeline?.researchCheckedAt ?? null)}</p>
        </div>
        <div>
          <h3 className="font-semibold">City-Aufträge · Admin</h3>
          <p className="mt-1 text-sm">{statusText[cityRunHealth(snapshot)]}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">Letzter erfasster echter Lauf: {dateTime(snapshot.cityRun?.finishedAt ?? null)}<br />Aktualität: maximal 48 Stunden. Ein technischer Lauf bestätigt keine redaktionelle Freigabe.</p>
        </div>
      </div>
      <Link href="/agents" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#061829] transition hover:border-teal-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">Agenten, Zeitpläne und Freigaben öffnen <span aria-hidden="true" className="ml-2 text-teal-700">→</span></Link>
      <p className="text-xs leading-5 text-slate-500">Betriebszahlen aus Supabase, standortübergreifend außer M1 Annweiler. Umsatz, zahlende Nutzer und Wiederkehr sind hier noch nicht angebunden. Fehlende Messungen werden nicht als null dargestellt.</p>
    </section>
  )
}
