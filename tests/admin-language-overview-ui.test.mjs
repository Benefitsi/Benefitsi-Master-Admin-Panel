import assert from "node:assert/strict"
import test from "node:test"
import React, { act } from "react"
import { JSDOM } from "jsdom"
import { loadTypescript } from "./helpers/load-typescript.mjs"
import * as language from "../app/admin-language.tsx"
import { AdminTranslationBoundary } from "../components/admin-translation-boundary.tsx"
import * as navigation from "../lib/admin-navigation.ts"
import * as overviewData from "../lib/ecosystem/overview.ts"
import * as catalog from "../lib/ecosystem/catalog.ts"
import * as knowledgeContract from "../lib/benefitsi-knowledge-controls.ts"
import * as normalize from "../lib/analytics/normalize.ts"
import * as agentSummaries from "../lib/ecosystem/agent-summaries.ts"
import { buildOverviewPriorities } from "../lib/ecosystem/priorities.ts"
import * as founder from "../lib/founder-overview.ts"

const h = React.createElement
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) }
const Link = ({ children, ...props }) => { delete props.prefetch; return h("a", props, children) }
const common = { "@/components/admin-translation-boundary": { AdminTranslationBoundary }, "next/link": Link, "@/app/admin-language": language, "./ecosystem.module.css": css }
let networkCalls = [], refreshes = 0
const unavailable = async () => ({ ok: false, json: async () => ({ error: "unavailable" }) })
let fetchResult = unavailable
const safeFetch = async (url, init) => { networkCalls.push({ url, init }); return fetchResult(url, init) }
const composer = loadTypescript("components/knowledge/benefitsi-note-composer.tsx", { "@/app/admin-language": language, "@/lib/benefitsi-knowledge-controls": knowledgeContract }, { fetch: safeFetch, crypto: globalThis.crypto })
const entry = loadTypescript("components/knowledge/benefitsi-knowledge-entry.tsx", { "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++ } }) }, "./benefitsi-note-composer": composer })
const profileControls = loadTypescript("app/agents/agent-controls.tsx", { "@/app/admin-language": language }, { fetch: safeFetch, AbortController })
common["@/components/knowledge/benefitsi-knowledge-entry"] = entry
const explorer = loadTypescript("components/ecosystem/ecosystem-explorer.tsx", {
  ...common, "@/lib/ecosystem/catalog": catalog,
  "@/components/benefit-icon": { BenefitIcon: () => h("svg", { "aria-hidden": true }) },
})
const activity = loadTypescript("components/ecosystem/ecosystem-analytics.tsx", {
  ...common, "@/lib/analytics/normalize": normalize, "./ecosystem-analytics.module.css": css,
})
const hub = loadTypescript("components/ecosystem/ecosystem-product-hub.tsx", { ...common, "@/lib/ecosystem/catalog": catalog, "./ecosystem-explorer": explorer })
const overview = loadTypescript("components/ecosystem/ecosystem-overview.tsx", {
  ...common, "@/lib/ecosystem/catalog": catalog, "@/lib/ecosystem/overview": overviewData,
  "@/lib/founder-overview": founder, "./ecosystem-explorer": explorer, "./ecosystem-analytics": activity, "./ecosystem-product-hub": hub,
})
const agentsPage = loadTypescript("app/agents/agent-overview.tsx", { ...common, "@/lib/ecosystem/agent-summaries": agentSummaries, "@/lib/benefitsi-knowledge-controls": knowledgeContract, "./agent-controls": profileControls })
const browserGlobals = Object.fromEntries(["document", "window"].map(name => [name, new Proxy({}, { get: (_, key) => { const value = globalThis[name]?.[key]; return typeof value === "function" ? value.bind(globalThis[name]) : value } })]))
const shell = loadTypescript("app/admin-shell.tsx", {
  ...common, "next/navigation": { usePathname: () => "/" },
  "next/image": props => { const imageProps = { ...props }; delete imageProps.priority; return h("img", imageProps) },
  "./actions": { signOut: async () => {} }, "./admin-language": language,
  "@/lib/admin-navigation": navigation,
  "@/components/pending-submit-button": { PendingSubmitButton: ({ children, ...props }) => { delete props.pendingLabel; return h("button", props, children) } },
  "@/components/brand-logo": { BrandLogo: () => h("span", null, "Benefitsi") },
}, browserGlobals)

const checkedAt = "2026-10-13T10:00:00Z"
const control = { checkedAt, runtime: { state: "unavailable", snapshot: null }, cities: { state: "unavailable", items: [] } }
const snapshot = { checkedAt, activePartners: { value: 12, unavailable: false }, failedJobs: { value: 2, unavailable: false }, pendingReviews: { value: 3, unavailable: false }, overdueSources: { value: 0, unavailable: false }, cityRun: null, cityRunUnavailable: true }
const readySource = items => ({ state: "ready", items, truncated: false })
const prioritySources = {
  checkedAt, jobs: readySource([{ id: "00000000-0000-4000-8000-000000000002", job_type: "city_scan", status: "needs_human" }, { id: "00000000-0000-4000-8000-000000000003", job_type: "source_verification", status: "failed" }]),
  editorial: readySource([{ id: "00000000-0000-4000-8000-000000000004", title: "Wissen" }]),
  workspace: readySource([{ id: "00000000-0000-4000-8000-000000000001", title: "Wissen", status: "in_progress", content: { tasks: [{ text: "Prüfung & Freigaben", done: false, dueDate: "2026-10-12" }] } }]),
}
const emptyAnalytics = state => ({ state, views: [], kpis: [], series: null, freshness: null, period: null })
const series = (key, title, points = [2, null, 4]) => ({ key, title, unit: "count", quality: "verified", source: "Supabase", asOf: checkedAt, points: points.map((value, index) => ({ date: `2026-10-${11 + index}`, value, comparisonValue: null })) })
const measuredAnalytics = {
  ...emptyAnalytics("partial"),
  period: { environment: "production", dateFrom: "2026-10-01", dateTo: "2026-10-13" },
  freshness: { status: "stale", sources: [{ key: "supabase", label: "Supabase", status: "stale", asOf: checkedAt }] },
  views: [
    { key: "overview", label: "Überblick", asOf: checkedAt, kpis: [{ key: "users", label: "Aktive Nutzer", value: 4, formatted: "4", quality: "verified", source: "Supabase", asOf: checkedAt }], series: [series("users", "Aktive Nutzer"), series("visits", "Besuche", [null])], tables: [], caveats: ["Der Datenstand ist veraltet."] },
    { key: "product", label: "Produktnutzung", asOf: checkedAt, kpis: [], series: [], tables: [], caveats: [] },
  ],
}

async function mount(t, content, useShell = false) {
  networkCalls = []; refreshes = 0; fetchResult = unavailable
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://admin.example" })
  const names = ["window", "self", "document", "Element", "Text", "Node", "NodeFilter", "HTMLElement", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] })
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  const settle = () => new Promise(resolve => setTimeout(resolve, 15))
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const name of names) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else delete globalThis[name] }
  })
  const render = async next => {
    const tree = useShell ? h(shell.AdminShell, { adminName: "Wissen", title: "Übersicht" }, next)
      : h(language.AdminLanguageProvider, null, h(language.AdminLanguageControl), h(AdminTranslationBoundary, null, next))
    await act(async () => { root.render(tree); await settle() })
    await act(settle)
  }
  await render(content)
  const click = async element => { assert.ok(element, "click target must exist"); await act(async () => { element.click(); await settle() }) }
  const toggle = option => click([...document.querySelectorAll('button')].find(button => button.textContent === option))
  const text = selector => document.querySelector(selector)?.textContent ?? ""
  return { dom, root, render, click, toggle, text, settle }
}

