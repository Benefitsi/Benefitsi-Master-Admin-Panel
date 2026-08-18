import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  automationJobTypes,
  automationStatuses,
  redactAutomationPayload,
  type AutomationData,
  type AutomationHumanGate,
  type AutomationJob,
} from "./contracts"

type Row = Record<string, unknown>

function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Row =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : []
}

function text(value: unknown) {
  return typeof value === "string" ? value : null
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return 0
}

function boolean(value: unknown) {
  return value === true
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeJob(row: Row, cityNames: Map<string, string>): AutomationJob {
  const jobType = automationJobTypes.includes(
    row.job_type as (typeof automationJobTypes)[number],
  )
    ? (row.job_type as AutomationJob["jobType"])
    : "city_scan"
  const status = automationStatuses.includes(
    row.status as (typeof automationStatuses)[number],
  )
    ? (row.status as AutomationJob["status"])
    : "failed"
  const cityId = text(row.city_id)
  const gate = text(row.human_gate)

  return {
    id: text(row.id) ?? "",
    jobType,
    status,
    priority: number(row.priority),
    cityId,
    cityName: cityId ? cityNames.get(cityId) ?? "Unbekannte Stadt" : null,
    providerId: text(row.provider_id),
    bookingId: text(row.booking_id),
    targetType: text(row.target_type),
    targetId: text(row.target_id),
    humanGate: (
      [
        "none",
        "publish",
        "refund",
        "payout",
        "live_activation",
        "provider_activation",
      ].includes(gate ?? "")
        ? gate
        : "none"
    ) as AutomationHumanGate,
    input: redactAutomationPayload(object(row.input)) as Record<string, unknown>,
    result: row.result
      ? (redactAutomationPayload(object(row.result)) as Record<string, unknown>)
      : null,
    recommendedAction: text(row.recommended_action),
    agentProfile: text(row.agent_profile),
    attempts: number(row.attempts),
    maxAttempts: number(row.max_attempts),
    availableAt: text(row.available_at),
    leaseUntil: text(row.lease_until),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  }
}

function normalizeCityAgentSource(row: Row, cityNames: Map<string, string>) {
  const cityId = text(row.city_id) ?? ""
  return {
    id: text(row.id) ?? "",
    cityId,
    cityName: cityNames.get(cityId) ?? null,
    slug: text(row.slug) ?? "",
    url: text(row.url) ?? "",
    sourceType: text(row.source_type) ?? "official",
    trustLevel: text(row.trust_level) ?? "primary",
    cadence: text(row.cadence) ?? "daily",
    nextCheckAt: text(row.next_check_at),
    lastCheckedAt: text(row.last_checked_at),
    lastStatus: text(row.last_status) ?? "unknown",
    active: boolean(row.active),
    enabled: boolean(row.enabled),
    crawlMethod: text(row.crawl_method) ?? "html",
    failureCount: number(row.failure_count),
    health: text(row.health) ?? "UNKNOWN",
    trustTier: text(row.trust_tier) ?? "D",
    lastSuccessAt: text(row.last_success_at),
    lastChangeAt: text(row.last_change_at),
    ownerName: text(row.owner_name),
    primarySource: boolean(row.primary_source),
    lastFailureAt: text(row.last_failure_at),
    lastRecoveredAt: text(row.last_recovered_at),
    nextRetryAt: text(row.next_retry_at),
    retryCount: number(row.retry_count),
    lastFailureCategory: text(row.last_failure_category),
    retiredAt: text(row.retired_at),
    retirementReason: text(row.retirement_reason),
    replacementSourceId: text(row.replacement_source_id),
  }
}

function normalizeCityAgentRun(row: Row, cityNames: Map<string, string>) {
  const cityId = text(row.city_id) ?? ""
  const metadata = object(row.metadata)
  return {
    id: text(row.id) ?? "",
    cityId,
    cityName: cityNames.get(cityId) ?? null,
    jobId: text(row.job_id),
    profileId: text(row.profile_id) ?? "",
    orchestratorProfile: text(row.orchestrator_profile) ?? "ben",
    trigger: text(row.trigger) ?? "scheduled",
    status: text(row.status) ?? "unknown",
    dryRun: boolean(row.dry_run),
    sourceCount: number(row.source_count),
    snapshotCount: number(row.snapshot_count),
    proposalCount: number(row.proposal_count),
    staleCount: number(row.stale_count),
    errorCode: text(row.error_code),
    errorSummary: text(row.error_summary),
    startedAt: text(row.started_at),
    finishedAt: text(row.finished_at),
    createdAt: text(row.created_at),
    operatingMode: text(row.operating_mode) ?? text(metadata.operatingMode) ?? (boolean(row.dry_run) ? "SHADOW" : "UNKNOWN"),
    moduleKey: text(row.module_key) ?? text(metadata.moduleKey),
    shadow: boolean(row.shadow) || boolean(metadata.shadow) || boolean(row.dry_run),
    findingCount: number(row.finding_count) || number(metadata.findingCount),
    desiredCadenceMinutes: number(metadata.desiredCadenceMinutes) || null,
    actualTrigger: text(metadata.actualTrigger),
    changeCounts: object(metadata.changeCounts) as Record<string, number>,
    freshness: object(metadata.freshness) as Record<string, number>,
  }
}

function normalizeCityAgentControl(row: Row, cityNames: Map<string, string>) {
  const cityId = text(row.city_id) ?? ""
  return {
    cityId,
    cityName: cityNames.get(cityId) ?? null,
    operatingMode: text(row.operating_mode) ?? "DISABLED",
    orchestratorProfile: text(row.orchestrator_profile) ?? "ben",
    cityProfile: text(row.city_profile) ?? "",
    timezone: text(row.timezone) ?? "Europe/Berlin",
    autoPublishEnabled: boolean(row.auto_publish_enabled),
    lastFullCheckAt: text(row.last_full_check_at),
    nextFullCheckAt: text(row.next_full_check_at),
    pausedReason: text(row.paused_reason),
    updatedAt: text(row.updated_at),
    healthStatus: text(row.health_status) ?? "UNKNOWN",
    healthReasons: Array.isArray(row.health_reasons) ? row.health_reasons.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
    readinessMetrics: object(row.readiness_metrics),
    shadowWindowStartedAt: text(row.shadow_window_started_at),
    shadowWindowEndsAt: text(row.shadow_window_ends_at),
  }
}

function normalizeCityAgentSchedule(row: Row, cityNames: Map<string, string>) {
  const cityId = text(row.city_id) ?? ""
  return {
    id: text(row.id) ?? "",
    cityId,
    cityName: cityNames.get(cityId) ?? null,
    moduleKey: text(row.module_key) ?? "unknown",
    cadenceMinutes: number(row.cadence_minutes),
    enabled: boolean(row.enabled),
    nextRunAt: text(row.next_run_at),
    lastRunAt: text(row.last_run_at),
    lastStatus: text(row.last_status) ?? "idle",
    lastRunId: text(row.last_run_id),
    updatedAt: text(row.updated_at),
    actualTrigger: text(row.actual_trigger),
    lastTriggerAt: text(row.last_trigger_at),
    lastMissedAt: text(row.last_missed_at),
    consecutiveMissedRuns: number(row.consecutive_missed_runs),
  }
}

function normalizeCityAgentSchedulerJobLink(row: Row, cityNames: Map<string, string>) {
  const cityId = text(row.city_id) ?? ""
  return {
    schedulerJobId: text(row.scheduler_job_id) ?? "",
    schedulerRunId: text(row.scheduler_run_id) ?? "",
    scheduleId: text(row.schedule_id) ?? "",
    cityId,
    cityName: cityNames.get(cityId) ?? null,
    moduleKey: text(row.module_key) ?? "unknown",
    scheduledFor: text(row.scheduled_for),
    queuedAt: text(row.queued_at),
    workerJobId: text(row.worker_job_id),
    agentRunId: text(row.agent_run_id),
    agentType: text(row.agent_type) ?? "city_scan",
    startedAt: text(row.started_at),
    finishedAt: text(row.finished_at),
    result: text(row.result),
    errorSummary: text(row.error_summary),
  }
}

function normalizeCityAgentFinding(row: Row, cityNames: Map<string, string>) {
  const cityId = text(row.city_id) ?? ""
  const evidence = Array.isArray(row.evidence)
    ? row.evidence.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).slice(0, 10)
    : []
  return {
    id: text(row.id) ?? "",
    cityId,
    cityName: cityNames.get(cityId) ?? null,
    runId: text(row.run_id),
    sourceId: text(row.source_id),
    moduleKey: text(row.module_key) ?? "unknown",
    findingType: text(row.finding_type) ?? "QA_ISSUE",
    status: text(row.status) ?? "OBSERVED",
    title: text(row.title) ?? "Unbenannter Fund",
    summary: text(row.summary) ?? "",
    actionType: text(row.action_type),
    confidence: number(row.confidence),
    riskLevel: text(row.risk_level) ?? "medium",
    evidence: evidence.map((item) => redactAutomationPayload(item) as Record<string, unknown>),
    details: redactAutomationPayload(object(row.details)) as Record<string, unknown>,
    detectedAt: text(row.detected_at),
    changeType: text(row.change_type),
    attentionRequired: row.attention_required !== false,
    priorityScore: number(row.priority_score),
    decisionClass: text(row.decision_class),
    targetUrl: text(row.target_url),
  }
}

