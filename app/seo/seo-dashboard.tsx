"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowClockwise,
  ArrowUpRight,
  ChartLineUp,
  CheckCircle,
  CircleNotch,
  Faders,
  Gauge,
  GlobeHemisphereWest,
  MagnifyingGlass,
  MapPin,
  Sparkle,
  Target,
  WarningCircle,
} from "@phosphor-icons/react"
import { describeSeoJob, isSeoJobPending } from "@/lib/seo/seo-status"
import { getSeoActionPlan, getSeoScoreRoadmap, type SeoActionPlan } from "@/lib/seo/seo-action-plan"
import {
  localizeSeoAuditSummary,
  localizeSeoExperiment,
  localizeSeoFinding,
  localizeSeoMetric,
  localizeSeoStatus,
  localizeSeoTargetType,
  localizeSeoVisibilityKind,
} from "@/lib/seo/seo-i18n"
import type {
  SeoAutomationJob,
  SeoFinding,
  SeoKeywordSet,
  SeoOperationsData,
  SeoRankSnapshot,
  SeoScoreSnapshot,
  SeoVisibilitySnapshot,
} from "@/lib/seo/seo-data"

type Props = {
  data: SeoOperationsData
  initialTargetId?: string
  started?: boolean
  rankStarted?: boolean
  error?: string
  startAuditAction: (formData: FormData) => void | Promise<void>
  startRankCheckAction: (formData: FormData) => void | Promise<void>
}

const scoreLabels: Array<{
  key: keyof Pick<
    SeoScoreSnapshot,
    | "technical_score"
    | "organic_score"
    | "local_score"
    | "content_entity_score"
    | "ai_visibility_score"
  >
  label: string
  short: string
}> = [
  { key: "technical_score", label: "Technische Gesundheit", short: "Technik" },
  { key: "organic_score", label: "Organische Sichtbarkeit", short: "Organisch" },
  { key: "local_score", label: "Lokale Sichtbarkeit / Maps", short: "Lokal" },
  { key: "content_entity_score", label: "Inhalt & Entität", short: "Entität" },
  { key: "ai_visibility_score", label: "AI-Sichtbarkeit", short: "AI" },
]

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatScore(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : Math.round(value).toString()
}

function scoreTone(value: number | null | undefined) {
  if (value === null || value === undefined) return "text-zinc-400"
  if (value >= 80) return "text-emerald-700"
  if (value >= 60) return "text-amber-700"
  return "text-rose-700"
}

function statusLabel(status: string) {
  return {
    queued: "Warteschlange",
    running: "Läuft",
    completed: "Abgeschlossen",
    partial: "Teilweise",
    failed: "Fehlgeschlagen",
  }[status] ?? localizeSeoStatus(status)
}

function statusTone(status: string) {
  if (status === "completed") return "text-emerald-700 bg-emerald-50 border-emerald-200"
  if (status === "failed") return "text-rose-700 bg-rose-50 border-rose-200"
  if (status === "running") return "text-sky-700 bg-sky-50 border-sky-200"
  return "text-amber-700 bg-amber-50 border-amber-200"
}

function jobTone(status: ReturnType<typeof describeSeoJob>["tone"]) {
  if (status === "completed") return "text-emerald-700 bg-emerald-50 border-emerald-200"
  if (status === "failed") return "text-rose-700 bg-rose-50 border-rose-200"
  if (status === "running") return "text-sky-700 bg-sky-50 border-sky-200"
  if (status === "review") return "text-violet-700 bg-violet-50 border-violet-200"
  return "text-amber-700 bg-amber-50 border-amber-200"
}

function latestByTarget<T extends { target_id: string }>(rows: T[]) {
  const result = new Map<string, T>()
  for (const row of rows) {
    if (!result.has(row.target_id)) result.set(row.target_id, row)
  }
  return result
}

function latestJobForTarget(
  jobs: SeoAutomationJob[],
  targetId: string | undefined,
  jobType: string,
) {
  if (!targetId) return undefined
  return jobs.find((job) => job.target_id === targetId && job.job_type === jobType)
}

