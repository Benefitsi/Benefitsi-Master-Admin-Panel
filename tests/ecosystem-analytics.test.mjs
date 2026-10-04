import assert from "node:assert/strict"
import test from "node:test"
import { act, createElement as h } from "react"
import { JSDOM } from "jsdom"
import * as model from "../lib/ecosystem/analytics.ts"
import { parseBusinessAnalyticsFilters } from "../lib/analytics/filters.ts"
import { createEmptyBusinessAnalyticsPayload } from "../lib/analytics/normalize.ts"
import { loadTypescript } from "./helpers/load-typescript.mjs"

const observedAt = "2026-10-02T10:00:00Z"
const sectionKeys = ["overview", "engagement", "acquisition", "product", "retention", "revenueProfit", "partners", "dataQuality"]
const kpi = (key, changes = {}) => ({
  key, label: key, value: 7, formattedValue: null, unit: "count", comparisonValue: null,
  delta: null, deltaUnit: "count", deltaDirection: "unknown", definition: "Bestätigte Messung",
  source: "Produktmessung", asOf: observedAt, quality: "verified", availability: "available",
  sensitivity: "business", ...changes,
})
const series = (key, values, changes = {}) => ({
  key, title: key, description: "Beobachteter Verlauf", unit: "count", source: "Produktmessung",
  asOf: observedAt, quality: "verified", sensitivity: "business",
  points: values.map((value, index) => ({ date: `2026-09-${String(index + 1).padStart(2, "0")}`, label: null, value, comparisonValue: null })),
  ...changes,
})
const table = (key, changes = {}) => ({
  key, title: key, description: null, columns: [{ key: "count", label: "Anzahl", unit: "count" }],
  rows: [{ id: "one", label: "Bestätigt", values: { count: 4 }, quality: "verified" }],
  source: "Produktmessung", asOf: observedAt, quality: "verified", sensitivity: "business", ...changes,
})
const definition = (key, target, changes = {}) => ({
  key, label: key, target, formula: "Beobachtete Summe", grain: "day", source: "Kennzahlenkatalog",
  owner: "Benefitsi", freshnessSla: "Täglich", unit: "count", version: "1", sensitivity: "business", ...changes,
})
function analytics(sections = {}, changes = {}) {
  const filters = parseBusinessAnalyticsFilters({ from: "2026-09-01", to: "2026-09-30" }, new Date(observedAt))
  const payload = createEmptyBusinessAnalyticsPayload(filters, new Date(observedAt))
  payload.status = "ready"
  payload.freshness = {
    status: "fresh", asOf: observedAt, staleAfter: null,
    sources: [{ key: "product", label: "Produktmessung", asOf: observedAt, expectedWithinMinutes: 60, status: "fresh", sensitivity: "business" }],
  }
  for (const [key, values] of Object.entries(sections)) Object.assign(payload.sections[key], values)
  return { state: "ready", permissions: { businessAnalyticsRead: true, financeRead: true }, payload, ...changes }
}

test("every analytics section carries its own metrics, sources and breakdowns into the client model", () => {
  const source = analytics(Object.fromEntries(sectionKeys.map(key => [key, {
    kpis: [kpi(`${key}-metric`)], series: [series(`${key}-series`, [0, null, 5])],
    tables: [table(`${key}-table`)], caveats: [`${key}: Unvollständige Abdeckung`],
  }])))
  const before = structuredClone(source)
  const result = model.selectOverviewAnalytics(source)
  assert.ok(Array.isArray(result.views), "the client model must expose selectable section data")
  assert.deepEqual(result.views.map(view => view.key), sectionKeys)
  for (const view of result.views) {
    assert.equal(view.kpis[0].key, `${view.key}-metric`)
    assert.equal(view.kpis[0].source, "Produktmessung")
    assert.equal(view.kpis[0].asOf, observedAt)
    assert.equal(view.series[0].key, `${view.key}-series`)
    assert.equal(view.tables[0].rows[0].values.count, 4)
    assert.ok(view.caveats.includes(`${view.key}: Unvollständige Abdeckung`))
  }
  assert.deepEqual(source, before)
  assert.equal(result.period.dateFrom, "2026-09-01")
  assert.equal(result.period.dateTo, "2026-09-30")
})

