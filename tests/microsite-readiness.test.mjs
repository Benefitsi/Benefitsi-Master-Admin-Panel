import assert from "node:assert/strict"
import test from "node:test"

import {
  createMicrositeReadinessReport,
  micrositeReadinessEnglishTranslations,
} from "../lib/microsite-readiness.ts"
import { createDefaultMicrositeConfig } from "../lib/microsites.ts"

function partnerFixture(overrides = {}) {
  return {
    name: "Test Partner",
    logo_url: null,
    address: null,
    phone: null,
    coordinates: null,
    opening_hours: [],
    menus: [],
    deals: [],
    microsite: null,
    ...overrides,
  }
}

test("readiness no longer includes the manual partner data review item", () => {
  const partner = partnerFixture()
  const report = createMicrositeReadinessReport(
    partner,
    createDefaultMicrositeConfig(partner),
  )

  assert.equal(report.items.some((item) => item.id === "partner-review"), false)
})

test("readiness uses forgiving content thresholds", () => {
  const partner = partnerFixture({
    phone: "+49 123 456",
    menus: [
      {
        categories: [],
        items: [
          { name: "First", price: 8.5, image_url: "/first.jpg" },
          { name: "Second", price: null, image_url: null },
        ],
      },
    ],
  })
  const config = createDefaultMicrositeConfig(partner)
  config.template = "restaurant-premium"
  config.deals.topDealImageUrl = ""
  config.seo.title = "123456789012"
  config.seo.description = "x".repeat(50)
  config.seo.keywords = ["food", "local"]

  const report = createMicrositeReadinessReport(partner, config)
  const byId = new Map(report.items.map((item) => [item.id, item]))

  assert.equal(byId.get("menu-prices")?.ok, true)
  assert.equal(byId.get("menu-images")?.ok, true)
  assert.equal(byId.get("mobile-actions")?.ok, true)
  assert.equal(byId.get("top-deal-image")?.ok, true)
  assert.equal(byId.get("seo-title")?.ok, true)
  assert.equal(byId.get("seo-description")?.ok, true)
  assert.equal(byId.get("seo-keywords")?.ok, true)
})

test("every readiness label and detail has an English translation", () => {
  const partner = partnerFixture()
  const report = createMicrositeReadinessReport(
    partner,
    createDefaultMicrositeConfig(partner),
  )

  for (const item of report.items) {
    assert.ok(
      micrositeReadinessEnglishTranslations[item.label],
      `Missing English label for ${item.id}: ${item.label}`,
    )
    assert.ok(
      micrositeReadinessEnglishTranslations[item.detail],
      `Missing English detail for ${item.id}: ${item.detail}`,
    )
  }
})