test("shared admin chrome translates expanded navigation and system cards without changing identity or routes", async t => {
  const ui = await mount(t, h("section", null, "Page"), true)
  const nav = () => document.querySelector("aside nav")
  assert.equal(nav().getAttribute("aria-label"), "Admin navigation")
  assert.match(nav().textContent, /Overview/)
  assert.match(nav().textContent, /Cities/)
  assert.equal(document.querySelector('aside button[aria-expanded]').getAttribute("aria-label"), "Expand navigation")
  assert.equal(document.querySelector("header > div:last-child > p").textContent, "Wissen")
  const routes = [...nav().querySelectorAll("a")].map(a => a.getAttribute("href"))
  await ui.click(document.querySelector('button[aria-haspopup="dialog"]'))
  assert.match(ui.text('[role="dialog"]'), /Benefitsi systems/)
  assert.match(ui.text('[role="dialog"]'), /Builder, drafts & live pages/)
  for (const option of ["DE", "EN", "DE", "EN"]) {
    await ui.toggle(option)
    assert.match(nav().textContent, option === "DE" ? /Übersicht/ : /Overview/)
    assert.match(ui.text('[role="dialog"]'), option === "DE" ? /Öffentliche Hauptseite/ : /Public website/)
    assert.equal(document.querySelector("header > div:last-child > p").textContent, "Wissen")
    assert.deepEqual([...nav().querySelectorAll("a")].map(a => a.getAttribute("href")), routes)
    assert.equal(document.documentElement.lang, option.toLowerCase())
  }
  await ui.click(document.querySelector('aside button[aria-expanded]'))
  assert.equal(document.querySelector('aside button[aria-expanded]').getAttribute("aria-label"), "Collapse navigation")
})

