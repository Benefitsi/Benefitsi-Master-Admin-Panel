import assert from "node:assert/strict"
import test from "node:test"
import { translateValue } from "../app/admin-language.tsx"

const workflows = [
  ["Observed configuration", "Beobachtete Konfiguration"],
  ["Agents, schedules and approvals", "Agenten, Pläne und Freigaben"],
  ["Create test provider", "Test-Anbieter anlegen"],
  ["Prepare a bookable experience", "Buchbares Erlebnis vorbereiten"],
  ["Order access by partner", "Bestellfreischaltung nach Partner"],
  ["No measurement runs for this target yet.", "Noch keine Messläufe für dieses Ziel."],
  ["Knowledge mirror", "Wissensspiegel"],
  ["Private Benefitsi knowledge – read-only view", "Privater Benefitsi-Wissensstand – schreibgeschützte Ansicht"],
  ["Context file missing", "Kontextdatei fehlt"],
  ["Technical check needed", "Technische Prüfung nötig"],
]

test("business and operations pages follow both language choices", () => {
  for (const [english, german] of workflows) {
    assert.equal(translateValue(german, "en"), english)
    assert.equal(translateValue(english, "de"), german)
  }
})

test("operations templates translate copy without changing identifiers", () => {
  assert.equal(translateValue("Technische Einzelheiten zu benefitsi-finance", "en"), "Technical details for benefitsi-finance")
  assert.equal(translateValue("Technical details for benefitsi-finance", "de"), "Technische Einzelheiten zu benefitsi-finance")
  assert.equal(translateValue("  Unbekannte Stadt · city-01  ", "en"), "  Unknown city · city-01  ")
  assert.equal(translateValue("Partner suchen, z. B. Knobi", "en"), "Search partners, e.g. Knobi")
})

test("analytics values format raw measurements with the selected locale", async () => {
  const { formatAnalyticsValue } = await import("../lib/analytics/normalize.ts")
  assert.equal(formatAnalyticsValue(1234, "count", null, "en-GB"), "1,234")
  assert.equal(formatAnalyticsValue(1.5, "days", null, "en-GB"), "1.5 days")
  assert.equal(formatAnalyticsValue(1.5, "days", null, "de-DE"), "1,5 Tage")
})

test("knowledge documents retain authored text while controls and dates change language", async () => {
  const React = await import("react")
  const { createRoot } = await import("react-dom/client")
  const { JSDOM } = await import("jsdom")
  const { AdminLanguageProvider, useAdminLanguage } = await import("../app/admin-language.tsx")
  const { KnowledgeBrowser } = await import("../app/wissen/knowledge-browser.tsx")
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost" })
  const names = ["window", "self", "document", "Element", "Text", "Node", "NodeFilter", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] })
  const root = createRoot(document.getElementById("root"))
  let setLanguage
  function Control() { setLanguage = useAdminLanguage().setLanguage; return null }
  const settle = () => new Promise(resolve => setTimeout(resolve, 15))
  const timestamp = "2026-10-09T10:30:00Z"
  const doc = { id: "doc-1", title: "Beobachtete Konfiguration", content: "Beobachtete Konfiguration", relativePath: "notes/overview.md", sourceModifiedAt: timestamp, syncedAt: timestamp, isDeleted: false }
  try {
    await React.act(async () => {
      root.render(React.createElement(AdminLanguageProvider, null, React.createElement(Control), React.createElement(KnowledgeBrowser, {
        query: "", page: 0, status: { status: "healthy", lastSuccessfulSyncAt: timestamp, documentCount: 1, lastErrorCode: null },
        search: { totalCount: 1, items: [doc], hasMore: false, errorCode: null }, detail: doc,
      })))
      await settle()
    })
    await React.act(settle)
    assert.equal(document.querySelector("pre").textContent.trim(), "Beobachtete Konfiguration")
    assert.equal(document.querySelector("tbody td").textContent, "Beobachtete Konfiguration")
    assert.equal(document.querySelector("input").placeholder, "Search title or content …")
    assert.match(document.body.textContent, /9 Oct 2026/)
    await React.act(async () => { setLanguage("de"); await settle() })
    assert.equal(document.querySelector("pre").textContent.trim(), "Beobachtete Konfiguration")
    assert.equal(document.querySelector("input").placeholder, "Titel oder Inhalt suchen …")
    assert.match(document.body.textContent, /09\.10\.2026/)
  } finally {
    await React.act(async () => root.unmount())
    for (const name of names) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else delete globalThis[name] }
    dom.window.close()
  }
})

