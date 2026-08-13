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
  }
}

function normalizeCityAgentRun(row: Row, cityNames: Map<string, string>) {
  const cityId = text(row.city_id) ?? ""
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
  const [jobsResult, auditResult, sourcesResult, runsResult, proposalsResult, cityAgentAuditResult] = await Promise.all([
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
      .select("id,city_id,slug,url,source_type,trust_level,cadence,next_check_at,last_checked_at,last_status,active")
      .order("next_check_at", { ascending: true, nullsFirst: true })
      .limit(1000),
    admin
      .from("city_agent_runs")
      .select("id,city_id,job_id,profile_id,orchestrator_profile,trigger,status,dry_run,source_count,snapshot_count,proposal_count,stale_count,error_code,error_summary,started_at,finished_at,created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("city_agent_proposals")
      .select("id,city_id,run_id,source_id,snapshot_id,content_type,content_id,operation,status,risk_level,confidence,field_diff,proposed_payload,evidence,review_id,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("city_agent_run_audit")
      .select("id,run_id,action,actor_type,actor_profile,details,created_at")
      .order("created_at", { ascending: false })
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
      migrationReady: false,
      warnings: [
        "Die Automations-Migration ist noch nicht verfügbar. Es wurden keine Ersatzdaten angezeigt.",
      ],
    }
  }

  const warnings: string[] = []
  if (sourcesResult.error || runsResult.error || proposalsResult.error || cityAgentAuditResult.error) {
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
    migrationReady: true,
    warnings,
  }
}
