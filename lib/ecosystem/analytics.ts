import { contractTimestampMs } from "../agent-control"
import {
  ANALYTICS_SECTION_KEYS,
  type AnalyticsBreakdownTable,
  type AnalyticsFreshness,
  type AnalyticsKpiCard,
  type AnalyticsSectionKey,
  type AnalyticsTimeSeries,
  type BusinessAnalyticsFilters,
} from "../analytics/contracts"
import type { BusinessAnalyticsLoadResult } from "../analytics/loader"
import { formatAnalyticsValue, redactFinanceData } from "../analytics/normalize"

export type OverviewAnalyticsKpi = AnalyticsKpiCard & { formatted: string }

export type OverviewAnalyticsView = {
  key: AnalyticsSectionKey
  label: string
  asOf: string | null
  kpis: OverviewAnalyticsKpi[]
  series: AnalyticsTimeSeries[]
  tables: AnalyticsBreakdownTable[]
  caveats: string[]
}

export type OverviewAnalytics = {
  state: BusinessAnalyticsLoadResult["state"]
  asOf: string | null
  kpis: OverviewAnalyticsKpi[]
  series: AnalyticsTimeSeries | null
  caveats: string[]
  views: OverviewAnalyticsView[]
  period: Pick<BusinessAnalyticsFilters, "dateFrom" | "dateTo" | "environment"> | null
  freshness: AnalyticsFreshness | null
}

export type OverviewGoals = {
  state: BusinessAnalyticsLoadResult["state"]
  items: { id: string; key: string; version: string; label: string; target: string; source: string; asOf: string | null }[]
}

const sectionLabels: Record<AnalyticsSectionKey, string> = {
  overview: "Überblick",
  engagement: "Nutzeraktivität",
  acquisition: "Akquisition",
  product: "Produktnutzung",
  retention: "Kundenbindung",
  revenueProfit: "Umsatz & Gewinn",
  partners: "Partner",
  dataQuality: "Datenqualität",
}

/** Run on the server: permissions are applied before constructing any client props. */
export function selectOverviewAnalytics(result: BusinessAnalyticsLoadResult): OverviewAnalytics {
  if (!("payload" in result)) return emptyAnalytics(result.state)
  if (!result.permissions.businessAnalyticsRead) return emptyAnalytics("forbidden")

  const payload = result.permissions.financeRead ? result.payload : redactFinanceData(result.payload)
  const freshness: AnalyticsFreshness = {
    ...payload.freshness,
    asOf: validTimestamp(payload.freshness.asOf),
    staleAfter: validTimestamp(payload.freshness.staleAfter),
    sources: payload.freshness.sources.map(source => ({
      ...source,
      asOf: validTimestamp(source.asOf),
      expectedWithinMinutes: finiteValue(source.expectedWithinMinutes),
    })),
  }
  const caveats = [...payload.caveats]
  if (freshness.status === "stale") caveats.push("Der Datenstand ist veraltet.")
  if (freshness.status === "missing") caveats.push("Ein aktueller Datenstand ist nicht nachgewiesen.")
  if (freshness.status === "partial") caveats.push("Die Datenquellen sind nur teilweise aktuell oder verfügbar.")

  const views = ANALYTICS_SECTION_KEYS
    .filter(key => result.permissions.financeRead || key !== "revenueProfit")
    .map(key => {
      const section = payload.sections[key]
      const kpis = section.kpis.map(selectKpi)
      const series = section.series.map(selectSeries)
      const tables = section.tables.map(selectTable)
      const timestamps = [...kpis, ...series, ...tables]
        .map(item => item.asOf).filter((value): value is string => value !== null)
        .sort((left, right) => Date.parse(left) - Date.parse(right))
      return {
        key, label: sectionLabels[key], asOf: timestamps[0] ?? null, kpis, series, tables,
        caveats: [...new Set([...caveats, ...section.caveats])],
      }
    })

  // Retain the compact overview contract for existing server consumers.
  const overview = views.filter(view => view.key === "overview" || view.key === "engagement")
  const kpis = [...new Map(overview.flatMap(view => view.kpis).map(item => [item.key, item])).values()].slice(0, 4)
  const series = overview.flatMap(view => view.series).find(item => item.points.some(point => point.value !== null)) ?? null
  return {
    state: result.state,
    asOf: freshness.asOf ?? series?.asOf ?? kpis.find(item => item.asOf !== null)?.asOf ?? null,
    kpis, series,
    caveats: [...new Set([...caveats, ...overview.flatMap(view => view.caveats)])],
    views,
    period: { dateFrom: payload.filters.dateFrom, dateTo: payload.filters.dateTo, environment: payload.filters.environment },
    freshness,
  }
}

/** Definition targets are authored goals, not measured progress. */
export function selectOverviewGoals(result: BusinessAnalyticsLoadResult): OverviewGoals {
  if (!("payload" in result)) return { state: result.state, items: [] }
  if (!result.permissions.businessAnalyticsRead) return { state: "forbidden", items: [] }
  const payload = result.permissions.financeRead ? result.payload : redactFinanceData(result.payload)
  const items = payload.definitions.flatMap(definition => {
    const target = definition.target?.trim()
    if (!target) return []
    return [{
      id: `${encodeURIComponent(definition.key)}:${encodeURIComponent(definition.version)}`,
      version: definition.version,
      key: definition.key, label: definition.label, target, source: definition.source,
      // The definition contract does not provide an observation timestamp.
      asOf: null,
    }]
  })
  return { state: items.length ? result.state === "partial" ? "partial" : "ready" : "empty", items }
}

function selectKpi(item: AnalyticsKpiCard): OverviewAnalyticsKpi {
  const value = item.availability === "not_measurable" ? null : finiteValue(item.value)
  return {
    ...item, value,
    comparisonValue: finiteValue(item.comparisonValue), delta: finiteValue(item.delta),
    asOf: validTimestamp(item.asOf),
    formatted: formatAnalyticsValue(value, item.unit, item.formattedValue),
    quality: value === null ? "missing" : item.quality,
  }
}

function selectSeries(item: AnalyticsTimeSeries): AnalyticsTimeSeries {
  return {
    ...item, asOf: validTimestamp(item.asOf),
    points: item.points.map(point => ({
      ...point, value: finiteValue(point.value), comparisonValue: finiteValue(point.comparisonValue),
    })),
  }
}

function selectTable(item: AnalyticsBreakdownTable): AnalyticsBreakdownTable {
  return {
    ...item, asOf: validTimestamp(item.asOf),
    columns: item.columns.map(column => ({ ...column })),
    rows: item.rows.map(row => ({
      ...row,
      values: Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, typeof value === "number" ? finiteValue(value) : value])),
    })),
  }
}

function emptyAnalytics(state: OverviewAnalytics["state"]): OverviewAnalytics {
  return { state, asOf: null, kpis: [], series: null, caveats: [], views: [], period: null, freshness: null }
}

function finiteValue(value: number | null) { return typeof value === "number" && Number.isFinite(value) ? value : null }
function validTimestamp(value: string | null) { return contractTimestampMs(value) === null ? null : value }