test("finance permissions remove sensitive content from every serialized section before rendering", () => {
  const source = analytics(Object.fromEntries(sectionKeys.map(key => [key, {
    kpis: [kpi("public"), kpi("PRIVATE-kpi", { sensitivity: "finance" })],
    series: [series("PRIVATE-series", [999], { sensitivity: "finance" })],
    tables: [table("PRIVATE-table", { sensitivity: "finance" })], caveats: ["PRIVATE-section-note"],
  }])), { permissions: { businessAnalyticsRead: true, financeRead: false } })
  source.payload.caveats = ["PRIVATE-note"]
  source.payload.freshness.sources.push({ key: "PRIVATE-source", label: "PRIVATE-source", asOf: observedAt, expectedWithinMinutes: 60, status: "fresh", sensitivity: "finance" })
  const result = model.selectOverviewAnalytics(source)
  assert.ok(Array.isArray(result.views))
  assert.equal(result.views.some(view => view.key === "revenueProfit"), false)
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/)
  assert.equal(result.views.find(view => view.key === "partners").kpis[0].key, "public")
  const forbidden = model.selectOverviewAnalytics({ ...source, permissions: { businessAnalyticsRead: false, financeRead: true } })
  assert.equal(forbidden.state, "forbidden")
  assert.deepEqual(forbidden.views, [])
  assert.deepEqual(forbidden.kpis, [])
  assert.equal(forbidden.series, null)
  assert.equal(forbidden.period, null)
  assert.equal(forbidden.freshness, null)
})

test("zero remains measured while invalid, missing and unavailable values remain gaps", () => {
  const source = analytics({
    overview: { kpis: [kpi("zero", { value: 0 }), kpi("missing", { value: null, formattedValue: "0" }), kpi("blocked", { availability: "not_measurable", value: 50 }), kpi("invalid", { value: Infinity })], series: [series("unknown", [null, null])] },
    engagement: { series: [series("measured", [0, null, 5, Infinity])] },
  })
  source.payload.sections.engagement.series[0].points[3].comparisonValue = NaN
  const result = model.selectOverviewAnalytics(source)
  assert.equal(result.kpis[0].formatted, "0")
  assert.equal(result.kpis[0].quality, "verified")
  assert.deepEqual(result.kpis.slice(1).map(metric => metric.value), [null, null, null])
  assert.ok(result.kpis.slice(1).every(metric => metric.quality === "missing" && metric.formatted !== "0"))
  assert.equal(result.series.key, "measured")
  assert.deepEqual(result.series.points.map(point => point.value), [0, null, 5, null])
  assert.equal(result.series.points[3].comparisonValue, null)
  assert.ok(Array.isArray(result.views))
  assert.deepEqual(result.views.find(view => view.key === "overview").series[0].points.map(point => point.value), [null, null])
})

test("unavailable states carry no metrics and missing observation time never uses response generation time", () => {
  for (const state of ["unavailable", "setup_required", "forbidden"]) {
    const result = model.selectOverviewAnalytics({ state, permissions: null })
    assert.equal(result.state, state)
    assert.deepEqual(result.kpis, [])
    assert.deepEqual(result.views, [])
    assert.equal(result.asOf, null)
  }
  const source = analytics({ product: { kpis: [kpi("events", { asOf: null })] } })
  source.payload.freshness.asOf = null
  source.payload.freshness.status = "missing"
  source.payload.freshness.sources = []
  const result = model.selectOverviewAnalytics(source)
  assert.equal(result.asOf, null)
  assert.equal(result.views.find(view => view.key === "product").asOf, null)
  assert.ok(result.caveats.length > 0)
})

test("goals expose only explicit authorized targets without invented progress or timestamps", () => {
  assert.equal(typeof model.selectOverviewGoals, "function", "targets must be selected on the server")
  const source = analytics({}, { permissions: { businessAnalyticsRead: true, financeRead: false } })
  source.payload.definitions = [definition("active-users", "Mindestens 80 %"), definition("blank", "  "), definition("missing", null), definition("PRIVATE-goal", "250.000 €", { sensitivity: "finance" })]
  const goals = model.selectOverviewGoals(source)
  assert.equal(goals.state, "ready")
  assert.deepEqual(goals.items, [{ id: "active-users:1", key: "active-users", version: "1", label: "active-users", target: "Mindestens 80 %", source: "Kennzahlenkatalog", asOf: null }])
  assert.doesNotMatch(JSON.stringify(goals), /PRIVATE|250.000/)
  assert.equal(model.selectOverviewGoals({ ...source, state: "empty" }).state, "ready", "configured targets remain available before the first measurements")
  source.payload.definitions = [definition("missing", null)]
  assert.deepEqual(model.selectOverviewGoals(source), { state: "empty", items: [] })
  assert.deepEqual(model.selectOverviewGoals({ ...source, permissions: { businessAnalyticsRead: false, financeRead: true } }), { state: "forbidden", items: [] })
})

