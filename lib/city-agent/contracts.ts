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

export const cityAgentOperatingModes = ["DISABLED", "SHADOW", "GUARDED_AUTO"] as const
export type CityAgentOperatingMode = (typeof cityAgentOperatingModes)[number]

export const cityAgentModuleKeys = [
  "event",
  "news",
  "discovery",
  "business",
  "freshness",
  "route",
  "seo_opportunity",
  "editorial",
  "media",
  "qa",
  "content_gap",
  "event_seo",
  "editorial_queue",
  "full_seo",
  "full_city_audit",
  "evergreen_deep_recheck",
] as const
export type CityAgentModuleKey = (typeof cityAgentModuleKeys)[number]

export const cityAgentFindingTypes = [
  "CONTENT_GAP",
  "SEO_OPPORTUNITY",
  "MEDIA_NEED",
  "QA_ISSUE",
  "DUPLICATE",
  "STALE",
  "SOURCE_FAILURE",
] as const
export type CityAgentFindingType = (typeof cityAgentFindingTypes)[number]

export const cityAgentChangeTypes = [
  "INITIAL_BASELINE",
  "NO_CHANGE",
  "SEMANTIC_CHANGE",
  "METADATA_ONLY_CHANGE",
  "UNCHANGED",
  "CONTENT_CHANGED",
  "ENTITY_NEW",
  "ENTITY_REMOVED",
  "SOURCE_RECOVERED",
  "SOURCE_FAILED",
] as const
export type CityAgentChangeType = (typeof cityAgentChangeTypes)[number]

export const cityAgentDecisionClasses = [
  "VALID_ACTIONABLE",
  "VALID_LOW_VALUE",
  "DUPLICATE",
  "INITIAL_BASELINE_NOISE",
  "OUTDATED",
  "CONFLICTING",
  "FALSE_POSITIVE",
  "ALREADY_IN_SYSTEM",
  "RESOLVED_BY_CANONICALIZATION",
] as const
export type CityAgentDecisionClass = (typeof cityAgentDecisionClasses)[number]

export const cityAgentSeoDecisions = [
  "PURSUE_NOW",
  "IMPROVE_EXISTING",
  "CREATE_NEW",
  "WATCH",
  "REJECT",
] as const
export type CityAgentSeoDecision = (typeof cityAgentSeoDecisions)[number]

export type CityAgentQualityScore = {
  relevance: number
  evidence: number
  actionability: number
  confidence: number
  sourceQuality: number
  duplicateRisk: number
  score: number
  priority: number
  decisionClass: CityAgentDecisionClass
  seoDecision: CityAgentSeoDecision
  queryIntent: string | null
  targetUser: string | null
  existingUrl: string | null
  targetUrl: string | null
  proposedAction: string | null
  localValue: number
  temporalValue: number
  cannibalizationRisk: number
  freshness: "CURRENT" | "DUE" | "STALE" | "UNKNOWN"
}

export const cityAgentTrustTiers = ["A", "B", "C", "D"] as const
export type CityAgentTrustTier = (typeof cityAgentTrustTiers)[number]

export type CityAgentSourceRow = {
  id: string
  city_id: string
  slug: string
  url: string
  source_type: "official" | "tourism" | "structured" | "community"
  owner_name?: string | null
  trust_level: "primary" | "trusted_secondary" | "community"
  cadence: "hourly" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "manual"
  next_check_at: string | null
  parser_config: Record<string, unknown>
  content_scope: Record<string, unknown>
  active: boolean
  enabled?: boolean
  crawl_method?: string
  last_status?: "pending" | "healthy" | "changed" | "error" | "blocked" | "stale" | string | null
  last_checked_at?: string | null
  failure_count?: number
  health?: "HEALTHY" | "DEGRADED" | "FAILED" | "DISABLED" | "DEPRECATED"
  notes?: string | null
  trust_tier?: CityAgentTrustTier | null
  last_success_at?: string | null
  last_change_at?: string | null
  last_failure_at?: string | null
  last_recovered_at?: string | null
  next_retry_at?: string | null
  retry_count?: number
  last_failure_category?: string | null
  primary_source?: boolean
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
  extractionMethod?: "html" | "text" | "pdf-text" | "hermes"
  pageCount?: number | null
  provenance?: Array<{ page?: number; locator?: string }>
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
  operatingMode?: CityAgentOperatingMode
  moduleKey?: CityAgentModuleKey
  shadow?: boolean
  findingCount?: number
  desiredCadenceMinutes?: number
  actualTrigger?: string
  changeCounts?: Record<string, number>
  freshness?: Record<string, number>
  business?: {
    checked: number
    current: number
    due: number
    stale: number
    unknown: number
    inCity: number
    nearby: number
    regional: number
    unknownScope: number
    dataGaps: number
  }
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

export function isCityAgentOperatingMode(value: unknown): value is CityAgentOperatingMode {
  return typeof value === "string" && cityAgentOperatingModes.includes(value as CityAgentOperatingMode)
}

export function isCityAgentModuleKey(value: unknown): value is CityAgentModuleKey {
  return typeof value === "string" && cityAgentModuleKeys.includes(value as CityAgentModuleKey)
}

export function isCityAgentFindingType(value: unknown): value is CityAgentFindingType {
  return typeof value === "string" && cityAgentFindingTypes.includes(value as CityAgentFindingType)
}

export function trustTierForSource(source: Pick<CityAgentSourceRow, "trust_level" | "trust_tier">): CityAgentTrustTier {
  if (source.trust_tier && cityAgentTrustTiers.includes(source.trust_tier)) return source.trust_tier
  return source.trust_level === "primary" ? "A" : source.trust_level === "trusted_secondary" ? "B" : "D"
}

export function confidenceForTrustLevel(level: CityAgentSourceRow["trust_level"]) {
  return level === "primary" ? 0.95 : level === "trusted_secondary" ? 0.85 : 0.7
}

export function riskForTrustLevel(level: CityAgentSourceRow["trust_level"]): CityAgentRiskLevel {
  return level === "primary" ? "medium" : level === "trusted_secondary" ? "high" : "critical"
}

export function riskForTrustTier(tier: CityAgentTrustTier): CityAgentRiskLevel {
  return tier === "A" ? "low" : tier === "B" ? "medium" : tier === "C" ? "high" : "critical"
}

export function confidenceForTrustTier(tier: CityAgentTrustTier) {
  return tier === "A" ? 0.98 : tier === "B" ? 0.88 : tier === "C" ? 0.75 : 0.55
}
