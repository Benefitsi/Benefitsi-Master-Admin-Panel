import {
  type CityAgentChangeType,
  type CityAgentDecisionClass,
  type CityAgentQualityScore,
  type CityAgentSeoDecision,
  type CityAgentSourceRow,
} from "./contracts"
import { freshnessState, type FreshnessState } from "./freshness"
import { normalizeEntityText, tokenSimilarity } from "./dedupe"

type ProposalQualityInput = {
  source: Pick<CityAgentSourceRow, "url" | "slug" | "trust_level" | "trust_tier" | "content_scope" | "parser_config">
  operation: string
  contentType: string
  changeType: CityAgentChangeType
  fieldDiff: Record<string, unknown>
  proposedPayload: Record<string, unknown>
  evidenceCount: number
  existingUrl?: string | null
  duplicateRisk?: number
  now?: Date
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))

function sourceQuality(source: ProposalQualityInput["source"]) {
  if (source.trust_tier === "A" || source.trust_level === "primary") return 1
  if (source.trust_tier === "B") return 0.75
  if (source.trust_tier === "C") return 0.5
  return 0.25
}

function queryIntent(source: ProposalQualityInput["source"], payload: Record<string, unknown>) {
  const configured = source.parser_config.seoIntent
  if (typeof configured === "string" && configured.trim()) return configured.trim().slice(0, 120)
  const scope = Object.keys(source.content_scope).join(" ").toLowerCase()
  const title = typeof payload.title === "string" ? payload.title.toLowerCase() : ""
  if (/(event|veranstaltung|markt|festival|konzert)/.test(scope + " " + title)) return "lokale Veranstaltung finden"
  if (/(route|wandern|tour|trail|gpx)/.test(scope + " " + title)) return "Route oder Ausflug planen"
  if (/(sight|sehens|burg|museum|history|geschichte)/.test(scope + " " + title)) return "Sehenswürdigkeit entdecken"
  if (/(opening|hours|öffnungs|pricing|preis|access)/.test(scope + " " + title)) return "Besuch praktisch planen"
  if (/(business|restaurant|cafe|shop|partner)/.test(scope + " " + title)) return "Lokales Angebot finden"
  return null
}

function targetUser(contentType: string, intent: string | null) {
  if (intent?.includes("Veranstaltung")) return "Einwohner und Besucher mit konkretem Termininteresse"
  if (intent?.includes("Route")) return "Wanderer und Ausflügler"
  if (intent?.includes("Sehenswürdigkeit")) return "Besucher und Familien"
  if (contentType === "city_partner_benefit") return "Lokale Nutzer und Benefitsi-Mitglieder"
  return "Menschen mit lokalem Informationsbedarf"
}

function decisionFor(input: ProposalQualityInput, relevance: number, actionability: number, duplicateRisk: number, intent: string | null): {
  decisionClass: CityAgentDecisionClass
  seoDecision: CityAgentSeoDecision
} {
  const isInitial = input.changeType === "INITIAL_BASELINE" || Boolean(input.fieldDiff.baseline)
  if (isInitial) return { decisionClass: "INITIAL_BASELINE_NOISE", seoDecision: "WATCH" }
  if (duplicateRisk >= 0.8) return { decisionClass: "DUPLICATE", seoDecision: "REJECT" }
  if (input.operation === "verify" && input.proposedPayload.contentId) {
    return { decisionClass: "ALREADY_IN_SYSTEM", seoDecision: "IMPROVE_EXISTING" }
  }
  if (!intent || relevance < 0.45) return { decisionClass: "VALID_LOW_VALUE", seoDecision: "WATCH" }
  if (actionability < 0.45) return { decisionClass: "CONFLICTING", seoDecision: "WATCH" }
  if (input.existingUrl) return { decisionClass: "VALID_ACTIONABLE", seoDecision: "IMPROVE_EXISTING" }
  return { decisionClass: "VALID_ACTIONABLE", seoDecision: "CREATE_NEW" }
}

