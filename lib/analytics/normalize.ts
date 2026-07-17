import type {
  AnalyticsAvailability,
  AnalyticsBreakdownTable,
  AnalyticsDataQuality,
  AnalyticsFilterOption,
  AnalyticsFilterOptions,
  AnalyticsFreshness,
  AnalyticsFreshnessSource,
  AnalyticsKpiCard,
  AnalyticsMetricDefinition,
  AnalyticsMetricUnit,
  AnalyticsSection,
  AnalyticsSectionKey,
  AnalyticsSensitivity,
  AnalyticsTableColumn,
  AnalyticsTableRow,
  AnalyticsTimeSeries,
  AnalyticsTimeSeriesPoint,
  BusinessAnalyticsFilters,
  BusinessAnalyticsPayloadV1,
} from "./contracts"

const SECTION_KEYS: AnalyticsSectionKey[] = [
  "overview",
  "acquisition",
  "product",
  "retention",
  "revenueProfit",
  "partners",
  "dataQuality",
]

const METRIC_UNITS = new Set<AnalyticsMetricUnit>([
  "count",
  "percent",
  "percentage_points",
  "currency_eur",
  "ratio",
  "days",
  "hours",
  "minutes",
  "seconds",
  "text",
])

const QUALITY_VALUES = new Set<AnalyticsDataQuality>([
  "verified",
  "estimated",
  "provisional",
  "partial",
  "unverified",
  "missing",
])

export class AnalyticsPayloadContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AnalyticsPayloadContractError"
  }
}

export function createEmptyBusinessAnalyticsPayload(
  filters: BusinessAnalyticsFilters,
  now = new Date(),
  caveat?: string,
): BusinessAnalyticsPayloadV1 {
  return {
    schemaVersion: "1",
    generatedAt: now.toISOString(),
    status: "empty",
    filters,
    freshness: {
      status: "missing",
      asOf: null,
      staleAfter: null,
      sources: [],
    },
    filterOptions: emptyFilterOptions(),
    sections: emptySections(),
    definitions: [],
    caveats: caveat ? [caveat] : [],
  }
}

export function normalizeBusinessAnalyticsPayload(
  input: unknown,
  filters: BusinessAnalyticsFilters,
  now = new Date(),
): BusinessAnalyticsPayloadV1 {
  const payload = unwrapPayload(input)

  if (!payload) {
    throw new AnalyticsPayloadContractError("Analytics payload is missing")
  }

  const schemaVersion = payload.schemaVersion ?? payload.schema_version
  if (schemaVersion !== "1" && schemaVersion !== 1) {
    throw new AnalyticsPayloadContractError("Unsupported analytics schema version")
  }
  const generatedAt = isoTimestamp(payload.generatedAt ?? payload.generated_at)
  if (!generatedAt) {
    throw new AnalyticsPayloadContractError("Analytics generated_at is missing or invalid")
  }

  const sections = normalizeSections(payload)
  const hasContent = SECTION_KEYS.some((key) => {
    const section = sections[key]
    return section.kpis.length > 0 || section.series.length > 0 || section.tables.length > 0
  })
  const requestedStatus = safeString(payload.status, 24)
  const status =
    requestedStatus === "partial"
      ? "partial"
      : requestedStatus === "empty"
        ? hasContent
          ? "partial"
          : "empty"
        : requestedStatus === "ready" && hasContent
          ? "ready"
          : hasContent
            ? "partial"
            : "empty"

  return {
    schemaVersion: "1",
    generatedAt,
    status,
    filters,
    freshness: normalizeFreshness(payload.freshness),
    filterOptions: normalizeFilterOptions(
      payload.filterOptions ?? payload.filter_options,
    ),
    sections,
    definitions: uniqueBy(
      array(payload.definitions).map(normalizeDefinition).filter(isPresent),
      (definition) => `${definition.key}:${definition.version}`,
    ),
    caveats: stringArray(payload.caveats, 12, 320),
  }
}