test("stored operational codes display localized state and feedback labels", async () => {
  const { operationsStatusLabel, operationsFeedbackLabel } = await import("../lib/admin-i18n/operations-labels.ts")
  assert.equal(translateValue(operationsStatusLabel("payment_pending"), "en"), "Payment pending")
  assert.equal(translateValue(operationsStatusLabel("payment_pending"), "de"), "Zahlung ausstehend")
  assert.equal(translateValue(operationsStatusLabel("agent_draft"), "en"), "Agent draft")
  assert.equal(translateValue(operationsFeedbackLabel("city_scan_queued"), "en"), "City scan queued")
  assert.equal(translateValue(operationsFeedbackLabel("offer_published"), "de"), "Angebot veröffentlicht")
})

test("ecosystem and financial interface copy does not stop at partial word substitutions", () => {
  assert.equal(translateValue("Abmelden und Konto löschen", "en"), "Sign out and delete account")
  assert.equal(translateValue("Deals & Treue", "en"), "Benefits & loyalty")
  assert.equal(translateValue("Premium-Angebote und Deal Drops", "en"), "Premium benefits and deal drops")
  assert.equal(translateValue("· Zeitzone Europe/Berlin · Währung EUR", "en"), "· Time zone Europe/Berlin · Currency EUR")
  assert.equal(translateValue("Booking Control", "de"), "Buchungssteuerung")
})

test("ranking, chart and history terms retain their separate meanings", () => {
  assert.equal(translateValue("Position", "de"), "Position")
  assert.equal(translateValue("Suchposition", "en"), "Search position")
  assert.equal(translateValue("Search position", "de"), "Suchposition")
  assert.equal(translateValue("Verlauf", "en"), "History")
  assert.equal(translateValue("Trend", "de"), "Trend")
  assert.equal(translateValue("Booking Control unavailable", "de"), "Buchungsverwaltung nicht verfügbar")
  assert.equal(translateValue("Buchungsverwaltung nicht verfügbar", "en"), "Booking Control unavailable")
})

test("booking detail subtitle preserves the authored offer and localizes its state", async () => {
  const React = await import("react")
  const { createRoot } = await import("react-dom/client")
  const { JSDOM } = await import("jsdom")
  const { AdminLanguageProvider, useAdminLanguage } = await import("../app/admin-language.tsx")
  const { loadTypescript } = await import("./helpers/load-typescript.mjs")
  const offerTitle = "Beobachtete Konfiguration"
  const booking = {
    id: "f4c2ab99-04a4-4b18-8331-b128a8508420", publicReference: "TEST-42",
    state: "payment_pending", offerTitle, providerName: "Test-Anbieter", quantity: 1,
    totalAmount: 1200, applicationFeeAmount: 100, createdAt: "2026-10-09T10:30:00Z",
  }
  const { default: BookingDetailPage } = loadTypescript("app/bookings/[bookingId]/page.tsx", {
    "@/lib/admin": { requireAdmin: async () => ({ adminSession: { profile: { display_name: "Admin" }, user: {} } }) },
    "@/lib/bookings/data": { loadBookingDetail: async () => ({ booking, data: { providers: [], offers: [], slots: [] }, audit: [] }) },
    "@/lib/stripe/config": { isStripeTestConfigured: () => false },
    "@/app/bookings/actions": { cancelOrRefundBooking: async () => {} },
    "@/app/admin-shell": { AdminShell: ({ subtitle }) => React.createElement("p", { id: "booking-subtitle" }, subtitle) },
  })
  const page = await BookingDetailPage({ params: Promise.resolve({ bookingId: booking.id }), searchParams: Promise.resolve({}) })
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost" })
  const names = ["window", "self", "document", "Element", "Text", "Node", "NodeFilter", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] })
  const root = createRoot(document.getElementById("root"))
  let setLanguage
  function Control() { setLanguage = useAdminLanguage().setLanguage; return null }
  const settle = () => new Promise(resolve => setTimeout(resolve, 15))
  try {
    await React.act(async () => {
      root.render(React.createElement(AdminLanguageProvider, null, React.createElement(Control), page))
      await settle()
    })
    await React.act(async () => { setLanguage("en"); await settle() })
    assert.equal(document.querySelector("#booking-subtitle").textContent, `${offerTitle} · Payment pending`)
    assert.equal(document.querySelector("#booking-subtitle [data-admin-i18n-ignore]").textContent, offerTitle)
    await React.act(async () => { setLanguage("de"); await settle() })
    assert.equal(document.querySelector("#booking-subtitle").textContent, `${offerTitle} · Zahlung ausstehend`)
  } finally {
    await React.act(async () => root.unmount())
    for (const name of names) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else delete globalThis[name] }
    dom.window.close()
  }
})