test("goal versions keep distinct stable identities and targets without choosing a current version", () => {
  const source = analytics()
  source.payload.definitions = [
    definition("active-users", "Mindestens 100", { version: "2" }),
    definition("active-users", "Mindestens 80", { version: "1" }),
  ]
  const goals = model.selectOverviewGoals(source)
  assert.deepEqual(goals.items.map(item => ({ id: item.id, key: item.key, version: item.version, target: item.target, asOf: item.asOf })), [
    { id: "active-users:2", key: "active-users", version: "2", target: "Mindestens 100", asOf: null },
    { id: "active-users:1", key: "active-users", version: "1", target: "Mindestens 80", asOf: null },
  ])
  source.payload.definitions.reverse()
  assert.deepEqual(model.selectOverviewGoals(source).items.map(item => item.id), ["active-users:1", "active-users:2"])
})

async function ui(t, initial) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost" })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  t.after(async () => {
    try { await act(async () => root.unmount()) } finally {
      dom.window.close()
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    }
  })
  const { EcosystemActivity } = loadTypescript("components/ecosystem/ecosystem-analytics.tsx", {
    "./ecosystem.module.css": {}, "./ecosystem-analytics.module.css": {},
  })
  const render = value => act(async () => root.render(h(EcosystemActivity, { analytics: value })))
  await render(initial)
  return {
    render,
    select: async label => {
      const button = [...document.querySelectorAll('[role="group"][aria-label="Analysebereich"] button')].find(item => item.textContent.trim() === label)
      assert.ok(button, `selectable section ${label} must exist`)
      await act(async () => button.click())
      assert.equal(button.getAttribute("aria-pressed"), "true")
    },
    metric: async key => {
      const select = document.querySelector('select[aria-label="Diagramm-Kennzahl"]')
      assert.ok(select, "multiple series require a metric selection")
      await act(async () => { select.value = key; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })) })
    },
    graph: () => document.querySelector('svg[role="img"]'),
    kpis: () => document.querySelector('[aria-label="Kennzahlen"]'),
    details: () => document.querySelector("details"),
  }
}

test("selecting a section and a graph metric updates real KPIs, SVG data and source details", async t => {
  const result = model.selectOverviewAnalytics(analytics({
    overview: { kpis: [kpi("active-users", { label: "Aktive Nutzer", value: 124 })], series: [series("users", [2, 3, 4], { title: "Nutzer im Verlauf" })] },
    product: { kpis: [kpi("completed", { label: "Abgeschlossene Buchungen", value: 9 })], series: [series("bookings", [0, 4, 9], { title: "Buchungen im Verlauf", source: "Buchungsdienst" }), series("searches", [8, 2, 1], { title: "Suchanfragen im Verlauf", source: "App-Suche" })] },
  }))
  const f = await ui(t, result)
  await f.select("Produktnutzung")
  assert.match(f.kpis().textContent, /9.*Abgeschlossene Buchungen/)
  assert.doesNotMatch(f.kpis().textContent, /Aktive Nutzer|124/)
  assert.match(f.graph().getAttribute("aria-label"), /Buchungen im Verlauf/)
  const before = [...f.graph().querySelectorAll("circle")].map(dot => dot.getAttribute("cy"))
  await f.metric("searches")
  assert.match(f.graph().getAttribute("aria-label"), /Suchanfragen im Verlauf/)
  assert.notDeepEqual([...f.graph().querySelectorAll("circle")].map(dot => dot.getAttribute("cy")), before)
  f.details().open = true
  assert.match(f.details().textContent, /App-Suche/)
  assert.match(f.details().textContent, /Suchanfragen im Verlauf/)
  await f.select("Überblick")
  assert.match(f.kpis().textContent, /124.*Aktive Nutzer/)
  assert.match(f.graph().getAttribute("aria-label"), /Nutzer im Verlauf/)
})