export function redactFinanceData(
  payload: BusinessAnalyticsPayloadV1,
): BusinessAnalyticsPayloadV1 {
  const sections = Object.fromEntries(
    SECTION_KEYS.map((key) => {
      if (key === "revenueProfit") {
        return [key, emptySection()]
      }

      const section = payload.sections[key]
      return [
        key,
        {
          ...section,
          kpis: section.kpis.filter((item) => item.sensitivity !== "finance"),
          series: section.series.filter(
            (item) => item.sensitivity !== "finance",
          ),
          tables: section.tables.filter(
            (item) => item.sensitivity !== "finance",
          ),
          caveats: [],
        },
      ]
    }),
  ) as Record<AnalyticsSectionKey, AnalyticsSection>

  return {
    ...payload,
    sections,
    freshness: redactFinanceFreshness(payload.freshness),
    definitions: payload.definitions.filter(
      (definition) => definition.sensitivity !== "finance",
    ),
    caveats: [],
  }
}

function redactFinanceFreshness(freshness: AnalyticsFreshness): AnalyticsFreshness {
  const sources = freshness.sources.filter(
    (source) => source.sensitivity === "business",
  )
  const status = freshnessStatusFromSources(sources)
  return {
    status,
    asOf: sources.length > 0 ? freshness.asOf : null,
    staleAfter: sources.length > 0 ? freshness.staleAfter : null,
    sources,
  }
}

export function formatAnalyticsValue(
  value: number | null,
  unit: AnalyticsMetricUnit,
  formattedValue?: string | null,
) {
  if (value === null || !Number.isFinite(value)) return "Noch nicht messbar"
  if (formattedValue) return formattedValue

  switch (unit) {
    case "currency_eur":
      return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
      }).format(value)
    case "percent":
    case "percentage_points":
      return `${formatNumber(value, 1)} %`
    case "ratio":
      return `${formatNumber(value, 2)}×`
    case "days":
      return `${formatNumber(value, 1)} Tage`
    case "hours":
      return `${formatNumber(value, 1)} Std.`
    case "minutes":
      return `${formatNumber(value, 1)} Min.`
    case "seconds":
      return `${formatNumber(value, 1)} Sek.`
    case "text":
      return String(value)
    default:
      return formatNumber(value, Math.abs(value) < 10 ? 1 : 0)
  }
}

function normalizeSections(
  payload: Record<string, unknown>,
): Record<AnalyticsSectionKey, AnalyticsSection> {
  const result = emptySections()
  const sectionRecord = record(payload.sections)

  for (const key of SECTION_KEYS) {
    const aliases = sectionAliases(key)
    const source = aliases.map((alias) => sectionRecord[alias]).find(isRecord)
    result[key] = normalizeSection(source)
  }

  for (const item of array(payload.kpis)) {
    const itemRecord = record(item)
    const normalized = normalizeKpi(item)
    const key = normalizeSectionKey(itemRecord.section)
    if (normalized && key) result[key].kpis.push(normalized)
  }

  for (const item of array(payload.series ?? payload.time_series)) {
    const itemRecord = record(item)
    const normalized = normalizeSeries(item)
    const key = normalizeSectionKey(itemRecord.section)
    if (normalized && key) result[key].series.push(normalized)
  }

  for (const item of array(payload.tables ?? payload.breakdowns)) {
    const itemRecord = record(item)
    const normalized = normalizeTable(item)
    const key = normalizeSectionKey(itemRecord.section)
    if (normalized && key) result[key].tables.push(normalized)
  }

  for (const key of SECTION_KEYS) {
    const section = result[key]
    result[key] = {
      ...section,
      kpis: uniqueBy(section.kpis, (item) => item.key),
      series: uniqueBy(section.series, (item) => item.key),
      tables: uniqueBy(section.tables, (item) => item.key),
      caveats: [...new Set(section.caveats)],
    }
  }

  return result
}

function normalizeSection(input: unknown): AnalyticsSection {
  const value = record(input)
  return {
    kpis: array(value.kpis).map(normalizeKpi).filter(isPresent),
    series: array(value.series ?? value.time_series)
      .map(normalizeSeries)
      .filter(isPresent),
    tables: array(value.tables ?? value.breakdowns)
      .map(normalizeTable)
      .filter(isPresent),
    caveats: stringArray(value.caveats, 8, 280),
  }
}

