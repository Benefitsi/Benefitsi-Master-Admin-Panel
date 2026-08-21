import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type { CityAgentFindingInput } from "./findings"
import { findingKey } from "./findings"
import type { CityAgentModuleKey } from "./contracts"
import { freshnessState } from "./freshness"
import { getCitySeoUrl } from "./seo-url-resolver"

type AdminClient = ReturnType<typeof createAdminClient>

type EventRow = {
  id?: string
  title?: string | null
  description?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string | null
  event_status?: string | null
  canonical_slug?: string | null
  source_url?: string | null
  last_verified_at?: string | null
  freshness_ttl_days?: number | null
  seo_title?: string | null
  seo_description?: string | null
}

type EventScheduleRow = {
  event_id?: string | null
  status?: string | null
  frequency?: string | null
  interval_count?: number | null
  weekdays?: number[] | null
  month_day?: number | null
  start_time?: string | null
  end_time?: string | null
  starts_on?: string | null
  ends_on?: string | null
  timezone?: string | null
  expires_at?: string | null
}

export type CityAgentEventSeoAudit = {
  checked: number
  current: number
  stale: number
  expired: number
  missingCanonical: number
  thin: number
  duplicateTitles: number
  recurrence: CityAgentEventRecurrenceAudit
  findings: CityAgentFindingInput[]
  byEvent: Array<{
    id: string
    title: string
    canonicalUrl: string | null
    status: "CURRENT" | "STALE" | "EXPIRED" | "UNKNOWN"
    startDate: string | null
    endDate: string | null
    lastVerifiedAt: string | null
  }>
}