function normalizeCityAgentBaseline(row: Row, cityNames: Map<string, string>) {
  const cityId = text(row.city_id) ?? ""
  return {
    id: text(row.id) ?? "",
    cityId,
    cityName: cityNames.get(cityId) ?? null,
    runId: text(row.run_id),
    operatingMode: text(row.operating_mode) ?? "SHADOW",
    status: text(row.status) ?? "running",
    startedAt: text(row.started_at),
    finishedAt: text(row.finished_at),
    sourcesChecked: number(row.sources_checked),
    sourceFailures: number(row.source_failures),
    changesDetected: number(row.changes_detected),
    duplicatesFound: number(row.duplicates_found),
    reviewsCreated: number(row.reviews_created),
    seoOpportunities: number(row.seo_opportunities),
    mediaNeeds: number(row.media_needs),
    qaIssues: number(row.qa_issues),
    staleEntities: number(row.stale_entities),
    summary: redactAutomationPayload(object(row.summary)) as Record<string, unknown>,
    initialBaselines: number(row.initial_baselines),
    contentChanged: number(row.content_changed),
    unchanged: number(row.unchanged),
    sourceRecovered: number(row.source_recovered),
    entityNew: number(row.entity_new),
    entityRemoved: number(row.entity_removed),
    reviewNoise: number(row.review_noise),
    falsePositiveRate: row.false_positive_rate == null ? null : number(row.false_positive_rate),
    shadowWindowId: text(row.shadow_window_id),
  }
}

