import type { BusinessAnalyticsFilters } from "./contracts"

export function cityMeasurementWindow(filters: BusinessAnalyticsFilters):
  | { state: "ready"; from: string; until: string }
  | { state: "unsupported_filters" | "window_too_long" | "invalid_window" } {
  if (filters.partnerId || filters.channel || filters.planCode) return { state: "unsupported_filters" }
  if (!validDate(filters.dateFrom) || !validDate(filters.dateTo) || filters.dateFrom > filters.dateTo ||
    !["production", "staging", "test"].includes(filters.environment) || filters.timezone !== "Europe/Berlin") {
    return { state: "invalid_window" }
  }
  const days = (Date.parse(filters.dateTo) - Date.parse(filters.dateFrom)) / 86_400_000 + 1
  if (days > 90) return { state: "window_too_long" }
  const nextDay = new Date(Date.parse(`${filters.dateTo}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10)
  return { state: "ready", from: berlinMidnight(filters.dateFrom), until: berlinMidnight(nextDay) }
}

export function cityMeasurementHref(filters: BusinessAnalyticsFilters, cityId: string, reset = false) {
  const params = new URLSearchParams({ city: cityId, environment: filters.environment })
  if (!reset) {
    params.set("from", filters.dateFrom)
    params.set("to", filters.dateTo)
  }
  return `/analytics?${params.toString()}#city-measurement`
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function berlinMidnight(day: string) {
  const utc = Date.parse(`${day}T00:00:00.000Z`)
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utc))
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const offset = Number(values.hour) * 3600 + Number(values.minute) * 60 + Number(values.second)
  return new Date(utc - offset * 1000).toISOString()
}
