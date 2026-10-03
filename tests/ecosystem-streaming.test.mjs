import assert from "node:assert/strict"
import { setImmediate as nextTurn } from "node:timers/promises"
import { PassThrough } from "node:stream"
import test from "node:test"
import React from "react"
import { renderToPipeableStream } from "react-dom/server"
import { loadTypescript } from "./helpers/load-typescript.mjs"
import * as overviewData from "../lib/ecosystem/overview.ts"
import * as catalog from "../lib/ecosystem/catalog.ts"
import * as normalize from "../lib/analytics/normalize.ts"
import * as directory from "../lib/ecosystem/directory.ts"

const h = React.createElement
const checkedAt = "2026-10-03T12:00:00Z"
const snapshot = {
  checkedAt, activePartners: { value: 12, unavailable: false },
  pendingReviews: { value: 2, unavailable: false },
  failedJobs: { value: 0, unavailable: false }, overdueSources: { value: null, unavailable: true },
}
const agents = {
  checkedAt, runtime: { state: "unavailable", snapshot: null },
  cities: { state: "unavailable", items: [] },
}
const analytics = { state: "unavailable", message: "Messwerte vorübergehend nicht verfügbar" }
const dashboard = {
  partners: [{ id: "first", name: "First" }, { id: "selected", name: "Selected" }],
  cities: [], owners: [], errors: [],
}
const resolved = { dashboard, founder: snapshot, agents, analytics, publicPages: { data: [], error: null }, portal: { partnerIds: ["selected"] } }

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function fixture(t, { admin = true } = {}) {
  const pending = Object.fromEntries(Object.keys(resolved).map(key => [key, deferred()]))
  const calls = []
  const partnerProps = []
  let refreshStarted = false
  const source = key => (...args) => { calls.push({ key, args }); return pending[key].promise }
  const Link = ({ href, children }) => h("a", { href }, children)
  const presentation = loadTypescript("components/ecosystem/ecosystem-overview.tsx", {
    "next/link": Link,
    "@/lib/ecosystem/overview": overviewData,
    "@/lib/ecosystem/catalog": catalog,
    "@/lib/analytics/normalize": normalize,
    "./ecosystem.module.css": { __esModule: true, default: new Proxy({}, { get: (_, name) => name }) },
    "./ecosystem-explorer": {
      EcosystemExplorer: () => h("section", null, "Features und Vorteile"),
      PageDirectory: ({ incomplete }) => h("section", null, incomplete ? "Seiten: Daten unvollständig" : "Seitenverzeichnis"),
    },
  })
  const page = loadTypescript("app/page.tsx", {
    "@/components/admin-translation-boundary": { AdminTranslationBoundary: ({ children }) => h("div", { "data-admin-i18n-pending": "true" }, children) },
    "next/link": Link,
    "next/navigation": { redirect: destination => { throw new Error(`redirect:${destination}`) } },
    "@/lib/supabase/config": { getSupabaseConfig: () => ({ isConfigured: true }) },
    "@/lib/supabase/server": { createClient: async () => ({ rpc: source("publicPages") }) },
    "@/lib/admin": { getAdminSession: async () => admin === null ? null : ({ isAdmin: admin, user: { id: "admin", email: "admin@example.invalid" } }) },
    "@/lib/partner-portal": { getPartnerPortalSession: source("portal") },
    "@/lib/admin-data": { getDashboardData: source("dashboard") },
    "@/lib/founder-overview-data": { loadFounderOverview: source("founder") },
    "@/lib/agent-control-data": { loadAgentControl: source("agents") },
    "@/lib/analytics/loader": { loadBusinessAnalytics: source("analytics") },
    "@/lib/analytics/filters": { parseBusinessAnalyticsFilters: () => ({}) },
    "@/lib/ecosystem/overview": overviewData,
    "@/lib/ecosystem/directory": directory,
    "@/components/ecosystem/ecosystem-overview": presentation,
    "./admin-shell": {
      AdminShell: ({ children, headerActions, micrositeCount }) => h("main", null,
        h("nav", null, "Admin-Navigation"), headerActions, h("aside", null, micrositeCount), children),
      PartnerPanelLink: () => h("a", { href: "/partner" }, "Partner panel"),
    },
    "./partner-admin": { PartnerWorkspace: props => { partnerProps.push(props); return h("section", null, `Partner bearbeiten: ${props.initialPartnerId}`) } },
    "./dashboard-auto-refresh": { DashboardAutoRefresh: () => { refreshStarted = true; return null } },
  }).default
  const release = (key, value = resolved[key]) => pending[key].resolve(value)
  t.after(() => Object.keys(pending).forEach(key => release(key)))
  return { page, calls, partnerProps, release, refreshStarted: () => refreshStarted }
}