test("rendered overview translates tiers, operational evidence, catalogue and directory across repeated language toggles", async t => {
  const pages = [{ id: "city", title: "Annweiler am Trifels", kind: "Stadtseite", description: "", status: "Stadtseite", href: "https://benefitsi.de/stadt/annweiler", adminHref: "/city-pages/annweiler" }, { id: "partner", title: "Wissen", kind: "Microsite", description: "", status: "Entwurf", href: null, adminHref: "/partners?partner=k" }]
  const ui = await mount(t, h(overview.EcosystemOverviewLayout, {
    timestamp: h(overview.EcosystemTimestamp, { checkedAt }), metrics: h(overview.EcosystemMetrics, { snapshot, agentData: control }),
    activity: h(activity.EcosystemActivity, { analytics: emptyAnalytics("unavailable") }),
    focus: h(overview.EcosystemPriorities, { data: buildOverviewPriorities(prioritySources) }), goals: h(overview.EcosystemGoals, { goals: { state: "empty", items: [] } }), agents: null,
    directory: h(explorer.PageDirectory, { pages, incomplete: true }),
  }))
  assert.equal(ui.text("#product-heading"), "Product & knowledge")
  assert.match(ui.text("#features-heading"), /Product features/)
  assert.match(ui.text("#seiten"), /Cities & partner pages/)
  assert.equal(document.querySelector("#fleet-heading"), null)
  assert.match(ui.text("#priorities-heading"), /Next steps/)
  assert.match(ui.text("#ziele"), /No target values recorded yet/)
  assert.match(ui.text(".priorityList"), /Human approval pending/)
  assert.match(ui.text(".priorityList"), /Job failed/)
  assert.equal(document.querySelector('.priorityList h3').textContent, "Prüfung & Freigaben")
  const showAll = document.querySelector("#features > div button")
  await ui.click(showAll)
  assert.match(ui.text("#features"), /Registration, sign-in and guest access/)
  const featureCards = [...document.querySelectorAll(".featureCard")]
  assert.equal(featureCards.length, catalog.ecosystemCatalog.length)
  for (const [index, entry] of catalog.ecosystemCatalog.entries()) {
    const description = featureCards[index].querySelector(".featureExpanded p").textContent
    assert.ok(description.length > 0)
    assert.notEqual(description, entry.description, `${entry.id}: the rendered description must be English`)
  }
  await ui.click(document.querySelector("#product-tab-1"))
  assert.equal(document.querySelector("#product-panel-1").hidden, false)
  const tierButtons = [...document.querySelectorAll(".tierToggle button")]
  assert.deepEqual(tierButtons.map(button => button.textContent), ["User Free", "User Premium", "Partner Free", "Partner Pro"])
  for (const [index, tier] of catalog.tierCatalog.entries()) {
    await ui.click(tierButtons[index])
    const details = document.querySelector(".tierShared")
    assert.notEqual(details.querySelector("p").textContent, tier.description)
    assert.ok(details.querySelector("p").textContent.length > 0)
    assert.equal(details.querySelectorAll("li").length, tier.features.length)
    assert.ok(details.querySelector("h3").textContent.endsWith(tier.name), "Plan brands retain their spelling")
    assert.equal(details.querySelector("a").getAttribute("href"), tier.href)
    assert.notEqual(details.querySelector(".hubNote").textContent, tier.note)
    if (tier.id === "partner-free") assert.match(details.textContent, /3 team members including the owner/)
    if (tier.id === "partner-pro") {
      assert.match(details.textContent, /10 team members including the owner/)
      assert.match(details.textContent, /owner interview\/podcast/)
      assert.match(details.textContent, /one approved video and one 360° view or virtual tour/)
    }
    for (const [featureIndex, feature] of tier.features.entries()) {
      assert.notEqual([...details.querySelectorAll("li")][featureIndex].textContent, feature)
    }
  }
  for (const option of ["DE", "EN", "DE", "EN"]) {
    await ui.toggle(option)
    assert.equal(ui.text("#product-heading"), option === "DE" ? "Produkt & Wissen" : "Product & knowledge")
    assert.equal(document.querySelector(".tierShared h3").textContent, "Partner Pro")
    assert.equal(document.querySelector(".priorityList h3").textContent, "Prüfung & Freigaben")
    assert.ok([...document.querySelectorAll(".priorityList h3")].some(node => node.textContent === "Wissen"))
    assert.match(ui.text("#features"), option === "DE" ? /Registrierung, Anmeldung und Gastzugang/ : /Registration, sign-in and guest access/)
    assert.match(ui.text("#seiten"), option === "DE" ? /Seitendaten teilweise nicht verfügbar/ : /Page data partially unavailable/)
    assert.equal(document.querySelector('#page-search').getAttribute('placeholder'), option === "DE" ? "Stadt oder Partner …" : "City or partner …")
    assert.ok([...document.querySelectorAll('#seiten h3')].some(node => node.textContent === "Wissen"), "User-authored partner names retain their exact spelling")
    assert.equal(document.querySelector('#seiten a[target="_blank"]').getAttribute("href"), "https://benefitsi.de/stadt/annweiler")
  }
})

