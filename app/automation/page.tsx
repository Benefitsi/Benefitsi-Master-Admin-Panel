import type { Metadata } from "next"
import { AdminShell } from "@/app/admin-shell"
import {
  enqueueCityScan,
  reviewCityAgentProposal,
  reviewAutomationRecommendation,
  scheduleAllDueCityScans,
} from "@/app/automation/actions"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { requireAdmin } from "@/lib/admin"
import {
  automationStatusLabel,
  automationTypeLabel,
  humanGateLabel,
  type AutomationJob,
  type AutomationStatus,
  type CityAgentProposalSummary,
  type CityAgentRunSummary,
  type CityAgentSourceSummary,
} from "@/lib/automation/contracts"
import { loadAutomationData } from "@/lib/automation/data"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Automation Control | Benefitsi Admin",
  description: "Agent-Aufträge, Freigaben und operative Automationskontrolle.",
}

type SearchParams = {
  success?: string
  error?: string
  status?: string
  city?: string
}

export default async function AutomationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { adminSession } = await requireAdmin()
  const query = await searchParams
  const data = await loadAutomationData()
  const jobs = data.jobs.filter(
    (job) =>
      (!query.status || job.status === query.status) &&
      (!query.city || job.cityId === query.city),
  )
  const cityAgentSources = data.cityAgentSources.filter(
    (source) => !query.city || source.cityId === query.city,
  )
  const cityAgentRuns = data.cityAgentRuns.filter(
    (run) => !query.city || run.cityId === query.city,
  )
  const cityAgentProposals = data.cityAgentProposals.filter(
    (proposal) => !query.city || proposal.cityId === query.city,
  )
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"

  return (
    <AdminShell
      adminName={adminName}
      title="Automation Control"
      subtitle="Ben und Stadt-Agenten arbeiten vor – Menschen entscheiden geschützte Aktionen"
    >
      <section className="grid gap-3 lg:grid-cols-[1.3fr_.7fr]">
        <div className="rounded-3xl bg-[#061829] p-5 text-white sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#17d4d7]">
            Klare Zuständigkeiten
          </p>
          <h2 className="mt-2 max-w-2xl text-2xl font-black tracking-[-0.03em]">
            Stadtprofile erstellen Entwürfe. Ben prüft sie; nur risikoarme Evergreen-Inhalte dürfen kontrolliert automatisch live gehen.
          </h2>
          <div className="mt-5 grid gap-2 text-sm text-white/70 sm:grid-cols-3">
            <Boundary label="Agents" text="Recherche, Quellenprüfung, Korrekturvorschläge" />
            <Boundary label="Ben/System" text="Review, Low-Risk-Gate, Queue und Audit" />
            <Boundary label="Mensch" text="Sensible Inhalte, Zahlungen und Live-Freigaben" />
          </div>
        </div>
        <div className="rounded-3xl border border-[#061829]/10 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
            Tageslauf
          </p>
          <h2 className="mt-2 text-xl font-black">Alle Städte einplanen</h2>
          <p className="mt-2 text-sm leading-6 text-[#617080]">
            Legt pro Stadt höchstens einen Scan je Kalendertag an. Doppelte Aufträge werden atomar zusammengeführt.
          </p>
          <form action={scheduleAllDueCityScans} className="mt-4">
            <PendingSubmitButton
              pendingLabel="Wird geplant …"
              className="min-h-11 w-full rounded-xl bg-[#118cff] px-4 text-sm font-black text-white transition hover:bg-[#0878df]"
            >
              Fällige Stadt-Scans einplanen
            </PendingSubmitButton>
          </form>
        </div>
      </section>

      {query.success ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          Aktion gespeichert: {query.success}
        </div>
      ) : null}
      {query.error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
          Aktion blockiert: {query.error}
        </div>
      ) : null}
      {data.warnings.map((warning) => (
        <div key={warning} role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          {warning}
        </div>
      ))}

      <section className="grid overflow-hidden rounded-3xl border border-[#061829]/10 bg-white sm:grid-cols-4">
        <Metric label="Wartend" value={count(data.jobs, "queued")} />
        <Metric label="Agents aktiv" value={count(data.jobs, "claimed")} />
        <Metric label="Freigabe nötig" value={count(data.jobs, "needs_human")} alert />
        <Metric label="Fehler" value={count(data.jobs, "failed")} />
      </section>

      <section className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white">
        <div className="flex flex-col gap-4 border-b border-[#061829]/10 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              City-Agent Operations
            </p>
            <h2 className="mt-1 text-xl font-black">Quellen, Läufe und Vorschläge</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#617080]">
              Ben und die Stadtprofile recherchieren vor. Hier siehst du die Belegkette, Policy-Entscheidungen und alle Fälle, die trotz Automatisierung menschlich geschützt bleiben.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold text-[#526170] sm:min-w-[26rem]">
            <MiniMetric label="Quellen" value={cityAgentSources.length} />
            <MiniMetric label="Läufe" value={cityAgentRuns.length} />
            <MiniMetric label="Review" value={cityAgentProposals.filter((proposal) => proposal.status === "needs_human").length} alert />
            <MiniMetric label="Auto live" value={cityAgentProposals.filter((proposal) => proposal.status === "published").length} />
          </div>
        </div>
        <div className="grid gap-4 p-5 xl:grid-cols-[.9fr_1.1fr]">
          <AgentRunList runs={cityAgentRuns.slice(0, 8)} />
          <AgentSourceList sources={cityAgentSources.slice(0, 12)} />
        </div>
        <AgentProposalList proposals={cityAgentProposals.slice(0, 20)} />
      </section>

      <section className="grid gap-4 rounded-3xl border border-[#061829]/10 bg-white p-5 lg:grid-cols-[1fr_1fr_auto]">
        <label className="grid gap-1.5 text-xs font-bold text-[#526170]">
          Status filtern
          <select name="status" form="automation-filters" defaultValue={query.status ?? ""} className={inputClass}>
            <option value="">Alle Status</option>
            {[
              "queued",
              "claimed",
              "agent_completed",
              "needs_human",
              "approved",
              "rejected",
              "failed",
            ].map((status) => (
              <option key={status} value={status}>
                {automationStatusLabel(status as AutomationStatus)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-[#526170]">
          Stadt filtern
          <select name="city" form="automation-filters" defaultValue={query.city ?? ""} className={inputClass}>
            <option value="">Alle Städte</option>
            {data.cities.map((city) => (
              <option key={city.id} value={city.id}>{city.name}</option>
            ))}
          </select>
        </label>
        <form id="automation-filters" className="flex items-end">
          <button className="min-h-11 w-full rounded-xl border border-[#061829]/15 bg-[#f8fafb] px-5 text-sm font-black transition hover:border-[#118cff]/40">
            Anwenden
          </button>
        </form>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(17rem,.55fr)_minmax(0,1.45fr)]">
        <aside className="rounded-3xl border border-[#061829]/10 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
            Einzelauftrag
          </p>
          <h2 className="mt-1 text-xl font-black">Stadt jetzt prüfen</h2>
          <p className="mt-2 text-sm leading-6 text-[#617080]">
            Ben übernimmt zentrale Benefitsi-Aufgaben. Stadt-Profile erhalten nur Aufträge ihrer konfigurierten Stadt.
          </p>
          <form action={enqueueCityScan} className="mt-4 space-y-3">
            <label className="grid gap-1.5 text-xs font-bold text-[#526170]">
              Stadt
              <select name="cityId" required className={inputClass}>
                <option value="">Bitte wählen</option>
                {data.cities.map((city) => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))}
              </select>
            </label>
            <PendingSubmitButton
              pendingLabel="Wird eingereiht …"
              className="min-h-11 w-full rounded-xl bg-[#061829] px-4 text-sm font-black text-white transition hover:bg-[#0d2b44]"
            >
              Scan einreihen
            </PendingSubmitButton>
          </form>
        </aside>

        <section className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white">
          <div className="flex items-end justify-between gap-4 p-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
                Globale Queue
              </p>
              <h2 className="mt-1 text-xl font-black">{jobs.length} Aufträge</h2>
            </div>
            <span className="text-xs font-bold text-[#617080]">Priorität hoch → niedrig</span>
          </div>
          {jobs.length === 0 ? (
            <p className="border-t border-[#061829]/10 p-6 text-sm text-[#617080]">
              Für diesen Filter gibt es keine Aufträge.
            </p>
          ) : (
            <div className="divide-y divide-[#061829]/10 border-t border-[#061829]/10">
              {jobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  auditCount={data.audit.filter((entry) => entry.jobId === job.id).length}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  )
}

function MiniMetric({
  label,
  value,
  alert = false,
}: {
  label: string
  value: number
  alert?: boolean
}) {
  return (
    <div className="rounded-2xl bg-[#f6f9fb] px-3 py-3">
      <p className={`text-xl font-black ${alert && value > 0 ? "text-amber-700" : "text-[#061829]"}`}>{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[#7b8794]">{label}</p>
    </div>
  )
}

function AgentRunList({ runs }: { runs: CityAgentRunSummary[] }) {
  return (
    <div className="rounded-2xl border border-[#061829]/10">
      <div className="flex items-center justify-between gap-3 border-b border-[#061829]/10 px-4 py-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0b75d9]">Runs</p>
          <h3 className="mt-1 font-black">Letzte Stadtläufe</h3>
        </div>
        <span className="text-xs font-bold text-[#7b8794]">{runs.length} angezeigt</span>
      </div>
      {runs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[#617080]">Noch kein Stadtagentenlauf gespeichert.</p>
      ) : (
        <div className="divide-y divide-[#061829]/10">
          {runs.map((run) => (
            <article key={run.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AgentStatus status={run.status} />
                    <span className="text-xs font-bold text-[#526170]">{run.cityName ?? "Unbekannte Stadt"}</span>
                    {run.dryRun ? <span className="rounded-full bg-[#eef3f7] px-2 py-1 text-[10px] font-black text-[#526170]">Dry-Run</span> : null}
                  </div>
                  <p className="mt-2 text-sm font-black">{run.profileId || "Stadtprofil"}</p>
                  <p className="mt-1 text-xs font-semibold text-[#7b8794]">
                    {run.orchestratorProfile} · {run.trigger} · {formatDate(run.createdAt)}
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-1 text-center text-[10px] font-bold text-[#7b8794]">
                  <span className="rounded-lg bg-[#f6f9fb] px-2 py-1"><b className="block text-sm text-[#061829]">{run.sourceCount}</b>Quellen</span>
                  <span className="rounded-lg bg-[#f6f9fb] px-2 py-1"><b className="block text-sm text-[#061829]">{run.snapshotCount}</b>Snapshots</span>
                  <span className="rounded-lg bg-[#f6f9fb] px-2 py-1"><b className="block text-sm text-[#061829]">{run.proposalCount}</b>Vorschläge</span>
                </div>
              </div>
              {run.errorSummary ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{run.errorSummary}</p> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentSourceList({ sources }: { sources: CityAgentSourceSummary[] }) {
  return (
    <div className="rounded-2xl border border-[#061829]/10">
      <div className="flex items-center justify-between gap-3 border-b border-[#061829]/10 px-4 py-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0b75d9]">Quellenregister</p>
          <h3 className="mt-1 font-black">Aktuelle Quellenlage</h3>
        </div>
        <span className="text-xs font-bold text-[#7b8794]">{sources.filter((source) => source.lastStatus === "error").length} Fehler</span>
      </div>
      {sources.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[#617080]">Noch keine Quellen registriert. T007 füllt Annweiler zuerst.</p>
      ) : (
        <div className="divide-y divide-[#061829]/10">
          {sources.map((source) => (
            <article key={source.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AgentStatus status={source.lastStatus} />
                    <span className="text-xs font-black text-[#061829]">{source.cityName ?? "Unbekannte Stadt"}</span>
                    <span className="text-[11px] font-bold text-[#7b8794]">{source.cadence}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-black">{source.slug}</p>
                  <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs font-semibold text-[#0b75d9] hover:underline">{source.url}</a>
                </div>
                <div className="shrink-0 text-right text-[11px] font-semibold text-[#7b8794]">
                  <p>geprüft</p>
                  <p>{formatDate(source.lastCheckedAt)}</p>
                  <p className="mt-1">nächster Check</p>
                  <p>{formatDate(source.nextCheckAt)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentProposalList({ proposals }: { proposals: CityAgentProposalSummary[] }) {
  const pending = proposals.filter((proposal) => proposal.status === "needs_human")
  return (
    <div className="border-t border-[#061829]/10">
      <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0b75d9]">Belegbasierte Empfehlungen</p>
          <h3 className="mt-1 text-lg font-black">Review-Warteschlange</h3>
        </div>
        <span className="text-xs font-bold text-[#7b8794]">{pending.length} warten auf Entscheidung</span>
      </div>
      {proposals.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-[#617080]">Noch keine Vorschläge. Ein Quellenlauf erzeugt hier Diffs und Belege.</p>
      ) : (
        <div className="divide-y divide-[#061829]/10">
          {proposals.map((proposal) => (
            <article key={proposal.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.7fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <AgentStatus status={proposal.status} />
                  <span className="rounded-full bg-[#eef3f7] px-2.5 py-1 text-[11px] font-black text-[#526170]">{proposal.operation}</span>
                  <span className="rounded-full bg-[#fff7e6] px-2.5 py-1 text-[11px] font-black text-[#8a5a00]">{proposal.riskLevel} · {Math.round(proposal.confidence * 100)}%</span>
                  <span className="text-xs font-bold text-[#7b8794]">{proposal.cityName ?? "Unbekannte Stadt"}</span>
                </div>
                <h4 className="mt-3 font-black">{proposal.contentType} · {formatDate(proposal.createdAt)}</h4>
                <p className="mt-1 text-xs font-semibold text-[#7b8794]">Run {proposal.runId} · Quelle {proposal.sourceId ?? "nicht verknüpft"}</p>
                <pre className="mt-3 max-h-36 overflow-auto rounded-xl bg-[#f6f9fb] p-3 text-[11px] leading-5 text-[#19334a]">{JSON.stringify(proposal.fieldDiff, null, 2)}</pre>
                {proposal.evidence.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {proposal.evidence.slice(0, 4).map((evidence, index) => {
                      const url = typeof evidence.url === "string" ? evidence.url : ""
                      return url.startsWith("https://") ? <a key={`${proposal.id}-${index}`} href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-[#e9f8f8] px-2.5 py-1.5 text-[11px] font-black text-[#087f84] hover:underline">Quelle {index + 1}</a> : null
                    })}
                  </div>
                ) : null}
              </div>
              {proposal.status === "needs_human" ? (
                <form action={reviewCityAgentProposal} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <p className="text-sm font-black text-amber-950">Die manuelle Aktion bestätigt nur diese Proposal. Eine Veröffentlichung erfolgt ausschließlich über die Ben-Policy für risikoarme Evergreen-Inhalte; alle sensiblen Inhalte bleiben menschlich geschützt.</p>
                  <label className="mt-3 flex items-start gap-2 text-xs font-semibold text-amber-950">
                    <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 size-4" />
                    Quelle, Diff und Vorschlag geprüft.
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button name="decision" value="approved" className="min-h-10 rounded-xl bg-emerald-700 px-3 text-xs font-black text-white">Empfehlung bestätigen</button>
                    <button name="decision" value="rejected" className="min-h-10 rounded-xl border border-rose-300 bg-white px-3 text-xs font-black text-rose-800">Ablehnen</button>
                  </div>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentStatus({ status }: { status: string }) {
  const tone = status === "needs_human" || status === "changed" || status === "partial"
    ? "bg-amber-100 text-amber-900"
    : status === "failed" || status === "error"
      ? "bg-rose-100 text-rose-800"
      : status === "succeeded" || status === "healthy" || status === "approved"
        ? "bg-emerald-100 text-emerald-800"
        : "bg-slate-100 text-slate-700"
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${tone}`}>{status.replaceAll("_", " ")}</span>
}

function JobRow({ job, auditCount }: { job: AutomationJob; auditCount: number }) {
  return (
    <article className="p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Status status={job.status} />
            <span className="rounded-full bg-[#eef3f7] px-2.5 py-1 text-[11px] font-black text-[#526170]">
              P{job.priority}
            </span>
            <span className="text-xs font-bold text-[#617080]">
              {job.cityName ?? "stadtübergreifend"}
            </span>
          </div>
          <h3 className="mt-3 font-black">{automationTypeLabel(job.jobType)}</h3>
          <p className="mt-1 text-sm text-[#617080]">
            {job.targetType ?? "System"} · Agent: {job.agentProfile ?? "noch nicht zugewiesen"} · Versuch {job.attempts}/{job.maxAttempts}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#7b8794]">
            Gate: {humanGateLabel(job.humanGate)} · {auditCount} Audit-Einträge
          </p>
        </div>
        <time className="shrink-0 text-xs font-semibold text-[#7b8794]">
          {formatDate(job.updatedAt)}
        </time>
      </div>

      {job.recommendedAction ? (
        <div className="mt-4 rounded-2xl border border-[#118cff]/15 bg-[#f3f8ff] p-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0b75d9]">
            Agent-Empfehlung
          </p>
          <p className="mt-2 text-sm leading-6 text-[#19334a]">{job.recommendedAction}</p>
        </div>
      ) : null}

      {job.status === "needs_human" ? (
        <form action={reviewAutomationRecommendation} className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <input type="hidden" name="jobId" value={job.id} />
          <p className="text-sm font-black text-amber-950">
            Die Entscheidung bestätigt nur die Empfehlung. Die geschützte Aktion wird weiterhin im zuständigen Fachbereich ausgeführt.
          </p>
          <label className="mt-3 grid gap-1.5 text-xs font-bold text-amber-950">
            Review-Notiz
            <textarea name="note" maxLength={2000} rows={2} className={inputClass} />
          </label>
          <label className="mt-3 flex items-start gap-2 text-xs font-semibold text-amber-950">
            <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 size-4" />
            Ich habe Quellen, Empfehlung und zuständiges Human-Gate geprüft.
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button name="decision" value="approved" className="min-h-10 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white">
              Empfehlung bestätigen
            </button>
            <button name="decision" value="rejected" className="min-h-10 rounded-xl border border-rose-300 bg-white px-4 text-sm font-black text-rose-800">
              Ablehnen
            </button>
          </div>
        </form>
      ) : null}
    </article>
  )
}

function Boundary({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-2xl bg-white/6 p-3 ring-1 ring-inset ring-white/10">
      <p className="font-black text-white">{label}</p>
      <p className="mt-1 leading-5">{text}</p>
    </div>
  )
}

function Metric({
  label,
  value,
  alert = false,
}: {
  label: string
  value: number
  alert?: boolean
}) {
  return (
    <div className="border-b border-[#061829]/10 p-5 last:border-0 sm:border-b-0 sm:border-r">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#617080]">{label}</p>
      <p className={`mt-2 text-3xl font-black ${alert && value > 0 ? "text-amber-700" : ""}`}>{value}</p>
    </div>
  )
}

function Status({ status }: { status: AutomationStatus }) {
  const tone = {
    queued: "bg-slate-100 text-slate-700",
    claimed: "bg-sky-100 text-sky-800",
    agent_completed: "bg-cyan-100 text-cyan-800",
    needs_human: "bg-amber-100 text-amber-900",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
    failed: "bg-rose-100 text-rose-800",
    cancelled: "bg-slate-100 text-slate-600",
  }[status]
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${tone}`}>{automationStatusLabel(status)}</span>
}

function count(jobs: AutomationJob[], status: AutomationStatus) {
  return jobs.filter((job) => job.status === status).length
}

function formatDate(value: string | null) {
  if (!value) return "ohne Zeit"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "ohne Zeit"
    : new Intl.DateTimeFormat("de-DE", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date)
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-[#061829]/15 bg-white px-3 py-2 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-2 focus:ring-[#118cff]/15"