function normalizeKpi(input: unknown): AnalyticsKpiCard | null {
  const value = record(input)
  const key = safeKey(value.key ?? value.metric_key)
  const label = safeString(value.label ?? value.title, 100)
  if (!key || !label) return null

  const metricValue = finiteNumberOrNull(value.value)
  const requestedAvailability = safeString(value.availability ?? value.status, 32)
  const availability: AnalyticsAvailability =
    requestedAvailability === "provisional"
      ? "provisional"
      : requestedAvailability === "not_measurable" || metricValue === null
        ? "not_measurable"
        : "available"
  const delta = finiteNumberOrNull(value.delta)
  const quality =
    availability === "provisional" ? "provisional" : dataQuality(value.quality)

  return {
    key,
    label,
    value: metricValue,
    formattedValue: safeString(value.formattedValue ?? value.formatted_value, 64),
    unit: metricUnit(value.unit),
    comparisonValue: finiteNumberOrNull(
      value.comparisonValue ?? value.comparison_value,
    ),
    delta,
    deltaUnit: metricUnit(value.deltaUnit ?? value.delta_unit ?? "percent"),
    deltaDirection:
      value.deltaDirection === "up" || value.delta_direction === "up"
        ? "up"
        : value.deltaDirection === "down" || value.delta_direction === "down"
          ? "down"
          : delta === 0
            ? "flat"
            : delta === null
              ? "unknown"
              : delta > 0
                ? "up"
                : "down",
    definition:
      safeString(value.definition, 360) ?? "Definition ist noch nicht hinterlegt.",
    source: safeString(value.source, 160) ?? "Quelle noch nicht hinterlegt",
    asOf: isoTimestamp(value.asOf ?? value.as_of),
    quality,
    availability,
    sensitivity: sensitivity(value.sensitivity),
  }
}

function normalizeSeries(input: unknown): AnalyticsTimeSeries | null {
  const value = record(input)
  const key = safeKey(value.key)
  const title = safeString(value.title ?? value.label, 120)
  if (!key || !title) return null

  return {
    key,
    title,
    description: safeString(value.description, 240),
    unit: metricUnit(value.unit),
    points: array(value.points).map(normalizePoint).filter(isPresent).slice(0, 400),
    source: safeString(value.source, 160) ?? "Quelle noch nicht hinterlegt",
    asOf: isoTimestamp(value.asOf ?? value.as_of),
    quality: dataQuality(value.quality),
    sensitivity: sensitivity(value.sensitivity),
  }
}

function normalizePoint(input: unknown): AnalyticsTimeSeriesPoint | null {
  const value = record(input)
  const date = safeString(value.date ?? value.period, 32)
  if (!date) return null
  return {
    date,
    label: safeString(value.label, 48),
    value: finiteNumberOrNull(value.value),
    comparisonValue: finiteNumberOrNull(
      value.comparisonValue ?? value.comparison_value,
    ),
  }
}

function normalizeTable(input: unknown): AnalyticsBreakdownTable | null {
  const value = record(input)
  const key = safeKey(value.key)
  const title = safeString(value.title ?? value.label, 120)
  if (!key || !title) return null
  const columns = array(value.columns)
    .map(normalizeColumn)
    .filter(isPresent)
    .slice(0, 12)

  return {
    key,
    title,
    description: safeString(value.description, 240),
    columns,
    rows: uniqueBy(
      array(value.rows)
        .map((row) => normalizeRow(row, columns))
        .filter(isPresent),
      (row) => row.id,
    ).slice(0, 250),
    source: safeString(value.source, 160) ?? "Quelle noch nicht hinterlegt",
    asOf: isoTimestamp(value.asOf ?? value.as_of),
    quality: dataQuality(value.quality),
    sensitivity: sensitivity(value.sensitivity),
  }
}

