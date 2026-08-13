export const cityAgentContentTypes = [
  "city_event",
  "city_place",
  "city_playground",
  "city_club",
  "city_route",
  "city_guide",
  "city_partner_benefit",
  "city_newsletter",
] as const

export type CityAgentContentType = (typeof cityAgentContentTypes)[number]

export const cityAgentProposalOperations = ["create", "update", "expire", "verify"] as const
export type CityAgentProposalOperation = (typeof cityAgentProposalOperations)[number]

export const cityAgentRiskLevels = ["low", "medium", "high", "critical"] as const
export type CityAgentRiskLevel = (typeof cityAgentRiskLevels)[number]

export type CityAgentSourceRow = {
  id: string
  city_id: string
  slug: string
  url: string
  source_type: "official" | "tourism" | "structured" | "community"
  trust_level: "primary" | "trusted_secondary" | "community"
  cadence: "hourly" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "manual"
  next_check_at: string | null
  parser_config: Record<string, unknown>
  content_scope: Record<string, unknown>
  active: boolean
}

export type CityAgentSourceFacts = {
  title: string
  headings: string[]
  textPreview: string
  dateMentions: string[]
  contentHash: string
  retrievedAt: string
  finalUrl: string
  httpStatus: number
  contentType: string
  truncated: boolean
  drafts?: CityAgentDraftReference[]
  issues?: string[]
}

export type CityAgentDraftReference = {
  contentType: CityAgentContentType
  draftId: string
  operation: CityAgentProposalOperation
  summary: string
}

export type CityAgentReviewDecision = {
  proposalId: string
  decision: "auto_published" | "approved" | "needs_review" | "reject"
  confidence: number
  risk: CityAgentRiskLevel
  reason: string
  publishedDraftIds: string[]
}

export type CityAgentDiff = Record<
  string,
  { before: unknown; after: unknown }
>

export type CityAgentRunSummary = {
  claimed: boolean
  jobId?: string
  runId?: string
  cityId?: string
  citySlug?: string
  provider?: string
  sourceCount: number
  snapshotCount: number
  proposalCount: number
  autoPublishedCount?: number
  staleCount: number
  errorCount: number
  status: "succeeded" | "partial" | "failed" | "idle"
  errors: string[]
}

export function isCityAgentContentType(value: unknown): value is CityAgentContentType {
  return typeof value === "string" && cityAgentContentTypes.includes(value as CityAgentContentType)
}

export function isCityAgentProposalOperation(value: unknown): value is CityAgentProposalOperation {
  return typeof value === "string" && cityAgentProposalOperations.includes(value as CityAgentProposalOperation)
}

export function isCityAgentRiskLevel(value: unknown): value is CityAgentRiskLevel {
  return typeof value === "string" && cityAgentRiskLevels.includes(value as CityAgentRiskLevel)
}

export function confidenceForTrustLevel(level: CityAgentSourceRow["trust_level"]) {
  return level === "primary" ? 0.95 : level === "trusted_secondary" ? 0.85 : 0.7
}

export function riskForTrustLevel(level: CityAgentSourceRow["trust_level"]): CityAgentRiskLevel {
  return level === "primary" ? "medium" : level === "trusted_secondary" ? "high" : "critical"
}