test("interactive analytics translates tabs, details and chart state while preserving chosen series and values", async t => {
  const ui = await mount(t, h(activity.EcosystemActivity, { analytics: measuredAnalytics }))
  assert.match(ui.text('[aria-label="Analytics section"]'), /Overview/)
  assert.match(ui.text('[aria-label="Analytics section"]'), /Product usage/)
  assert.equal(document.querySelector(".stageHead h2").textContent, "Overview.")
  assert.match(ui.text('[role="img"]'), /4/)
  assert.equal(document.querySelector('[role="img"]').getAttribute("aria-label"), "Active users, 3 time points. Missing data interrupts the trend.")
  assert.match(ui.text("details"), /All metrics/)
  assert.match(ui.text("details"), /Data sources/)
  const select = document.querySelector("select")
  await act(async () => { select.value = "visits"; select.dispatchEvent(new ui.dom.window.Event("change", { bubbles: true })); await ui.settle() })
  assert.match(ui.text("figure") || document.body.textContent, /No measurements in the history yet/)
  await ui.toggle("DE")
  assert.match(document.body.textContent, /Noch keine Messwerte im Verlauf/)
  assert.equal(select.value, "visits")
  await ui.toggle("EN")
  assert.equal(select.value, "visits")
  await ui.click([...document.querySelectorAll('[aria-label="Analytics section"] button')].find(button => button.textContent === "Product usage"))
  assert.match(document.body.textContent, /No measurements/)
  assert.equal(document.querySelector(".stageHead h2").textContent, "Product usage.")
  await ui.toggle("DE")
  assert.match(document.body.textContent, /Keine Messwerte/)
  assert.equal(document.querySelector('[aria-label="Analysebereich"] button[aria-pressed="true"]').textContent, "Produktnutzung")
})

