export const ANALYTICS_ENVIRONMENTS = [
  "production",
  "staging",
  "test",
] as const

export const ANALYTICS_SECTION_KEYS = [
  "overview",
  "acquisition",
  "product",
  "retention",
  "revenueProfit",
  "partners",
  "dataQuality",
] as const

export type AnalyticsEnvironment = (typeof ANALYTICS_ENVIRONMENTS)[number]
export type AnalyticsSectionKey = (typeof ANALYTICS_SECTION_KEYS)[number]

export type AnalyticsAttributionTouchV1 = {
  channel:
    | "direct"
    | "organic_search"
    | "organic_social"
    | "paid_search"
    | "paid_social"
    | "referral"
    | "email"
    | "other"
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  campaign_id?: string
}

export type AnalyticsEventV1 = {
  schema_version: 1
  event_id: string
  event_name:
    | "signup_started"
    | "signup_completed"
    | "partner_viewed"
    | "search_performed"
    | "deal_viewed"
    | "deal_selected"
    | "paywall_viewed"
    | "checkout_started"
    | "notification_opened"
  occurred_at: string
  environment: AnalyticsEnvironment
  anonymous_id: string
  user_id?: string
  attribution?: {
    first_touch: AnalyticsAttributionTouchV1
    last_non_direct?: AnalyticsAttributionTouchV1
  }
  properties: {
    partner_id?: string
    deal_id?: string
    plan_code?: string
    city_slug?: string
    platform?: "ios" | "android" | "web"
    app_version?: string
    locale?: string
  }
}

export type BusinessAnalyticsFilters = {
  dateFrom: string
  dateTo: string
  compareFrom: string
  compareTo: string
  cityId: string | null
  partnerId: string | null
  channel: string | null
  planCode: string | null
  environment: AnalyticsEnvironment
  timezone: "Europe/Berlin"
  currency: "EUR"
}

export type AnalyticsMetricUnit =
  | "count"
  | "percent"
  | "percentage_points"
  | "currency_eur"
  | "ratio"
  | "days"
  | "hours"
  | "minutes"
  | "seconds"
  | "text"

export type AnalyticsDataQuality =
  | "verified"
  | "estimated"
  | "provisional"
  | "partial"
  | "unverified"
  | "missing"

export type AnalyticsAvailability =
  | "available"
  | "not_measurable"
  | "provisional"

export type AnalyticsSensitivity = "business" | "finance"

export type AnalyticsKpiCard = {
  key: string
  label: string
  value: number | null
  formattedValue: string | null
  unit: AnalyticsMetricUnit
  comparisonValue: number | null
  delta: number | null
  deltaUnit: AnalyticsMetricUnit
  deltaDirection: "up" | "down" | "flat" | "unknown"
  definition: string
  source: string
  asOf: string | null
  quality: AnalyticsDataQuality
  availability: AnalyticsAvailability
  sensitivity: AnalyticsSensitivity
}

export type AnalyticsTimeSeriesPoint = {
  date: string
  label: string | null
  value: number | null
  comparisonValue: number | null
}

export type AnalyticsTimeSeries = {
  key: string
  title: string
  description: string | null
  unit: AnalyticsMetricUnit
  points: AnalyticsTimeSeriesPoint[]
  source: string
  asOf: string | null
  quality: AnalyticsDataQuality
  sensitivity: AnalyticsSensitivity
}

export type AnalyticsTableColumn = {
  key: string
  label: string
  unit: AnalyticsMetricUnit
}

export type AnalyticsTableRow = {
  id: string
  label: string
  values: Record<string, string | number | boolean | null>
  quality: AnalyticsDataQuality | null
}

export type AnalyticsBreakdownTable = {
  key: string
  title: string
  description: string | null
  columns: AnalyticsTableColumn[]
  rows: AnalyticsTableRow[]
  source: string
  asOf: string | null
  quality: AnalyticsDataQuality
  sensitivity: AnalyticsSensitivity
}

export type AnalyticsSection = {
  kpis: AnalyticsKpiCard[]
  series: AnalyticsTimeSeries[]
  tables: AnalyticsBreakdownTable[]
  caveats: string[]
}

export type AnalyticsFilterOption = {
  id: string
  label: string
}

export type AnalyticsFilterOptions = {
  cities: AnalyticsFilterOption[]
  partners: AnalyticsFilterOption[]
  channels: AnalyticsFilterOption[]
  plans: AnalyticsFilterOption[]
}

export type AnalyticsFreshnessSource = {
  key: string
  label: string
  asOf: string | null
  expectedWithinMinutes: number | null
  status: "fresh" | "stale" | "missing" | "partial"
  sensitivity: AnalyticsSensitivity
}

export type AnalyticsFreshness = {
  status: "fresh" | "stale" | "missing" | "partial"
  asOf: string | null
  staleAfter: string | null
  sources: AnalyticsFreshnessSource[]
}

export type AnalyticsMetricDefinition = {
  key: string
  label: string
  formula: string
  grain: string
  source: string
  owner: string
  freshnessSla: string
  unit: AnalyticsMetricUnit
  version: string
  target: string | null
  sensitivity: AnalyticsSensitivity
}

export type BusinessAnalyticsPayloadV1 = {
  schemaVersion: "1"
  generatedAt: string
  status: "ready" | "empty" | "partial"
  filters: BusinessAnalyticsFilters
  freshness: AnalyticsFreshness
  filterOptions: AnalyticsFilterOptions
  sections: Record<AnalyticsSectionKey, AnalyticsSection>
  definitions: AnalyticsMetricDefinition[]
  caveats: string[]
}

export type AnalyticsPermissions = {
  businessAnalyticsRead: boolean
  financeRead: boolean
}
