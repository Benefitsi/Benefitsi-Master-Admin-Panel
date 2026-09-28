import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { JSDOM } from "jsdom"
import { readFileSync } from "node:fs"
import ts from "typescript"
import * as jsx from "react/jsx-runtime"
import { BusinessControlCenter, AnalyticsAccessState } from "../components/analytics/business-control-center.tsx"
import { createEmptyBusinessAnalyticsPayload } from "../lib/analytics/normalize.ts"
import { CityMeasurementDashboard } from "../components/analytics/city-measurement-dashboard.tsx"
import { normalizeCityConversion, normalizeCityWebOperations } from "../lib/analytics/city-measurement-normalize.ts"
import { city, filters, scope, conversionFixture, operationsFixture, emptyOperationsFixture } from "./helpers/city-measurement-fixtures.mjs"

const ready = () => ({ state: "loaded", cities: [city], scope,
  conversion: { state: "ready", data: normalizeCityConversion(conversionFixture(), scope) },
  operations: { state: "ready", data: normalizeCityWebOperations(operationsFixture(), scope) },
})
function render(result, showFilters = false) {
  return new JSDOM(renderToStaticMarkup(createElement(CityMeasurementDashboard, { result, filters, showFilters }))).window.document
}
function metricValue(document, label) {
  return [...document.querySelectorAll("dt")].find(node => node.textContent === label)?.nextElementSibling?.textContent
}

test("city dashboard presents independent operational and observed facts with explicit source context", () => {
  const document = render(ready())
  assert.equal(metricValue(document, "Beobachtete Stadtaufrufe"), "3")
  assert.equal(metricValue(document, "Beobachtete Actors"), "2")
  assert.equal(metricValue(document, "Partneranfragen"), "3")
  assert.match(document.body.textContent, /Einwilligung/)
  assert.match(document.body.textContent, /01\.09\.2026.*22\.09\.2026/)
  assert.match(document.body.textContent, /Europe\/Berlin/)
  assert.match(document.body.textContent, /city_conversion_readout/)
  assert.equal([...document.querySelectorAll("a")].some(link => link.getAttribute("href") === `/city-operations?city=annweiler`), true)
})

test("unavailable web conversion and technical source never display replacement zero or healthy status", () => {
  const result = ready()
  result.conversion.data.web = null
  result.operations = { state: "setup_required" }
  const document = render(result)
  assert.equal(metricValue(document, "Beobachtete Stadtaufrufe"), "—")
  assert.equal(metricValue(document, "Partneranfragen"), "3")
  assert.match(document.querySelector("#web-operations").textContent, /noch nicht verfügbar/)
  assert.equal(document.querySelector("#web-operations").textContent.includes("Gesund"), false)
  assert.equal(document.querySelector("#web-operations").textContent.includes("0 Fehler"), false)
})

test("technical p75, sample qualification and open alerts render without inventing an overall health score", () => {
  const document = render(ready())
  assert.match(document.querySelector("#web-vitals").textContent, /2\.700 ms/)
  assert.match(document.querySelector("#web-vitals").textContent, /120/)
  assert.match(document.querySelector("#web-vitals").textContent, /Prüfen/)
  assert.match(document.querySelector("#web-alerts").textContent, /Ladezeit prüfen/)
  assert.ok(document.querySelector('#web-alerts a[href="#web-errors"]'))
  assert.equal([...document.querySelectorAll("a")].some(link => link.getAttribute("href") === `/automation?city=${city.id}&status=needs_human`), true)
  const small = ready(); small.operations.data.vitals[0].sampleCount = 2
  assert.match(render(small).querySelector("#web-vitals").textContent, /Vorläufig/)
})

test("successful empty operations readout distinguishes no observations from no errors", () => {
  const result = ready()
  result.operations = { state: "empty", data: normalizeCityWebOperations(emptyOperationsFixture(), scope) }
  const document = render(result)
  assert.match(document.querySelector("#web-operations").textContent, /Noch keine Beobachtungen/)
  assert.match(document.querySelector("#web-errors").textContent, /kein Nachweis für fehlerfreien Betrieb/)
  assert.match(document.querySelector("#web-alerts").textContent, /Keine Alarm-Einträge/)
})

