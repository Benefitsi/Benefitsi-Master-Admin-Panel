import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type { CityAgentFindingInput } from "./findings"
import { findingKey } from "./findings"
import type { CityAgentModuleKey } from "./contracts"
import { freshnessState } from "./freshness"

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

export type CityAgentEventSeoAudit = {
  checked: number
  current: number
  stale: number
  expired: number
  missingCanonical: number
  thin: number
  duplicateTitles: number
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

function eventStatus(row: EventRow, now: Date) {
  const end = row.end_date ? new Date(row.end_date) : row.start_date ? new Date(row.start_date) : null
  if (end && Number.isFinite(end.getTime()) && end.getTime() < now.getTime()) return "EXPIRED" as const
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
    targetUrl: canonicalSlug ? `/stadt/${input.citySlug}/entdecken/event/${canonicalSlug}` : null,
  }
}

/**
 * Event SEO is deliberately a read-only audit. It verifies route/metadata
 * coverage and freshness from the existing city_events records; it does not
 * invent event facts or create a second event store.
 */
export async function auditCityEventSeo(admin: AdminClient, cityId: string, citySlug: string, runId: string, now = new Date()): Promise<CityAgentEventSeoAudit> {
  const result = await admin
    .from("city_events")
    .select("id,title,description,start_date,end_date,status,event_status,canonical_slug,source_url,last_verified_at,freshness_ttl_days,seo_title,seo_description")
    .eq("city_id", cityId)
    .limit(500)
  if (result.error) throw new Error(`Event-SEO-Audit konnte Events nicht laden: ${result.error.message}`)

  const events = (result.data ?? []) as EventRow[]
  const counts = { current: 0, stale: 0, expired: 0, missingCanonical: 0, thin: 0, duplicateTitles: 0 }
  const findings: CityAgentFindingInput[] = []
  const byTitle = new Map<string, EventRow[]>()
  const byEvent: CityAgentEventSeoAudit["byEvent"] = []

  for (const event of events) {
    const id = text(event.id) ?? "unknown"
    const title = text(event.title) ?? "Unbenannte Veranstaltung"
    const state = eventStatus(event, now)
    if (state === "CURRENT") counts.current += 1
    if (state === "STALE" || state === "UNKNOWN") counts.stale += 1
    if (state === "EXPIRED") counts.expired += 1
    const slug = text(event.canonical_slug)
    const canonicalUrl = slug ? `/stadt/${citySlug}/entdecken/event/${slug}` : null
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

  return { checked: events.length, ...counts, findings, byEvent }
}
