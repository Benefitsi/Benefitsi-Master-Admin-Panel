import { createHash } from "node:crypto"
import type {
  CityAgentFindingSummary,
  CityAgentProposalSummary,
  CityAgentScheduleSummary,
  CityAgentSchedulerRunSummary,
  CityAgentSourceSummary,
} from "@/lib/automation/contracts"

export type CityAgentHealthStatus = "HEALTHY" | "DEGRADED" | "CRITICAL"

export type CityAgentHealth = {
  status: CityAgentHealthStatus
  reasons: string[]
  attentionCount: number
  metrics: {
    primarySources: number
    primarySourcesUnhealthy: number
    schedulerRuns48h: number
    schedulerFailures48h: number
    missedSchedules: number
    reviewBacklog: number
    blockingQa: number
    duplicates: number
    falsePositives: number
  }
  readiness: {
    noP0AgentBugs: boolean
    primarySourceHealth: boolean
    schedulerObserved: boolean
    lowFalsePositiveRate: boolean
    deduplicationStable: boolean
    publicQaStable: boolean
    proposalQualityReady: boolean
    testsGreen: boolean
  }
}

type HealthInput = {
  sources: CityAgentSourceSummary[]
  schedules: CityAgentScheduleSummary[]
  findings: CityAgentFindingSummary[]
  proposals: CityAgentProposalSummary[]
  schedulerRuns?: CityAgentSchedulerRunSummary[]
  now?: Date
}

function hoursSince(value: string | null, now: Date) {
  if (!value) return Number.POSITIVE_INFINITY
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY
  return Math.max(0, now.getTime() - timestamp) / (60 * 60 * 1000)
}

function inLastHours(value: string | null, now: Date, hours: number) {
  return Boolean(value) && hoursSince(value, now) <= hours
}

export function deriveCityAgentHealth(input: HealthInput): CityAgentHealth {
  const now = input.now ?? new Date()
  const reasons: string[] = []
  const primarySources = input.sources.filter((source) => source.trustTier === "A" || source.primarySource)
  const primarySourcesUnhealthy = primarySources.filter((source) => {
    const unhealthy = ["FAILED", "DEGRADED", "UNKNOWN"].includes(source.health.toUpperCase())
    return unhealthy && hoursSince(source.lastSuccessAt, now) > 24
  })
  if (primarySourcesUnhealthy.length > 0) {
    reasons.push(`${primarySourcesUnhealthy.length} Primärquelle(n) sind seit mehr als 24 Stunden nicht belastbar.`)
  } else if (primarySources.some((source) => ["FAILED", "DEGRADED"].includes(source.health.toUpperCase()))) {
    reasons.push("Mindestens eine Primärquelle ist aktuell beeinträchtigt; Retry/Recovery läuft weiter.")
  }

  const missedSchedules = input.schedules.filter((schedule) =>
    schedule.enabled && (
      schedule.consecutiveMissedRuns > 0
      || inLastHours(schedule.lastMissedAt, now, 48)
      || (schedule.nextRunAt && new Date(schedule.nextRunAt).getTime() < now.getTime() - Math.max(15 * 60 * 1000, schedule.cadenceMinutes * 90 * 1000))
    ),
  ).length
  if (missedSchedules > 0) reasons.push(`${missedSchedules} Scheduler-Frequenz(en) wurden verpasst oder sind überfällig.`)

  const schedulerRuns48h = (input.schedulerRuns ?? []).filter((run) => inLastHours(run.startedAt, now, 48))
  const schedulerFailures48h = schedulerRuns48h.filter((run) => ["failed", "partial"].includes(run.status)).length
  if (schedulerRuns48h.length === 0) reasons.push("Noch kein echter Scheduler-Run im Beobachtungsfenster erfasst.")
  if (schedulerFailures48h > 0) reasons.push(`${schedulerFailures48h} Scheduler-/Worker-Run(s) waren in den letzten 48 Stunden nicht vollständig erfolgreich.`)

  const reviewBacklog = input.proposals.filter((proposal) => ["needs_human", "agent_draft"].includes(proposal.status)).length
  if (reviewBacklog > 100) reasons.push(`Review-Backlog ist kritisch groß (${reviewBacklog}).`)
  else if (reviewBacklog > 50) reasons.push(`Review-Backlog braucht Aufmerksamkeit (${reviewBacklog}).`)

  const blockingQa = input.findings.filter((finding) =>
    finding.attentionRequired
    && (finding.riskLevel.toLowerCase() === "critical" || finding.details?.severity === "blocking"),
  ).length
  if (blockingQa > 0) reasons.push(`${blockingQa} blockierende QA-Finding(s) sind offen.`)

  const duplicates = input.proposals.filter((proposal) => proposal.decisionClass === "DUPLICATE").length
  const falsePositives = input.proposals.filter((proposal) => ["FALSE_POSITIVE", "INITIAL_BASELINE_NOISE", "ALREADY_IN_SYSTEM", "RESOLVED_BY_CANONICALIZATION"].includes(proposal.decisionClass ?? "")).length
  const falsePositiveRate = input.proposals.length ? falsePositives / input.proposals.length : 0
  if (falsePositiveRate > 0.6) reasons.push(`Noise-/False-Positive-Rate liegt bei ${Math.round(falsePositiveRate * 100)}%.`)
  const duplicateRate = input.proposals.length ? duplicates / input.proposals.length : 0
  if (duplicateRate > 0.2) reasons.push(`Duplikat-Rate liegt bei ${Math.round(duplicateRate * 100)}% und überschreitet die Stabilitätsschwelle.`)

  const critical = primarySourcesUnhealthy.length > 0 || blockingQa > 0 || reviewBacklog > 100 || schedulerFailures48h >= 3
  const degraded = reasons.length > 0
  const status: CityAgentHealthStatus = critical ? "CRITICAL" : degraded ? "DEGRADED" : "HEALTHY"
  const readiness = {
    noP0AgentBugs: blockingQa === 0,
    primarySourceHealth: primarySourcesUnhealthy.length === 0,
    schedulerObserved: schedulerRuns48h.length >= 3 && schedulerFailures48h === 0 && missedSchedules === 0,
    lowFalsePositiveRate: input.proposals.length === 0 || falsePositiveRate <= 0.25,
    deduplicationStable: input.proposals.length === 0 || duplicates / input.proposals.length <= 0.2,
    publicQaStable: blockingQa === 0,
    proposalQualityReady: input.proposals.length === 0 || input.proposals.every((proposal) => proposal.qualityScore !== null),
    testsGreen: false,
  }

  return {
    status,
    reasons,
    attentionCount: input.findings.filter((finding) => finding.attentionRequired && finding.priorityScore >= 35).length,
    metrics: {
      primarySources: primarySources.length,
      primarySourcesUnhealthy: primarySourcesUnhealthy.length,
      schedulerRuns48h: schedulerRuns48h.length,
      schedulerFailures48h,
      missedSchedules,
      reviewBacklog,
      blockingQa,
      duplicates,
      falsePositives,
    },
    readiness,
  }
}

