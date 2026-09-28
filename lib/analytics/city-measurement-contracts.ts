import type { AnalyticsEnvironment } from "./contracts"

// Version-one RPC vocabularies mirror the database constraints. Expansion needs
// a coordinated reader update, so arbitrary route/error payloads fail closed.
export const CITY_WEB_ROUTE_KINDS = ["city_home", "city_guides", "city_guide", "city_places", "city_place", "city_events", "city_event", "city_meetups", "city_meetup", "city_stays", "city_stay", "city_memories", "city_downloads", "city_newsletter", "city_businesses", "city_magazine", "city_article", "city_service", "city_other", "partner", "marketing", "api_public"] as const
export const CITY_WEB_ERROR_CODES = ["client_exception", "promise_rejected", "boundary_failed", "render_failed", "route_failed", "action_failed", "proxy_failed"] as const
export type CityWebRouteKind = typeof CITY_WEB_ROUTE_KINDS[number]

export type MeasurementCity = { id: string; slug: string; name: string }
export type CityMeasurementScope = {
  city: MeasurementCity
  dateFrom: string
  dateTo: string
  from: string
  until: string
  environment: AnalyticsEnvironment
  checkedAt: string
}
export type ObservationCoverage = "observed_subset" | "no_observations" | "partial_retention" | "outside_retention"
export type CityObservationRow = { key: string; events: number; actors: number }
export type CityConversion = {
  confirmedVisits: number
  confirmedRedemptions: number
  partnerRequests: { submitted: number; qualified: number }
  web: null | {
    eventCount: number
    actorCount: number
    cityViews: number
    cityActors: number
    coverage: ObservationCoverage
    lastObservedAt: string | null
    stages: CityObservationRow[]
    channels: CityObservationRow[]
    providerDelivery: { delivered: number; pending: number; failed: number }
  }
}
export type CityVital = {
  metric: "LCP" | "INP" | "CLS" | "TTFB" | "FCP"
  device: "mobile" | "desktop" | "unknown"
  routeKind: CityWebRouteKind
  sampleCount: number
  p75: number | null
  lastObservedAt: string | null
}
export type CityWebError = {
  kind: "client_error" | "unhandled_rejection" | "server_error"
  code: typeof CITY_WEB_ERROR_CODES[number]
  routeKind: CityWebRouteKind
  count: number
  lastObservedAt: string | null
}
export type CityWebAlert = {
  key: string
  severity: "warning" | "critical"
  state: "open" | "resolved"
  title: string
  observedValue: number | null
  threshold: number | null
  sampleCount: number | null
  lastObservedAt: string | null
}
export type CityWebOperations = {
  generatedAt: string
  lastObservedAt: string | null
  coverage: "observed_subset" | "no_observations"
  vitals: CityVital[]
  errors: CityWebError[]
  alerts: CityWebAlert[]
  limitations: string[]
}
export type CityMeasurementSource<T> =
  | { state: "ready" | "empty"; data: T }
  | { state: "setup_required" | "unavailable" }
export type CityMeasurementScopeIssue = "unsupported_filters" | "window_too_long" | "invalid_window" | "unknown_city"
export type CityMeasurementResult =
  | { state: "forbidden" }
  | { state: "setup_required" }
  | { state: "unavailable" }
  | { state: "selection_required"; cities: MeasurementCity[] }
  | { state: "invalid_scope"; reason: CityMeasurementScopeIssue; cities: MeasurementCity[] }
  | {
      state: "loaded"
      cities: MeasurementCity[]
      scope: CityMeasurementScope
      conversion: CityMeasurementSource<CityConversion>
      operations: CityMeasurementSource<CityWebOperations>
    }