function normalizeCityAgentProposal(row: Row, cityNames: Map<string, string>) {
  const cityId = text(row.city_id) ?? ""
  const evidence = Array.isArray(row.evidence)
    ? row.evidence.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).slice(0, 20)
    : []
  return {
    id: text(row.id) ?? "",
    cityId,
    cityName: cityNames.get(cityId) ?? null,
    runId: text(row.run_id) ?? "",
    sourceId: text(row.source_id),
    snapshotId: text(row.snapshot_id),
    contentType: text(row.content_type) ?? "city_guide",
    contentId: text(row.content_id),
    operation: text(row.operation) ?? "verify",
    status: text(row.status) ?? "agent_draft",
    riskLevel: text(row.risk_level) ?? "medium",
    confidence: number(row.confidence),
    fieldDiff: redactAutomationPayload(object(row.field_diff)) as Record<string, unknown>,
    proposedPayload: redactAutomationPayload(object(row.proposed_payload)) as Record<string, unknown>,
    evidence: evidence.map((item) => redactAutomationPayload(item) as Record<string, unknown>),
    reviewId: text(row.review_id),
    createdAt: text(row.created_at),
    decisionClass: text(row.decision_class),
    seoDecision: text(row.seo_decision),
    relevanceScore: row.relevance_score == null ? null : number(row.relevance_score),
    evidenceScore: row.evidence_score == null ? null : number(row.evidence_score),
    actionabilityScore: row.actionability_score == null ? null : number(row.actionability_score),
    sourceQualityScore: row.source_quality_score == null ? null : number(row.source_quality_score),
    duplicateRiskScore: row.duplicate_risk_score == null ? null : number(row.duplicate_risk_score),
    qualityScore: row.quality_score == null ? null : number(row.quality_score),
    priorityScore: row.priority_score == null ? null : number(row.priority_score),
    noActionReason: text(row.no_action_reason),
  }
}