test("loading, missing and access states render in both languages without claiming measured zeroes", async t => {
  const ui = await mount(t, h(overview.EcosystemSectionLoading, { label: "Kennzahlen werden geladen", variant: "metrics" }))
  assert.equal(document.querySelector('[role="status"]').textContent, "Loading metrics")
  await ui.toggle("DE")
  assert.equal(document.querySelector('[role="status"]').textContent, "Kennzahlen werden geladen")
  await ui.toggle("EN")
  for (const [state, en, de] of [["forbidden", "Analytics access missing", "Analytics-Zugriff fehlt"], ["setup_required", "Analytics not configured yet", "Analytics noch nicht eingerichtet"], ["unavailable", "Analytics currently unavailable", "Analytics derzeit nicht verfügbar"]]) {
    await ui.render(h(activity.EcosystemActivity, { analytics: emptyAnalytics(state) }))
    assert.match(document.body.textContent, new RegExp(en))
    assert.equal(document.querySelector("strong").textContent, "—")
    await ui.toggle("DE")
    assert.match(document.body.textContent, new RegExp(de))
    await ui.toggle("EN")
  }
})


test("directory type filtering uses stable values after rendered option labels change language", async t => {
  const pages = [{ id: "city", title: "Annweiler", kind: "Stadtseite", description: "", status: "Stadtseite", href: "https://benefitsi.de/stadt/annweiler", adminHref: "/city-pages/annweiler" }, { id: "partner", title: "Knobi", kind: "Microsite", description: "", status: "Entwurf", href: null, adminHref: "/partners?partner=k" }]
  const ui = await mount(t, h(explorer.PageDirectory, { pages, incomplete: false }))
  const select = document.querySelector("#page-type")
  assert.equal([...select.options].find(option => option.textContent === "City pages").value, "Stadtseite")
  await act(async () => { select.value = "Stadtseite"; select.dispatchEvent(new ui.dom.window.Event("change", { bubbles: true })); await ui.settle() })
  assert.deepEqual([...document.querySelectorAll("#seiten h3")].map(node => node.textContent), ["Annweiler"])
  await ui.toggle("DE")
  assert.equal(select.value, "Stadtseite")
  await ui.toggle("EN")
  assert.equal(select.value, "Stadtseite")
  await act(async () => { select.value = "Microsite"; select.dispatchEvent(new ui.dom.window.Event("change", { bubbles: true })); await ui.settle() })
  assert.deepEqual([...document.querySelectorAll("#seiten h3")].map(node => node.textContent), ["Knobi"])
})