export type CityAgentEventRecurrenceAudit = {
  checked: number
  scheduledEvents: number
  activeRecurringEvents: number
  invalidScheduleEvents: number
  expiredScheduleEvents: number
  unknownEndTimeEvents: number
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizedTitle(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function localDate(now: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now)
    const values = new Map(parts.map((part) => [part.type, part.value]))
    return `${values.get("year")}-${values.get("month")}-${values.get("day")}`
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export function recurringScheduleIsCurrent(schedule: EventScheduleRow, now: Date) {
  const today = localDate(now, text(schedule.timezone) ?? "Europe/Berlin")
  const startsOn = text(schedule.starts_on)
  const endsOn = text(schedule.ends_on)
  const expiresAt = text(schedule.expires_at)
  return schedule.status === "active"
    && Boolean(startsOn && startsOn <= today)
    && Boolean(!endsOn || endsOn >= today)
    && Boolean(expiresAt && Number.isFinite(new Date(expiresAt).getTime()) && new Date(expiresAt).getTime() > now.getTime())
}

function validScheduleShape(schedule: EventScheduleRow) {
  const frequency = text(schedule.frequency)
  const startsOn = text(schedule.starts_on)
  const expiresAt = text(schedule.expires_at)
  if (!frequency || !["weekly", "monthly"].includes(frequency) || !startsOn || !expiresAt) return false
  if (schedule.start_time && schedule.end_time && schedule.end_time <= schedule.start_time) return false
  if (frequency === "weekly") {
    return Array.isArray(schedule.weekdays)
      && schedule.weekdays.length > 0
      && schedule.weekdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)
      && schedule.month_day == null
  }
  return Array.isArray(schedule.weekdays)
    && schedule.weekdays.length === 0
    && Number.isInteger(schedule.month_day)
    && (schedule.month_day as number) >= 1
    && (schedule.month_day as number) <= 31
}

export function evaluateEventRecurrence(input: {
  event: EventRow
  schedules: EventScheduleRow[]
  now: Date
}) {
  const activeSchedules = input.schedules.filter((schedule) => schedule.status === "active")
  const invalidScheduleCount = activeSchedules.filter((schedule) => !validScheduleShape(schedule)).length
  const validSchedules = activeSchedules.filter(validScheduleShape)
  const activeScheduleCount = validSchedules.filter((schedule) => recurringScheduleIsCurrent(schedule, input.now)).length
  const expiredScheduleCount = validSchedules.filter((schedule) => !recurringScheduleIsCurrent(schedule, input.now)).length
  return {
    hasSchedule: input.schedules.length > 0,
    activeScheduleCount,
    invalidScheduleCount,
    expiredScheduleCount,
    unknownEndTime: input.event.end_date == null,
  }
}

function eventStatus(row: EventRow, schedules: EventScheduleRow[], now: Date) {
  const hasCurrentRecurringSchedule = schedules.some((schedule) => validScheduleShape(schedule) && recurringScheduleIsCurrent(schedule, now))
  const end = row.end_date ? new Date(row.end_date) : row.start_date ? new Date(row.start_date) : null
  if (!hasCurrentRecurringSchedule && end && Number.isFinite(end.getTime()) && end.getTime() < now.getTime()) return "EXPIRED" as const
  const freshness = freshnessState({
    lastVerifiedAt: row.last_verified_at ?? null,
    ttlDays: typeof row.freshness_ttl_days === "number" && row.freshness_ttl_days > 0 ? row.freshness_ttl_days : 1,
    now,
  })
  return freshness === "CURRENT" ? "CURRENT" as const : freshness === "UNKNOWN" ? "UNKNOWN" as const : "STALE" as const
}

function baseFinding(input: {
  cityId: string
  runId: string
  event: EventRow
  citySlug: string
  code: string
  findingType: CityAgentFindingInput["findingType"]
  title: string
  summary: string
  actionType: string
  priorityScore: number
  attentionRequired?: boolean
  details?: Record<string, unknown>
}): CityAgentFindingInput {
  const eventId = text(input.event.id) ?? "unknown"
  const eventTitle = text(input.event.title) ?? "Unbenannte Veranstaltung"
  const canonicalSlug = text(input.event.canonical_slug)
  const canonicalUrl = canonicalSlug ? getCitySeoUrl(input.citySlug, "event", canonicalSlug) : null
  return {
    cityId: input.cityId,
    runId: input.runId,
    moduleKey: "event_seo" as CityAgentModuleKey,
    findingType: input.findingType,
    title: input.title,
    summary: input.summary,
    actionType: input.actionType,
    confidence: 0.95,
    riskLevel: "medium",
    evidence: [{ eventId, title: eventTitle, sourceUrl: text(input.event.source_url) }],
    details: { eventId, eventTitle, canonicalSlug, ...input.details },
    deduplicationKey: findingKey([input.cityId, "event-seo", eventId, input.code]),
    changeType: "NO_CHANGE",
    attentionRequired: input.attentionRequired ?? true,
    priorityScore: input.priorityScore,
    targetUrl: canonicalUrl,
  }
}

/**
 * Event SEO is deliberately a read-only audit. It verifies route/metadata
 * coverage and freshness from the existing city_events records; it does not
 * invent event facts or create a second event store.
 */
export async function auditCityEventSeo(admin: AdminClient, cityId: string, citySlug: string, runId: string, now = new Date()): Promise<CityAgentEventSeoAudit> {
  const [result, schedulesResult] = await Promise.all([
    admin
      .from("city_events")
      .select("id,title,description,start_date,end_date,status,event_status,canonical_slug,source_url,last_verified_at,freshness_ttl_days,seo_title,seo_description")
      .eq("city_id", cityId)
      .limit(500),
    admin
      .from("city_event_schedules")
      .select("event_id,status,frequency,interval_count,weekdays,month_day,start_time,end_time,starts_on,ends_on,timezone,expires_at")
      .eq("city_id", cityId)
      .limit(500),
  ])
  if (result.error) throw new Error(`Event-SEO-Audit konnte Events nicht laden: ${result.error.message}`)
  if (schedulesResult.error) throw new Error(`Event-SEO-Audit konnte Wiederholungspläne nicht laden: ${schedulesResult.error.message}`)

  const events = (result.data ?? []) as EventRow[]
  const schedulesByEvent = new Map<string, EventScheduleRow[]>()
  for (const schedule of (schedulesResult.data ?? []) as EventScheduleRow[]) {
    const eventId = text(schedule.event_id)
    if (!eventId) continue
    schedulesByEvent.set(eventId, [...(schedulesByEvent.get(eventId) ?? []), schedule])
  }
  const counts = { current: 0, stale: 0, expired: 0, missingCanonical: 0, thin: 0, duplicateTitles: 0 }
  const recurrence: CityAgentEventRecurrenceAudit = {
    checked: events.length,
    scheduledEvents: 0,
    activeRecurringEvents: 0,
    invalidScheduleEvents: 0,
    expiredScheduleEvents: 0,
    unknownEndTimeEvents: 0,
  }
  const findings: CityAgentFindingInput[] = []
  const byTitle = new Map<string, EventRow[]>()
  const byEvent: CityAgentEventSeoAudit["byEvent"] = []

  for (const event of events) {
    const id = text(event.id) ?? "unknown"
    const title = text(event.title) ?? "Unbenannte Veranstaltung"
    const recurrenceState = evaluateEventRecurrence({ event, schedules: schedulesByEvent.get(id) ?? [], now })
    if (recurrenceState.hasSchedule) recurrence.scheduledEvents += 1
    if (recurrenceState.activeScheduleCount > 0) recurrence.activeRecurringEvents += 1
    if (recurrenceState.invalidScheduleCount > 0) recurrence.invalidScheduleEvents += 1
    if (recurrenceState.expiredScheduleCount > 0) recurrence.expiredScheduleEvents += 1
    if (recurrenceState.unknownEndTime) recurrence.unknownEndTimeEvents += 1
    if (recurrenceState.invalidScheduleCount > 0) {
      findings.push(baseFinding({
        cityId, runId, event, citySlug, code: "INVALID_RECURRENCE_SCHEDULE", findingType: "QA_ISSUE",
        title: `Wiederholungsplan prüfen: ${title}`,
        summary: "Der aktive Wiederholungsplan erfüllt nicht die gespeicherte Frequenz-/Kalenderstruktur. Es werden keine fehlenden Termine oder Uhrzeiten erfunden.",
        actionType: "REVIEW_EVENT_RECURRENCE", priorityScore: 80,
        details: { recurrence: recurrenceState },
      }))
    }
    const state = eventStatus(event, schedulesByEvent.get(id) ?? [], now)
    if (state === "CURRENT") counts.current += 1
    if (state === "STALE" || state === "UNKNOWN") counts.stale += 1
    if (state === "EXPIRED") counts.expired += 1
    const slug = text(event.canonical_slug)
    const canonicalUrl = slug ? getCitySeoUrl(citySlug, "event", slug) : null
    byEvent.push({ id, title, canonicalUrl, status: state, startDate: text(event.start_date), endDate: text(event.end_date), lastVerifiedAt: text(event.last_verified_at) })

    const key = normalizedTitle(title)
    if (key) byTitle.set(key, [...(byTitle.get(key) ?? []), event])
    if (!slug) {
      counts.missingCanonical += 1
      findings.push(baseFinding({
        cityId, runId, event, citySlug, code: "MISSING_CANONICAL_SLUG", findingType: "SEO_OPPORTUNITY",
        title: `Event-Detailroute fehlt: ${title}`,
        summary: "Die Veranstaltung besitzt noch keinen kanonischen Slug. Die Event-Detailseite kann deshalb nicht sauber intern verlinkt und als Event-Landingpage ausgewertet werden.",
        actionType: "REVIEW_EVENT_CANONICAL", priorityScore: 70,
      }))
    }
    if ((text(event.description)?.length ?? 0) < 120 || (text(event.seo_description)?.length ?? 0) < 80) {
      counts.thin += 1
      findings.push(baseFinding({
        cityId, runId, event, citySlug, code: "THIN_EVENT_METADATA", findingType: "SEO_OPPORTUNITY",
        title: `Event-Inhalt ausbauen: ${title}`,
        summary: "Beschreibung oder SEO-Beschreibung ist zu kurz für eine belastbare Event-Detailseite. Der Agent schlägt keine Fakten vor, sondern markiert nur die redaktionelle Lücke.",
        actionType: "IMPROVE_EVENT_CONTENT", priorityScore: 45,
        details: { descriptionLength: text(event.description)?.length ?? 0, seoDescriptionLength: text(event.seo_description)?.length ?? 0 },
      }))
    }
    if (state === "EXPIRED") {
      findings.push(baseFinding({
        cityId, runId, event, citySlug, code: "EXPIRED_EVENT", findingType: "STALE",
        title: `Abgelaufenes Event prüfen: ${title}`,
        summary: "Das Enddatum liegt vor dem Audit-Zeitpunkt. Status, Archivierung und interne Links müssen redaktionell geprüft werden.",
        actionType: "REVIEW_EVENT_EXPIRY", priorityScore: 65,
        details: { startDate: event.start_date ?? null, endDate: event.end_date ?? null, eventStatus: event.event_status ?? null },
      }))
    } else if (state === "STALE" || state === "UNKNOWN") {
      findings.push(baseFinding({
        cityId, runId, event, citySlug, code: "STALE_EVENT_SOURCE", findingType: "STALE",
        title: `Event-Fakten verifizieren: ${title}`,
        summary: "Die vorhandene Event-Quelle ist für den konfigurierten Zeitraum nicht frisch genug. Vor einer Veröffentlichung oder SEO-Ausweitung ist eine erneute Quellenprüfung nötig.",
        actionType: "VERIFY_EVENT_SOURCE", priorityScore: 55,
        details: { freshnessState: state, lastVerifiedAt: event.last_verified_at ?? null },
      }))
    }
  }

  for (const [title, matching] of byTitle) {
    if (matching.length < 2) continue
    counts.duplicateTitles += matching.length
    for (const event of matching) {
      findings.push(baseFinding({
        cityId, runId, event, citySlug, code: "DUPLICATE_EVENT_TITLE", findingType: "DUPLICATE",
        title: `Möglicher Event-Duplikat: ${text(event.title) ?? title}`,
        summary: "Mehrere Event-Datensätze teilen denselben normalisierten Titel. Serien- und Terminvarianten müssen vor einer SEO-Ausspielung getrennt oder aggregiert werden.",
        actionType: "REVIEW_EVENT_DUPLICATE", priorityScore: 50,
        details: { normalizedTitle: title, matchingEventIds: matching.map((item) => text(item.id)).filter(Boolean) },
      }))
    }
  }

  return { checked: events.length, ...counts, recurrence, findings, byEvent }
}