export type CityAgentHealthSimulation = {
  scenario: string
  status: CityAgentHealthStatus
  passed: boolean
  reason: string
  evaluationVersion: number
  inputFingerprint: string
}

export function simulateCityAgentHealth(now = new Date()): CityAgentHealthSimulation[] {
  const base = {
    sources: [{ trustTier: "A", primarySource: true, health: "HEALTHY", lastSuccessAt: now.toISOString() }],
    schedules: [{ enabled: true, cadenceMinutes: 15, consecutiveMissedRuns: 0, lastMissedAt: null, nextRunAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString() }],
    findings: [],
    proposals: [],
    schedulerRuns: [1, 2, 3].map((index) => ({ status: "succeeded", startedAt: new Date(now.getTime() - index * 15 * 60 * 1000).toISOString() })),
  } as unknown as HealthInput
  const scenarios: Array<{ name: string; mutate: (value: HealthInput) => void; expected: CityAgentHealthStatus }> = [
    {
      name: "source_unavailable",
      mutate: (value) => { value.sources[0] = { ...value.sources[0], health: "FAILED", lastSuccessAt: new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString() } },
      expected: "CRITICAL",
    },
    {
      name: "scheduler_missed",
      mutate: (value) => { value.schedules[0] = { ...value.schedules[0], consecutiveMissedRuns: 1, lastMissedAt: now.toISOString() } },
      expected: "DEGRADED",
    },
    {
      name: "worker_failure",
      mutate: (value) => { value.schedulerRuns = [{ status: "failed", startedAt: now.toISOString() }] as unknown as HealthInput["schedulerRuns"] },
      expected: "DEGRADED",
    },
    {
      name: "publish_failure",
      mutate: (value) => { value.findings = [{ attentionRequired: true, riskLevel: "critical", details: { severity: "blocking" } }] as unknown as CityAgentFindingSummary[] },
      expected: "CRITICAL",
    },
    {
      name: "duplicate_spike",
      mutate: (value) => { value.proposals = Array.from({ length: 10 }, () => ({ decisionClass: "DUPLICATE", status: "superseded", qualityScore: 40 })) as unknown as CityAgentProposalSummary[] },
      expected: "DEGRADED",
    },
    {
      name: "review_backlog_threshold",
      mutate: (value) => { value.proposals = Array.from({ length: 101 }, () => ({ status: "needs_human", qualityScore: 70 })) as unknown as CityAgentProposalSummary[] },
      expected: "CRITICAL",
    },
  ]
  return scenarios.map((scenario) => {
    const value = structuredClone(base)
    scenario.mutate(value)
    const result = deriveCityAgentHealth(value)
    const inputFingerprint = createHash("sha256")
      .update(JSON.stringify({ evaluationVersion: 1, scenario: scenario.name, expected: scenario.expected }))
      .digest("hex")
    return {
      scenario: scenario.name,
      status: result.status,
      passed: result.status === scenario.expected,
      reason: result.reasons[0] ?? "Keine Abweichung erkannt.",
      evaluationVersion: 1,
      inputFingerprint,
    }
  })
}