test("Benefitsi agent cards translate expanded details while preserving names, private paths and model data", async t => {
  const profile = { id: "ben", scope: "benefitsi", purpose: "Koordiniert freigegebene Aufträge.", provider: "Wissen", model: "Prüfung & Freigaben", citySlug: null, automation: "scheduled", contextFiles: [{ path: "Wissen/notes.md", exists: true, chars: 42, limit: 100, loadedBy: "reference", modifiedAt: checkedAt }], contextHealth: "ok", runtimeHealth: "ok", schedules: [{ id: "Wissen", source: "launchd", enabled: true, cadence: "Alle 30 Minuten", lastRunAt: checkedAt, lastStatus: "queue_empty" }] }
  const data = { ...control, runtime: { state: "fresh", snapshot: { schemaVersion: 1, hostId: "m1-benefitsi", observedAt: checkedAt, collectorVersion: "1", profiles: [profile] } }, citySchedules: { state: "unavailable", items: [] }, pipeline: { state: "unavailable", item: null } }
  const ui = await mount(t, h(agentsPage.AgentOverview, { data, selectedAgentId: "ben" }))
  assert.match(document.body.textContent, /Your Benefitsi team/)
  assert.match(document.body.textContent, /Profiles, last evidenced runs and approvals/)
  const cards = document.querySelectorAll('[id^="agent-"]')
  assert.equal(cards.length, 6)
  const names = [...cards].map(card => card.querySelector("h3").textContent)
  assert.ok(names.includes("Content"))
  assert.ok(names.includes("Menü"))
  const ben = document.querySelector("#agent-ben")
  assert.equal(ben.querySelector("details").open, true)
  assert.match(ben.querySelector("summary").textContent, /Profile details/)
  assert.ok(ben.querySelector('section[aria-label="Markdown & model"]'))
  assert.match(ben.textContent, /Save task or knowledge/)
  assert.equal(ben.querySelector('select[name="profileId"]').value, "ben")
  const values = () => [...ben.querySelectorAll("dd")].map(node => node.textContent)
  assert.ok(values().includes("Wissen"))
  assert.ok(values().includes("Prüfung & Freigaben"))
  assert.match(ben.textContent, /Wissen\/notes.md/)
  assert.match(ben.textContent, /Every 30 minutes/)
  assert.match(document.body.textContent, /On demand · no run evidence/)
  for (const option of ["DE", "EN", "DE", "EN"]) {
    await ui.toggle(option)
    assert.deepEqual([...cards].map(card => card.querySelector("h3").textContent), names)
    assert.ok(values().includes("Wissen"))
    assert.ok(values().includes("Prüfung & Freigaben"))
    assert.equal(ben.querySelector("details").open, true)
    assert.match(ben.querySelector("summary").textContent, option === "DE" ? /Profil-Details/ : /Profile details/)
    assert.match(document.body.textContent, option === "DE" ? /Auf Abruf: startet durch einen passenden Auftrag im Admin/ : /On demand: starts through a suitable job in the admin/)
    assert.match(ben.textContent, /Wissen\/notes.md/)
  }
})


test("product hub keyboard navigation exposes one shared panel and retains its selected access plan across languages", async t => {
  const ui = await mount(t, h(hub.EcosystemProductHub))
  const tabs = [...document.querySelectorAll('[role="tab"]')]
  const panels = [...document.querySelectorAll('[role="tabpanel"]')]
  const active = () => tabs.findIndex(tab => tab.getAttribute("aria-selected") === "true")
  const key = async (index, value) => { await act(async () => { tabs[index].focus(); tabs[index].dispatchEvent(new ui.dom.window.KeyboardEvent("keydown", { key: value, bubbles: true })); await ui.settle() }) }
  const check = index => {
    assert.equal(active(), index)
    assert.equal(panels.filter(panel => !panel.hidden).length, 1)
    assert.equal(panels[index].hidden, false)
    assert.equal(tabs.filter(tab => tab.tabIndex === 0).length, 1)
    assert.equal(tabs[index].getAttribute("aria-controls"), panels[index].id)
  }
  check(0)
  assert.deepEqual(tabs.map(tab => tab.textContent), ["Features", "Access plans", "Knowledge"])
  await key(0, "ArrowRight"); check(1)
  assert.equal(document.activeElement, tabs[1])
  await ui.click(document.querySelectorAll('.tierToggle button')[1])
  assert.equal(document.querySelector('.tierShared h3').textContent, "User Premium")
  await key(1, "End"); check(2)
  assert.equal(document.activeElement, tabs[2])
  assert.match(panels[2].textContent, /Knowledge status currently unavailable/)
  assert.match(panels[2].textContent, /The knowledge mirror remains read-only/i)
  assert.equal(panels[2].querySelector("a").getAttribute("href"), "/wissen")
  assert.match(panels[2].textContent, /Save task or knowledge/)
  assert.match(panels[2].textContent, /Benefitsi Obsidian vault/)
  assert.equal(networkCalls.length, 0); assert.equal(refreshes, 0)
  await ui.toggle("DE")
  assert.deepEqual(tabs.map(tab => tab.textContent), ["Funktionen", "Zugänge", "Wissen"])
  check(2)
  await key(2, "Home"); check(0)
  await key(0, "ArrowLeft"); check(2)
  await key(2, "ArrowLeft"); check(1)
  assert.equal(document.querySelector('.tierShared h3').textContent, "Nutzer Premium")
  await ui.toggle("EN")
  assert.equal(document.querySelector('.tierShared h3').textContent, "User Premium")
  check(1)
})