export function scoreProposalQuality(input: ProposalQualityInput): CityAgentQualityScore {
  const now = input.now ?? new Date()
  const intent = queryIntent(input.source, input.proposedPayload)
  const sourceScore = sourceQuality(input.source)
  const evidence = clamp(input.evidenceCount > 0 ? 0.9 : 0)
  const relevance = clamp(intent ? 0.7 + (input.source.content_scope.local_value ? 0.2 : 0) : 0.25)
  const actionability = clamp(Object.keys(input.fieldDiff).filter((key) => key !== "contentHash").length > 0 ? 0.8 : 0.3)
  const confidence = sourceScore >= 1 ? 0.98 : sourceScore >= 0.75 ? 0.88 : sourceScore >= 0.5 ? 0.75 : 0.55
  const duplicateRisk = clamp(input.duplicateRisk ?? 0)
  const temporalValue = /(event|date|opening|price|service|current)/i.test(`${intent ?? ""} ${Object.keys(input.source.content_scope).join(" ")}`) ? 0.85 : 0.35
  const localValue = input.source.content_scope.local_value ? 1 : relevance
  const cannibalizationRisk = input.existingUrl ? 0.75 : 0.2
  const freshnessTtlDays = typeof input.source.parser_config.freshnessTtlDays === "number"
    ? input.source.parser_config.freshnessTtlDays
    : temporalValue > 0.7 ? 7 : 30
  const retrievedAt = typeof input.proposedPayload.retrievedAt === "string" ? input.proposedPayload.retrievedAt : null
  const freshness: FreshnessState = freshnessState({ lastVerifiedAt: retrievedAt, ttlDays: freshnessTtlDays, now })
  const decision = decisionFor(input, relevance, actionability, duplicateRisk, intent)
  const score = Math.round(
    100 * (
      relevance * 0.24 +
      evidence * 0.2 +
      actionability * 0.18 +
      confidence * 0.16 +
      sourceScore * 0.12 +
      (1 - duplicateRisk) * 0.1
    ),
  )
  const priority = Math.round(
    100 * (
      localValue * 0.25 +
      temporalValue * 0.2 +
      relevance * 0.2 +
      actionability * 0.15 +
      confidence * 0.1 +
      (1 - cannibalizationRisk) * 0.1
    ),
  )
  return {
    relevance,
    evidence,
    actionability,
    confidence,
    sourceQuality: sourceScore,
    duplicateRisk,
    score,
    priority,
    decisionClass: decision.decisionClass,
    seoDecision: decision.seoDecision,
    queryIntent: intent,
    targetUser: targetUser(input.contentType, intent),
    existingUrl: input.existingUrl ?? null,
    targetUrl: input.existingUrl ?? null,
    proposedAction: input.existingUrl ? "Bestehende Seite verbessern" : "Neue Seite nur nach Editorial Review prüfen",
    localValue,
    temporalValue,
    cannibalizationRisk,
    freshness,
  }
}

export function qualityDetails(score: CityAgentQualityScore) {
  return {
    relevance: score.relevance,
    evidence: score.evidence,
    actionability: score.actionability,
    confidence: score.confidence,
    sourceQuality: score.sourceQuality,
    duplicateRisk: score.duplicateRisk,
    score: score.score,
    priority: score.priority,
    decisionClass: score.decisionClass,
    seoDecision: score.seoDecision,
    queryIntent: score.queryIntent,
    targetUser: score.targetUser,
    existingUrl: score.existingUrl,
    targetUrl: score.targetUrl,
    proposedAction: score.proposedAction,
    localValue: score.localValue,
    temporalValue: score.temporalValue,
    cannibalizationRisk: score.cannibalizationRisk,
    freshness: score.freshness,
  }
}

export function qualityIsAttentionWorthy(score: Pick<CityAgentQualityScore, "decisionClass" | "seoDecision" | "priority">) {
  const lowValueWatch = score.decisionClass === "VALID_LOW_VALUE" && score.priority < 60
  return !["DUPLICATE", "INITIAL_BASELINE_NOISE", "ALREADY_IN_SYSTEM", "FALSE_POSITIVE", "RESOLVED_BY_CANONICALIZATION"].includes(score.decisionClass)
    && !lowValueWatch
    && score.seoDecision !== "REJECT"
    && score.priority >= 35
}

export function duplicateRiskForProposal(input: { title?: unknown; sourceUrl?: unknown; seenTitles: string[] }) {
  const title = typeof input.title === "string" ? normalizeEntityText(input.title) : ""
  if (!title) return 0
  return Math.max(0, ...input.seenTitles.map((seen) => tokenSimilarity(title, seen)))
}
