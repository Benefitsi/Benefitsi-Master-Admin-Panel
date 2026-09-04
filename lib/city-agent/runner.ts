import "server-only"

import {
  confidenceForTrustTier,
  isCityAgentModuleKey,
  isCityAgentOperatingMode,
  riskForTrustTier,
  trustTierForSource,
  type CityAgentChangeType,
  type CityAgentRunSummary,
  type CityAgentSourceFacts,
  type CityAgentSourceRow,
} from "./contracts"
import { sourceFindings } from "./findings"
import { sourceQaIssues } from "./qa"
import { sourceBelongsToModule } from "./modules"
import { scoreProposalQuality, qualityDetails } from "./quality"
import { auditCityFreshness, type CityAgentFreshnessAudit } from "./freshness-audit"
import { auditCityBusinesses, type CityBusinessAudit } from "./business-audit"
import { auditCityEventSeo, type CityAgentEventSeoAudit } from "./event-seo-audit"
import {
  loadCitySeoDirectory,
  resolveCitySeoOpportunity,
  type CitySeoResolution,
} from "./seo-url-resolver"
import {
  createSourceResearchProvider,
  diffSourceFacts,
  nextSourceCheckAt,
  reviewCityAgentProposalsThroughHermes,
  sourceContentType,
} from "./sources"
import { createSourceFetchMetrics } from "./source-metrics"
import { buildEditorialDraft, editorialDraftKey, evaluateEditorialDraft, type EditorialDraftInput } from "./editorial-automation"
import { createAdminClient } from "@/lib/supabase/admin"

type SupabaseClient = ReturnType<typeof createAdminClient>

type RunnerOptions = {
  cityId?: string
  agentProfile?: string
  maxSources?: number
  dryRun?: boolean
  now?: Date
  supabase?: SupabaseClient
  fetchImpl?: typeof fetch
  baseline?: boolean
  moduleKey?: string
}

type AutomationJob = {
  id: string
  city_id: string | null
  agent_profile: string | null
  human_gate: string
  input: Record<string, unknown>
}

type SnapshotRow = {
  id: string
  content_hash: string
  extracted_payload: Partial<CityAgentSourceFacts>
  final_url?: string | null
  http_status?: number | null
  content_type?: string | null
  extraction_method?: string | null
  page_count?: number | null
  canonicalization_version?: string | null
}

const MAX_SOURCES = 20
const MAX_BASELINE_SOURCES = 50

function sourceChangeType(input: { previous: SnapshotRow | null; source: CityAgentSourceRow; current: CityAgentSourceFacts }): CityAgentChangeType {
  const recovered = input.source.health !== "HEALTHY" || input.source.last_status === "error"
  if (!input.previous) return "INITIAL_BASELINE"
  const semanticDiff = diffSourceFacts(input.previous.extracted_payload ?? null, input.current)
  const metadataChanged = [
    [input.previous.final_url, input.current.finalUrl],
    [input.previous.http_status, input.current.httpStatus],
    [input.previous.content_type, input.current.contentType],
    [input.previous.extraction_method, input.current.extractionMethod ?? "html"],
    [input.previous.page_count, input.current.pageCount ?? null],
  ].some(([before, after]) => before !== undefined && before !== null && JSON.stringify(before) !== JSON.stringify(after))
  if (input.previous.content_hash === input.current.contentHash || Object.keys(semanticDiff).length === 0) {
    if (recovered) return "SOURCE_RECOVERED"
    return metadataChanged ? "METADATA_ONLY_CHANGE" : "NO_CHANGE"
  }
  return "SEMANTIC_CHANGE"
}

async function sourceHasExistingEntity(supabase: SupabaseClient, cityId: string, source: CityAgentSourceRow) {
  const contentType = typeof source.parser_config.contentType === "string" ? source.parser_config.contentType : "city_guide"
  const table = contentType === "city_event"
    ? "city_events"
    : contentType === "city_route"
      ? "city_routes"
      : contentType === "city_place" || contentType === "city_playground"
        ? "city_places"
        : null
  if (!table) return false
  const result = await supabase
    .from(table)
    .select("id")
    .eq("city_id", cityId)
    .eq("source_url", source.url)
    .limit(1)
    .maybeSingle()
  return !result.error && Boolean(result.data)
}

function boundedSources(value: number | undefined, maximum = MAX_SOURCES) {
  return Math.max(1, Math.min(Math.trunc(value ?? 10), maximum))
}

function safeText(value: unknown, maxLength = 2_000) {
  return typeof value === "string" ? value.slice(0, maxLength) : ""
}

function safeObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function runTrigger(options: RunnerOptions, jobInput: Record<string, unknown>) {
  if (options.dryRun !== false) return "dry_run"

  const scheduled = jobInput.scheduled === true
    || typeof jobInput.schedulerJobId === "string"
    || typeof jobInput.schedulerRunId === "string"

  return scheduled ? "scheduled" : "manual"
}

async function updateSchedulerJobLink(
  supabase: SupabaseClient,
  jobInput: Record<string, unknown>,
  workerJobId: string,
  patch: Record<string, unknown>,
) {
  const schedulerJobId = typeof jobInput.schedulerJobId === "string" ? jobInput.schedulerJobId : null
  const query = supabase
    .from("city_agent_scheduler_job_links")
    .update({ ...patch, updated_at: new Date().toISOString() })
  const result = schedulerJobId
    ? await query.eq("scheduler_job_id", schedulerJobId)
    : await query.eq("worker_job_id", workerJobId)
  if (result.error) throw new Error(`Scheduler-Agent-Verknüpfung konnte nicht aktualisiert werden: ${result.error.message}`)
}

function schedulerResult(status: "succeeded" | "partial" | "failed") {
  return status === "succeeded" ? "SUCCESS" : status === "partial" ? "PARTIAL" : "FAILED"
}

function findingRow(finding: ReturnType<typeof sourceFindings>[number]) {
  return {
    city_id: finding.cityId,
    run_id: finding.runId ?? null,
    source_id: finding.sourceId ?? null,
    module_key: finding.moduleKey,
    finding_type: finding.findingType,
    title: finding.title,
    summary: finding.summary,
    action_type: finding.actionType ?? null,
    confidence: finding.confidence,
    risk_level: finding.riskLevel,
    evidence: finding.evidence ?? [],
    details: finding.details ?? {},
    deduplication_key: finding.deduplicationKey,
    change_type: finding.changeType ?? null,
    attention_required: finding.attentionRequired ?? true,
    priority_score: finding.priorityScore ?? 0,
    decision_class: finding.decisionClass ?? null,
    target_url: finding.targetUrl ?? null,
  }
}

function businessSummary(audit: CityBusinessAudit | null) {
  if (!audit) return null
  return {
    checked: audit.checked,
    current: audit.current,
    due: audit.due,
    stale: audit.stale,
    unknown: audit.unknown,
    inCity: audit.scopeCounts.IN_CITY,
    nearby: audit.scopeCounts.NEARBY,
    regional: audit.scopeCounts.REGIONAL,
    unknownScope: audit.scopeCounts.UNKNOWN,
    dataGaps: audit.dataGaps.length,
  }
}