test("knowledge status distinguishes missing and unknown counts from synchronized data in both languages", async t => {
  const ui = await mount(t, h(overview.EcosystemKnowledgeStatus, { status: { status: "unavailable", documentCount: 0, lastSuccessfulSyncAt: null, lastErrorCode: null } }))
  for (const [state, en, de, expectedCount] of [["unavailable", "Missing data", "Daten fehlen", "—"], ["unknown", "Status unknown", "Status unbekannt", "—"], ["healthy", "Synchronized", "Synchronisiert", "17"], ["syncing", "Synchronization in progress", "Synchronisierung läuft", "17"], ["failed", "Error reported", "Fehler gemeldet", "17"]]) {
    await ui.render(h(overview.EcosystemKnowledgeStatus, { status: { status: state, documentCount: 17, lastSuccessfulSyncAt: state === "healthy" ? checkedAt : null, lastErrorCode: "private-error-code" } }))
    assert.match(ui.text("dl"), new RegExp(en))
    assert.equal(document.querySelectorAll("dd")[1].textContent, expectedCount)
    assert.doesNotMatch(ui.text("dl"), /private-error-code/)
    await ui.toggle("DE")
    assert.match(ui.text("dl"), new RegExp(de))
    assert.equal(document.querySelectorAll("dd")[1].textContent, expectedCount)
    await ui.toggle("EN")
  }
})

test("priorities keep authored tasks intact and translate derived labels, source gaps and empty states", async t => {
  const sources = { ...prioritySources, jobs: readySource([]), workspace: readySource([{ id: "00000000-0000-4000-8000-000000000001", title: "", status: "blocked", content: {} }]), editorial: readySource([{ id: "00000000-0000-4000-8000-000000000004", title: "" }]) }
  const ui = await mount(t, h(overview.EcosystemPriorities, { data: buildOverviewPriorities(sources) }))
  assert.match(ui.text("section"), /Editorial draft/)
  assert.match(ui.text("section"), /Pending clarification/)
  assert.match(ui.text("section"), /Needs clarification/)
  await ui.toggle("DE")
  assert.match(ui.text("section"), /Redaktioneller Entwurf/)
  assert.match(ui.text("section"), /Offene Klärung/)
  await ui.toggle("EN")
  const empty = { checkedAt, jobs: readySource([]), workspace: readySource([]), editorial: readySource([]) }
  await ui.render(h(overview.EcosystemPriorities, { data: buildOverviewPriorities(empty) }))
  assert.match(ui.text("section"), /No open tasks in the checked sources/)
  await ui.toggle("DE")
  assert.match(ui.text("section"), /Keine offenen Aufgaben in den geprüften Quellen/)
  await ui.toggle("EN")
  await ui.render(h(overview.EcosystemPriorities, { data: buildOverviewPriorities({ ...empty, workspace: { state: "unavailable", items: [], truncated: false } }) }))
  assert.match(ui.text("section"), /Open tasks are not fully evidenced at present/)
  assert.match(ui.text("section"), /Sources unavailable: Partner workspace/)
  await ui.toggle("DE")
  assert.match(ui.text("section"), /Offene Aufgaben derzeit nicht vollständig nachgewiesen/)
  assert.match(ui.text("section"), /Quellen nicht verfügbar: Partner-Workspace/)
})

