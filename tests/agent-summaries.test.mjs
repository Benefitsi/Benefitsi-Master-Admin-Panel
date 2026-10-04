import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { JSDOM } from "jsdom"
import { buildAgentSummaries } from "../lib/ecosystem/agent-summaries.ts"
import { normalizeRuntimeSnapshot } from "../lib/agent-control.ts"
import { AgentOverview } from "../app/agents/agent-overview.tsx"
import { loadTypescript } from "./helpers/load-typescript.mjs"

const checkedAt = "2026-10-04T18:00:00Z"
const observedAt = "2026-10-02T12:27:54Z"
const schedule = (changes = {}) => ({
  id: "worker", source: "launchd", enabled: true, cadence: "Alle 30 Minuten",
  lastRunAt: "2026-10-02T12:00:00Z", lastStatus: "succeeded", ...changes,
})
const profile = (changes = {}) => ({
  id: "ben", scope: "benefitsi", purpose: "Koordiniert freigegebene Aufträge.",
  provider: "observed-provider", model: "observed-model", citySlug: null, automation: "scheduled",
  contextFiles: [], contextHealth: "unknown", runtimeHealth: "unknown", schedules: [schedule()], ...changes,
})
const control = (profiles = [profile()], changes = {}) => ({
  checkedAt,
  runtime: { state: "stale", snapshot: { schemaVersion: 1, hostId: "m1-benefitsi", observedAt, collectorVersion: "1", profiles } },
  cities: { state: "unavailable", items: [] }, citySchedules: { state: "unavailable", items: [] },
  pipeline: { state: "unavailable", item: null }, ...changes,
})
const summary = data => buildAgentSummaries(data).find(item => item.id === "ben")
const documentFor = (data, selectedAgentId) => new JSDOM(renderToStaticMarkup(createElement(AgentOverview, { data, selectedAgentId }))).window.document

test("a runtime-only finance profile retains its named workspace without inventing execution evidence", () => {
  const runtime = normalizeRuntimeSnapshot({
    ...control([profile({ id: "benefitsi-finance", schedules: [], automation: "manual" })]).runtime.snapshot,
    observedAt: checkedAt,
  }, new Date(checkedAt))
  const result = buildAgentSummaries(control([], { runtime })).find(item => item.id === "benefitsi-finance")
  assert.equal(result.name, "Buchhaltung & Steuern")
  assert.equal(result.workspaceHref, "/analytics")
  assert.equal(result.href, "/agents?agent=benefitsi-finance#agent-benefitsi-finance")
  assert.equal(result.status, "unknown")
  assert.equal(result.lastRunAt, null)
  assert.equal(result.lastRunStatus, "unknown")
})

test("a stale observation retains its dated successful result without claiming current health", () => {
  const result = summary(control())
  assert.equal(result.status, "stale")
  assert.equal(result.freshness, "stale")
  assert.equal(result.observedAt, observedAt)
  assert.equal(result.evidence, "observed")
  assert.equal(result.lastRunStatus, "succeeded")
  assert.equal(result.lastRunLabel, "Letzter beobachteter Lauf erfolgreich")
  assert.equal(result.lastRunAt, "2026-10-02T12:00:00Z")
  assert.equal(result.lastRunScheduleId, "worker")
  assert.equal(result.cadence, "Alle 30 Minuten")
  assert.doesNotMatch(result.statusLabel + result.lastRunLabel, /aktuell erfolgreich|läuft|gesund/i)
})

test("latest observed result is separate from stale data and older failing schedules", () => {
  const schedules = [schedule({ id: "older", lastRunAt: "2026-10-01T12:00:00Z", lastStatus: "failed" }), schedule()]
  assert.equal(summary(control([profile({ runtimeHealth: "failed", schedules })])).lastRunStatus, "succeeded")
  schedules[1] = schedule({ lastStatus: "error" })
  const failed = summary(control([profile({ runtimeHealth: "failed", schedules })]))
  assert.equal(failed.status, "stale")
  assert.equal(failed.lastRunStatus, "failed")
  assert.match(failed.lastRunLabel, /fehlgeschlagen/)
})

test("latest disabled schedule failure requires attention while stale observations keep their age state", () => {
  const snapshot = {
    ...control([profile({ schedules: [
      schedule({ id: "enabled-success", lastRunAt: "2026-10-04T17:40:00Z" }),
      schedule({ id: "disabled-failure", enabled: false, lastRunAt: "2026-10-04T17:50:00Z", lastStatus: "failed" }),
    ] })]).runtime.snapshot,
    observedAt: checkedAt,
  }
  for (const [at, state] of [[checkedAt, "fresh"], ["2026-10-04T19:31:00Z", "stale"]]) {
    const runtime = normalizeRuntimeSnapshot(snapshot, new Date(at))
    assert.equal(runtime.state, state)
    assert.equal(runtime.snapshot.profiles[0].runtimeHealth, "ok")
    const result = summary(control([], { checkedAt: at, runtime }))
    assert.equal(result.lastRunStatus, "failed")
    assert.equal(result.lastRunAt, "2026-10-04T17:50:00Z")
    assert.equal(result.lastRunScheduleId, "disabled-failure")
    assert.equal(result.status, state === "fresh" ? "attention" : "stale")
    assert.equal(result.statusLabel, state === "fresh" ? "Letzter beobachteter Lauf fehlgeschlagen" : "Beobachtung veraltet")
  }
})