function normalizeColumn(input: unknown): AnalyticsTableColumn | null {
  const value = record(input)
  const key = safeKey(value.key)
  const label = safeString(value.label, 80)
  return key && label ? { key, label, unit: metricUnit(value.unit) } : null
}

function normalizeRow(
  input: unknown,
  columns: AnalyticsTableColumn[],
): AnalyticsTableRow | null {
  const value = record(input)
  const label = safeString(value.label ?? value.name, 160)
  if (!label) return null
  const rawValues = record(value.values)
  const values = Object.fromEntries(
    columns.map((column) => [
      column.key,
      primitiveValue(rawValues[column.key] ?? value[column.key]),
    ]),
  )

  return {
    id: safeString(value.id, 128) ?? label,
    label,
    values,
    quality: value.quality ? dataQuality(value.quality) : null,
  }
}

function normalizeFreshness(input: unknown): AnalyticsFreshness {
  const value = record(input)
  const sources = array(value.sources)
    .map(normalizeFreshnessSource)
    .filter(isPresent)
  const requestedStatus = freshnessStatus(value.status)
  const derivedStatus = freshnessStatusFromSources(sources)

  return {
    status: worstFreshnessStatus(requestedStatus, derivedStatus),
    asOf: isoTimestamp(value.asOf ?? value.as_of),
    staleAfter: isoTimestamp(value.staleAfter ?? value.stale_after),
    sources,
  }
}

function normalizeFreshnessSource(input: unknown): AnalyticsFreshnessSource | null {
  const value = record(input)
  const key = safeKey(value.key)
  const label = safeString(value.label, 100)
  if (!key || !label) return null
  const status = safeString(value.status, 24)
  return {
    key,
    label,
    asOf: isoTimestamp(value.asOf ?? value.as_of),
    expectedWithinMinutes: finiteNumberOrNull(
      value.expectedWithinMinutes ?? value.expected_within_minutes,
    ),
    status:
      status === "fresh" || status === "stale" || status === "partial"
        ? status
        : "missing",
    sensitivity: sensitivity(value.sensitivity),
  }
}

function freshnessStatus(input: unknown): AnalyticsFreshness["status"] {
  return input === "fresh" || input === "stale" || input === "partial" || input === "missing"
    ? input
    : "missing"
}

function freshnessStatusFromSources(
  sources: AnalyticsFreshnessSource[],
): AnalyticsFreshness["status"] {
  if (sources.length === 0 || sources.some((source) => source.status === "missing")) {
    return "missing"
  }
  if (sources.some((source) => source.status === "stale")) return "stale"
  if (sources.some((source) => source.status === "partial")) return "partial"
  return "fresh"
}

function worstFreshnessStatus(
  left: AnalyticsFreshness["status"],
  right: AnalyticsFreshness["status"],
): AnalyticsFreshness["status"] {
  const severity: Record<AnalyticsFreshness["status"], number> = {
    fresh: 0,
    partial: 1,
    stale: 2,
    missing: 3,
  }
  return severity[left] >= severity[right] ? left : right
}

function normalizeFilterOptions(input: unknown): AnalyticsFilterOptions {
  const value = record(input)
  return {
    cities: optionArray(value.cities),
    partners: optionArray(value.partners),
    channels: optionArray(value.channels),
    plans: optionArray(value.plans),
  }
}

function optionArray(input: unknown): AnalyticsFilterOption[] {
  return uniqueBy(
    array(input)
      .map((item) => {
        if (typeof item === "string") return { id: item, label: item }
        const value = record(item)
        const id = safeString(value.id ?? value.value, 128)
        const label = safeString(value.label ?? value.name, 160)
        return id && label ? { id, label } : null
      })
      .filter(isPresent),
    (option) => option.id,
  ).slice(0, 500)
}

