export const automationJobTypes = [
  "city_scan",
  "source_verification",
  "content_correction",
  "provider_onboarding",
  "booking_anomaly",
  "notification",
] as const

export type AutomationJobType = (typeof automationJobTypes)[number]

export const automationStatuses = [
  "queued",
  "claimed",
  "agent_completed",
  "needs_human",
  "approved",
  "rejected",
  "failed",
  "cancelled",
] as const

export type AutomationStatus = (typeof automationStatuses)[number]

export type AutomationHumanGate =
  | "none"
  | "publish"
  | "refund"
  | "payout"
  | "live_activation"
  | "provider_activation"

export type AutomationJob = {
  id: string
  jobType: AutomationJobType
  status: AutomationStatus
  priority: number
  cityId: string | null
  cityName: string | null
  providerId: string | null
  bookingId: string | null
  targetType: string | null
  targetId: string | null
  humanGate: AutomationHumanGate
  input: Record<string, unknown>
  result: Record<string, unknown> | null
  recommendedAction: string | null
  agentProfile: string | null
  attempts: number
  maxAttempts: number
  availableAt: string | null
  leaseUntil: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type AutomationAuditEntry = {
  id: string
  jobId: string
  action: string
  actorType: string
  actorProfile: string | null
  details: Record<string, unknown>
  createdAt: string | null
}

export type AutomationData = {
  jobs: AutomationJob[]
  audit: AutomationAuditEntry[]
  cities: Array<{ id: string; name: string }>
  cityAgentSources: CityAgentSourceSummary[]
  cityAgentRuns: CityAgentRunSummary[]
  cityAgentProposals: CityAgentProposalSummary[]
  cityAgentAudit: CityAgentAuditEntry[]
  migrationReady: boolean
  warnings: string[]
}

export type CityAgentSourceSummary = {
  id: string
  cityId: string
  cityName: string | null
  slug: string
  url: string
  sourceType: string
  trustLevel: string
  cadence: string
  nextCheckAt: string | null
  lastCheckedAt: string | null
  lastStatus: string
  active: boolean
}

export type CityAgentRunSummary = {
  id: string
  cityId: string
  cityName: string | null
  jobId: string | null
  profileId: string
  orchestratorProfile: string
  trigger: string
  status: string
  dryRun: boolean
  sourceCount: number
  snapshotCount: number
  proposalCount: number
  staleCount: number
  errorCode: string | null
  errorSummary: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string | null
}

export type CityAgentProposalSummary = {
  id: string
  cityId: string
  cityName: string | null
  runId: string
  sourceId: string | null
  snapshotId: string | null
  contentType: string
  contentId: string | null
  operation: string
  status: string
  riskLevel: string
  confidence: number
  fieldDiff: Record<string, unknown>
  proposedPayload: Record<string, unknown>
  evidence: Array<Record<string, unknown>>
  reviewId: string | null
  createdAt: string | null
}

export type CityAgentAuditEntry = {
  id: string
  runId: string
  action: string
  actorType: string
  actorProfile: string | null
  details: Record<string, unknown>
  createdAt: string | null
}

export function isAutomationJobType(
  value: string,
): value is AutomationJobType {
  return automationJobTypes.includes(value as AutomationJobType)
}

export function isAutomationStatus(
  value: string,
): value is AutomationStatus {
  return automationStatuses.includes(value as AutomationStatus)
}

export function automationTypeLabel(type: AutomationJobType) {
  return {
    city_scan: "Stadt-Scan",
    source_verification: "Quellenprüfung",
    content_correction: "Inhaltskorrektur",
    provider_onboarding: "Anbieter-Onboarding",
    booking_anomaly: "Buchungsprüfung",
    notification: "Benachrichtigung",
  }[type]
}

export function automationStatusLabel(status: AutomationStatus) {
  return {
    queued: "Wartet",
    claimed: "In Bearbeitung",
    agent_completed: "Agent fertig",
    needs_human: "Freigabe nötig",
    approved: "Empfehlung bestätigt",
    rejected: "Abgelehnt",
    failed: "Fehlgeschlagen",
    cancelled: "Abgebrochen",
  }[status]
}

export function humanGateLabel(gate: AutomationHumanGate) {
  return {
    none: "Keine geschützte Aktion",
    publish: "Veröffentlichung",
    refund: "Erstattung",
    payout: "Auszahlung",
    live_activation: "Live-Zahlungen",
    provider_activation: "Anbieter-Aktivierung",
  }[gate]
}

const sensitiveKeyPattern =
  /(secret|password|token|authorization|cookie|customer_email|email|phone|iban|tax_id|identity|kyc|date_of_birth|address)/i

export function redactAutomationPayload(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 5) return "[gekürzt]"
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactAutomationPayload(item, depth + 1))
  }
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? value.slice(0, 2000) : value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([key, item]) => [
        key,
        sensitiveKeyPattern.test(key)
          ? "[geschützt]"
          : redactAutomationPayload(item, depth + 1),
      ]),
  )
}