async function addAudit(
  supabase: SupabaseClient,
  runId: string,
  action: string,
  details: Record<string, unknown>,
  actorProfile: string,
) {
  await supabase.from("city_agent_run_audit").insert({
    run_id: runId,
    action,
    actor_type: "agent",
    actor_profile: actorProfile,
    details: safeObject(details),
  })
}

async function completeJob(
  supabase: SupabaseClient,
  jobId: string,
  agentProfile: string,
  result: Record<string, unknown>,
  recommendedAction: string | null,
) {
  const response = await supabase.rpc("complete_automation_job", {
    p_job_id: jobId,
    p_agent_profile: agentProfile,
    p_result: result,
    p_recommended_action: recommendedAction,
  })
  if (response.error) throw new Error(`Automation-Job konnte nicht abgeschlossen werden: ${response.error.message}`)
}

async function failJob(
  supabase: SupabaseClient,
  jobId: string,
  agentProfile: string,
  errorCode: string,
) {
  await supabase.rpc("fail_automation_job", {
    p_job_id: jobId,
    p_agent_profile: agentProfile,
    p_error_code: errorCode.slice(0, 160),
  })
}

function proposalPayload(facts: CityAgentSourceFacts): Record<string, unknown> {
  return {
    title: facts.title,
    headings: facts.headings,
    textPreview: facts.textPreview,
    dateMentions: facts.dateMentions,
    sourceUrl: facts.finalUrl,
    retrievedAt: facts.retrievedAt,
    drafts: facts.drafts ?? [],
    issues: facts.issues ?? [],
  }
}

