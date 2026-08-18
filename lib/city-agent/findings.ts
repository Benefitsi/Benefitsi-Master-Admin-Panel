import { createHash } from "node:crypto"
import {
  type CityAgentChangeType,
  type CityAgentFindingType,
  type CityAgentModuleKey,
  type CityAgentRiskLevel,
  type CityAgentSourceFacts,
  type CityAgentSourceRow,
} from "./contracts"
import { classifySource } from "./orchestrator"
import { moduleForSource } from "./modules"

export type CityAgentFindingInput = {
  cityId: string
  runId?: string
  sourceId?: string
  moduleKey: CityAgentModuleKey
  findingType: CityAgentFindingType
  title: string
  summary: string
  actionType?: string
  confidence: number
  riskLevel: CityAgentRiskLevel
  evidence?: Array<Record<string, unknown>>
  details?: Record<string, unknown>
  deduplicationKey: string
  changeType?: CityAgentChangeType
  attentionRequired?: boolean
  priorityScore?: number
  decisionClass?: string
  targetUrl?: string | null
}

function hasSearchIntent(input: { source: CityAgentSourceRow; facts?: CityAgentSourceFacts }) {
  if (typeof input.source.parser_config.seoIntent === "string" && input.source.parser_config.seoIntent.trim()) return true
  const scope = Object.keys(input.source.content_scope).join(" ").toLowerCase()
  const title = input.facts?.title?.toLowerCase() ?? ""
  return /(event|veranstaltung|markt|route|tour|wandern|sight|sehens|burg|museum|family|famil|opening|price|restaurant|business|service)/.test(`${scope} ${title}`)
}

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 48)
}

export function findingKey(parts: string[]) {
  return hashKey(parts.map((part) => part.trim().toLowerCase()).join("|"))
}

