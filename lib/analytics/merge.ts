import type {
  AnalyticsFreshness,
  AnalyticsFreshnessSource,
  AnalyticsSection,
  AnalyticsSectionKey,
  BusinessAnalyticsPayloadV1,
} from "./contracts"

export function mergeAnalyticsExtension(
  base: BusinessAnalyticsPayloadV1,
  extension: BusinessAnalyticsPayloadV1,
  sectionKeys: AnalyticsSectionKey[],
): BusinessAnalyticsPayloadV1 {
  const sections = { ...base.sections }
  for (const key of sectionKeys) {
    sections[key] = mergeSection(base.sections[key], extension.sections[key])
  }

  return {
    ...base,
    status: mergePayloadStatus(base.status, extension.status),
    generatedAt: latestTimestamp(base.generatedAt, extension.generatedAt),
    freshness: mergeFreshness(base.freshness, extension.freshness),
    filterOptions: {
      cities: mergeOptions(
        base.filterOptions.cities,
        extension.filterOptions.cities,
      ),
      partners: mergeOptions(
        base.filterOptions.partners,
        extension.filterOptions.partners,
      ),
      channels: mergeOptions(
        base.filterOptions.channels,
        extension.filterOptions.channels,
      ),
      plans: mergeOptions(
        base.filterOptions.plans,
        extension.filterOptions.plans,
      ),
    },
    sections,
    definitions: uniqueBy(
      [...base.definitions, ...extension.definitions],
      (definition) => `${definition.key}:${definition.version}`,
    ),
    caveats: [...new Set([...base.caveats, ...extension.caveats])],
  }
}

function mergeSection(
  base: AnalyticsSection,
  extension: AnalyticsSection,
): AnalyticsSection {
  return {
    kpis: uniqueBy([...base.kpis, ...extension.kpis], (item) => item.key),
    series: uniqueBy([...base.series, ...extension.series], (item) => item.key),
    tables: uniqueBy([...base.tables, ...extension.tables], (item) => item.key),
    caveats: [...new Set([...base.caveats, ...extension.caveats])],
  }
}

function mergeFreshness(
  base: AnalyticsFreshness,
  extension: AnalyticsFreshness,
): AnalyticsFreshness {
  const sources = uniqueBy(
    [...base.sources, ...extension.sources],
    (source) => source.key,
  )

  return {
    status: freshnessStatus(sources),
    asOf: oldestTimestamp(
      sources.map((source) => source.asOf).filter(isTimestamp),
    ),
    staleAfter: oldestTimestamp(
      [base.staleAfter, extension.staleAfter].filter(isTimestamp),
    ),
    sources,
  }
}

function freshnessStatus(sources: AnalyticsFreshnessSource[]) {
  if (sources.length === 0) return "missing" as const
  if (sources.every((source) => source.status === "fresh")) {
    return "fresh" as const
  }
  if (sources.every((source) => source.status === "missing")) {
    return "missing" as const
  }
  if (sources.some((source) => source.status === "partial")) {
    return "partial" as const
  }
  if (sources.some((source) => source.status === "stale")) {
    return "stale" as const
  }
  return "partial" as const
}

function mergePayloadStatus(
  base: BusinessAnalyticsPayloadV1["status"],
  extension: BusinessAnalyticsPayloadV1["status"],
) {
  if (base === "ready" && extension === "ready") return "ready" as const
  if (base === "empty" && extension === "empty") return "empty" as const
  return "partial" as const
}

function mergeOptions<T extends { id: string }>(base: T[], extension: T[]) {
  return uniqueBy([...base, ...extension], (option) => option.id)
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const values = new Map<string, T>()
  for (const item of items) {
    values.set(key(item), item)
  }
  return [...values.values()]
}

function latestTimestamp(left: string, right: string) {
  return Date.parse(right) > Date.parse(left) ? right : left
}

function oldestTimestamp(values: string[]) {
  if (values.length === 0) return null
  return values.reduce((oldest, value) =>
    Date.parse(value) < Date.parse(oldest) ? value : oldest,
  )
}

function isTimestamp(value: string | null): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}
