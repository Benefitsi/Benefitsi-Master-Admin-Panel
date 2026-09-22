import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getAdminSession } from "./admin"
import { cityDisplayName, contractTimestampMs, normalizeRuntimeSnapshot, type RuntimeSnapshot } from "./agent-control"
import { createAdminClient } from "./supabase/admin"

export type SourceState = "available" | "unavailable"
export type AvailableList<T> = { state: SourceState; items: T[]; truncated?: boolean }
export type AvailableItem<T> = { state: SourceState; item: T | null }

export type CityControl = {
  cityId: string
  cityName: string | null
  operatingMode: string | null
  orchestratorProfile: string | null
  cityProfile: string | null
  timezone: string | null
  autoPublishEnabled: boolean | null
  lastFullCheckAt: string | null
  nextFullCheckAt: string | null
  healthStatus: string | null
}

export type CitySchedule = {
  id: string
  cityId: string
  moduleKey: string
  cadenceMinutes: number | null
  enabled: boolean | null
  nextRunAt: string | null
  lastRunAt: string | null
  lastStatus: string | null
  actualTrigger: string | null
  lastTriggerAt: string | null
  lastMissedAt: string | null
  consecutiveMissedRuns: number | null
}

export type PipelineHealth = {
  cityId: string
  cityName: string | null
  lastRunAt: string | null
  lastRunOk: boolean | null
  technicalOk: boolean | null
  editorialReviewPending: boolean | null
  researchCheckedAt: string | null
}

export type AgentControlData = {
  checkedAt: string
  runtime: { state: "fresh" | "stale" | "invalid" | "unavailable"; snapshot: RuntimeSnapshot | null }
  cities: AvailableList<CityControl>
  citySchedules: AvailableList<CitySchedule>
  pipeline: AvailableItem<PipelineHealth>
}

const ANNWEILER_ID = "b9e684e4-54b3-41ff-8f97-4426423893c2"

export async function loadAgentControl(client: SupabaseClient, now = new Date()): Promise<AgentControlData> {
  const session = await getAdminSession(client)
  if (!session?.isAdmin) throw new Error("Admin-Zugriff erforderlich.")

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return unavailableResult(now)
  }

  const [runtimeResult, cityResult, scheduleResult, pipelineResult] = await Promise.all([
    safeQuery(() => admin.from("benefitsi_agent_runtime_snapshots")
      .select("host_id,observed_at,schema_version,snapshot,received_at")
      .eq("host_id", "m1-benefitsi").order("observed_at", { ascending: false }).limit(1).maybeSingle()),
    safeQuery(() => admin.from("city_agent_city_controls")
      .select("city_id,operating_mode,orchestrator_profile,city_profile,timezone,auto_publish_enabled,last_full_check_at,next_full_check_at,health_status").limit(65)),
    safeQuery(() => admin.from("city_agent_schedules")
      .select("id,city_id,module_key,cadence_minutes,enabled,next_run_at,last_run_at,last_status,actual_trigger,last_trigger_at,last_missed_at,consecutive_missed_runs").limit(1025)),
    safeQuery(() => admin.from("annweiler_event_pipeline_health")
      .select("city_id,last_run_at,last_run_ok,summary").eq("city_id", ANNWEILER_ID).maybeSingle()),
  ])

  return {
    checkedAt: now.toISOString(),
    runtime: normalizeRuntimeSource(runtimeResult, now),
    cities: normalizeListSource(cityResult, normalizeCityControl, 64),
    citySchedules: normalizeListSource(scheduleResult, normalizeCitySchedule, 1024),
    pipeline: normalizeItemSource(pipelineResult, normalizePipeline),
  }
}

async function safeQuery(run: () => PromiseLike<{ data: unknown; error: unknown }>) {
  try {
    const result = await run()
    return result.error ? { ok: false as const, data: null } : { ok: true as const, data: result.data }
  } catch {
    return { ok: false as const, data: null }
  }
}

function normalizeRuntimeSource(result: Awaited<ReturnType<typeof safeQuery>>, now: Date): AgentControlData["runtime"] {
  if (!result.ok || !isRecord(result.data)) return { state: "unavailable", snapshot: null }
  const row = result.data
  if (row.host_id !== "m1-benefitsi" || row.schema_version !== 1 || !isRecord(row.snapshot)) return { state: "invalid", snapshot: null }
  if (!sameInstant(row.observed_at, row.snapshot.observedAt) || row.schema_version !== row.snapshot.schemaVersion || row.host_id !== row.snapshot.hostId) return { state: "invalid", snapshot: null }
  return normalizeRuntimeSnapshot(row.snapshot, now)
}