function normalizeSchedulerRun(row: Row) {
  return {
    id: text(row.id) ?? "",
    triggerSource: text(row.trigger_source) ?? "unknown",
    startedAt: text(row.started_at),
    finishedAt: text(row.finished_at),
    schedulesConsidered: number(row.schedules_considered),
    schedulesDue: number(row.schedules_due),
    jobsQueued: number(row.jobs_queued),
    jobsProcessed: number(row.jobs_processed),
    status: text(row.status) ?? "unknown",
    errorSummary: text(row.error_summary),
    details: redactAutomationPayload(object(row.details)) as Record<string, unknown>,
  }
}

function normalizeShadowWindow(row: Row, cityNames: Map<string, string>) {
  const cityId = text(row.city_id) ?? ""
  return {
    id: text(row.id) ?? "",
    cityId,
    cityName: cityNames.get(cityId) ?? null,
    startsAt: text(row.starts_at),
    endsAt: text(row.ends_at),
    status: text(row.status) ?? "UNKNOWN",
    metrics: redactAutomationPayload(object(row.metrics)) as Record<string, unknown>,
  }
}

function normalizeHealthCheck(row: Row, cityNames: Map<string, string>) {
  const cityId = text(row.city_id) ?? ""
  return {
    id: text(row.id) ?? "",
    cityId,
    cityName: cityNames.get(cityId) ?? null,
    checkType: text(row.check_type) ?? "unknown",
    mode: text(row.mode) ?? "LIVE",
    status: text(row.status) ?? "UNKNOWN",
    summary: text(row.summary) ?? "",
    details: redactAutomationPayload(object(row.details)) as Record<string, unknown>,
    createdAt: text(row.created_at),
    expiresAt: text(row.expires_at),
  }
}

function normalizeCityAgentAudit(row: Row) {
  return {
    id: text(row.id) ?? "",
    runId: text(row.run_id) ?? "",
    action: text(row.action) ?? "unknown",
    actorType: text(row.actor_type) ?? "agent",
    actorProfile: text(row.actor_profile),
    details: redactAutomationPayload(object(row.details)) as Record<string, unknown>,
    createdAt: text(row.created_at),
  }
}

