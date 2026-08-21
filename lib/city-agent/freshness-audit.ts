import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { freshnessState, type FreshnessState } from "./freshness"
import { auditCityBusinesses, type CityBusinessAudit } from "./business-audit"
import { evaluateEventRecurrence } from "./event-seo-audit"

type AdminClient = ReturnType<typeof createAdminClient>

type FreshnessRow = Record<string, unknown>

export type CityAgentFreshnessAudit = {
  checked: number
  current: number
  due: number
  stale: number
  unknown: number
  byEntity: Record<string, { checked: number; current: number; due: number; stale: number; unknown: number }>
  samples: Array<{ entityType: string; entityId: string; title: string; state: FreshnessState; lastVerifiedAt: string | null; ttlDays: number }>
  serviceFacts: { checked: number; current: number; due: number; stale: number; unknown: number }
  eventRecurrence: {
    checked: number
    scheduledEvents: number
    activeRecurringEvents: number
    invalidScheduleEvents: number
    expiredScheduleEvents: number
    unknownEndTimeEvents: number
  }
  businessAudit?: Pick<CityBusinessAudit, "scopeCounts" | "dataGaps" | "records">
}

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function text(value: unknown) {
  return typeof value === "string" ? value : null
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function ttlFor(row: FreshnessRow, entityType: string) {
  const freshness = object(row.data_freshness)
  const entity = object(freshness.entity)
  const explicit = number(row.freshness_ttl_days, NaN)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const nested = number(entity.freshnessTtlDays ?? entity.ttlDays, NaN)
  if (Number.isFinite(nested) && nested > 0) return nested
  if (entityType === "event") return 1
  if (entityType === "route") return 30
  if (entityType === "business") return 30
  return 30
}

function addState(result: CityAgentFreshnessAudit, entityType: string, state: FreshnessState) {
  result.checked += 1
  result[state.toLowerCase() as "current" | "due" | "stale" | "unknown"] += 1
  const bucket = result.byEntity[entityType] ?? { checked: 0, current: 0, due: 0, stale: 0, unknown: 0 }
  bucket.checked += 1
  bucket[state.toLowerCase() as "current" | "due" | "stale" | "unknown"] += 1
  result.byEntity[entityType] = bucket
}

export function isServiceFactSource(row: FreshnessRow) {
  const scope = JSON.stringify(object(row.content_scope)).toLowerCase()
  const slug = text(row.slug)?.toLowerCase() ?? ""
  return /(service|civic|municip|verwaltung|rathaus|notiz|notice|mobilität|mobility|parking|gesundheit|health|emergency|contact)/.test(`${scope} ${slug}`)
}

function sourceTtl(row: FreshnessRow) {
  const config = object(row.parser_config)
  const value = number(config.freshnessTtlDays ?? config.ttlDays, NaN)
  return Number.isFinite(value) && value > 0 ? value : 7
}

async function readRows(admin: AdminClient, table: string, select: string, cityId: string, limit?: number) {
  let query = admin.from(table).select(select).eq("city_id", cityId)
  if (limit) query = query.limit(limit)
  const result = await query
  return result.error ? [] : (result.data ?? []) as unknown as FreshnessRow[]
}

export async function auditCityFreshness(admin: AdminClient, cityId: string, now = new Date(), existingBusinessAudit?: CityBusinessAudit): Promise<CityAgentFreshnessAudit> {
  const [places, events, routes, serviceSources, eventSchedules] = await Promise.all([
    // These tables intentionally do not share every freshness column. Keep
    // the resolver schema-aware instead of making one broad select fail
    // closed to an empty audit for all entity types.
    readRows(admin, "city_places", "id,name,last_verified_at,data_freshness,updated_at", cityId, 10),
    readRows(admin, "city_events", "id,title,start_date,end_date,last_verified_at,freshness_ttl_days,updated_at", cityId),
    readRows(admin, "city_routes", "id,title,last_verified_at,freshness_ttl_days,updated_at", cityId, 3),
    readRows(admin, "city_agent_sources", "id,slug,content_scope,parser_config,last_success_at,last_checked_at,health,active,enabled", cityId),
    readRows(admin, "city_event_schedules", "event_id,status,frequency,interval_count,weekdays,month_day,start_time,end_time,starts_on,ends_on,timezone,expires_at", cityId),
  ])
  const businessAudit = existingBusinessAudit ?? await auditCityBusinesses(admin, cityId, now)
  const result: CityAgentFreshnessAudit = {
    checked: 0,
    current: 0,
    due: 0,
    stale: 0,
    unknown: 0,
    byEntity: {},
    samples: [],
    serviceFacts: { checked: 0, current: 0, due: 0, stale: 0, unknown: 0 },
    eventRecurrence: {
      checked: events.length,
      scheduledEvents: 0,
      activeRecurringEvents: 0,
      invalidScheduleEvents: 0,
      expiredScheduleEvents: 0,
      unknownEndTimeEvents: 0,
    },
    businessAudit: {
      scopeCounts: businessAudit.scopeCounts,
      dataGaps: businessAudit.dataGaps,
      records: businessAudit.records,
    },
  }
  const businesses: FreshnessRow[] = businessAudit.records.map((record) => ({
    id: record.id,
    name: record.name,
    last_verified_at: record.lastVerifiedAt,
    freshness_ttl_days: 30,
  }))
  const groups: Array<[string, FreshnessRow[]]> = [
    ["place", places],
    ["event", events],
    ["route", routes],
    ["business", businesses],
  ]
  const schedulesByEvent = new Map<string, FreshnessRow[]>()
  for (const schedule of eventSchedules) {
    const eventId = text(schedule.event_id)
    if (!eventId) continue
    schedulesByEvent.set(eventId, [...(schedulesByEvent.get(eventId) ?? []), schedule])
  }
  for (const [entityType, rows] of groups) {
    for (const row of rows) {
      if (entityType === "event") {
        const recurrence = evaluateEventRecurrence({
          event: row as Parameters<typeof evaluateEventRecurrence>[0]["event"],
          schedules: (schedulesByEvent.get(text(row.id) ?? "") ?? []) as Parameters<typeof evaluateEventRecurrence>[0]["schedules"],
          now,
        })
        if (recurrence.hasSchedule) result.eventRecurrence.scheduledEvents += 1
        if (recurrence.activeScheduleCount > 0) result.eventRecurrence.activeRecurringEvents += 1
        if (recurrence.invalidScheduleCount > 0) result.eventRecurrence.invalidScheduleEvents += 1
        if (recurrence.expiredScheduleCount > 0) result.eventRecurrence.expiredScheduleEvents += 1
        if (recurrence.unknownEndTime) result.eventRecurrence.unknownEndTimeEvents += 1
      }
      const lastVerifiedAt = text(row.last_verified_at)
      const ttlDays = ttlFor(row, entityType)
      const state = freshnessState({ lastVerifiedAt, ttlDays, now })
      addState(result, entityType, state)
      if (result.samples.length < 24) {
        result.samples.push({
          entityType,
          entityId: text(row.id) ?? "",
          title: text(row.title) ?? text(row.name) ?? "Unbenannte Entity",
          state,
          lastVerifiedAt,
          ttlDays,
        })
      }
    }
  }
  // Service facts remain source-backed metadata, not a parallel city-content
  // table. Their freshness is derived from the existing source registry.
  for (const row of serviceSources.filter(isServiceFactSource)) {
    const lastVerifiedAt = text(row.last_success_at) ?? text(row.last_checked_at)
    const ttlDays = sourceTtl(row)
    const state = freshnessState({ lastVerifiedAt, ttlDays, now })
    addState(result, "service_fact", state)
    result.serviceFacts.checked += 1
    result.serviceFacts[state.toLowerCase() as "current" | "due" | "stale" | "unknown"] += 1
    if (result.samples.length < 24) {
      result.samples.push({
        entityType: "service_fact",
        entityId: text(row.id) ?? "",
        title: text(row.slug) ?? "Service-Fact-Quelle",
        state,
        lastVerifiedAt,
        ttlDays,
      })
    }
  }
  return result
}