function normalizeListSource<T>(result: Awaited<ReturnType<typeof safeQuery>>, normalize: (value: unknown) => T | null, limit: number): AvailableList<T> {
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) return { state: "unavailable", items: [] }
  const truncated = result.data.length > limit
  return { state: "available", items: result.data.slice(0, limit).map(normalize).filter((item): item is T => item !== null), truncated }
}

function normalizeItemSource<T>(result: Awaited<ReturnType<typeof safeQuery>>, normalize: (value: unknown) => T | null): AvailableItem<T> {
  if (!result.ok || result.data === null) return { state: "unavailable", item: null }
  const item = normalize(result.data)
  return item ? { state: "available", item } : { state: "unavailable", item: null }
}

function normalizeCityControl(value: unknown): CityControl | null {
  if (!isRecord(value) || typeof value.city_id !== "string") return null
  return {
    cityId: value.city_id, cityName: cityDisplayName(value.city_id),
    operatingMode: nullableText(value.operating_mode), orchestratorProfile: nullableText(value.orchestrator_profile),
    cityProfile: nullableText(value.city_profile), timezone: nullableText(value.timezone),
    autoPublishEnabled: nullableBoolean(value.auto_publish_enabled), lastFullCheckAt: nullableDate(value.last_full_check_at),
    nextFullCheckAt: nullableDate(value.next_full_check_at), healthStatus: nullableText(value.health_status),
  }
}

function normalizeCitySchedule(value: unknown): CitySchedule | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.city_id !== "string" || typeof value.module_key !== "string") return null
  return {
    id: value.id, cityId: value.city_id, moduleKey: value.module_key,
    cadenceMinutes: nullableInteger(value.cadence_minutes), enabled: nullableBoolean(value.enabled),
    nextRunAt: nullableDate(value.next_run_at), lastRunAt: nullableDate(value.last_run_at),
    lastStatus: nullableText(value.last_status), actualTrigger: nullableText(value.actual_trigger),
    lastTriggerAt: nullableDate(value.last_trigger_at), lastMissedAt: nullableDate(value.last_missed_at),
    consecutiveMissedRuns: nullableInteger(value.consecutive_missed_runs),
  }
}

function normalizePipeline(value: unknown): PipelineHealth | null {
  if (!isRecord(value) || typeof value.city_id !== "string") return null
  const summary = isRecord(value.summary) ? value.summary : null
  const health = summary && isRecord(summary.health) ? summary.health : null
  const lastRunOk = nullableBoolean(value.last_run_ok)
  const summaryTechnical = nullableBoolean(health?.technical_ok)
  return {
    cityId: value.city_id, cityName: cityDisplayName(value.city_id), lastRunAt: nullableDate(value.last_run_at),
    lastRunOk, technicalOk: summaryTechnical,
    editorialReviewPending: editorialReviewPending(health), researchCheckedAt: nullableDate(health?.research_checked_at),
  }
}

function editorialReviewPending(health: Record<string, unknown> | null) {
  if (health?.editorial_status === "pending_review") return true
  return nullableBoolean(health?.editorial_review_pending)
}

function unavailableResult(now: Date): AgentControlData {
  return { checkedAt: now.toISOString(), runtime: { state: "unavailable", snapshot: null }, cities: { state: "unavailable", items: [] }, citySchedules: { state: "unavailable", items: [] }, pipeline: { state: "unavailable", item: null } }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
function nullableText(value: unknown) { return typeof value === "string" && value.length <= 200 ? value : null }
function nullableBoolean(value: unknown) { return typeof value === "boolean" ? value : null }
function nullableInteger(value: unknown) { return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null }
function nullableDate(value: unknown) { return typeof value === "string" && contractTimestampMs(value) !== null ? value : null }
function sameInstant(left: unknown, right: unknown) { const leftMs = contractTimestampMs(left), rightMs = contractTimestampMs(right); return leftMs !== null && rightMs !== null && leftMs === rightMs }
