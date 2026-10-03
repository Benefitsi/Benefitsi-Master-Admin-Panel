import assert from "node:assert/strict"
import test from "node:test"
import { buildAgentSummaries, selectOverviewAnalytics } from "../lib/ecosystem/overview.ts"
import { parseBusinessAnalyticsFilters } from "../lib/analytics/filters.ts"
import { normalizeBusinessAnalyticsPayload } from "../lib/analytics/normalize.ts"

const checkedAt = "2026-10-02T10:00:00Z"
const profile = (changes = {}) => ({
  id: "ben", scope: "benefitsi", purpose: "Koordiniert freigegebene Aufträge.",
  provider: "provider", model: "observed-model", citySlug: null, automation: "scheduled",
  contextFiles: [], contextHealth: "ok", runtimeHealth: "ok",
  schedules: [{ id: "worker", source: "launchd", enabled: true, cadence: "Alle 30 Minuten", lastRunAt: "2026-10-02T09:00:00Z", lastStatus: "queue_empty" }],
  ...changes,
})
const control = (changes = {}) => ({
  checkedAt, runtime: { state: "fresh", snapshot: { schemaVersion: 1, hostId: "m1-benefitsi", observedAt: checkedAt, collectorVersion: "1", profiles: [profile()] } },
  cities: { state: "unavailable", items: [] }, citySchedules: { state: "unavailable", items: [] },
  pipeline: { state: "unavailable", item: null }, ...changes,
})
const filters = parseBusinessAnalyticsFilters({}, new Date(checkedAt))
const kpi = (key, changes = {}) => ({
  key, label: key, value: 3, unit: "count", quality: "verified", availability: "available", sensitivity: "business", ...changes,
})
const series = (key, values, changes = {}) => ({
  key, title: key, unit: "count", sensitivity: "business", quality: "verified", asOf: "2026-10-01T18:00:00Z",
  points: values.map((value, index) => ({ date: `2026-09-${String(index + 1).padStart(2, "0")}`, value, comparisonValue: null })), ...changes,
})
const analytics = (sections = {}, changes = {}) => ({
  state: "ready", permissions: { businessAnalyticsRead: true, financeRead: true },
  payload: normalizeBusinessAnalyticsPayload({
    schemaVersion: "1", generatedAt: checkedAt, status: "ready",
    freshness: { status: "fresh", asOf: "2026-10-01T18:00:00Z", sources: [] }, sections,
  }, filters), ...changes,
})

test("missing runtime keeps configured Benefitsi roles visible without inventing healthy or running agents", () => {
  const result = buildAgentSummaries(control({ runtime: { state: "unavailable", snapshot: null } }))
  assert.ok(result.some(item => item.id === "ben"))
  assert.ok(result.some(item => item.id === "benefitsi-menu"))
  assert.ok(result.every(item => item.scope === "benefitsi" && item.status === "unknown" && item.lastRunAt === null && item.model === null))
  assert.equal(result.some(item => item.id === "nova"), false)
  assert.ok(result.every(item => !item.href.startsWith("/api/")))
})

test("observed roles replace configured cards and keep non-Benefitsi profiles", () => {
  const data = control()
  data.runtime.snapshot.profiles.push(profile({ id: "nova", scope: "general", automation: "manual", runtimeHealth: "unknown", schedules: [] }))
  const result = buildAgentSummaries(data)
  assert.equal(result.filter(item => item.id === "ben").length, 1)
  assert.equal(result.find(item => item.id === "ben").model, "observed-model")
  assert.equal(result.find(item => item.id === "ben").lastRunAt, "2026-10-02T09:00:00Z")
  assert.equal(result.find(item => item.id === "ben").status, "ok")
  assert.equal(result.find(item => item.id === "nova").scope, "general")
  assert.equal(result.find(item => item.id === "nova").status, "unknown")
})

test("stale snapshots cannot present their old successful run as current health", () => {
  const data = control()
  data.runtime.state = "stale"
  const ben = buildAgentSummaries(data).find(item => item.id === "ben")
  assert.equal(ben.status, "stale")
  assert.equal(ben.lastRunAt, "2026-10-02T09:00:00Z")
  data.runtime.state = "invalid"
  assert.equal(buildAgentSummaries(data).find(item => item.id === "ben").model, null)
})