test("missing, invalid and future run times cannot become dated run evidence", () => {
  for (const lastRunAt of [null, "not-a-date", "2026-02-30T12:00:00Z", "2026-10-04T18:06:00Z", "2026-10-02T12:34:00Z"]) {
    const result = summary(control([profile({ runtimeHealth: "ok", schedules: [schedule({ lastRunAt })] })]))
    assert.equal(result.lastRunAt, null, String(lastRunAt))
    assert.equal(result.lastRunStatus, "unknown", String(lastRunAt))
    assert.equal(result.lastRunScheduleId, null)
  }
})

test("idle and partial results remain distinguishable from completed work", () => {
  for (const [lastStatus, expected, label] of [["queue_empty", "idle", /Leerlauf/], ["partial", "partial", /Teilweise/]]) {
    const result = summary(control([profile({ schedules: [schedule({ lastStatus })] })]))
    assert.equal(result.lastRunStatus, expected)
    assert.match(result.lastRunLabel, label)
  }
})

test("missing or future observations retain configured roles without observed models", () => {
  const missing = summary(control([], { runtime: { state: "unavailable", snapshot: null } }))
  assert.equal(missing.evidence, "configured")
  assert.equal(missing.freshness, "unavailable")
  assert.equal(missing.observedAt, null)
  assert.equal(missing.lastRunStatus, "unknown")
  const future = control()
  future.runtime.state = "fresh"
  future.runtime.snapshot.observedAt = "2026-10-04T18:06:00Z"
  const result = summary(future)
  assert.equal(result.evidence, "configured")
  assert.equal(result.model, null)
  assert.equal(result.freshness, "invalid")
})

test("freshness is checked against the observation even if a caller supplied fresh", () => {
  const data = control()
  data.runtime.state = "fresh"
  assert.equal(summary(data).freshness, "stale")
  assert.equal(summary(data).status, "stale")
})

test("configured city roles and observed other profiles get safe specific destinations", () => {
  const data = control([profile({ id: "nova", scope: "general", automation: "manual", schedules: [] })])
  data.cities = { state: "available", items: [
    { cityId: "city", cityName: "Landau", cityProfile: "city-landau", orchestratorProfile: "ben" },
    { cityId: "bad", cityName: "Bad", cityProfile: "bad#anchor", orchestratorProfile: "../private" },
  ] }
  const all = buildAgentSummaries(data)
  assert.equal(all.find(item => item.id === "nova").scope, "general")
  assert.equal(all.find(item => item.id === "city-landau").evidence, "configured")
  assert.equal(all.some(item => item.id === "bad#anchor" || item.id === "../private"), false)
  for (const item of all) {
    const url = new URL(item.href, "https://admin.example.test")
    assert.equal(url.pathname, "/agents")
    assert.equal(url.searchParams.get("agent"), item.id)
    assert.equal(url.hash, `#agent-${item.id}`)
  }
})

test("configured-only menu agent opens useful details with its real scope and no fabricated run", () => {
  const data = control([], { runtime: { state: "unavailable", snapshot: null } })
  const menu = buildAgentSummaries(data).find(item => item.id === "benefitsi-menu")
  assert.equal(menu.evidence, "configured")
  assert.equal(menu.cadence, "Bei Bedarf")
  assert.equal(menu.lastRunStatus, "unknown")
  assert.equal(menu.model, null)
  const document = documentFor(data, "benefitsi-menu")
  const card = document.getElementById(new URL(menu.href, "https://example.test").hash.slice(1))
  assert.ok(card)
  assert.equal(card.dataset.selected, "true")
  assert.match(card.textContent, /Foto|PDF/)
  assert.match(card.textContent, /Konfiguriert/)
  assert.match(card.textContent, /Kein Laufnachweis/)
  assert.ok(card.querySelector('a[href="/partners"]'))
})

test("specific observed profile entry highlights it, opens evidence and never calls a stale result current", () => {
  const document = documentFor(control(), "ben")
  const card = document.getElementById("agent-ben")
  assert.ok(card)
  assert.equal(card.dataset.selected, "true")
  assert.ok(card.querySelector("details[open]"))
  assert.match(card.textContent, /Beobachtung veraltet/)
  assert.match(card.textContent, /Letzter beobachteter Lauf erfolgreich/)
  assert.doesNotMatch(card.textContent, /aktuell erfolgreich/)
})

test("unknown requested profiles do not create invented agent cards", () => {
  const document = documentFor(control(), "unknown-profile")
  assert.equal(document.getElementById("agent-unknown-profile"), null)
  assert.match(document.body.textContent, /Kein passendes Profil nachgewiesen/)
})

test("server route forwards a single requested agent after its admin authorization", async () => {
  const calls = []
  const data = control()
  const page = loadTypescript("app/agents/page.tsx", {
    "@/app/admin-shell": { AdminShell: ({ children }) => children },
    "@/lib/admin": { requireAdmin: async () => {
      calls.push("authorize")
      return { supabase: {}, adminSession: { profile: null, user: { email: "admin@example.test" } } }
    } },
    "@/lib/agent-control-data": { loadAgentControl: async () => { calls.push("load"); return data } },
    "./agent-overview": { AgentOverview: props => { calls.push(props.selectedAgentId); return null } },
  }).default
  renderToStaticMarkup(await page({ searchParams: Promise.resolve({ agent: "benefitsi-menu" }) }))
  assert.deepEqual(calls, ["authorize", "load", "benefitsi-menu"])
})
