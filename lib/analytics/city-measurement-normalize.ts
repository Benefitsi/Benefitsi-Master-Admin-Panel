import type { CityConversion, CityMeasurementScope, CityObservationRow, CityVital, CityWebOperations, ObservationCoverage } from "./city-measurement-contracts"
import { CITY_WEB_ERROR_CODES, CITY_WEB_ROUTE_KINDS } from "./city-measurement-contracts"

const STAGES = ["city_page_views", "partner_form_views", "partner_submissions_observed", "app_entry_clicks", "today_selections", "newsletter_confirmations_observed", "other_city_ctas", "benefit_views", "benefit_selections", "partner_views", "searches", "newsletter_signups_observed", "other_web_observations"]
const CHANNELS = ["direct", "organic_search", "organic_social", "paid_search", "paid_social", "referral", "email", "other", "unknown"]

export function normalizeCityConversion(input: unknown, scope: CityMeasurementScope): CityConversion {
  const value = record(input)
  checkScope(value, scope, "city")
  const backend = record(value.backend_consented)
  const requests = record(value.partner_requests)
  const submitted = count(requests.submitted)
  const qualified = count(requests.qualified)
  if (qualified > submitted) invalid()
  let web: CityConversion["web"] = null
  if (value.web_observations !== null) {
    const observed = record(value.web_observations)
    if (observed.source !== "analytics.reportable_product_event_facts_v1") invalid()
    const denominators = record(observed.denominators)
    const provider = record(observed.provider_delivery)
    const eventCount = count(observed.event_count)
    const actorCount = count(observed.observed_actors)
    const cityViews = count(denominators.city_page_view_events)
    const cityActors = count(denominators.city_page_view_actors)
    const delivered = count(provider.delivered)
    const pending = count(provider.pending)
    const failed = count(provider.failed)
    if (actorCount > eventCount || cityViews > eventCount || cityActors > cityViews || cityActors > actorCount || delivered + pending + failed !== eventCount) invalid()
    web = {
      eventCount, actorCount, cityViews, cityActors,
      coverage: oneOf(observed.coverage, ["observed_subset", "no_observations", "partial_retention", "outside_retention"] as const) as ObservationCoverage,
      lastObservedAt: nullableTimestamp(observed.last_observed_at),
      stages: observationRows(observed.stages, STAGES, eventCount),
      channels: observationRows(observed.channels, CHANNELS, eventCount),
      providerDelivery: { delivered, pending, failed },
    }
    if (web.coverage === "no_observations" && eventCount !== 0) invalid()
  }
  return {
    confirmedVisits: Object.hasOwn(backend, "visit_confirmed") ? count(backend.visit_confirmed) : 0,
    confirmedRedemptions: Object.hasOwn(backend, "redemption_confirmed") ? count(backend.redemption_confirmed) : 0,
    partnerRequests: { submitted, qualified }, web,
  }
}