test("unselected city and unsupported scope provide usable GET filters rather than fake charts", () => {
  const document = render({ state: "selection_required", cities: [city] })
  assert.equal(document.querySelector("form").getAttribute("method"), "get")
  assert.equal(document.querySelector('select[name="city"] option[value="' + city.id + '"]').textContent, "Annweiler")
  assert.equal(document.querySelector('input[name="from"]').value, "2026-09-01")
  assert.equal(document.querySelectorAll("dt").length, 0)
  const invalid = render({ state: "invalid_scope", reason: "unsupported_filters", cities: [city] })
  assert.match(invalid.body.textContent, /Partner-, Kanal- und Planfilter/)
  assert.equal([...invalid.querySelectorAll("a")].some(link => link.getAttribute("href") === `/analytics?city=${city.id}&environment=production#city-measurement`), true)
})

test("Google property links disclose that no API statistics were imported into this dashboard", () => {
  const document = render(ready())
  const panel = document.querySelector("#google-measurement")
  assert.match(panel.textContent, /verknüpft/)
  assert.match(panel.textContent, /nicht verbunden/)
  assert.equal(panel.querySelectorAll("dt").length, 0)
  assert.equal([...panel.querySelectorAll("a")].some(link => link.href.includes("p516005474")), true)
  assert.equal([...panel.querySelectorAll("a")].some(link => new URL(link.href).searchParams.get("resource_id") === "https://benefitsi.de/"), true)
})

test("unavailable technical sources do not offer in-page links without a destination", () => {
  const result = ready(); result.operations = { state: "unavailable" }
  const document = render(result)
  for (const link of document.querySelectorAll('a[href^="#web-"]')) {
    assert.ok(document.querySelector(link.getAttribute("href")))
  }
})

function pageRuntime(businessState, auth = async () => ({ supabase: {}, adminSession: { user: {}, profile: null } })) {
  const calls = []
  const dependencies = {
    "react/jsx-runtime": jsx,
    "@/app/admin-shell": { AdminShell: ({ children }) => createElement("main", null, children) },
    "@/components/analytics/business-control-center": { BusinessControlCenter, AnalyticsAccessState },
    "@/components/analytics/city-measurement-dashboard": { CityMeasurementDashboard },
    "@/lib/admin": { requireAdmin: async () => { calls.push("auth"); return await auth() } },
    "@/lib/analytics/filters": { parseBusinessAnalyticsFilters: () => filters },
    "@/lib/analytics/loader": { loadBusinessAnalytics: async () => {
      calls.push("business")
      return businessState === "ready" ? { state: "ready", payload: createEmptyBusinessAnalyticsPayload(filters), permissions: { financeRead: false } } : { state: businessState }
    } },
    "@/lib/analytics/city-measurement-loader": { loadCityMeasurement: async () => { calls.push("city"); return ready() } },
    "@/lib/supabase/config": { getSupabaseConfig: () => ({ isConfigured: true }) },
  }
  const source = readFileSync(new URL("../app/analytics/page.tsx", import.meta.url), "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", compiled)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, loaded, loaded.exports)
  return { calls, run: () => loaded.exports.default({ searchParams: Promise.resolve({}) }) }
}

test("analytics page mounts the real city dashboard under shared filters and preserves it on business-source failure", async () => {
  for (const state of ["ready", "unavailable"]) {
    const check = pageRuntime(state)
    const document = new JSDOM(renderToStaticMarkup(await check.run())).window.document
    assert.ok(document.querySelector("#city-measurement"))
    assert.equal(metricValue(document, "Beobachtete Stadtaufrufe"), "3")
    assert.deepEqual(check.calls, ["auth", "business", "city"])
    if (state === "unavailable") assert.ok(document.querySelector('#city-measurement form select[name="city"]'))
  }
})

test("analytics page must finish its login boundary before either source begins", async () => {
  const check = pageRuntime("ready", async () => { throw new Error("login-boundary") })
  await assert.rejects(check.run(), /login-boundary/)
  assert.deepEqual(check.calls, ["auth"])
})