async function within(promise, message) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), 1500)
    })])
  } finally { clearTimeout(timer) }
}

async function streamPage(t, page) {
  const output = new PassThrough()
  let html = ""
  const waiters = new Set()
  const failures = []
  output.on("data", data => { html += data; for (const notify of waiters) notify() })
  const rendering = renderToPipeableStream(page, {
    onShellReady() { rendering.pipe(output) },
    onError(error) { failures.push(error) },
  })
  t.after(() => { rendering.abort(); output.destroy() })
  const waitFor = async text => {
    const ready = () => html.includes(text)
    if (ready()) return
    let notify
    try {
      await within(new Promise(resolve => {
        notify = () => { if (ready()) resolve() }
        waiters.add(notify)
      }), `Expected streamed content: ${text}; errors: ${failures.map(error => error.message).join(", ")}`)
    } finally { waiters.delete(notify) }
  }
  await waitFor("Admin-Navigation")
  return { html: () => html, waitFor, failures }
}

test("authorized dashboard streams navigation and catalog before any optional data source resolves", async t => {
  const fixtureData = fixture(t)
  const page = await within(fixtureData.page({ searchParams: Promise.resolve({}) }), "Dashboard is blocked by optional data")
  const stream = await streamPage(t, page)
  assert.match(stream.html(), /Features und Vorteile/)
  assert.match(stream.html(), /Vier Zugänge/)
  assert.match(stream.html(), /Analytics werden geladen/)
  assert.match(stream.html(), /Agent-Status wird geladen/)
  assert.doesNotMatch(stream.html(), /Keine Daten|Noch kein Verlauf|Partner bearbeiten/)
  assert.equal(fixtureData.refreshStarted(), false)
  assert.equal(fixtureData.calls.length, 6)
  assert.equal(new Set(fixtureData.calls.map(call => call.key)).size, 6)
})

test("partner editing and operations stream independently while analytics and publication checks are pending", async t => {
  const f = fixture(t)
  const page = await within(f.page({ searchParams: Promise.resolve({ partner: ["selected"], mode: "create", view: "microsite", tab: "deals" }) }), "Dashboard waits for analytics")
  const stream = await streamPage(t, page)
  f.release("dashboard")
  await stream.waitFor("Partner bearbeiten: selected")
  assert.equal(f.partnerProps[0].initialMode, "create")
  assert.equal(f.partnerProps[0].initialView, "microsite")
  assert.equal(f.partnerProps[0].initialSettingsTab, "deals")
  assert.equal(f.calls.find(call => call.key === "dashboard").args[1].entitlementPartnerId, "selected")
  f.release("founder")
  f.release("agents")
  await stream.waitFor("Dein Team")
  await stream.waitFor("Aktive Profile")
  assert.doesNotMatch(stream.html(), /Noch kein Verlauf|Seitenverzeichnis/)
  f.release("publicPages", { data: null, error: true })
  await stream.waitFor("Seiten: Daten unvollständig")
  assert.equal(f.refreshStarted(), false, "Do not refresh while initial sources are pending")
  f.release("analytics")
  await stream.waitFor("Noch kein Verlauf")
  f.release("portal")
  await stream.waitFor("Partner panel")
  await nextTurn()
  assert.equal(f.refreshStarted(), true)
  assert.deepEqual(stream.failures, [])
  assert.equal(f.calls.length, 6, "Shared sections must not refetch their data")
})

for (const admin of [false, null]) {
  test(`unauthorized session (${admin}) cannot start dashboard or privileged data reads`, async t => {
    const f = fixture(t, { admin })
    await assert.rejects(f.page({ searchParams: Promise.resolve({}) }), /redirect:\/login/)
    assert.deepEqual(f.calls, [])
  })
}
