import type {
  AnalyticsEnvironment,
  BusinessAnalyticsFilters,
} from "./contracts"

export type AnalyticsSearchParams = Record<
  string,
  string | string[] | undefined
>

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9._~-]{1,128}$/
const ALLOWED_CHANNELS = new Set([
  "direct",
  "organic_search",
  "organic_social",
  "paid_search",
  "paid_social",
  "referral",
  "email",
  "other",
  "unattributed",
])
const ALLOWED_ENVIRONMENTS = new Set<AnalyticsEnvironment>([
  "production",
  "staging",
  "test",
])
const MAX_WINDOW_DAYS = 366

export function parseBusinessAnalyticsFilters(
  searchParams: AnalyticsSearchParams,
  now = new Date(),
): BusinessAnalyticsFilters {
  const today = dateInBerlin(now)
  const defaultDateTo = today
  const defaultDateFrom = shiftIsoDate(defaultDateTo, -29)
  const requestedTo = validDate(first(searchParams.to))
  const dateTo = requestedTo && requestedTo <= today ? requestedTo : defaultDateTo
  const requestedFrom = validDate(first(searchParams.from))

  let dateFrom = requestedFrom ?? defaultDateFrom
  if (dateFrom > dateTo) {
    dateFrom = shiftIsoDate(dateTo, -29)
  }

  const windowDays = daysInclusive(dateFrom, dateTo)
  if (windowDays > MAX_WINDOW_DAYS) {
    dateFrom = shiftIsoDate(dateTo, -(MAX_WINDOW_DAYS - 1))
  }

  const compareTo = shiftIsoDate(dateFrom, -1)
  const compareFrom = shiftIsoDate(compareTo, -(daysInclusive(dateFrom, dateTo) - 1))
  const requestedEnvironment = first(searchParams.environment)
  const environment = ALLOWED_ENVIRONMENTS.has(
    requestedEnvironment as AnalyticsEnvironment,
  )
    ? (requestedEnvironment as AnalyticsEnvironment)
    : "production"

  return {
    dateFrom,
    dateTo,
    compareFrom,
    compareTo,
    cityId: safeUuid(first(searchParams.city)),
    partnerId: safeUuid(first(searchParams.partner)),
    channel: safeChannel(first(searchParams.channel)),
    planCode: safeToken(first(searchParams.plan)),
    environment,
    timezone: "Europe/Berlin",
    currency: "EUR",
  }
}

export function toBusinessAnalyticsRpcFilters(filters: BusinessAnalyticsFilters) {
  return {
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    compare_from: filters.compareFrom,
    compare_to: filters.compareTo,
    city_id: filters.cityId,
    partner_id: filters.partnerId,
    channel: filters.channel,
    plan_code: filters.planCode,
    environment: filters.environment,
    timezone: filters.timezone,
    currency: filters.currency,
  }
}

export function periodLabel(filters: BusinessAnalyticsFilters) {
  return `${formatShortDate(filters.dateFrom)}–${formatShortDate(filters.dateTo)} · Vergleich ${formatShortDate(filters.compareFrom)}–${formatShortDate(filters.compareTo)}`
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function safeUuid(value: string | undefined) {
  const clean = value?.trim()
  return clean && UUID_PATTERN.test(clean) ? clean : null
}

function safeToken(value: string | undefined) {
  const clean = value?.trim()
  return clean && SAFE_TOKEN_PATTERN.test(clean) ? clean : null
}

function safeChannel(value: string | undefined) {
  const clean = safeToken(value)
  return clean && ALLOWED_CHANNELS.has(clean) ? clean : null
}

function validDate(value: string | undefined) {
  if (!value || !DATE_PATTERN.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value
}

function dateInBerlin(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function daysInclusive(from: string, to: string) {
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime()
  const toMs = new Date(`${to}T00:00:00.000Z`).getTime()
  return Math.floor((toMs - fromMs) / 86_400_000) + 1
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`))
}
