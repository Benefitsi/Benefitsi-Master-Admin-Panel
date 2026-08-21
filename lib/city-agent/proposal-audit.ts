import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  type CityAgentChangeType,
  type CityAgentDecisionClass,
  type CityAgentQualityScore,
  type CityAgentSourceRow,
} from "./contracts"
import { duplicateRiskForProposal, qualityDetails, scoreProposalQuality } from "./quality"
import {
  loadCitySeoDirectory,
  resolveCitySeoOpportunity,
} from "./seo-url-resolver"

type Row = Record<string, unknown>
type AdminClient = ReturnType<typeof createAdminClient>

function text(value: unknown) {
  return typeof value === "string" ? value : null
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function sourceFromRow(row: Row): CityAgentSourceRow {
  return {
    id: text(row.id) ?? "",
    city_id: text(row.city_id) ?? "",
    slug: text(row.slug) ?? "",
    url: text(row.url) ?? "",
    source_type: (text(row.source_type) ?? "official") as CityAgentSourceRow["source_type"],
    owner_name: text(row.owner_name),
    trust_level: (text(row.trust_level) ?? "community") as CityAgentSourceRow["trust_level"],
    cadence: (text(row.cadence) ?? "daily") as CityAgentSourceRow["cadence"],
    next_check_at: text(row.next_check_at),
    parser_config: object(row.parser_config),
    content_scope: object(row.content_scope),
    active: row.active !== false,
    enabled: row.enabled !== false,
    trust_tier: (text(row.trust_tier) ?? "D") as CityAgentSourceRow["trust_tier"],
    health: text(row.health) as CityAgentSourceRow["health"],
    last_success_at: text(row.last_success_at),
    last_status: text(row.last_status),
  }
}

function isInitialBaseline(proposal: Row, snapshot: Row | undefined) {
  if (text(snapshot?.change_type) === "INITIAL_BASELINE") return true
  const diff = object(proposal.field_diff)
  return diff.baseline === true
}

function proposalTitle(proposal: Row) {
  const payload = object(proposal.proposed_payload)
  return typeof payload.title === "string" ? payload.title : text(proposal.content_type) ?? "Unbenannter Vorschlag"
}

function classifyProposal(input: {
  initial: boolean
  contentId: string | null
  canonicalizationResolved: boolean
  duplicateRisk: number
  qualityDecision: CityAgentDecisionClass
  source: CityAgentSourceRow | null
  sourceUrlDuplicate: boolean
  operation: string
}) {
  if (input.contentId) return "ALREADY_IN_SYSTEM" as const
  if (input.initial) return "INITIAL_BASELINE_NOISE" as const
  if (input.canonicalizationResolved) return "RESOLVED_BY_CANONICALIZATION" as const
  if (input.sourceUrlDuplicate || input.duplicateRisk >= 0.82) return "DUPLICATE" as const
  if (!input.source || input.source.health === "FAILED") return "FALSE_POSITIVE" as const
  if (input.qualityDecision === "CONFLICTING") return "CONFLICTING" as const
  if (input.operation === "expire" && input.source.health !== "HEALTHY") return "OUTDATED" as const
  return input.qualityDecision
}

function seoDecisionFor(decisionClass: CityAgentDecisionClass, existingUrl: string | null) {
  if (["DUPLICATE", "FALSE_POSITIVE", "INITIAL_BASELINE_NOISE", "RESOLVED_BY_CANONICALIZATION"].includes(decisionClass)) return "REJECT" as const
  if (decisionClass === "ALREADY_IN_SYSTEM" || existingUrl) return "IMPROVE_EXISTING" as const
  if (decisionClass === "VALID_ACTIONABLE") return "PURSUE_NOW" as const
  return "WATCH" as const
}

export type CityAgentProposalAuditSummary = {
  total: number
  classCounts: Record<string, number>
  seoCounts: Record<string, number>
  superseded: number
  noiseCount: number
  falsePositiveRate: number
  topTen: Array<{ id: string; title: string; priority: number; decision: string; targetUrl: string | null; reason: string }>
}

export async function auditCityAgentProposals(options: { cityId?: string; now?: Date; admin?: AdminClient } = {}): Promise<CityAgentProposalAuditSummary> {
  const admin = options.admin ?? createAdminClient()
  const now = options.now ?? new Date()
  let cityId = options.cityId
  if (!cityId) {
    const city = await admin.from("cities").select("id").order("created_at", { ascending: true }).limit(1)
    cityId = text(rows(city.data)[0]?.id) ?? undefined
  }
  if (!cityId) throw new Error("Keine City konnte für den Proposal-Audit aufgelöst werden.")

  const [proposalsResult, sourcesResult] = await Promise.all([
    admin.from("city_agent_proposals").select("id,city_id,run_id,source_id,snapshot_id,content_type,content_id,operation,status,risk_level,confidence,field_diff,proposed_payload,evidence,created_at").eq("city_id", cityId).order("created_at", { ascending: true }).limit(1000),
    admin.from("city_agent_sources").select("id,city_id,slug,url,source_type,owner_name,trust_level,cadence,next_check_at,parser_config,content_scope,active,enabled,health,trust_tier,last_success_at,last_status").eq("city_id", cityId).limit(1000),
  ])
  if (proposalsResult.error) throw new Error(`Proposal-Audit konnte Vorschläge nicht laden: ${proposalsResult.error.message}`)
  if (sourcesResult.error) throw new Error(`Proposal-Audit konnte Quellen nicht laden: ${sourcesResult.error.message}`)

  const sources = new Map(rows(sourcesResult.data).map((row) => [text(row.id) ?? "", sourceFromRow(row)]))
  // Only the live review queue is mutable input for this audit. Historical
  // superseded/rejected/approved proposals are evidence, not fresh work, and
  // must never be reclassified or used to create duplicate pressure for the
  // current queue.
  const proposalRows = rows(proposalsResult.data).filter((row) =>
    ["needs_human", "agent_draft"].includes(text(row.status) ?? ""),
  )
  const seoDirectory = await loadCitySeoDirectory(admin, cityId)
  const snapshotIds = proposalRows.map((row) => text(row.snapshot_id)).filter((value): value is string => Boolean(value))
  const snapshotsResult = snapshotIds.length > 0
    ? await admin.from("city_agent_source_snapshots").select("id,source_id,change_type,extracted_payload").in("id", snapshotIds).limit(1000)
    : { data: [], error: null }
  const snapshots = new Map(rows(snapshotsResult.data).map((row) => [text(row.id) ?? "", row]))
  const seenTitles: string[] = []
  const seenTitleSources: string[] = []
  const seenSourceUrls = new Map<string, string>()
  const seenSeoEntityKeys = new Set<string>()
  const classCounts: Record<string, number> = {}
  const seoCounts: Record<string, number> = {}
  const scored: CityAgentProposalAuditSummary["topTen"] = []
  let superseded = 0
  let noiseCount = 0

  for (const proposal of proposalRows) {
    const id = text(proposal.id) ?? ""
    const source = sources.get(text(proposal.source_id) ?? "") ?? null
    const payload = object(proposal.proposed_payload)
    const fieldDiff = object(proposal.field_diff)
    const title = proposalTitle(proposal)
    const normalizedTitle = title.trim().toLocaleLowerCase("de-DE")
    const sourceUrl = source?.url ?? text(payload.sourceUrl)
    const sourceId = text(proposal.source_id) ?? ""
    const sourceUrlDuplicate = Boolean(sourceUrl && seenSourceUrls.has(sourceUrl) && seenSourceUrls.get(sourceUrl) !== sourceId)
    const duplicateCandidates = seenTitles.filter((_, index) => seenTitleSources[index] !== sourceId)
    const duplicateRisk = duplicateRiskForProposal({ title, sourceUrl, seenTitles: duplicateCandidates })
    const initial = isInitialBaseline(proposal, snapshots.get(text(proposal.snapshot_id) ?? ""))
    const snapshotChangeType = text(snapshots.get(text(proposal.snapshot_id) ?? "")?.change_type)
    const changeType = (initial
      ? "INITIAL_BASELINE"
      : snapshotChangeType && [
        "NO_CHANGE", "SEMANTIC_CHANGE", "METADATA_ONLY_CHANGE", "UNCHANGED", "CONTENT_CHANGED", "ENTITY_NEW", "ENTITY_REMOVED", "SOURCE_RECOVERED", "SOURCE_FAILED",
      ].includes(snapshotChangeType)
        ? snapshotChangeType
        : "SEMANTIC_CHANGE") as CityAgentChangeType
    const canonicalizationResolved = Object.keys(fieldDiff).length === 0
      || Object.keys(fieldDiff).every((key) => key === "contentHash")
    const seoResolution = resolveCitySeoOpportunity({
      directory: seoDirectory,
      contentType: text(proposal.content_type),
      contentId: text(proposal.content_id),
      title,
      sourceSlug: source?.slug ?? "",
      sourceTrustTier: source?.trust_tier,
      existingEntityKeys: seenSeoEntityKeys,
    })
    const resolvedExistingUrl = ["IMPROVE_EXISTING", "MERGE_DUPLICATE"].includes(seoResolution.action)
      ? seoResolution.canonicalUrl
      : null
    const baseScore = scoreProposalQuality({
      source: source ?? {
        url: sourceUrl ?? "",
        slug: "unknown",
        trust_level: "community",
        trust_tier: "D",
        content_scope: {},
        parser_config: {},
      },
      operation: text(proposal.operation) ?? "verify",
      contentType: text(proposal.content_type) ?? "city_guide",
      changeType,
      fieldDiff,
      proposedPayload: payload,
      evidenceCount: array(proposal.evidence).length,
      existingUrl: resolvedExistingUrl ?? text(payload.targetUrl) ?? (text(proposal.content_id) || text(proposal.operation) === "update" || text(proposal.operation) === "verify" ? sourceUrl : null),
      duplicateRisk: Math.max(duplicateRisk, sourceUrlDuplicate ? 0.95 : 0),
      now,
    })
    const baseDecisionClass = classifyProposal({
      initial,
      // A resolver match is not itself a reason to hide an SEO improvement
      // behind ALREADY_IN_SYSTEM. The proposal still needs editorial review;
      // content_id is persisted as the canonical target below.
      contentId: text(proposal.content_id),
      canonicalizationResolved,
      duplicateRisk,
      qualityDecision: baseScore.decisionClass,
      source,
      sourceUrlDuplicate,
      operation: text(proposal.operation) ?? "verify",
    })
    const decisionClass = seoResolution.action === "MERGE_DUPLICATE"
      ? "DUPLICATE" as const
      : baseDecisionClass
    const existingUrl = baseScore.existingUrl
    const lowValueWatch = decisionClass === "VALID_LOW_VALUE" && (!baseScore.queryIntent || baseScore.priority < 60)
    const seoDecision: CityAgentQualityScore["seoDecision"] = lowValueWatch
      ? "WATCH"
      : seoResolution.action === "MERGE_DUPLICATE"
        ? "REJECT"
        : seoResolution.action === "CREATE_NEW"
          ? "CREATE_NEW"
          : seoResolution.action === "HUMAN_REVIEW"
            ? "PURSUE_NOW"
            : seoDecisionFor(decisionClass, existingUrl)
    const score = { ...baseScore, decisionClass, seoDecision, targetUrl: seoResolution.canonicalUrl ?? existingUrl }
    const canonicalContentId = seoResolution.entityType === "hub" ? null : seoResolution.entityId
    const noActionReason = lowValueWatch
      ? "WATCH – lokaler oder zeitlicher Nutzwert ist zu niedrig bzw. es fehlt ein belastbarer Suchintent; nicht als aktive Review-Aufgabe priorisieren."
      : seoResolution.action === "MERGE_DUPLICATE"
        ? `MERGE_DUPLICATE – auf die bestehende kanonische Entity ${seoResolution.canonicalUrl ?? ""} zusammenführen; keine zweite öffentliche Seite erzeugen.`
        : ["DUPLICATE", "INITIAL_BASELINE_NOISE", "FALSE_POSITIVE", "ALREADY_IN_SYSTEM", "RESOLVED_BY_CANONICALIZATION"].includes(decisionClass)
          ? decisionClass === "INITIAL_BASELINE_NOISE"
            ? "Erstbeobachtung ohne nachgewiesene neue Information gegenüber dem bestehenden City-Katalog."
            : `${decisionClass} – keine neue automatische Review-Aufgabe erzeugen.`
          : null
    const currentStatus = text(proposal.status) ?? "needs_human"
    const nextStatus = noActionReason && ["needs_human", "agent_draft"].includes(currentStatus)
      ? "superseded"
      : !noActionReason && currentStatus === "superseded"
        ? "needs_human"
        : undefined
    const update = await admin.from("city_agent_proposals").update({
      decision_class: decisionClass,
      seo_decision: seoDecision,
      relevance_score: score.relevance,
      evidence_score: score.evidence,
      actionability_score: score.actionability,
      source_quality_score: score.sourceQuality,
      duplicate_risk_score: score.duplicateRisk,
      quality_score: score.score,
      priority_score: score.priority,
      no_action_reason: noActionReason,
      status: nextStatus ?? currentStatus,
      ...(canonicalContentId && !text(proposal.content_id) ? { content_id: canonicalContentId } : {}),
      proposed_payload: {
        ...payload,
        targetUrl: seoResolution.canonicalUrl ?? payload.targetUrl ?? null,
        seoResolution,
        quality: qualityDetails(score),
      },
      updated_at: now.toISOString(),
    }).eq("id", id)
    if (update.error) throw new Error(`Proposal ${id} konnte nicht klassifiziert werden: ${update.error.message}`)

    await admin.from("city_agent_run_audit").insert({
      run_id: text(proposal.run_id),
      action: "review_linked",
      actor_type: "system",
      actor_profile: "city-agent-quality-audit",
      details: {
        proposalId: id,
        decisionClass,
        seoDecision,
        quality: qualityDetails(score),
        seoResolution,
        noActionReason,
        protected_action_executed: false,
      },
    })

    classCounts[decisionClass] = (classCounts[decisionClass] ?? 0) + 1
    seoCounts[seoDecision] = (seoCounts[seoDecision] ?? 0) + 1
    if (noActionReason) noiseCount += 1
    if (nextStatus === "superseded") superseded += 1
    if (normalizedTitle) {
      seenTitles.push(normalizedTitle)
      seenTitleSources.push(sourceId)
    }
    if (sourceUrl) seenSourceUrls.set(sourceUrl, sourceId)
    if (seoResolution.entityType === "hub" && seoResolution.entityId) {
      seenSeoEntityKeys.add(`hub:${seoResolution.entityId}`)
    } else if (canonicalContentId) {
      seenSeoEntityKeys.add(`${seoResolution.entityType}:${canonicalContentId}`)
    }
    scored.push({ id, title, priority: score.priority, decision: seoDecision, targetUrl: score.targetUrl, reason: noActionReason ?? score.proposedAction ?? "Review nach Qualitätswert priorisieren." })
  }

  // The top-ten report is an SEO/review opportunity list, not a list of
  // baseline noise. Keep all classifications in the audit counts, but only
  // expose non-rejected proposals as actionable opportunities.
  const ranked = scored
    .filter((item) => item.decision !== "REJECT")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10)
  return {
    total: scored.length,
    classCounts,
    seoCounts,
    superseded,
    noiseCount,
    falsePositiveRate: scored.length ? noiseCount / scored.length : 0,
    topTen: ranked,
  }
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []
}
