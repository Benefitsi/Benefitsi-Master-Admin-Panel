import assert from "node:assert/strict"
import test from "node:test"

import { mergeAnalyticsExtension } from "../lib/analytics/merge.ts"
import { createEmptyBusinessAnalyticsPayload } from "../lib/analytics/normalize.ts"

const filters = {
  dateFrom: "2026-07-01",
  dateTo: "2026-07-30",
  compareFrom: "2026-06-01",
  compareTo: "2026-06-30",
  cityId: null,
  partnerId: null,
  channel: null,
  planCode: null,
  environment: "production",
  timezone: "Europe/Berlin",
  currency: "EUR",
}

function kpi(key, value) {
  return {
    key,
    label: key,
    value,
    formattedValue: null,
    unit: "count",
    comparisonValue: null,
    delta: null,
    deltaUnit: "percent",
    deltaDirection: "unknown",
    definition: "Verified aggregate",
    source: "analytics",
    asOf: "2026-07-30T08:00:00.000Z",
    quality: value === null ? "missing" : "verified",
    availability: value === null ? "not_measurable" : "available",
    sensitivity: "business",
  }
}

test("product analytics append to server KPIs without replacing them", () => {
  const base = createEmptyBusinessAnalyticsPayload(
    filters,
    new Date("2026-07-30T08:00:00.000Z"),
  )
  base.status = "partial"
  base.sections.product.kpis = [kpi("server_confirmed_redemptions", 3)]

  const extension = createEmptyBusinessAnalyticsPayload(
    filters,
    new Date("2026-07-30T09:00:00.000Z"),
  )
  extension.status = "partial"
  extension.sections.product.kpis = [kpi("product_events_observed", 0)]
  extension.sections.product.caveats = [
    "Test- und Staging-Fakten sind ausgeschlossen.",
  ]
  extension.freshness = {
    status: "missing",
    asOf: null,
    staleAfter: null,
    sources: [
      {
        key: "product_events",
        label: "Product Event Facts",
        asOf: null,
        expectedWithinMinutes: 2160,
        status: "missing",
        sensitivity: "business",
      },
    ],
  }

  const merged = mergeAnalyticsExtension(base, extension, [
    "product",
    "dataQuality",
  ])

  assert.deepEqual(
    merged.sections.product.kpis.map((item) => item.key),
    ["server_confirmed_redemptions", "product_events_observed"],
  )
  assert.equal(merged.sections.product.kpis[1].value, 0)
  assert.equal(merged.sections.product.kpis[1].availability, "available")
  assert.deepEqual(merged.sections.product.caveats, [
    "Test- und Staging-Fakten sind ausgeschlossen.",
  ])
  assert.equal(merged.freshness.sources[0].key, "product_events")
  assert.equal(merged.status, "partial")
  assert.equal(merged.generatedAt, "2026-07-30T09:00:00.000Z")
})

test("extension values win only for an explicitly matching metric key", () => {
  const base = createEmptyBusinessAnalyticsPayload(filters)
  const extension = createEmptyBusinessAnalyticsPayload(filters)
  base.sections.product.kpis = [kpi("product_events_observed", 9)]
  extension.sections.product.kpis = [kpi("product_events_observed", 4)]

  const merged = mergeAnalyticsExtension(base, extension, ["product"])

  assert.equal(merged.sections.product.kpis.length, 1)
  assert.equal(merged.sections.product.kpis[0].value, 4)
  assert.equal(merged.filters.environment, "production")
})