export async function runNextCityAgentJob(options: RunnerOptions = {}): Promise<CityAgentRunSummary> {
  const supabase = options.supabase ?? createAdminClient()
  const now = options.now ?? new Date()
  const agentProfile = safeText(options.agentProfile ?? process.env.CITY_AGENT_PROFILE ?? "ben", 64).toLowerCase()
  const claimResult = await supabase.rpc("claim_automation_job", {
    p_agent_profile: agentProfile,
    p_supported_types: ["city_scan", "source_verification"],
    p_city_id: options.cityId ?? null,
    p_lease_minutes: 15,
  })

  if (claimResult.error) throw new Error(`City-Agent-Job konnte nicht geclaimt werden: ${claimResult.error.message}`)
  const job = (Array.isArray(claimResult.data) ? claimResult.data[0] : null) as AutomationJob | null
  if (!job) {
    return {
      claimed: false,
      provider: "none",
      sourceCount: 0,
      snapshotCount: 0,
      proposalCount: 0,
      autoPublishedCount: 0,
      staleCount: 0,
      errorCount: 0,
      status: "idle",
      errors: [],
    }
  }

  const claimedJobInput = safeObject(job.input)
  const cityId = job.city_id
  if (!cityId) {
    await updateSchedulerJobLink(supabase, claimedJobInput, job.id, { finished_at: new Date().toISOString(), result: "FAILED", error_summary: "Job enthält keine Stadt." })
    await failJob(supabase, job.id, agentProfile, "city_missing")
    return {
      claimed: true,
      jobId: job.id,
      provider: "none",
      sourceCount: 0,
      snapshotCount: 0,
      proposalCount: 0,
      autoPublishedCount: 0,
      staleCount: 0,
      errorCount: 1,
      status: "failed",
      errors: ["Job enthält keine Stadt."],
    }
  }

  const cityResult = await supabase.from("cities").select("id,slug,name").eq("id", cityId).maybeSingle()
  if (cityResult.error || !cityResult.data) {
    await updateSchedulerJobLink(supabase, claimedJobInput, job.id, { finished_at: new Date().toISOString(), result: "FAILED", error_summary: "Stadt konnte nicht geladen werden." })
    await failJob(supabase, job.id, agentProfile, "city_not_found")
    return {
      claimed: true,
      jobId: job.id,
      cityId,
      provider: "none",
      sourceCount: 0,
      snapshotCount: 0,
      proposalCount: 0,
      autoPublishedCount: 0,
      staleCount: 0,
      errorCount: 1,
      status: "failed",
      errors: ["Stadt konnte nicht geladen werden."],
    }
  }

  const citySlug = safeText(cityResult.data.slug, 120)
  let seoDirectoryPromise: ReturnType<typeof loadCitySeoDirectory> | null = null
  const seenSeoEntityKeys = new Set<string>()
  const getSeoDirectory = () => {
    seoDirectoryPromise ??= loadCitySeoDirectory(supabase, cityId)
    return seoDirectoryPromise
  }
  const controlResult = await supabase
    .from("city_agent_city_controls")
    .select("city_id,city_profile,operating_mode,timezone,auto_publish_enabled,last_full_check_at,next_full_check_at,paused_reason")
    .eq("city_id", cityId)
    .maybeSingle()
  if (controlResult.error) {
    await updateSchedulerJobLink(supabase, claimedJobInput, job.id, { finished_at: new Date().toISOString(), result: "FAILED", error_summary: controlResult.error.message })
    await failJob(supabase, job.id, agentProfile, "city_agent_control_load_failed")
    throw new Error(`City-Agent-Control konnte nicht geladen werden: ${controlResult.error.message}`)
  }
  if (!controlResult.data) {
    await updateSchedulerJobLink(supabase, claimedJobInput, job.id, { finished_at: new Date().toISOString(), result: "FAILED", error_summary: "Für diese Stadt ist kein City-Agent-Control hinterlegt." })
    await failJob(supabase, job.id, agentProfile, "city_agent_control_missing")
    return {
      claimed: true,
      jobId: job.id,
      cityId,
      citySlug,
      provider: "none",
      sourceCount: 0,
      snapshotCount: 0,
      proposalCount: 0,
      autoPublishedCount: 0,
      staleCount: 0,
      errorCount: 1,
      status: "failed",
      errors: ["Für diese Stadt ist kein City-Agent-Control hinterlegt."],
    }
  }

  const jobInput = claimedJobInput
  const moduleKey = isCityAgentModuleKey(options.moduleKey)
    ? options.moduleKey
    : isCityAgentModuleKey(jobInput.moduleKey)
      ? jobInput.moduleKey
      : undefined
  const operatingMode = isCityAgentOperatingMode(controlResult.data.operating_mode)
    ? controlResult.data.operating_mode
    : "DISABLED"
  const isShadow = operatingMode === "SHADOW" || options.dryRun !== false
  const baselineRequested = options.baseline === true || jobInput.baseline === true || moduleKey === "full_city_audit"
  const sourceLimit = boundedSources(options.maxSources, baselineRequested ? MAX_BASELINE_SOURCES : MAX_SOURCES)
  await updateSchedulerJobLink(supabase, jobInput, job.id, {
    worker_job_id: job.id,
    agent_type: moduleKey ?? (typeof jobInput.moduleKey === "string" ? jobInput.moduleKey : job.agent_profile ?? "city_scan"),
  })
  if (operatingMode === "DISABLED") {
    await updateSchedulerJobLink(supabase, jobInput, job.id, { finished_at: new Date().toISOString(), result: "FAILED", error_summary: "City-Agent ist für diese Stadt deaktiviert." })
    await failJob(supabase, job.id, agentProfile, "city_agent_disabled")
    return {
      claimed: true,
      jobId: job.id,
      cityId,
      citySlug,
      provider: "none",
      sourceCount: 0,
      snapshotCount: 0,
      proposalCount: 0,
      autoPublishedCount: 0,
      staleCount: 0,
      errorCount: 1,
      status: "failed",
      errors: ["City-Agent ist für diese Stadt deaktiviert."],
      operatingMode,
      moduleKey,
      shadow: true,
    }
  }

  const profileId = `city-${citySlug}`
  const idempotencyKey = `city-agent:${job.id}`
  const runInsert = await supabase
    .from("city_agent_runs")
    .upsert(
      {
        city_id: cityId,
        job_id: job.id,
        profile_id: profileId,
        orchestrator_profile: agentProfile,
        trigger: runTrigger(options, jobInput),
        status: "running",
        dry_run: isShadow,
        idempotency_key: idempotencyKey,
        started_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "city_id,idempotency_key" },
    )
    .select("id")
    .single()
  if (runInsert.error || !runInsert.data) {
    await failJob(supabase, job.id, agentProfile, "run_persist_failed")
    throw new Error(`City-Agent-Run konnte nicht gespeichert werden: ${runInsert.error?.message ?? "unbekannt"}`)
  }

  const runId = runInsert.data.id as string
  await updateSchedulerJobLink(supabase, jobInput, job.id, { agent_run_id: runId, started_at: now.toISOString() })
  await addAudit(supabase, runId, "created", { jobId: job.id, citySlug, dryRun: isShadow, operatingMode, moduleKey: moduleKey ?? null }, agentProfile)
  await addAudit(supabase, runId, "started", { maxSources: sourceLimit, operatingMode, moduleKey: moduleKey ?? null, baseline: baselineRequested }, agentProfile)
  if (isShadow) {
    await addAudit(supabase, runId, "shadow_gate", {
      decision: "research_and_propose_only",
      protected_action_executed: false,
      reason: operatingMode === "SHADOW" ? "city_control_shadow_mode" : "dry_run",
    }, agentProfile)
  }

  let baselineId: string | undefined
  if (baselineRequested) {
    const baselineInsert = await supabase.from("city_agent_baselines").insert({
      city_id: cityId,
      run_id: runId,
      operating_mode: operatingMode,
      status: "running",
      summary: { citySlug, moduleKey: moduleKey ?? null, shadow: isShadow },
    }).select("id").single()
    if (baselineInsert.error) throw new Error(`Shadow-Baseline konnte nicht angelegt werden: ${baselineInsert.error.message}`)
    baselineId = baselineInsert.data.id as string
    await addAudit(supabase, runId, "baseline_started", { baselineId, protected_action_executed: false }, agentProfile)
  }

  const sourcesResult = await supabase
    .from("city_agent_sources")
    .select("id,city_id,slug,url,source_type,owner_name,trust_level,cadence,next_check_at,parser_config,content_scope,active,enabled,crawl_method,failure_count,health,notes,trust_tier,last_success_at,last_change_at,last_status,last_checked_at,last_failure_at,last_recovered_at,next_retry_at,retry_count,last_failure_category,primary_source")
    .eq("city_id", cityId)
    .eq("active", true)
    .eq("enabled", true)
    .order("next_check_at", { ascending: true, nullsFirst: true })
    .limit(sourceLimit * 2)
  if (sourcesResult.error) {
    await supabase.from("city_agent_runs").update({ status: "failed", error_code: "sources_load_failed", error_summary: sourcesResult.error.message, finished_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", runId)
    await updateSchedulerJobLink(supabase, jobInput, job.id, { finished_at: new Date().toISOString(), result: "FAILED", error_summary: sourcesResult.error.message })
    await failJob(supabase, job.id, agentProfile, "sources_load_failed")
    throw new Error(`City-Agent-Quellen konnten nicht geladen werden: ${sourcesResult.error.message}`)
  }

  const dueSources = moduleKey === "event_seo"
    ? []
    : ((sourcesResult.data ?? []) as CityAgentSourceRow[])
      .filter((source) => baselineRequested || !source.next_check_at || new Date(source.next_check_at).getTime() <= now.getTime())
      .filter((source) => !moduleKey || jobInput.baseline === true || baselineRequested || sourceBelongsToModule(source, moduleKey))
      .slice(0, sourceLimit)
  const provider = createSourceResearchProvider({
    now,
    fetchImpl: options.fetchImpl,
    citySlug,
    cityProfile: profileId,
    orchestratorProfile: agentProfile,
    timeoutMs: baselineRequested ? 4_000 : undefined,
    hermesTimeoutMs: baselineRequested ? 5_000 : undefined,
    forceDirect: baselineRequested,
  })
  const errors: string[] = []
  const sourceWarnings: string[] = []
  let snapshotCount = 0
  let proposalCount = 0
  const autoPublishedCount = 0
  let findingCount = 0
  let staleCount = 0
  let freshnessAudit: CityAgentFreshnessAudit | null = null
  let eventSeoAudit: CityAgentEventSeoAudit | null = null
  let businessAudit: CityBusinessAudit | null = null
  const reviewCandidates: Array<Record<string, unknown>> = []
  const baselineFindings: Array<{ findingType: string }> = []
  const changeCounts: Record<string, number> = {}
  let sourceFetchAttempts = 0
  let sourceFetchSuccesses = 0
  let sourceFetchFailures = 0
  const editorialDraftCandidates: EditorialDraftInput[] = []
  const editorialDraftCandidateKeys = new Set<string>()
  let editorialDraftCreatedCount = 0
  let editorialDraftUpdatedCount = 0
  let editorialDraftSkippedCount = 0

  for (const source of dueSources) {
    sourceFetchAttempts += 1
    let sourceFetchSucceeded = false
    const previousResult = await supabase
      .from("city_agent_source_snapshots")
      .select("id,content_hash,extracted_payload,final_url,http_status,content_type,extraction_method,page_count,canonicalization_version")
      .eq("source_id", source.id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const previous = (previousResult.data ?? null) as SnapshotRow | null

    try {
      const facts = await provider.fetchSource(source)
      sourceFetchSuccesses += 1
      sourceFetchSucceeded = true
      const snapshotInsert = await supabase
        .from("city_agent_source_snapshots")
        .upsert(
          {
            run_id: runId,
            source_id: source.id,
            fetched_at: facts.retrievedAt,
            final_url: facts.finalUrl,
            http_status: facts.httpStatus,
            content_type: facts.contentType,
            content_hash: facts.contentHash,
            title: facts.title,
            extracted_payload: {
              title: facts.title,
              headings: facts.headings,
              textPreview: facts.textPreview,
              dateMentions: facts.dateMentions,
              extractionMethod: facts.extractionMethod ?? "html",
              pageCount: facts.pageCount ?? null,
              provenance: facts.provenance ?? [],
            },
            changed_from_snapshot_id: previous?.id ?? null,
            canonicalization_version: "v2",
            change_type: sourceChangeType({ previous, source, current: facts }),
            change_summary: previous
              ? sourceChangeType({ previous, source, current: facts }) === "METADATA_ONLY_CHANGE"
                ? "Nur technische Quellenmetadaten geändert"
                : ["NO_CHANGE", "SOURCE_RECOVERED"].includes(sourceChangeType({ previous, source, current: facts }))
                  ? "Keine semantische Inhaltsänderung"
                  : "Semantisch relevante Quellenänderung"
              : "Erster Quellenbaseline ohne automatische Proposal-Erzeugung",
          },
          { onConflict: "source_id,content_hash", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle()
      const snapshot = snapshotInsert.data ?? (await supabase.from("city_agent_source_snapshots").select("id").eq("source_id", source.id).eq("content_hash", facts.contentHash).maybeSingle()).data
      if (snapshot?.id) {
        snapshotCount += 1
        // Keep the deduplicated snapshot's latest extraction provenance in
        // sync. A repeated fetch of unchanged content must not leave a
        // previously failed/empty PDF extraction recorded as the current
        // evidence.
        if (!snapshotInsert.data?.id) {
          const snapshotRefresh = await supabase.from("city_agent_source_snapshots").update({
            run_id: runId,
            fetched_at: facts.retrievedAt,
            final_url: facts.finalUrl,
            http_status: facts.httpStatus,
            content_type: facts.contentType,
            title: facts.title,
            extracted_payload: {
              title: facts.title,
              headings: facts.headings,
              textPreview: facts.textPreview,
              dateMentions: facts.dateMentions,
              extractionMethod: facts.extractionMethod ?? "html",
              pageCount: facts.pageCount ?? null,
              provenance: facts.provenance ?? [],
            },
            extraction_method: facts.extractionMethod ?? "html",
            page_count: facts.pageCount ?? null,
            provenance: facts.provenance ?? [],
            canonicalization_version: "v2",
          }).eq("id", snapshot.id)
          if (snapshotRefresh.error) throw new Error(`Snapshot-Provenienz konnte nicht aktualisiert werden: ${snapshotRefresh.error.message}`)
        }
      }

      const changeType = sourceChangeType({ previous, source, current: facts })
      const changed = changeType === "SEMANTIC_CHANGE" || changeType === "CONTENT_CHANGED"
      changeCounts[changeType] = (changeCounts[changeType] ?? 0) + 1
      const sourceUpdate: Record<string, unknown> = {
        last_checked_at: facts.retrievedAt,
        last_status: changed ? "changed" : "healthy",
        next_check_at: nextSourceCheckAt(source, now),
        updated_at: facts.retrievedAt,
        enabled: true,
        health: "HEALTHY",
        failure_count: 0,
        last_success_at: facts.retrievedAt,
      }
      if (changed) sourceUpdate.last_change_at = facts.retrievedAt
      if (changeType === "SOURCE_RECOVERED") sourceUpdate.last_recovered_at = facts.retrievedAt
      await supabase.from("city_agent_sources").update(sourceUpdate).eq("id", source.id)
      await addAudit(supabase, runId, "source_checked", { sourceId: source.id, changed, changeType, contentHash: facts.contentHash, extractionMethod: facts.extractionMethod ?? "html", pageCount: facts.pageCount ?? null }, agentProfile)

      const meaningfulBaseline = changeType === "INITIAL_BASELINE"
        ? Boolean(source.parser_config.baselineProposalAllowed && !(await sourceHasExistingEntity(supabase, cityId, source)))
        : false
      const findings = sourceFindings({ cityId, runId, source, facts, changed, changeType, meaningfulBaseline, snapshotId: snapshot?.id })
      const qaFindings = sourceQaIssues({
        url: facts.finalUrl,
        httpStatus: facts.httpStatus,
        contentType: facts.contentType,
        truncated: facts.truncated,
        lastVerifiedAt: source.last_success_at,
      }).map((issue) => ({
        cityId,
        runId,
        sourceId: source.id,
        moduleKey: "qa" as const,
        findingType: "QA_ISSUE" as const,
        title: issue.code,
        summary: issue.message,
        actionType: "REVIEW_SOURCE",
        confidence: 1,
        riskLevel: issue.severity === "blocking" ? "high" as const : "medium" as const,
        evidence: [{ ...((findings[0]?.evidence ?? [])[0] ?? {}), url: issue.sourceUrl ?? facts.finalUrl }],
        details: { code: issue.code, severity: issue.severity, changeType },
        deduplicationKey: `${cityId}:${source.id}:qa:${issue.code}`,
        changeType,
        attentionRequired: issue.severity !== "info",
        priorityScore: issue.severity === "blocking" ? 90 : 45,
      }))
      for (const finding of [...findings, ...qaFindings]) {
        const findingResult = await supabase.from("city_agent_findings").upsert(
          findingRow(finding),
          { onConflict: "city_id,deduplication_key", ignoreDuplicates: true },
        ).select("id").maybeSingle()
        if (findingResult.error) throw new Error(`Finding konnte nicht gespeichert werden: ${findingResult.error.message}`)
        findingCount += 1
        baselineFindings.push(finding)
        await addAudit(supabase, runId, "finding_created", { findingId: findingResult.data?.id ?? null, findingType: finding.findingType, protected_action_executed: false }, agentProfile)
      }

      const fieldDiff = diffSourceFacts(previous?.extracted_payload ?? null, facts)
      if (changed && Object.keys(fieldDiff).length > 0 && snapshot?.id) {
        const operation = "update"
        const deduplicationKey = `${cityId}:${source.id}:${facts.contentHash}`
        const contentType = sourceContentType(source)
        const proposalPayloadValue = proposalPayload(facts)
        let seoResolution: CitySeoResolution | null = null
        let resolvedContentId: string | null = null
        let resolvedExistingUrl: string | null = null
        if (["city_place", "city_event", "city_route", "city_guide"].includes(contentType)) {
          seoResolution = resolveCitySeoOpportunity({
            directory: await getSeoDirectory(),
            contentType,
            contentId: null,
            title: facts.title,
            sourceSlug: source.slug,
            sourceTrustTier: source.trust_tier,
            existingEntityKeys: seenSeoEntityKeys,
          })
          resolvedContentId = seoResolution.entityType === "hub" ? null : seoResolution.entityId
          resolvedExistingUrl = ["IMPROVE_EXISTING", "MERGE_DUPLICATE"].includes(seoResolution.action)
            ? seoResolution.canonicalUrl
            : null
          if (seoResolution.canonicalUrl) proposalPayloadValue.targetUrl = seoResolution.canonicalUrl
          proposalPayloadValue.seoResolution = seoResolution
          if (resolvedContentId) proposalPayloadValue.contentId = resolvedContentId
        }
        const editorialModule = ["editorial", "event", "news", "discovery", "route"].includes(moduleKey ?? "")
        const editorialContent = ["city_event", "city_place", "city_route", "city_guide", "city_newsletter"].includes(contentType)
        if (editorialModule && editorialContent) {
          const editorialCandidate: EditorialDraftInput = {
            cityId,
            citySlug,
            cityName: safeText(cityResult.data.name, 120),
            contentType,
            sourceSlug: source.slug,
            sourceUrl: facts.finalUrl,
            sourceTitle: facts.title,
            sourceText: facts.textPreview,
            dateMentions: facts.dateMentions,
            retrievedAt: facts.retrievedAt,
            sourceTrustTier: trustTierForSource(source),
            canonicalUrl: seoResolution?.canonicalUrl ?? null,
          }
          const candidateKey = editorialDraftKey(editorialCandidate)
          if (!editorialDraftCandidateKeys.has(candidateKey)) {
            editorialDraftCandidateKeys.add(candidateKey)
            editorialDraftCandidates.push(editorialCandidate)
          }
        }
        const baseScore = scoreProposalQuality({
          source,
          operation,
          contentType,
          changeType,
          fieldDiff,
          proposedPayload: proposalPayloadValue,
          evidenceCount: 1,
          existingUrl: resolvedExistingUrl,
          now,
        })
        const score = {
          ...baseScore,
          decisionClass: seoResolution?.action === "MERGE_DUPLICATE" ? "DUPLICATE" as const : baseScore.decisionClass,
          seoDecision: seoResolution?.action === "MERGE_DUPLICATE" ? "REJECT" as const : baseScore.seoDecision,
          targetUrl: seoResolution?.canonicalUrl ?? baseScore.targetUrl,
        }
        const proposalResult = await supabase.from("city_agent_proposals").upsert(
          {
            city_id: cityId,
            run_id: runId,
            source_id: source.id,
            snapshot_id: snapshot.id,
            content_type: contentType,
            content_id: resolvedContentId,
            operation,
            status: "needs_human",
            risk_level: riskForTrustTier(trustTierForSource(source)),
            confidence: score.confidence,
            field_diff: fieldDiff,
            proposed_payload: { ...proposalPayloadValue, fieldControl: "AUTO", moduleKey: moduleKey ?? null, quality: qualityDetails(score) },
            evidence: [{ url: facts.finalUrl, snapshotId: snapshot.id, retrievedAt: facts.retrievedAt, excerpt: facts.textPreview.slice(0, 500) }],
            deduplication_key: deduplicationKey,
            decision_class: score.decisionClass,
            seo_decision: score.seoDecision,
            relevance_score: score.relevance,
            evidence_score: score.evidence,
            actionability_score: score.actionability,
            source_quality_score: score.sourceQuality,
            duplicate_risk_score: score.duplicateRisk,
            quality_score: score.score,
            priority_score: score.priority,
            no_action_reason: seoResolution?.action === "MERGE_DUPLICATE"
              ? `MERGE_DUPLICATE – auf ${seoResolution.canonicalUrl ?? "die bestehende kanonische Entity"} zusammenführen; keine zweite öffentliche Seite erzeugen.`
              : score.seoDecision === "WATCH"
                ? "Suchintent oder bestehende URL muss vor einer Aktion bestätigt werden."
                : null,
          },
          { onConflict: "city_id,deduplication_key", ignoreDuplicates: true },
        )
        if (proposalResult.error) throw new Error(`Proposal konnte nicht gespeichert werden: ${proposalResult.error.message}`)
        const proposalRow = proposalResult.data?.[0] as { id?: string } | undefined
        const proposalId = proposalRow?.id ?? (await supabase.from("city_agent_proposals").select("id").eq("city_id", cityId).eq("deduplication_key", deduplicationKey).maybeSingle()).data?.id
        if (proposalId) {
          reviewCandidates.push({
            proposalId,
            sourceSlug: source.slug,
            trustLevel: source.trust_level,
            contentType,
            operation,
            confidence: score.confidence,
            risk: riskForTrustTier(trustTierForSource(source)),
            fieldDiff,
            proposedPayload: { ...proposalPayloadValue, quality: qualityDetails(score) },
            evidence: [{ url: facts.finalUrl, snapshotId: snapshot.id, retrievedAt: facts.retrievedAt, excerpt: facts.textPreview.slice(0, 500) }],
            quality: qualityDetails(score),
          })
        }
        if (seoResolution?.entityType === "hub" && seoResolution.entityId) {
          seenSeoEntityKeys.add(`hub:${seoResolution.entityId}`)
        } else if (resolvedContentId && seoResolution) {
          seenSeoEntityKeys.add(`${seoResolution.entityType}:${resolvedContentId}`)
        }
        proposalCount += 1
        await addAudit(supabase, runId, "proposal_created", { sourceId: source.id, operation, deduplicationKey }, agentProfile)
      }
    } catch (error) {
      if (!sourceFetchSucceeded) sourceFetchFailures += 1
      const message = error instanceof Error ? error.message : "Unbekannter Quellenfehler"
      const sourceError = `${source.slug}: ${message}`.slice(0, 500)
      if (source.parser_config.requiredForCoverage === false) sourceWarnings.push(sourceError)
      else errors.push(sourceError)
      const failureCount = (source.failure_count ?? 0) + 1
      await supabase.from("city_agent_sources").update({
        last_checked_at: now.toISOString(),
        last_status: "error",
        next_check_at: nextSourceCheckAt(source, now),
        updated_at: now.toISOString(),
        health: failureCount >= 3 ? "FAILED" : "DEGRADED",
        failure_count: failureCount,
        last_failure_at: now.toISOString(),
        next_retry_at: new Date(now.getTime() + Math.min(60 * 60 * 1000, 5 * 60 * 1000 * 2 ** Math.max(0, failureCount - 1))).toISOString(),
        retry_count: Math.max(0, failureCount - 1),
        last_failure_category: /pdf|content-type/i.test(message) ? "CONTENT_TYPE_OR_EXTRACTION" : /HTTP|timeout|fetch|network/i.test(message) ? "TRANSIENT_FETCH" : "SOURCE_ERROR",
      }).eq("id", source.id)
      await addAudit(supabase, runId, "source_checked", { sourceId: source.id, error: message.slice(0, 300) }, agentProfile)
      const findings = sourceFindings({ cityId, runId, source, error: message, changed: false, changeType: "SOURCE_FAILED" })
      for (const finding of findings) {
        const findingResult = await supabase.from("city_agent_findings").upsert(
          findingRow(finding),
          { onConflict: "city_id,deduplication_key", ignoreDuplicates: true },
        ).select("id").maybeSingle()
        if (findingResult.error) errors.push(`finding:${findingResult.error.message}`.slice(0, 500))
        else {
          findingCount += 1
          baselineFindings.push(finding)
          await addAudit(supabase, runId, "finding_created", { findingId: findingResult.data?.id ?? null, findingType: finding.findingType, protected_action_executed: false }, agentProfile)
        }
      }
    }
  }

  for (const candidate of editorialDraftCandidates) {
    const draftKey = editorialDraftKey(candidate)
    const draft = buildEditorialDraft(candidate)
    if (!draft) {
      editorialDraftSkippedCount += 1
      sourceWarnings.push(`${candidate.sourceSlug}: Editorial-Entwurf wegen unvollständiger oder unsicherer Quellenbelege übersprungen`)
      await addAudit(supabase, runId, "editorial_draft_skipped", {
        draftKey,
        sourceSlug: candidate.sourceSlug,
        reason: "INSUFFICIENT_OR_UNSAFE_EVIDENCE",
        protected_action_executed: false,
      }, agentProfile)
      continue
    }
    const editorialQuality = evaluateEditorialDraft(draft)
    if (editorialQuality.status === "REJECTED") {
      editorialDraftSkippedCount += 1
      sourceWarnings.push(`${candidate.sourceSlug}: Editorial-Entwurf wegen Qualitätsprüfung übersprungen`)
      await addAudit(supabase, runId, "editorial_draft_skipped", {
        draftKey,
        sourceSlug: candidate.sourceSlug,
        reason: "EDITORIAL_QUALITY_GATE",
        qualityStatus: editorialQuality.status,
        qualityScore: editorialQuality.score,
        qualityIssues: editorialQuality.issues,
        protected_action_executed: false,
      }, agentProfile)
      continue
    }

    const existingResult = await supabase
      .from("editorial_posts")
      .select("id,status,eyebrow")
      .eq("scope", "city")
      .eq("city_id", cityId)
      .eq("slug", draft.slug)
      .maybeSingle()
    if (existingResult.error) {
      errors.push(`editorial: ${existingResult.error.message}`.slice(0, 500))
      await addAudit(supabase, runId, "editorial_draft_failed", {
        draftKey,
        sourceSlug: candidate.sourceSlug,
        error: existingResult.error.message.slice(0, 300),
        protected_action_executed: false,
      }, agentProfile)
      continue
    }

    const existing = existingResult.data as { id?: string; status?: string; eyebrow?: string } | null
    if (!existing?.id) {
      const insertResult = await supabase.from("editorial_posts").insert(draft)
      if (insertResult.error) {
        errors.push(`editorial: ${insertResult.error.message}`.slice(0, 500))
        await addAudit(supabase, runId, "editorial_draft_failed", {
          draftKey,
          sourceSlug: candidate.sourceSlug,
          error: insertResult.error.message.slice(0, 300),
          protected_action_executed: false,
        }, agentProfile)
      } else {
        editorialDraftCreatedCount += 1
        await addAudit(supabase, runId, "editorial_draft_created", {
          draftKey,
          sourceSlug: candidate.sourceSlug,
          sourceUrl: candidate.sourceUrl,
          status: "draft",
          qualityStatus: editorialQuality.status,
          qualityScore: editorialQuality.score,
          qualityIssues: editorialQuality.issues,
          protected_action_executed: false,
        }, agentProfile)
      }
      continue
    }

    if (existing.eyebrow === "Automatisch recherchierter Entwurf" && existing.status === "draft") {
      const updateResult = await supabase.from("editorial_posts").update({
        title: draft.title,
        excerpt: draft.excerpt,
        category: draft.category,
        audience: draft.audience,
        content: draft.content,
        sources: draft.sources,
        related_links: draft.related_links,
        updated_at: draft.updated_at,
      }).eq("id", existing.id)
      if (updateResult.error) {
        errors.push(`editorial: ${updateResult.error.message}`.slice(0, 500))
        await addAudit(supabase, runId, "editorial_draft_failed", {
          draftKey,
          sourceSlug: candidate.sourceSlug,
          error: updateResult.error.message.slice(0, 300),
          protected_action_executed: false,
        }, agentProfile)
      } else {
        editorialDraftUpdatedCount += 1
        await addAudit(supabase, runId, "editorial_draft_updated", {
          draftKey,
          sourceSlug: candidate.sourceSlug,
          sourceUrl: candidate.sourceUrl,
          status: "draft",
          qualityStatus: editorialQuality.status,
          qualityScore: editorialQuality.score,
          qualityIssues: editorialQuality.issues,
          protected_action_executed: false,
        }, agentProfile)
      }
      continue
    }

    editorialDraftSkippedCount += 1
    sourceWarnings.push(`${candidate.sourceSlug}: bestehender redaktioneller Inhalt wurde nicht überschrieben`)
    await addAudit(supabase, runId, "editorial_draft_skipped", {
      draftKey,
      sourceSlug: candidate.sourceSlug,
      reason: "EXISTING_HUMAN_OR_PUBLISHED_CONTENT_PROTECTED",
      existingStatus: existing.status ?? null,
      protected_action_executed: false,
    }, agentProfile)
  }

  if (editorialDraftCandidates.length > 0 || editorialDraftCreatedCount > 0 || editorialDraftUpdatedCount > 0 || editorialDraftSkippedCount > 0) {
    await addAudit(supabase, runId, "editorial_drafts_completed", {
      candidates: editorialDraftCandidates.length,
      created: editorialDraftCreatedCount,
      updated: editorialDraftUpdatedCount,
      skipped: editorialDraftSkippedCount,
      protected_action_executed: false,
    }, agentProfile)
  }

  const shouldAuditBusinesses = baselineRequested || moduleKey === "business" || moduleKey === "freshness" || (moduleKey as string | undefined) === "full_city_audit"
  if (shouldAuditBusinesses) {
    try {
      businessAudit = await auditCityBusinesses(supabase, cityId, now)
      await addAudit(supabase, runId, "business_audit_completed", {
        checked: businessAudit.checked,
        current: businessAudit.current,
        due: businessAudit.due,
        stale: businessAudit.stale,
        unknown: businessAudit.unknown,
        scopeCounts: businessAudit.scopeCounts,
        dataGaps: businessAudit.dataGaps.length,
        sourceOfTruth: "partners + partner_locations + partner_opening_hours",
        protected_action_executed: false,
      }, agentProfile)
      for (const gap of businessAudit.dataGaps) {
        const finding = {
          cityId,
          runId,
          moduleKey: "business" as const,
          findingType: "CONTENT_GAP" as const,
          title: `Partnerdaten unvollständig: ${gap.name}`,
          summary: `Für den bestehenden Partner fehlen belastbare Felder: ${gap.fields.join(", ")}. Der Business Agent schlägt keine Schließung oder Veröffentlichung vor.`,
          actionType: "REVIEW_BUSINESS_DATA",
          confidence: 0.95,
          riskLevel: "medium" as const,
          evidence: [{ businessId: gap.businessId, scope: gap.scope, fields: gap.fields }],
          details: { businessId: gap.businessId, scope: gap.scope, missingFields: gap.fields, protected_action_executed: false },
          deduplicationKey: `${cityId}:business:${gap.businessId}:data-gap:${gap.fields.join(",")}`,
          changeType: "CONTENT_CHANGED" as const,
          attentionRequired: true,
          priorityScore: 60,
        }
        const findingResult = await supabase.from("city_agent_findings").upsert(
          findingRow(finding),
          { onConflict: "city_id,deduplication_key", ignoreDuplicates: true },
        ).select("id").maybeSingle()
        if (findingResult.error) throw new Error(`Business-Finding konnte nicht gespeichert werden: ${findingResult.error.message}`)
        findingCount += 1
        baselineFindings.push(finding)
        await addAudit(supabase, runId, "finding_created", { findingId: findingResult.data?.id ?? null, findingType: finding.findingType, businessId: gap.businessId, protected_action_executed: false }, agentProfile)
      }
    } catch (error) {
      errors.push(`business: ${error instanceof Error ? error.message : "Business-Audit fehlgeschlagen"}`.slice(0, 500))
      await addAudit(supabase, runId, "health_updated", { kind: "business_audit", status: "FAILED", error: errors.at(-1), protected_action_executed: false }, agentProfile)
    }
  }

  if (baselineRequested || moduleKey === "freshness" || (moduleKey as string | undefined) === "full_city_audit") {
    try {
      freshnessAudit = await auditCityFreshness(supabase, cityId, now, businessAudit ?? undefined)
      staleCount = freshnessAudit.stale + freshnessAudit.unknown
      await addAudit(supabase, runId, "health_updated", {
        kind: "entity_freshness",
        checked: freshnessAudit.checked,
        current: freshnessAudit.current,
        due: freshnessAudit.due,
        stale: freshnessAudit.stale,
        unknown: freshnessAudit.unknown,
        byEntity: freshnessAudit.byEntity,
        eventRecurrence: freshnessAudit.eventRecurrence,
        business: businessSummary(businessAudit),
        protected_action_executed: false,
      }, agentProfile)
    } catch (error) {
      errors.push(`freshness: ${error instanceof Error ? error.message : "Freshness-Audit fehlgeschlagen"}`.slice(0, 500))
      await addAudit(supabase, runId, "health_updated", { kind: "entity_freshness", status: "FAILED", error: errors.at(-1), protected_action_executed: false }, agentProfile)
    }
  }

  if (baselineRequested || moduleKey === "event_seo" || (moduleKey as string | undefined) === "full_city_audit") {
    try {
      eventSeoAudit = await auditCityEventSeo(supabase, cityId, citySlug, runId, now)
      for (const finding of eventSeoAudit.findings) {
        const findingResult = await supabase.from("city_agent_findings").upsert(
          findingRow(finding),
          { onConflict: "city_id,deduplication_key", ignoreDuplicates: true },
        ).select("id").maybeSingle()
        if (findingResult.error) throw new Error(`Event-SEO-Finding konnte nicht gespeichert werden: ${findingResult.error.message}`)
        findingCount += 1
        baselineFindings.push(finding)
      }
      await addAudit(supabase, runId, "health_updated", {
        kind: "event_seo",
        checked: eventSeoAudit.checked,
        current: eventSeoAudit.current,
        stale: eventSeoAudit.stale,
        expired: eventSeoAudit.expired,
        missingCanonical: eventSeoAudit.missingCanonical,
        thin: eventSeoAudit.thin,
        duplicateTitles: eventSeoAudit.duplicateTitles,
        recurrence: eventSeoAudit.recurrence,
        protected_action_executed: false,
      }, agentProfile)
    } catch (error) {
      errors.push(`event_seo: ${error instanceof Error ? error.message : "Event-SEO-Audit fehlgeschlagen"}`.slice(0, 500))
      await addAudit(supabase, runId, "health_updated", { kind: "event_seo", status: "FAILED", error: errors.at(-1), protected_action_executed: false }, agentProfile)
    }
  }

  const autoPublishAllowed = operatingMode === "GUARDED_AUTO"
    && Boolean(controlResult.data.auto_publish_enabled)
    && options.dryRun === false
    && process.env.CITY_AGENT_AUTO_PUBLISH === "true"
  if ((provider.name === "hermes_city_agent" || provider.name === "hermes_required") && reviewCandidates.length > 0) {
    try {
      const review = await reviewCityAgentProposalsThroughHermes({
        now,
        citySlug,
        cityProfile: profileId,
        orchestratorProfile: agentProfile,
        fetchImpl: options.fetchImpl,
        autoPublishAllowed,
        proposals: reviewCandidates,
      })
      for (const decision of review.decisions) {
        const agentRequestedPublish = decision.decision === "auto_published" && decision.publishedDraftIds.length > 0
        const nextStatus = decision.decision === "reject" ? "rejected" : "needs_human"
        // The Phase-1 runner never marks a proposal as published on its own.
        // A future GUARDED_AUTO implementation must call the central content
        // promotion RPC after field-control and revision checks.
        const agentPublished = false
        await supabase.from("city_agent_proposals").update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        }).eq("id", decision.proposalId).eq("run_id", runId)
        await addAudit(supabase, runId, "review_linked", {
          proposalId: decision.proposalId,
          decision: decision.decision,
          confidence: decision.confidence,
          risk: decision.risk,
          reason: decision.reason,
          publishedDraftIds: decision.publishedDraftIds,
          protected_action_executed: false,
          policy_blocked: agentRequestedPublish && !agentPublished,
          operatingMode,
          autoPublishAllowed,
        }, agentProfile)
      }
      await addAudit(supabase, runId, "review_linked", {
        reviewer: agentProfile,
        summary: review.summary,
        decisions: review.decisions.length,
        autoPublishedCount,
        protected_action_executed: false,
      }, agentProfile)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ben-Review fehlgeschlagen"
      errors.push(`ben-review: ${message}`.slice(0, 500))
      await addAudit(supabase, runId, "review_linked", {
        reviewer: agentProfile,
        error: message.slice(0, 300),
        protected_action_executed: false,
      }, agentProfile)
    }
  }

  const status = errors.length ? (snapshotCount || eventSeoAudit?.checked || businessAudit?.checked || freshnessAudit?.checked ? "partial" : "failed") : "succeeded"
  const finishedAt = new Date().toISOString()
  const sourceFetchMetrics = createSourceFetchMetrics(sourceFetchAttempts, sourceFetchSuccesses, sourceFetchFailures)
  await supabase.from("city_agent_runs").update({ status, source_count: dueSources.length, snapshot_count: snapshotCount, proposal_count: proposalCount, stale_count: staleCount, error_code: errors.length ? "source_errors" : null, error_summary: errors.length ? errors.join(" | ").slice(0, 2_000) : null, metadata: { autoPublishedCount, reviewCandidateCount: reviewCandidates.length, findingCount, editorialDrafts: { candidates: editorialDraftCandidates.length, created: editorialDraftCreatedCount, updated: editorialDraftUpdatedCount, skipped: editorialDraftSkippedCount }, operatingMode, moduleKey: moduleKey ?? null, shadow: isShadow, changeCounts, sourceWarnings: sourceWarnings.slice(0, 20), sourceFetchMetrics, business: businessSummary(businessAudit), eventSeo: eventSeoAudit ? { checked: eventSeoAudit.checked, current: eventSeoAudit.current, stale: eventSeoAudit.stale, expired: eventSeoAudit.expired, missingCanonical: eventSeoAudit.missingCanonical, thin: eventSeoAudit.thin, duplicateTitles: eventSeoAudit.duplicateTitles, recurrence: eventSeoAudit.recurrence } : null, freshness: freshnessAudit ? { checked: freshnessAudit.checked, current: freshnessAudit.current, due: freshnessAudit.due, stale: freshnessAudit.stale, unknown: freshnessAudit.unknown, byEntity: freshnessAudit.byEntity, eventRecurrence: freshnessAudit.eventRecurrence, serviceFacts: freshnessAudit.serviceFacts } : null }, finished_at: finishedAt, updated_at: finishedAt }).eq("id", runId)
  if (moduleKey) {
    await supabase.from("city_agent_schedules").update({
      last_run_id: runId,
      last_status: status,
      last_run_at: finishedAt,
      updated_at: finishedAt,
    }).eq("city_id", cityId).eq("module_key", moduleKey)
  }
  await addAudit(supabase, runId, status === "failed" ? "failed" : "completed", { sourceCount: dueSources.length, sourceFetchMetrics, snapshotCount, proposalCount, errors: errors.length, autoPublishedCount, findingCount, operatingMode, moduleKey: moduleKey ?? null, protected_action_executed: false }, agentProfile)
  if (baselineId) {
    const counts = baselineFindings.reduce<Record<string, number>>((result, finding) => {
      result[finding.findingType] = (result[finding.findingType] ?? 0) + 1
      return result
    }, {})
    await supabase.from("city_agent_baselines").update({
      status,
      finished_at: finishedAt,
      sources_checked: dueSources.length,
      source_failures: errors.length,
      changes_detected: proposalCount,
      duplicates_found: counts.DUPLICATE ?? 0,
      reviews_created: proposalCount,
      seo_opportunities: counts.SEO_OPPORTUNITY ?? 0,
      media_needs: counts.MEDIA_NEED ?? 0,
      qa_issues: (counts.QA_ISSUE ?? 0) + (counts.SOURCE_FAILURE ?? 0),
      stale_entities: staleCount,
      initial_baselines: changeCounts.INITIAL_BASELINE ?? 0,
      content_changed: changeCounts.CONTENT_CHANGED ?? 0,
      unchanged: (changeCounts.NO_CHANGE ?? 0) + (changeCounts.UNCHANGED ?? 0),
      source_recovered: changeCounts.SOURCE_RECOVERED ?? 0,
      summary: { counts, changeCounts, sourceWarnings: sourceWarnings.slice(0, 20), sourceCount: dueSources.length, sourceFetchMetrics, proposalCount, findingCount, editorialDrafts: { candidates: editorialDraftCandidates.length, created: editorialDraftCreatedCount, updated: editorialDraftUpdatedCount, skipped: editorialDraftSkippedCount }, operatingMode, shadow: isShadow, business: businessSummary(businessAudit), eventSeo: eventSeoAudit ? { checked: eventSeoAudit.checked, current: eventSeoAudit.current, stale: eventSeoAudit.stale, expired: eventSeoAudit.expired, missingCanonical: eventSeoAudit.missingCanonical, thin: eventSeoAudit.thin, duplicateTitles: eventSeoAudit.duplicateTitles, recurrence: eventSeoAudit.recurrence } : null, freshness: freshnessAudit ? { checked: freshnessAudit.checked, current: freshnessAudit.current, due: freshnessAudit.due, stale: freshnessAudit.stale, unknown: freshnessAudit.unknown, byEntity: freshnessAudit.byEntity, eventRecurrence: freshnessAudit.eventRecurrence, serviceFacts: freshnessAudit.serviceFacts, samples: freshnessAudit.samples } : null },
      updated_at: finishedAt,
    }).eq("id", baselineId)
    await addAudit(supabase, runId, "baseline_completed", { baselineId, counts, protected_action_executed: false }, agentProfile)
  }
  if (status === "failed") {
    await failJob(supabase, job.id, agentProfile, "all_sources_failed")
  } else {
    await completeJob(
      supabase,
      job.id,
      agentProfile,
      { runId, cityId, citySlug, sourceCount: dueSources.length, sourceFetchMetrics, snapshotCount, proposalCount, autoPublishedCount, findingCount, editorialDrafts: { candidates: editorialDraftCandidates.length, created: editorialDraftCreatedCount, updated: editorialDraftUpdatedCount, skipped: editorialDraftSkippedCount }, operatingMode, moduleKey: moduleKey ?? null, shadow: isShadow, errors: errors.slice(0, 10), warnings: sourceWarnings.slice(0, 10), eventSeo: eventSeoAudit ? { checked: eventSeoAudit.checked, findings: eventSeoAudit.findings.length } : null, protected_action_executed: false },
      autoPublishedCount ? `${autoPublishedCount} City-Vorschläge wurden nach Ben-Policy veröffentlicht.` : proposalCount ? `${proposalCount} belegte Vorschläge warten auf Prüfung.` : null,
    )
  }

  await updateSchedulerJobLink(supabase, jobInput, job.id, { agent_run_id: runId, started_at: now.toISOString(), finished_at: finishedAt, result: schedulerResult(status), error_summary: errors.length ? errors.join(" | ").slice(0, 2_000) : null })
  return { claimed: true, jobId: job.id, runId, cityId, citySlug, provider: provider.name, sourceCount: dueSources.length, snapshotCount, proposalCount, autoPublishedCount, staleCount, errorCount: errors.length, status, errors, operatingMode, moduleKey, shadow: isShadow, findingCount, editorialDraftCreatedCount, editorialDraftUpdatedCount, editorialDraftSkippedCount, changeCounts, business: businessSummary(businessAudit) ?? undefined, freshness: freshnessAudit ? { checked: freshnessAudit.checked, current: freshnessAudit.current, due: freshnessAudit.due, stale: freshnessAudit.stale, unknown: freshnessAudit.unknown } : undefined }
}
