import type {
  CityAgentContentType,
  CityAgentOperatingMode,
  CityAgentProposalOperation,
  CityAgentRiskLevel,
  CityAgentTrustTier,
} from "./contracts"

export type AutonomyFieldMode = "AUTO" | "MANUAL" | "LOCKED"

export type AutonomousActionInput = {
  operatingMode: CityAgentOperatingMode
  autoPublishEnabled: boolean
  prelaunch: boolean
  fieldMode: AutonomyFieldMode
  sourceTrustTier: CityAgentTrustTier
  confidence: number
  risk: CityAgentRiskLevel
  contentType: CityAgentContentType
  operation: CityAgentProposalOperation
  fields: string[]
  entityExists: boolean
  evidenceCount: number
  hasConflict: boolean
}

export type AutonomousActionDecision = {
  decision: "AUTO" | "REVIEW" | "BLOCKED"
  reason: string
  protectedActionExecuted: false
}

// This is intentionally narrower than the complete City-Agent field surface.
// Anything not listed here remains a human decision, even after guarded auto
// is enabled. Changes to events, partners, prices, media, URLs, and legal or
// safety copy must never be inferred as routine metadata changes.
export const guardedAutoFields = new Set([
  "seo_title",
  "seo_description",
  "meta_title",
  "meta_description",
  "excerpt",
])

const guardedAutoContentTypes = new Set<CityAgentContentType>([
  "city_place",
  "city_route",
  "city_guide",
])

function review(reason: string): AutonomousActionDecision {
  return { decision: "REVIEW", reason, protectedActionExecuted: false }
}

function blocked(reason: string): AutonomousActionDecision {
  return { decision: "BLOCKED", reason, protectedActionExecuted: false }
}

/**
 * Central policy decision for a possible automatic write.
 *
 * A decision of AUTO is only a permission from policy. The caller still has
 * to use the existing central write/publish gate and record the decision in
 * the run audit. This function never performs a mutation.
 */
export function decideAutonomousAction(input: AutonomousActionInput): AutonomousActionDecision {
  if (input.operatingMode === "DISABLED") return blocked("CITY_AGENT_DISABLED")
  if (input.operatingMode === "SHADOW") return blocked("SHADOW")
  if (input.prelaunch) return blocked("PRELAUNCH")
  if (!input.autoPublishEnabled) return blocked("AUTO_PUBLISH_DISABLED")

  if (input.fieldMode !== "AUTO") return review("FIELD_REQUIRES_HUMAN")
  if (input.operation !== "update") return review("CREATE_OR_LIFECYCLE_CHANGE_REQUIRES_HUMAN")
  if (!input.entityExists) return review("NEW_ENTITY_REQUIRES_HUMAN")
  if (!guardedAutoContentTypes.has(input.contentType)) return review("CONTENT_TYPE_REQUIRES_HUMAN")
  if (input.contentType === "city_event") return review("EVENT_CHANGE_REQUIRES_HUMAN")
  if (input.hasConflict) return review("CONFLICT_REQUIRES_HUMAN")
  if (input.sourceTrustTier !== "A") return review("SOURCE_TRUST_REQUIRES_HUMAN")
  if (!Number.isFinite(input.confidence) || input.confidence < 0.98) return review("CONFIDENCE_REQUIRES_HUMAN")
  if (input.risk !== "low") return review("RISK_REQUIRES_HUMAN")
  if (!Number.isFinite(input.evidenceCount) || input.evidenceCount < 2) return review("EVIDENCE_REQUIRES_HUMAN")

  const fields = input.fields.map((field) => field.trim().toLowerCase()).filter(Boolean)
  if (!fields.length || fields.some((field) => !guardedAutoFields.has(field))) {
    return review("FIELD_NOT_IN_GUARDED_ALLOWLIST")
  }

  return { decision: "AUTO", reason: "existing_low_risk_change", protectedActionExecuted: false }
}