function normalizeDefinition(input: unknown): AnalyticsMetricDefinition | null {
  const value = record(input)
  const key = safeKey(value.key)
  const label = safeString(value.label, 120)
  if (!key || !label) return null
  return {
    key,
    label,
    formula: safeString(value.formula, 480) ?? "Noch nicht hinterlegt",
    grain: safeString(value.grain, 120) ?? "Noch nicht hinterlegt",
    source: safeString(value.source, 180) ?? "Noch nicht hinterlegt",
    owner: safeString(value.owner, 120) ?? "Noch nicht zugewiesen",
    freshnessSla:
      safeString(value.freshnessSla ?? value.freshness_sla, 120) ??
      "Noch nicht hinterlegt",
    unit: metricUnit(value.unit),
    version: safeString(value.version ?? value.definition_version, 40) ?? "v1",
    target: safeString(value.target, 120),
    sensitivity: sensitivity(value.sensitivity),
  }
}

function unwrapPayload(input: unknown): Record<string, unknown> | null {
  if (Array.isArray(input)) return unwrapPayload(input[0])
  if (!isRecord(input)) return null
  for (const key of ["payload", "result", "get_business_analytics_v1"]) {
    if (isRecord(input[key])) return input[key]
  }
  return input
}

function normalizeSectionKey(input: unknown): AnalyticsSectionKey | null {
  const value = safeString(input, 40)
  const aliases: Record<string, AnalyticsSectionKey> = {
    overview: "overview",
    acquisition: "acquisition",
    acquisition_marketing: "acquisition",
    product: "product",
    product_funnel: "product",
    retention: "retention",
    retention_clv: "retention",
    revenue: "revenueProfit",
    revenue_profit: "revenueProfit",
    revenueProfit: "revenueProfit",
    partners: "partners",
    data_quality: "dataQuality",
    dataQuality: "dataQuality",
  }
  return value ? aliases[value] ?? null : null
}

function sectionAliases(key: AnalyticsSectionKey) {
  if (key === "revenueProfit") return ["revenueProfit", "revenue_profit", "revenue"]
  if (key === "dataQuality") return ["dataQuality", "data_quality"]
  return [key]
}

function emptySections() {
  return Object.fromEntries(
    SECTION_KEYS.map((key) => [key, emptySection()]),
  ) as Record<AnalyticsSectionKey, AnalyticsSection>
}

function emptySection(): AnalyticsSection {
  return { kpis: [], series: [], tables: [], caveats: [] }
}

function emptyFilterOptions(): AnalyticsFilterOptions {
  return { cities: [], partners: [], channels: [], plans: [] }
}

function metricUnit(input: unknown): AnalyticsMetricUnit {
  return METRIC_UNITS.has(input as AnalyticsMetricUnit)
    ? (input as AnalyticsMetricUnit)
    : "text"
}

function dataQuality(input: unknown): AnalyticsDataQuality {
  return QUALITY_VALUES.has(input as AnalyticsDataQuality)
    ? (input as AnalyticsDataQuality)
    : "unverified"
}

function sensitivity(input: unknown): AnalyticsSensitivity {
  // Fail closed: only an explicit business classification may cross the
  // business-only boundary. Unknown or malformed upstream data is treated as
  // finance-sensitive so a missing DTO field can never reveal financial data.
  return input === "business" ? "business" : "finance"
}

function primitiveValue(value: unknown): string | number | boolean | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "boolean") return value
  if (typeof value === "string") return safeString(value, 180)
  return null
}

function finiteNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function formatNumber(value: number, maximumFractionDigits: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits }).format(value)
}

function isoTimestamp(value: unknown) {
  if (typeof value !== "string" || value.length > 64) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function safeKey(value: unknown) {
  const key = safeString(value, 100)
  return key && /^[a-zA-Z0-9_.:-]+$/.test(key) ? key : null
}

function safeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null
  const clean = value.trim().replace(/[\u0000-\u001f\u007f]/g, "")
  return clean.length > 0 ? clean.slice(0, maxLength) : null
}

function stringArray(input: unknown, maxItems: number, maxLength: number) {
  return array(input)
    .map((item) => safeString(item, maxLength))
    .filter(isPresent)
    .slice(0, maxItems)
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isPresent<T>(value: T | null): value is T {
  return value !== null
}

function uniqueBy<T>(items: T[], keyFor: (item: T) => string) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = keyFor(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