export function normalizeCityWebOperations(input: unknown, scope: CityMeasurementScope): CityWebOperations {
  const value = record(input)
  if (value.schema_version !== 1) invalid()
  checkScope(value, scope, "city_slug")
  const maxVitalGroups = CITY_WEB_ROUTE_KINDS.length * 3 * 5
  const vitals: CityVital[] = list(value.vitals, maxVitalGroups).map(input => {
    const row = record(input)
    const sampleCount = count(row.sample_count)
    const p75 = nullableNumber(row.p75)
    if (sampleCount === 0 && p75 !== null) invalid()
    return {
      metric: oneOf(row.metric, ["LCP", "INP", "CLS", "TTFB", "FCP"] as const),
      device: oneOf(row.device, ["mobile", "desktop", "unknown"] as const),
      routeKind: oneOf(row.route_kind, CITY_WEB_ROUTE_KINDS), sampleCount, p75,
      lastObservedAt: nullableTimestamp(row.last_observed_at),
    }
  })
  unique(vitals.map(row => `${row.metric}:${row.device}:${row.routeKind}`))
  const errors = list(value.errors, CITY_WEB_ROUTE_KINDS.length * 3 * CITY_WEB_ERROR_CODES.length).map(input => {
    const row = record(input)
    return {
      kind: oneOf(row.error_kind, ["client_error", "unhandled_rejection", "server_error"] as const),
      code: oneOf(row.error_code, CITY_WEB_ERROR_CODES), routeKind: oneOf(row.route_kind, CITY_WEB_ROUTE_KINDS), count: count(row.count),
      lastObservedAt: nullableTimestamp(row.last_observed_at),
    }
  })
  unique(errors.map(row => `${row.kind}:${row.code}:${row.routeKind}`))
  const alerts = list(value.alerts, 100 + maxVitalGroups).map(input => {
    const row = record(input)
    return {
      key: token(row.key), severity: oneOf(row.severity, ["warning", "critical"] as const),
      state: oneOf(row.state, ["open", "resolved"] as const), title: publicText(row.title, 160),
      observedValue: nullableNumber(row.observed_value), threshold: nullableNumber(row.threshold),
      sampleCount: row.sample_count === null ? null : count(row.sample_count),
      lastObservedAt: nullableTimestamp(row.last_observed_at),
    }
  })
  unique(alerts.map(row => row.key))
  const coverage = oneOf(value.coverage, ["observed_subset", "no_observations"] as const)
  if (coverage === "no_observations" && (vitals.some(row => row.sampleCount > 0) || errors.some(row => row.count > 0))) invalid()
  return {
    generatedAt: timestamp(value.generated_at), lastObservedAt: nullableTimestamp(value.last_observed_at),
    coverage, vitals, errors, alerts,
    limitations: list(value.limitations, 20).map(item => publicText(item, 400)),
  }
}

export function cityVitalAssessment(metric: Pick<CityVital, "metric" | "sampleCount" | "p75">) {
  if (metric.p75 === null || metric.sampleCount === 0) return "unknown" as const
  if (metric.sampleCount < 100) return "provisional" as const
  if (metric.metric === "TTFB" || metric.metric === "FCP") return "measured" as const
  const threshold = { LCP: 2500, INP: 200, CLS: 0.1 }[metric.metric]
  return metric.p75 <= threshold ? "good" as const : "attention" as const
}

function checkScope(value: Record<string, unknown>, scope: CityMeasurementScope, cityKey: string) {
  if (value[cityKey] !== scope.city.slug || value.environment !== scope.environment ||
    timestamp(value.from) !== scope.from || timestamp(value.until_exclusive) !== scope.until) invalid()
}
function observationRows(input: unknown, keys: string[], eventCount: number): CityObservationRow[] {
  const value = record(input)
  return keys.filter(key => Object.hasOwn(value, key)).map(key => {
    const row = record(value[key]); const events = count(row.events); const actors = count(row.observed_actors)
    if (events > eventCount || actors > events) invalid()
    return { key, events, actors }
  })
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function list(value: unknown, max = 250): unknown[] {
  if (!Array.isArray(value) || value.length > max) return invalid()
  return value
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid()
  return value
}
function nullableNumber(value: unknown): number | null {
  if (value === null) return null
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return invalid()
  return value
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) return invalid()
  return new Date(value).toISOString()
}
function nullableTimestamp(value: unknown) { return value === null ? null : timestamp(value) }
function token(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z][a-zA-Z0-9_.:-]{0,159}$/.test(value)) return invalid()
  return value
}
function publicText(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /@|https?:\/\/|[\u0000-\u001f]/.test(value)) return invalid()
  return value.trim()
}
function oneOf<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) return invalid()
  return value as T
}
function unique(values: string[]) { if (new Set(values).size !== values.length) invalid() }
function invalid(): never { throw new Error("Invalid city measurement payload") }