test("chart gaps stay disconnected, measured zeros remain visible, and details preserve missing data", async t => {
  const result = model.selectOverviewAnalytics(analytics({ overview: {
    kpis: [kpi("zero", { label: "Einlösungen", value: 0 }), kpi("missing", { label: "Wiederkehrquote", value: null })],
    series: [series("visits", [0, null, 5, 7], { title: "Besuche" })],
  } }))
  const f = await ui(t, result)
  const graph = f.graph()
  assert.ok(graph)
  assert.equal(graph.querySelectorAll("circle").length, 3)
  const paths = [...graph.querySelectorAll('path[fill="none"]')]
  assert.equal(paths.length, 2, "a missing sample must break the line")
  assert.equal(paths[0].getAttribute("d").includes(" L"), false)
  assert.match(graph.querySelector("circle title").textContent, /: 0$/)
  assert.ok(f.kpis(), "the metric group must expose measured and missing values accessibly")
  assert.match(f.kpis().textContent, /0.*Einlösungen/)
  assert.match(f.kpis().textContent, /—.*Wiederkehrquote/)
  f.details().open = true
  const rows = [...f.details().querySelectorAll('table[aria-label="Besuche"] tbody tr')]
  assert.equal(rows.length, 4)
  assert.equal(rows[0].cells[1].textContent, "0")
  assert.equal(rows[1].cells[1].textContent, "Keine Daten")
})

test("table-only and unavailable sections are honest and finance controls disappear when access changes", async t => {
  const source = analytics({
    overview: { kpis: [kpi("users", { label: "Aktive Nutzer" })] },
    revenueProfit: { kpis: [kpi("PRIVATE-profit", { label: "PRIVATE-Gewinn", value: 999, sensitivity: "finance" })], series: [series("PRIVATE-revenue", [999], { sensitivity: "finance" })] },
    dataQuality: { tables: [table("Quellenstatus")] },
  })
  const f = await ui(t, model.selectOverviewAnalytics(source))
  await f.select("Umsatz & Gewinn")
  assert.match(f.kpis().textContent, /999/)
  await f.render(model.selectOverviewAnalytics({ ...source, permissions: { businessAnalyticsRead: true, financeRead: false } }))
  assert.doesNotMatch(document.body.textContent, /PRIVATE|999|Umsatz & Gewinn/)
  await f.select("Datenqualität")
  assert.equal(f.graph(), null)
  assert.match(document.body.textContent, /Kein Zeitverlauf/)
  f.details().open = true
  assert.match(f.details().textContent, /Quellenstatus/)
  await f.select("Akquisition")
  assert.equal(f.graph(), null)
  assert.match(f.kpis().textContent, /Keine Messwerte/)
  await f.render(model.selectOverviewAnalytics({ state: "forbidden", permissions: null }))
  assert.equal(f.graph(), null)
  assert.match(document.body.textContent, /Analytics-Zugriff fehlt/)
  assert.equal(document.querySelectorAll('[role="group"][aria-label="Analysebereich"] button').length, 0)
})

test("negative series have a truthful zero axis and irregular dates keep their real spacing", async t => {
  const values = series("balance", [-5, -2, -1], { title: "Saldo" })
  values.points[2].date = "2026-09-11"
  const f = await ui(t, model.selectOverviewAnalytics(analytics({ overview: { series: [values] } })))
  const graph = f.graph()
  assert.equal(graph.querySelector("text").textContent, "0", "the upper axis of an entirely negative series is zero")
  const x = [...graph.querySelectorAll("circle")].map(dot => Number(dot.getAttribute("cx")))
  assert.ok(Math.abs((x[1] - x[0]) / (x[2] - x[0]) - 0.1) < 0.0001, "one day must occupy one tenth of the observed ten-day span")
  assert.doesNotMatch(graph.outerHTML, /NaN|Infinity/)
})

test("the initial view chooses an available measured series while explicit empty selections stay selected", async t => {
  const f = await ui(t, model.selectOverviewAnalytics(analytics({
    overview: { kpis: [kpi("users", { label: "Aktive Nutzer" })] },
    engagement: { series: [series("nes", [0, 15], { title: "Nutzer-Engagement-Score" })] },
  })))
  assert.ok(f.graph(), "an available engagement series must populate the initial stage")
  assert.match(f.graph().getAttribute("aria-label"), /Nutzer-Engagement-Score/)
  await f.select("Akquisition")
  assert.equal(f.graph(), null)
  assert.match(f.kpis().textContent, /Keine Messwerte/)
})

test("dated measurements remain visible when the overall source freshness is unknown", async t => {
  const source = analytics({ overview: { series: [series("visits", [0, 3], { title: "Besuche" })] } })
  source.payload.freshness = { status: "missing", asOf: null, staleAfter: null, sources: [] }
  const f = await ui(t, model.selectOverviewAnalytics(source))
  assert.ok(f.graph())
  const footer = document.querySelector('section[aria-labelledby] > div:last-child > span')
  assert.ok(footer)
  assert.match(footer.textContent, /Quellenstand unvollständig/)
  assert.match(footer.textContent, /Datenstand 02\.10/)
  assert.doesNotMatch(footer.textContent, /Datenstand unbekannt/)
})