export async function loadAutomationData(): Promise<AutomationData> {
  const admin = createAdminClient()
  const citiesResult = await admin.from("cities").select("id,name").order("name")
  if (citiesResult.error) {
    throw new Error(`Städte konnten nicht geladen werden: ${citiesResult.error.message}`)
  }

  const cities = rows(citiesResult.data).map((city) => ({
    id: text(city.id) ?? "",
    name: text(city.name) ?? "Unbekannte Stadt",
  }))
  const cityNames = new Map(cities.map((city) => [city.id, city.name]))
  const [jobsResult, auditResult, sourcesResult, runsResult, proposalsResult, cityAgentAuditResult, controlsResult, schedulesResult, findingsResult, baselinesResult, schedulerRunsResult, shadowWindowsResult, healthChecksResult, schedulerJobLinksResult] = await Promise.all([
    admin
      .from("automation_jobs")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("automation_job_audit")
      .select("id,job_id,action,actor_type,actor_profile,details,created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("city_agent_sources")
      .select("id,city_id,slug,url,source_type,owner_name,trust_level,cadence,next_check_at,last_checked_at,last_status,active,enabled,crawl_method,failure_count,health,trust_tier,last_success_at,last_change_at,primary_source,last_failure_at,last_recovered_at,next_retry_at,retry_count,last_failure_category,retired_at,retirement_reason,replacement_source_id")
      .order("next_check_at", { ascending: true, nullsFirst: true })
      .limit(1000),
    admin
      .from("city_agent_runs")
      .select("id,city_id,job_id,profile_id,orchestrator_profile,trigger,status,dry_run,source_count,snapshot_count,proposal_count,stale_count,error_code,error_summary,started_at,finished_at,created_at,metadata")
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("city_agent_proposals")
      .select("id,city_id,run_id,source_id,snapshot_id,content_type,content_id,operation,status,risk_level,confidence,field_diff,proposed_payload,evidence,review_id,created_at,decision_class,seo_decision,relevance_score,evidence_score,actionability_score,source_quality_score,duplicate_risk_score,quality_score,priority_score,no_action_reason")
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("city_agent_run_audit")
      .select("id,run_id,action,actor_type,actor_profile,details,created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("city_agent_city_controls")
      .select("city_id,operating_mode,orchestrator_profile,city_profile,timezone,auto_publish_enabled,last_full_check_at,next_full_check_at,paused_reason,updated_at,health_status,health_reasons,readiness_metrics,shadow_window_started_at,shadow_window_ends_at")
      .order("updated_at", { ascending: false }),
    admin
      .from("city_agent_schedules")
      .select("id,city_id,module_key,cadence_minutes,enabled,next_run_at,last_run_at,last_status,last_run_id,updated_at,actual_trigger,last_trigger_at,last_missed_at,consecutive_missed_runs")
      .order("next_run_at", { ascending: true })
      .limit(1000),
    admin
      .from("city_agent_findings")
      .select("id,city_id,run_id,source_id,module_key,finding_type,status,title,summary,action_type,confidence,risk_level,evidence,details,detected_at,change_type,attention_required,priority_score,decision_class,target_url")
      .order("detected_at", { ascending: false })
      .limit(500),
    admin
      .from("city_agent_baselines")
      .select("id,city_id,run_id,operating_mode,status,started_at,finished_at,sources_checked,source_failures,changes_detected,duplicates_found,reviews_created,seo_opportunities,media_needs,qa_issues,stale_entities,summary,initial_baselines,content_changed,unchanged,source_recovered,entity_new,entity_removed,review_noise,false_positive_rate,shadow_window_id")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("city_agent_scheduler_runs")
      .select("id,trigger_source,started_at,finished_at,schedules_considered,schedules_due,jobs_queued,jobs_processed,status,error_summary,details")
      .order("started_at", { ascending: false })
      .limit(200),
    admin
      .from("city_agent_shadow_windows")
      .select("id,city_id,starts_at,ends_at,status,metrics")
      .order("starts_at", { ascending: false })
      .limit(50),
    admin
      .from("city_agent_health_checks")
      .select("id,city_id,check_type,mode,status,summary,details,created_at,expires_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("city_agent_scheduler_job_links")
      .select("scheduler_job_id,scheduler_run_id,schedule_id,city_id,module_key,scheduled_for,queued_at,worker_job_id,agent_run_id,agent_type,started_at,finished_at,result,error_summary")
      .order("scheduled_for", { ascending: false })
      .limit(1000),
  ])

  if (jobsResult.error || auditResult.error) {
    return {
      jobs: [],
      audit: [],
      cities,
      cityAgentSources: [],
      cityAgentRuns: [],
      cityAgentProposals: [],
      cityAgentAudit: [],
      cityAgentControls: [],
      cityAgentSchedules: [],
      cityAgentFindings: [],
      cityAgentBaselines: [],
      cityAgentSchedulerRuns: [],
      cityAgentSchedulerJobLinks: [],
      cityAgentShadowWindows: [],
      cityAgentHealthChecks: [],
      migrationReady: false,
      warnings: [
        "Die Automations-Migration ist noch nicht verfügbar. Es wurden keine Ersatzdaten angezeigt.",
      ],
    }
  }

  const warnings: string[] = []
  if (sourcesResult.error || runsResult.error || proposalsResult.error || cityAgentAuditResult.error || controlsResult.error || schedulesResult.error || findingsResult.error || baselinesResult.error || schedulerRunsResult.error || shadowWindowsResult.error || healthChecksResult.error || schedulerJobLinksResult.error) {
    warnings.push("Die City-Agent-Migration ist noch nicht vollständig verfügbar. Queue-Daten werden trotzdem angezeigt.")
  }

  return {
    jobs: rows(jobsResult.data).map((job) => normalizeJob(job, cityNames)),
    audit: rows(auditResult.data).map((entry) => ({
      id: text(entry.id) ?? "",
      jobId: text(entry.job_id) ?? "",
      action: text(entry.action) ?? "unknown",
      actorType: text(entry.actor_type) ?? "system",
      actorProfile: text(entry.actor_profile),
      details: object(entry.details),
      createdAt: text(entry.created_at),
    })),
    cities,
    cityAgentSources: sourcesResult.error ? [] : rows(sourcesResult.data).map((row) => normalizeCityAgentSource(row, cityNames)),
    cityAgentRuns: runsResult.error ? [] : rows(runsResult.data).map((row) => normalizeCityAgentRun(row, cityNames)),
    cityAgentProposals: proposalsResult.error ? [] : rows(proposalsResult.data).map((row) => normalizeCityAgentProposal(row, cityNames)),
    cityAgentAudit: cityAgentAuditResult.error ? [] : rows(cityAgentAuditResult.data).map(normalizeCityAgentAudit),
    cityAgentControls: controlsResult.error ? [] : rows(controlsResult.data).map((row) => normalizeCityAgentControl(row, cityNames)),
    cityAgentSchedules: schedulesResult.error ? [] : rows(schedulesResult.data).map((row) => normalizeCityAgentSchedule(row, cityNames)),
    cityAgentFindings: findingsResult.error ? [] : rows(findingsResult.data).map((row) => normalizeCityAgentFinding(row, cityNames)),
    cityAgentBaselines: baselinesResult.error ? [] : rows(baselinesResult.data).map((row) => normalizeCityAgentBaseline(row, cityNames)),
    cityAgentSchedulerRuns: schedulerRunsResult.error ? [] : rows(schedulerRunsResult.data).map(normalizeSchedulerRun),
    cityAgentSchedulerJobLinks: schedulerJobLinksResult.error ? [] : rows(schedulerJobLinksResult.data).map((row) => normalizeCityAgentSchedulerJobLink(row, cityNames)),
    cityAgentShadowWindows: shadowWindowsResult.error ? [] : rows(shadowWindowsResult.data).map((row) => normalizeShadowWindow(row, cityNames)),
    cityAgentHealthChecks: healthChecksResult.error ? [] : rows(healthChecksResult.data).map((row) => normalizeHealthCheck(row, cityNames)),
    migrationReady: true,
    warnings,
  }
}