test("missing context and failed runs require attention; unknown evidence never becomes healthy", () => {
  for (const changes of [{ contextHealth: "missing" }, { contextHealth: "over_limit" }, { runtimeHealth: "failed" }]) {
    const data = control()
    data.runtime.snapshot.profiles = [profile(changes)]
    assert.equal(buildAgentSummaries(data).find(item => item.id === "ben").status, "attention")
  }
  const data = control()
  data.runtime.snapshot.profiles = [profile({ runtimeHealth: "unknown", schedules: [] })]
  assert.equal(buildAgentSummaries(data).find(item => item.id === "ben").status, "unknown")
})

test("a city control adds its registered profile without treating city health as runtime evidence", () => {
  const data = control({ cities: { state: "available", items: [{ cityId: "city-2", cityName: "Landau", cityProfile: "city-landau", orchestratorProfile: "ben", healthStatus: "ok" }] } })
  const result = buildAgentSummaries(data)
  const city = result.find(item => item.id === "city-landau")
  assert.ok(city)
  assert.equal(city.status, "unknown")
  assert.equal(city.lastRunAt, null)
  assert.equal(result.filter(item => item.id === "ben").length, 1)
})

test("unavailable and forbidden analytics do not manufacture zero metrics or a series", () => {
  for (const state of ["unavailable", "setup_required", "forbidden"]) {
    const result = selectOverviewAnalytics({ state, permissions: null })
    assert.equal(result.state, state)
    assert.equal(result.asOf, null)
    assert.deepEqual(result.kpis, [])
    assert.equal(result.series, null)
  }
})

test("zero remains measured while null and unmeasurable metrics stay unknown", () => {
  const result = selectOverviewAnalytics(analytics({ overview: { kpis: [
    kpi("zero", { value: 0 }), kpi("missing", { value: null, formattedValue: "0" }),
    kpi("blocked", { value: 12, availability: "not_measurable" }),
  ] } }))
  assert.equal(result.kpis.find(item => item.key === "zero").formatted, "0")
  assert.equal(result.kpis.find(item => item.key === "zero").quality, "verified")
  assert.equal(result.kpis.find(item => item.key === "missing").value, null)
  assert.equal(result.kpis.find(item => item.key === "missing").quality, "missing")
  assert.notEqual(result.kpis.find(item => item.key === "missing").formatted, "0")
  assert.equal(result.kpis.find(item => item.key === "blocked").value, null)
  assert.equal(result.kpis.find(item => item.key === "blocked").quality, "missing")
})

test("business-only analytics removes finance metrics, series and unsafe free-text caveats", () => {
  const source = analytics({
    overview: { kpis: [kpi("revenue", { sensitivity: "finance" }), kpi("users")], series: [series("revenue", [900], { sensitivity: "finance" })], caveats: ["Private revenue: 900 EUR"] },
    engagement: { series: [series("visits", [0, null, 5])] },
  }, { permissions: { businessAnalyticsRead: true, financeRead: false } })
  source.payload.caveats = ["Private profit: 300 EUR"]
  const result = selectOverviewAnalytics(source)
  assert.deepEqual(result.kpis.map(item => item.key), ["users"])
  assert.equal(result.series.key, "visits")
  assert.equal(JSON.stringify(result).includes("Private"), false)
  const denied = selectOverviewAnalytics({ ...source, permissions: { businessAnalyticsRead: false, financeRead: true } })
  assert.equal(denied.state, "forbidden")
  assert.deepEqual(denied.kpis, [])
})

test("series selection falls back to engagement, preserving null gaps and finite values", () => {
  const source = analytics({ overview: { series: [series("empty", [null, null])] }, engagement: { series: [series("visits", [0, null, 5])] } })
  source.payload.sections.engagement.series[0].points.push({ date: "2026-09-04", label: null, value: Infinity, comparisonValue: NaN })
  const before = structuredClone(source)
  const result = selectOverviewAnalytics(source)
  assert.equal(result.series.key, "visits")
  assert.deepEqual(result.series.points.map(item => item.value), [0, null, 5, null])
  assert.equal(result.series.points[3].comparisonValue, null)
  assert.deepEqual(source, before)
  assert.equal(selectOverviewAnalytics(analytics({ overview: { series: [series("empty", [null, null])] } })).series, null)
})

test("analytics observation time never falls back to the newly generated response time", () => {
  const source = analytics({ overview: { kpis: [kpi("users")] } })
  source.payload.freshness.asOf = null
  source.payload.freshness.status = "missing"
  assert.equal(selectOverviewAnalytics(source).asOf, null)
  source.payload.freshness.asOf = "2026-09-01T18:00:00Z"
  source.payload.freshness.status = "stale"
  const result = selectOverviewAnalytics(source)
  assert.equal(result.asOf, "2026-09-01T18:00:00Z")
  assert.ok(result.caveats.length > 0)
})