function uniqueExperiments(experiments: SeoOperationsData["experiments"]) {
  const seen = new Set<string>()
  const normalize = (value: string | null | undefined) =>
    (value ?? "").toLocaleLowerCase("de-DE").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  return experiments.filter((experiment) => {
    const key = [experiment.experiment_type, experiment.hypothesis, experiment.target_metric].map(normalize).join("|")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function providerUnavailable(job: SeoAutomationJob | undefined) {
  if (!job) return false
  if (job.error_code === "provider_unconfigured") return true
  const result = job.result
  if (!result) return false
  const diagnostics = result.diagnostics
  return result.state === "unconfigured" || (typeof diagnostics === "object" && diagnostics !== null && "state" in diagnostics && diagnostics.state === "unconfigured")
}

export function SeoDashboard({
  data,
  initialTargetId,
  started,
  rankStarted,
  error,
  startAuditAction,
  startRankCheckAction,
}: Props) {
  const router = useRouter()
  const [selectedTargetId, setSelectedTargetId] = useState(
    data.targets.find((target) => target.id === initialTargetId)?.id ?? data.targets[0]?.id ?? "",
  )
  const [query, setQuery] = useState("")
  const latestScores = useMemo(() => latestByTarget(data.scores), [data.scores])
  const latestAudits = useMemo(() => latestByTarget(data.audits), [data.audits])
  const selectedTarget = data.targets.find((target) => target.id === selectedTargetId) ?? data.targets[0]
  const selectedScore = selectedTarget ? latestScores.get(selectedTarget.id) : undefined
  const selectedAudit = selectedTarget ? latestAudits.get(selectedTarget.id) : undefined
  const selectedFindings = selectedTarget
    ? data.findings.filter((finding) => finding.target_id === selectedTarget.id)
    : []
  const selectedRanks = selectedTarget
    ? data.ranks.filter((rank) => rank.target_id === selectedTarget.id).slice(0, 8)
    : []
  const selectedKeywordSets = selectedTarget
    ? data.keywordSets.filter((set) => set.target_id === selectedTarget.id)
    : []
  const selectedVisibility = selectedTarget
    ? data.visibility.filter((item) => item.target_id === selectedTarget.id).slice(0, 8)
    : []
  const selectedExperiments = selectedTarget
    ? uniqueExperiments(data.experiments.filter((experiment) => experiment.target_id === selectedTarget.id))
    : []
  const selectedAuditJob = latestJobForTarget(data.jobs, selectedTarget?.id, "seo_audit")
  const selectedRankJob = latestJobForTarget(data.jobs, selectedTarget?.id, "seo_rank_check")
  const selectedLocalJob = latestJobForTarget(data.jobs, selectedTarget?.id, "seo_local_rank_check")
  const selectedAiJob = latestJobForTarget(data.jobs, selectedTarget?.id, "seo_ai_visibility_check")
  const selectedDriftJob = latestJobForTarget(data.jobs, selectedTarget?.id, "seo_drift_check")
  const selectedRecommendationJob = latestJobForTarget(data.jobs, selectedTarget?.id, "seo_recommendation")
  const selectedRoadmap = getSeoScoreRoadmap({
    technicalScore: selectedScore?.technical_score,
    organicScore: selectedScore?.organic_score,
    localScore: selectedScore?.local_score,
    contentEntityScore: selectedScore?.content_entity_score,
    aiVisibilityScore: selectedScore?.ai_visibility_score,
    coverage: selectedScore?.coverage,
    localProviderUnavailable: providerUnavailable(selectedLocalJob),
    aiProviderUnavailable: providerUnavailable(selectedAiJob),
    findings: selectedFindings,
    hasExperiments: selectedExperiments.length > 0,
  })
  const requestedTargetSelected = !initialTargetId || selectedTarget?.id === initialTargetId
  const requestedJob = requestedTargetSelected && rankStarted ? selectedRankJob : requestedTargetSelected && started ? selectedAuditJob : undefined
  const requestedJobStatus = requestedJob ? describeSeoJob(requestedJob) : undefined
  const selectedJobsPending = selectedTarget
    ? data.jobs.some((job) => job.target_id === selectedTarget.id && isSeoJobPending(job.status))
    : false
  const visibleTargets = data.targets.filter((target) => {
    const needle = query.trim().toLowerCase()
    return !needle || `${target.domain} ${target.canonical_url}`.toLowerCase().includes(needle)
  })
  useEffect(() => {
    if ((!started && !rankStarted) || !selectedJobsPending) return

    let refreshes = 0
    const interval = window.setInterval(() => {
      refreshes += 1
      router.refresh()
      if (refreshes >= 24) window.clearInterval(interval)
    }, 5000)

    return () => window.clearInterval(interval)
  }, [rankStarted, router, selectedJobsPending, selectedTargetId, started])

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-teal-700">SEO-Betrieb</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-zinc-950">Sichtbarkeit als laufender Betrieb.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">Hermes misst technische Gesundheit, Rankings, lokale Präsenz und AI-Zitate. Jede Empfehlung bleibt nachvollziehbar und menschlich freigabepflichtig.</p>
      </section>

        {requestedJobStatus ? (
          <div className={`mt-5 flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${jobTone(requestedJobStatus.tone)}`}>
            {requestedJobStatus.pending ? <CircleNotch className="mt-0.5 size-5 animate-spin" aria-hidden="true" /> : <CheckCircle className="mt-0.5 size-5" weight="duotone" aria-hidden="true" />}
            <div>
              <p className="font-semibold">{rankStarted ? "Ranktracking" : "SEO-Audit"}: {requestedJobStatus.label}</p>
              <p className="mt-1 leading-6">{requestedJobStatus.detail}</p>
              {requestedJobStatus.pending ? <p className="mt-1 text-xs opacity-80">Diese Ansicht aktualisiert sich automatisch, solange Hermes den Job bearbeitet.</p> : null}
            </div>
          </div>
        ) : requestedTargetSelected && (started || rankStarted) && (!selectedAudit && !selectedRanks.length) ? (
          <div className="mt-5 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <CircleNotch className="mt-0.5 size-5" aria-hidden="true" />
            <div>
              <p className="font-semibold">Job angefordert, Status noch nicht lesbar</p>
              <p className="mt-1 leading-6">Der Job wurde angelegt. Die Queue-Statusfunktion ist noch nicht ausgerollt oder der Worker hat noch keinen Status zurückgeschrieben.</p>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <WarningCircle className="mt-0.5 size-5 shrink-0" weight="duotone" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
        {data.errors.length > 0 ? (
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">SEO-Datenbank noch nicht vollständig verfügbar</p>
            <p className="mt-1 leading-6">Migration ausrollen, danach lädt diese Ansicht automatisch die Messwerte. Bestehende Partnerdaten bleiben unangetastet.</p>
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi label="SEO-Ziele" value={data.targets.length.toString()} note="aktive Domains und Microsites" icon={<Target className="size-5" weight="duotone" />} />
          <Kpi label="Letzte Audits" value={data.audits.length.toString()} note="inklusive Teil- und Fehlversuche" icon={<Gauge className="size-5" weight="duotone" />} />
          <Kpi label="Offene Findings" value={data.findings.filter((finding) => finding.status === "open").length.toString()} note="Menschliche Prüfqueue" icon={<WarningCircle className="size-5" weight="duotone" />} />
          <Kpi label="Rank-Messungen" value={data.ranks.length.toString()} note="mit Ort, Gerät und Provider" icon={<ChartLineUp className="size-5" weight="duotone" />} />
          <Kpi label="AI-Signale" value={data.visibility.filter((item) => item.visibility_kind === "ai").length.toString()} note="Erwähnungen und Zitate" icon={<Sparkle className="size-5" weight="duotone" />} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-md border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Ziele</p>
                <h2 className="mt-1 text-lg font-semibold">Messziele</h2>
              </div>
              <span className="font-mono text-xs text-zinc-500">{visibleTargets.length.toString().padStart(2, "0")}</span>
              </div>
              <label className="mt-4 flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2.5 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100">
                <MagnifyingGlass className="size-4 text-zinc-400" aria-hidden="true" />
                <span className="sr-only">SEO-Ziele filtern</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Domain filtern" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400" />
              </label>
            </div>
            <div className="space-y-2 p-3">
              {visibleTargets.length === 0 ? (
                <div className="px-4 py-8 text-sm leading-6 text-zinc-500">Noch kein SEO-Ziel vorhanden. Lege nach dem Migrations-Rollout den ersten Ziel-Datensatz für eine Microsite oder Stadtseite an.</div>
              ) : visibleTargets.map((target) => {
                const score = latestScores.get(target.id)
                const active = target.id === selectedTarget?.id
                return (
                  <button key={target.id} type="button" onClick={() => setSelectedTargetId(target.id)} className={`flex w-full items-start justify-between gap-4 rounded-md border p-3 text-left transition active:translate-y-px ${active ? "border-teal-600 bg-teal-50" : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-900">{target.domain}</span>
                      <span className="mt-1 block truncate text-xs text-zinc-500">{localizeSeoTargetType(target.target_type)}</span>
                    </span>
                    <span className={`font-mono text-lg font-semibold ${scoreTone(score?.overall_score)}`}>{formatScore(score?.overall_score)}</span>
                  </button>
                )
              })}
            </div>
          </aside>

          <div className="min-w-0">
            {selectedTarget ? (
              <>
                <div className="flex flex-col gap-5 rounded-md border border-zinc-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">Ausgewähltes Ziel</p>
                    <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight">{selectedTarget.domain}</h2>
                    <a href={selectedTarget.canonical_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-sm text-zinc-500 hover:text-teal-800">
                      <span className="truncate">{selectedTarget.canonical_url}</span><ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
                    </a>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <form action={startAuditAction}>
                      <input type="hidden" name="target_id" value={selectedTarget.id} />
                      <button type="submit" className="inline-flex h-10 items-center gap-2 bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 active:-translate-y-px">
                        <ArrowClockwise className="size-4" weight="bold" aria-hidden="true" />
                        Audit starten
                      </button>
                    </form>
                    <form action={startRankCheckAction}>
                      <input type="hidden" name="target_id" value={selectedTarget.id} />
                      <button type="submit" className="inline-flex h-10 items-center gap-2 border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50 active:-translate-y-px">
                        <ChartLineUp className="size-4" weight="duotone" aria-hidden="true" />
                        Ranktracking
                      </button>
                    </form>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <ScoreTile label="Gesamt" detail={overallScoreDetail(selectedScore, selectedAuditJob)} value={selectedScore?.overall_score ?? null} />
                  {scoreLabels.map((item) => (
                    <ScoreTile key={item.key} label={item.short} detail={scoreDetail(item, selectedScore, selectedAuditJob, selectedLocalJob, selectedAiJob)} value={selectedScore?.[item.key] ?? null} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-500">
                  <span>Bewertungsformel <strong className="font-mono text-zinc-800">{selectedScore?.formula_version ?? "v1"}</strong></span>
                  <span>Abdeckung <strong className="font-mono text-zinc-800">{selectedScore ? `${Math.round(selectedScore.coverage * 100)}%` : "—"}</strong></span>
                  <span>Vertrauensgrad <strong className="font-mono text-zinc-800">{selectedScore ? `${Math.round(selectedScore.confidence * 100)}%` : "—"}</strong></span>
                </div>

                <ScoreImprovementRoadmap plans={selectedRoadmap} />

                <div className="mt-5">
                  <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Audit-Verlauf</p>
                        <h3 className="mt-1 text-base font-semibold">Letzter Prüfzyklus</h3>
                      </div>
                      {selectedAudit ? <span className={`border px-2 py-1 text-[11px] font-semibold ${statusTone(selectedAudit.status)}`}>{statusLabel(selectedAudit.status)}</span> : selectedAuditJob ? <JobBadge job={selectedAuditJob} /> : null}
                    </div>
                    {selectedAudit ? (
                      <div className="mt-4 space-y-4 text-sm">
                        <div className="grid gap-4 sm:grid-cols-3">
                          <DataPoint label="Gestartet" value={formatDate(selectedAudit.started_at)} />
                          <DataPoint label="Beendet" value={formatDate(selectedAudit.completed_at)} />
                          <DataPoint label="Methode" value={selectedAudit.methodology_version} />
                        </div>
                        <p className="border-l-2 border-teal-600 pl-3 leading-6 text-zinc-700">{localizeSeoAuditSummary(selectedAudit.summary) || "Der Agent hat noch keine Zusammenfassung abgelegt."}</p>
                      </div>
                    ) : (
                      <EmptyLine
                        icon={<CircleNotch className="size-5" />}
                        text={selectedAuditJob ? describeSeoJob(selectedAuditJob).detail : "Noch kein Audit für dieses Ziel. Starte einen Prüfzyklus, um den ersten Prüfzyklus anzulegen."}
                      />
                    )}
                  </section>
                </div>

                <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <MeasurementTable
                    title="Ranktracking"
                    icon={<MapPin className="size-5" weight="duotone" />}
                    rows={selectedRanks}
                    keywordSets={selectedKeywordSets}
                    job={selectedRankJob}
                  />
                  <VisibilityTable rows={selectedVisibility} localJob={selectedLocalJob} aiJob={selectedAiJob} />
                </section>

                <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Menschliche Prüfqueue</p>
                      <h3 className="mt-1 text-base font-semibold">Findings und GEO-Hypothesen</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedDriftJob ? <JobBadge job={selectedDriftJob} /> : null}
                      {selectedRecommendationJob ? <JobBadge job={selectedRecommendationJob} /> : null}
                      <span className="font-mono text-xs text-zinc-500">{(selectedFindings.length + selectedExperiments.length).toString().padStart(2, "0")} offen</span>
                    </div>
                  </div>
                  {selectedFindings.length === 0 && selectedExperiments.length === 0 ? <EmptyLine icon={<CheckCircle className="size-5" />} text={selectedAudit?.status === "completed" ? "Für den letzten Prüfzyklus wurden keine offenen Findings oder GEO-Hypothesen angelegt." : selectedAuditJob ? describeSeoJob(selectedAuditJob).detail : "Noch keine Findings oder GEO-Hypothesen gespeichert. Starte einen vollständigen Auditzyklus."} /> : (
                    <div className="mt-4 divide-y divide-zinc-200 border-y border-zinc-200">
                      {selectedFindings.slice(0, 8).map((finding) => <FindingRow key={finding.id} finding={finding} />)}
                      {selectedExperiments.slice(0, 8).map((experiment) => <ExperimentRow key={experiment.id} experiment={experiment} />)}
                    </div>
                  )}
                </section>
              </>
            ) : (
              <div className="grid min-h-[420px] place-items-center rounded-md border border-zinc-200 bg-white px-6 text-center shadow-sm">
                <div className="max-w-md">
                  <Faders className="mx-auto size-9 text-teal-700" weight="duotone" aria-hidden="true" />
                  <h2 className="mt-4 text-xl font-semibold">SEO-Operations ist bereit</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">Sobald ein Ziel angelegt und die Migration ausgerollt ist, erscheinen hier Audits, Scores und Rankverläufe.</p>
                </div>
              </div>
            )}
          </div>
        </section>
    </div>
  )
}

function Kpi({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) {
  return <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="mt-0.5 text-teal-700">{icon}</span><div><p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p><p className="mt-1 font-mono text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-zinc-500">{note}</p></div></div></div>
}

function ScoreTile({ label, detail, value }: { label: string; detail: string; value: number | null }) {
  return <div className="rounded-md border border-zinc-200 bg-white px-4 py-4 shadow-sm"><div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</span><Gauge className="size-4 text-zinc-300" weight="duotone" aria-hidden="true" /></div><p className={`mt-3 font-mono text-3xl font-semibold ${scoreTone(value)}`}>{formatScore(value)}</p><p className="mt-1 text-xs text-zinc-500">{detail}</p></div>
}

function scoreDetail(
  item: (typeof scoreLabels)[number],
  score: SeoScoreSnapshot | undefined,
  auditJob: SeoAutomationJob | undefined,
  localJob: SeoAutomationJob | undefined,
  aiJob: SeoAutomationJob | undefined,
) {
  if (score?.[item.key] !== null && score?.[item.key] !== undefined) return item.label
  if (item.key === "local_score" && providerUnavailable(localJob)) return "Anbieter nicht konfiguriert"
  if (item.key === "ai_visibility_score" && providerUnavailable(aiJob)) return "Anbieter nicht konfiguriert"
  if (auditJob && isSeoJobPending(auditJob.status)) return `${item.label} · Audit läuft`
  return `${item.label} · noch nicht gemessen`
}

function overallScoreDetail(score: SeoScoreSnapshot | undefined, auditJob: SeoAutomationJob | undefined) {
  if (score?.overall_score !== null && score?.overall_score !== undefined) return "Normalisierter Ranking Score"
  if (auditJob && isSeoJobPending(auditJob.status)) return "Ranking Score · Audit läuft"
  return "Ranking Score · noch nicht gemessen"
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 truncate text-sm font-medium text-zinc-800">{value}</p></div>
}

function JobBadge({ job }: { job: SeoAutomationJob }) {
  const status = describeSeoJob(job)
  return <span className={`border px-2 py-1 text-[11px] font-semibold ${jobTone(status.tone)}`}>{status.label}</span>
}

function EmptyLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="mt-4 flex items-start gap-3 rounded-md border border-dashed border-zinc-300 px-4 py-4 text-sm leading-6 text-zinc-500"><span className="mt-0.5 text-zinc-400">{icon}</span><span>{text}</span></div>
}

function MeasurementTable({ title, icon, rows, keywordSets = [], job }: { title: string; icon: React.ReactNode; rows: SeoRankSnapshot[]; keywordSets?: SeoKeywordSet[]; job?: SeoAutomationJob }) {
  const jobStatus = job ? describeSeoJob(job) : undefined
  const emptyText = keywordSets.length === 0
    ? "Noch kein Keyword-Set und keine Positionsmessung vorhanden. Starte Audit oder Ranktracking, um ein überprüfbares Starter-Set anzulegen."
    : providerUnavailable(job)
      ? "Keyword-Set ist vorbereitet, aber kein Ranking-Anbieter ist konfiguriert. Hinterlege DataForSEO oder SE Ranking, bevor echte Positionen gemessen werden."
      : jobStatus?.pending
        ? jobStatus.detail
        : "Keyword-Set vorhanden; der nächste Hermes-Ranklauf schreibt die erste Positionsmessung."
  return <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-3">
      <div className="flex items-center gap-2"><span className="text-teal-700">{icon}</span><h3 className="text-base font-semibold">{title}</h3></div>
      <div className="flex items-center gap-2"><span className="text-xs text-zinc-500">{keywordSets.length} Keyword-Sets</span>{job ? <JobBadge job={job} /> : null}</div>
    </div>
    {keywordSets.length > 0 ? <p className="mt-3 text-xs leading-5 text-zinc-500">{keywordSets.slice(0, 3).map((set) => `${set.name} · ${set.locale} · ${set.device}`).join("  /  ")}</p> : null}
    {rows.length === 0 ? <EmptyLine icon={<ChartLineUp className="size-5" />} text={emptyText} /> : (
      <div className="mt-3 overflow-x-auto border-y border-zinc-200 bg-white">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-[0.12em] text-zinc-500"><tr><th className="px-3 py-3 font-semibold">Keyword</th><th className="px-3 py-3 font-semibold">Ort</th><th className="px-3 py-3 font-semibold">Position</th><th className="px-3 py-3 font-semibold">Anbieter</th><th className="px-3 py-3 font-semibold">Zeit</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">{rows.map((row) => <tr key={row.id}><td className="px-3 py-3 font-medium text-zinc-800">{row.keyword}</td><td className="px-3 py-3 text-zinc-600">{row.location || "—"}</td><td className={`px-3 py-3 font-mono font-semibold ${row.rank_position && row.rank_position <= 10 ? "text-emerald-700" : "text-zinc-700"}`}>{row.rank_position ?? "nicht gemessen"}</td><td className="px-3 py-3 text-zinc-600">{row.provider}</td><td className="px-3 py-3 text-xs text-zinc-500">{formatDate(row.observed_at)}</td></tr>)}</tbody>
        </table>
      </div>
    )}
  </section>
}

function VisibilityTable({ rows, localJob, aiJob }: { rows: SeoVisibilitySnapshot[]; localJob?: SeoAutomationJob; aiJob?: SeoAutomationJob }) {
  const pending = [localJob, aiJob].find((job) => job && isSeoJobPending(job.status))
  const unavailable = [localJob, aiJob].some((job) => providerUnavailable(job))
  const emptyText = unavailable
    ? "Keine Live-Snapshots: Local-/AI-Anbieter sind nicht konfiguriert. Die Ansicht zeigt bewusst keinen erfundenen Sichtbarkeitswert."
    : pending
      ? "Hermes verarbeitet lokale und AI-Sichtbarkeit. Die Ergebnisse erscheinen nach dem Jobabschluss automatisch."
      : "Noch keine Sichtbarkeits-Snapshots vorhanden. Starte einen vollständigen Audit, um lokale und AI-Sichtbarkeit getrennt zu messen."
  return <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-3"><div className="flex items-center gap-2"><span className="text-teal-700"><Sparkle className="size-5" weight="duotone" aria-hidden="true" /></span><h3 className="text-base font-semibold">AI- und lokale Sichtbarkeit</h3></div><div className="flex items-center gap-2">{localJob ? <JobBadge job={localJob} /> : null}{aiJob ? <JobBadge job={aiJob} /> : null}</div></div>
    {rows.length === 0 ? <EmptyLine icon={<GlobeHemisphereWest className="size-5" />} text={emptyText} /> : (
      <div className="mt-3 overflow-x-auto border-y border-zinc-200 bg-white">
        <table className="w-full min-w-[460px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-[0.12em] text-zinc-500"><tr><th className="px-3 py-3 font-semibold">Signal</th><th className="px-3 py-3 font-semibold">Metrik</th><th className="px-3 py-3 font-semibold">Wert</th><th className="px-3 py-3 font-semibold">Anbieter</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">{rows.map((row) => <tr key={row.id}><td className="px-3 py-3 font-medium text-zinc-800">{localizeSeoVisibilityKind(row.visibility_kind)}</td><td className="px-3 py-3 text-zinc-600">{localizeSeoMetric(row.metric_name)}</td><td className="px-3 py-3 font-mono text-zinc-800">{row.metric_value ?? row.mentions ?? row.citations ?? "—"}</td><td className="px-3 py-3 text-zinc-600">{row.provider}</td></tr>)}</tbody>
        </table>
      </div>
    )}
  </section>
}

function ScoreImprovementRoadmap({ plans }: { plans: SeoActionPlan[] }) {
  return (
    <section className="mt-7 rounded-md border border-teal-200 bg-teal-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-teal-700"><ChartLineUp className="size-5" weight="duotone" aria-hidden="true" /></span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">Bewertung verbessern</p>
          <h3 className="mt-1 text-base font-semibold text-zinc-950">Priorisierte Maßnahmen für den nächsten Score-Schritt</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700">Die Reihenfolge folgt den aktuell fehlenden Messgrundlagen. Ein höherer Score wird nicht versprochen; jede Maßnahme hat eine prüfbare Abschlussbedingung.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {plans.slice(0, 4).map((plan, index) => (
          <article key={`${plan.headline}-${index}`} className="border border-teal-100 bg-white px-4 py-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700">{plan.priority}</span>
              {plan.scoreAreas.map((area) => <span key={area} className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-600">{area}</span>)}
            </div>
            <h4 className="mt-3 text-sm font-semibold text-zinc-900">{plan.headline}</h4>
            <p className="mt-1 text-sm leading-6 text-zinc-600">{plan.summary}</p>
            <ActionPlanSteps plan={plan} />
          </article>
        ))}
      </div>
    </section>
  )
}

function ActionPlanSteps({ plan, compact = false }: { plan: SeoActionPlan; compact?: boolean }) {
  return (
    <ol className={`mt-4 space-y-3 ${compact ? "border-l border-zinc-200 pl-3" : ""}`}>
      {plan.steps.map((step, index) => (
        <li key={step.title} className="flex items-start gap-3">
          <span className={`grid shrink-0 place-items-center rounded-full bg-teal-100 font-mono font-semibold text-teal-800 ${compact ? "size-5 text-[10px]" : "size-6 text-xs"}`}>{index + 1}</span>
          <div className="min-w-0 text-sm leading-5">
            <p className="font-semibold text-zinc-800">{step.title}</p>
            <p className="mt-1 text-zinc-600">{step.action}</p>
            <p className="mt-2 text-xs leading-5 text-zinc-500"><span className="font-semibold text-zinc-700">Fertig wenn:</span> {step.doneWhen}</p>
            <p className="mt-1 text-xs leading-5 text-teal-800"><span className="font-semibold">Bewertungsbezug:</span> {step.scoreImpact}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function FindingRow({ finding }: { finding: SeoFinding }) {
  const copy = localizeSeoFinding(finding)
  const plan = getSeoActionPlan(finding)
  const severe = finding.severity === "critical" || finding.severity === "high"
  return (
    <article className="px-4 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{copy.category}</span>
            <span className={`text-xs font-semibold ${severe ? "text-rose-700" : "text-amber-700"}`}>{copy.severity}</span>
            <span className="border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-500">{copy.status}</span>
            <span className="text-xs text-zinc-400">{copy.evidenceClass}</span>
          </div>
          <h4 className="mt-2 text-sm font-semibold text-zinc-900">{copy.title}</h4>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">{plan.summary}</p>
          {copy.recommendation ? <p className="mt-2 max-w-3xl border-l-2 border-teal-500 pl-3 text-sm leading-6 text-zinc-700"><span className="font-semibold">Hinweis des Audits:</span> {copy.recommendation}</p> : null}
        </div>
        <span className="shrink-0 font-mono text-xs text-zinc-500" title="Vertrauen des Findings">{Math.round(finding.confidence * 100)}% Vertrauen</span>
      </div>
      <ActionPlanSteps plan={plan} compact />
    </article>
  )
}

function ExperimentRow({ experiment }: { experiment: SeoOperationsData["experiments"][number] }) {
  const copy = localizeSeoExperiment(experiment)
  const plan = getSeoActionPlan({ category: "geo", severity: "medium", title: experiment.hypothesis })
  return (
    <article className="px-4 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">GEO-Hypothese</span>
            <span className="text-xs text-zinc-500">{copy.type}</span>
            <span className="border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-500">{copy.status}</span>
          </div>
          <h4 className="mt-2 text-sm font-semibold text-zinc-900">{copy.hypothesis}</h4>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600"><span className="font-semibold">Zielmetrik:</span> {copy.targetMetric}. {copy.rollbackNote}</p>
        </div>
      </div>
      <ActionPlanSteps plan={plan} compact />
    </article>
  )
}