test("SEO metrics and analytics SVG values keep their Intl separators after provider translation", async () => {
  const React = await import("react")
  const { createRoot } = await import("react-dom/client")
  const { JSDOM } = await import("jsdom")
  const language = await import("../app/admin-language.tsx")
  const { loadTypescript } = await import("./helpers/load-typescript.mjs")
  const { SeoSetupPanel } = loadTypescript("app/seo/seo-setup-panel.tsx", {
    "@/app/admin-language": language,
    "./setup-actions": { saveSeoSetupAction: async () => {}, runGoogleMeasurementAction: async () => {} },
  })
  const { EcosystemActivity } = loadTypescript("components/ecosystem/ecosystem-analytics.tsx", {
    "@/app/admin-language": language,
    "./ecosystem.module.css": {}, "./ecosystem-analytics.module.css": {},
  })
  const observedAt = "2026-10-09T10:30:00Z"
  const series = {
    key: "visits", title: "Besuche", unit: "count", quality: "verified", source: "Produktmessung", asOf: observedAt,
    points: [{ date: "2026-10-09", label: null, value: 12345, comparisonValue: null }],
  }
  const analytics = {
    state: "ready", freshness: null, period: null,
    views: [{ key: "overview", label: "Überblick", kpis: [], series: [series], tables: [], caveats: [], asOf: observedAt }],
  }
  const audits = [{ id: "audit-1", created_at: observedAt, evidence: {
    source: "Google", provider: "gsc", state: "ok", observedAt,
    data: { totals: { clicks: 12345, impressions: 12345.67 }, queries: [{ query: "Test", clicks: 12345, impressions: 12345.67 }] },
  } }]
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost" })
  const names = ["window", "self", "document", "Element", "Text", "Node", "NodeFilter", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] })
  const root = createRoot(document.getElementById("root"))
  let setLanguage
  function Control() { setLanguage = language.useAdminLanguage().setLanguage; return null }
  const settle = () => new Promise(resolve => setTimeout(resolve, 15))
  try {
    await React.act(async () => {
      root.render(React.createElement(language.AdminLanguageProvider, null, React.createElement(Control),
        React.createElement("div", { id: "numeric-seo" }, React.createElement(SeoSetupPanel, {
          target: { id: "target-1", target_type: "city_page", canonical_url: "https://example.com/city", provider_config: {}, updated_at: observedAt }, audits,
        })),
        React.createElement("div", { id: "numeric-chart" }, React.createElement(EcosystemActivity, { analytics })),
      ))
      await settle()
    })
    for (const [selected, integer, decimal, axis, status] of [
      ["en", "12,345", "12,345.67", "12.3k", "Measurement available"],
      ["de", "12.345", "12.345,67", "12.345", "Messung verfügbar"],
      ["en", "12,345", "12,345.67", "12.3k", "Measurement available"],
    ]) {
      await React.act(async () => { setLanguage(selected); await settle() })
      // Let the provider's MutationObserver process the newly formatted client text.
      await React.act(settle)
      assert.equal(document.querySelectorAll("#numeric-seo dd")[0].textContent, integer)
      assert.equal(document.querySelectorAll("#numeric-seo dd")[1].textContent, decimal)
      assert.equal(document.querySelectorAll("#numeric-seo tbody td")[1].textContent, integer)
      assert.equal(document.querySelectorAll("#numeric-seo tbody td")[2].textContent, decimal)
      assert.ok(document.querySelector("#numeric-seo article > p").textContent.includes(status))
      assert.equal(document.querySelector("#numeric-chart svg text").textContent, axis)
      assert.ok(document.querySelector("#numeric-chart circle title").textContent.endsWith(`: ${integer}`))
      assert.equal(document.querySelector("#numeric-chart figcaption span:last-child").textContent, selected === "en" ? "Confirmed" : "Bestätigt")
    }
  } finally {
    await React.act(async () => root.unmount())
    for (const name of names) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else delete globalThis[name] }
    dom.window.close()
  }
})