export function sourceFindings(input: {
  cityId: string
  runId: string
  source: CityAgentSourceRow
  facts?: CityAgentSourceFacts
  error?: string
  changed: boolean
  snapshotId?: string
  changeType?: CityAgentChangeType
  meaningfulBaseline?: boolean
}): CityAgentFindingInput[] {
  const moduleKey = moduleForSource(input.source)
  const sourceUrl = input.facts?.finalUrl ?? input.source.url
  const evidence = [{ url: sourceUrl, snapshotId: input.snapshotId ?? null, retrievedAt: input.facts?.retrievedAt ?? new Date().toISOString() }]
  const classified = classifySource(input.source)
  if (input.error) {
    return [{
      cityId: input.cityId,
      runId: input.runId,
      sourceId: input.source.id,
      moduleKey,
      findingType: "SOURCE_FAILURE",
      title: `Quelle nicht erreichbar: ${input.source.slug}`,
      summary: input.error.slice(0, 1000),
      actionType: "OBSERVE",
      confidence: 1,
      riskLevel: "high",
      evidence,
      details: { sourceSlug: input.source.slug, health: "FAILED" },
      deduplicationKey: findingKey([input.cityId, input.source.id, "source-failure", input.error]),
      changeType: "SOURCE_FAILED",
      attentionRequired: true,
      priorityScore: 80,
    }]
  }

  if (input.changeType === "SOURCE_RECOVERED") {
    return [{
      cityId: input.cityId,
      runId: input.runId,
      sourceId: input.source.id,
      moduleKey,
      findingType: "QA_ISSUE",
      title: `Quelle wieder erreichbar: ${input.source.slug}`,
      summary: "Die Quelle war zuvor beeinträchtigt und wurde erfolgreich erneut geprüft. Inhaltliche Änderungen werden separat bewertet.",
      actionType: "OBSERVE_RECOVERY",
      confidence: classified.confidence,
      riskLevel: "low",
      evidence,
      details: { sourceSlug: input.source.slug, recovery: true, contentChanged: input.changed },
      deduplicationKey: findingKey([input.cityId, input.source.id, "source-recovered"]),
      changeType: "SOURCE_RECOVERED",
      attentionRequired: false,
      priorityScore: 15,
    }]
  }

  if (input.changeType === "INITIAL_BASELINE") {
    if (!input.meaningfulBaseline) return []
    return [{
      cityId: input.cityId,
      runId: input.runId,
      sourceId: input.source.id,
      moduleKey,
      findingType: "CONTENT_GAP",
      title: `Erstbaseline gegen Bestand prüfen: ${input.facts?.title || input.source.slug}`,
      summary: "Die Quelle wurde erstmals für diesen Agent-Lauf beobachtet. Vor einer Proposal-Erstellung muss die Information gegen bestehende City-Entities abgeglichen werden.",
      actionType: "COMPARE_WITH_EXISTING_ENTITY",
      confidence: classified.confidence,
      riskLevel: classified.defaultRisk,
      evidence,
      details: { initialBaseline: true, sourceTrust: classified.tier },
      deduplicationKey: findingKey([input.cityId, input.source.id, "initial-baseline-gap"]),
      changeType: "INITIAL_BASELINE",
      attentionRequired: true,
      priorityScore: 45,
    }]
  }

  if (!input.changed || ["NO_CHANGE", "UNCHANGED", "METADATA_ONLY_CHANGE"].includes(input.changeType ?? "")) return []
  const searchIntent = hasSearchIntent({ source: input.source, facts: input.facts })
  const findings: CityAgentFindingInput[] = [{
    cityId: input.cityId,
    runId: input.runId,
    sourceId: input.source.id,
    moduleKey,
    findingType: "SEO_OPPORTUNITY",
    title: `Bestehende Seite prüfen: ${input.facts?.title || input.source.slug}`,
    summary: searchIntent
      ? "Eine semantisch relevante Quellenänderung wurde erkannt. Bestehende URL, Suchintention und Kannibalisierung müssen vor einer Maßnahme geprüft werden."
      : "Eine technische Quellenänderung wurde erkannt, liefert aber noch keinen belastbaren Suchintent. Beobachten statt automatisch als SEO-Chance werten.",
    actionType: searchIntent ? "UPDATE_EXISTING_PAGE" : "WATCH_SOURCE_CHANGE",
    confidence: classified.confidence,
    riskLevel: classified.defaultRisk,
    evidence,
    details: { contentType: input.source.parser_config.contentType ?? "city_guide", sourceTrust: classified.tier, searchIntent, changeType: input.changeType },
    deduplicationKey: findingKey([input.cityId, input.source.id, input.facts?.contentHash ?? "changed", "seo"]),
    changeType: input.changeType ?? "SEMANTIC_CHANGE",
    attentionRequired: searchIntent,
    priorityScore: searchIntent ? 60 : 20,
    decisionClass: searchIntent ? "VALID_LOW_VALUE" : "FALSE_POSITIVE",
  }]

  if (input.source.content_scope.image_discovery || moduleKey === "media") {
    findings.push({
      cityId: input.cityId,
      runId: input.runId,
      sourceId: input.source.id,
      moduleKey: "media",
      findingType: "MEDIA_NEED",
      title: `Medien manuell prüfen: ${input.source.slug}`,
      summary: "Die Quelle kann Medien referenzieren. Der Media Agent erstellt nur einen Bedarf; Bilder werden nicht automatisch übernommen.",
      actionType: "REVIEW_MEDIA_RIGHTS",
      confidence: classified.confidence,
      riskLevel: "high",
      evidence,
      details: { rightsRequired: true, sourceTrust: classified.tier },
      deduplicationKey: findingKey([input.cityId, input.source.id, input.facts?.contentHash ?? "changed", "media"]),
      changeType: input.changeType ?? "SEMANTIC_CHANGE",
      attentionRequired: true,
      priorityScore: 55,
    })
  }

  return findings
}

export function baselineFindingCounts(findings: Array<Pick<CityAgentFindingInput, "findingType">>) {
  return findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.findingType] = (counts[finding.findingType] ?? 0) + 1
    return counts
  }, {})
}