test("integrated knowledge entry saves authored content once on explicit action and refreshes only after verified receipt", async t => {
  const ui = await mount(t, h(hub.EcosystemProductHub))
  assert.equal(networkCalls.length, 0)
  await ui.click(document.querySelector("#product-tab-2"))
  await ui.click(document.querySelector(".knowledgeCapture > summary"))
  await ui.click(document.querySelector(".knowledgeCapture details > summary"))
  const change = async (selector, value) => act(async () => {
    const element = document.querySelector(selector)
    const prototype = element.tagName === "TEXTAREA" ? ui.dom.window.HTMLTextAreaElement.prototype : ui.dom.window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value)
    element.dispatchEvent(new ui.dom.window.Event("input", { bubbles: true })); await ui.settle()
  })
  await change('input[name="title"]', "Wissen")
  await change('textarea[name="content"]', '<script>window.BAD=true</script> Prüfung & Freigaben · $&')
  assert.equal(networkCalls.length, 0)
  await ui.toggle("DE")
  assert.equal(document.querySelector('textarea').value, '<script>window.BAD=true</script> Prüfung & Freigaben · $&')
  fetchResult = async (_url, init) => {
    const input = JSON.parse(init.body)
    return { ok: true, json: async () => ({ schemaVersion: 1, sourceId: "benefitsi-obsidian", ownership: "BENEFITSI_EXTERNAL", checkedAt, path: "96 Aufgaben/note.md", title: input.title, kind: input.kind, sha256: "a".repeat(64), readbackVerified: true, created: true, mirrorState: "pending" }) }
  }
  await ui.click(document.querySelector('button[type="submit"]'))
  assert.equal(networkCalls.length, 1); assert.equal(refreshes, 1)
  assert.equal(networkCalls[0].url, "/api/knowledge/notes")
  const submitted = JSON.parse(networkCalls[0].init.body)
  assert.equal(submitted.title, "Wissen")
  assert.equal(submitted.content, '<script>window.BAD=true</script> Prüfung & Freigaben · $&')
  assert.equal(document.querySelector('button[type="submit"]').disabled, true)
  assert.match(document.querySelector('[role="status"]').textContent, /In Obsidian gespeichert; Wissensspiegel wird separat aktualisiert/)
  await ui.toggle("EN")
  assert.match(document.querySelector('[role="status"]').textContent, /Saved in Obsidian; the knowledge mirror updates separately/)
  assert.equal(document.querySelector('code').textContent, "96 Aufgaben/note.md")
  assert.equal(document.querySelector('script'), null)
  assert.equal(networkCalls.length, 1); assert.equal(refreshes, 1)
})

test("native Obsidian priorities translate actions and unassigned context while preserving titles and assigned profile names",async t=>{
  const tasks=[{id:"00000000-0000-4000-8000-000000000007",title:"Wissen",profileId:"benefitsi-menu",dueDate:null,state:"open"},{id:"00000000-0000-4000-8000-000000000008",title:"Prüfung & Freigaben",profileId:null,dueDate:null,state:"open"}]
  const data=buildOverviewPriorities({checkedAt,jobs:readySource([]),editorial:readySource([]),workspace:readySource([]),knowledge:readySource(tasks)})
  const ui=await mount(t,h(overview.EcosystemPriorities,{data}))
  assert.match(ui.text("section"),/Benefitsi knowledge/)
  const titles=()=>[...document.querySelectorAll(".priorityList h3")].map(node=>node.textContent)
  assert.deepEqual(titles(),["Wissen","Prüfung & Freigaben"])
  for(const option of["DE","EN"]){
    await ui.toggle(option)
    assert.deepEqual(titles(),["Wissen","Prüfung & Freigaben"])
    assert.match(ui.text("section"),/Menü/)
    const link=document.querySelector('a[href="/wissen?note=00000000-0000-4000-8000-000000000007"]')
    assert.equal(link.textContent,option==="DE"?"Aufgabe öffnen":"Open task")
  }
})
