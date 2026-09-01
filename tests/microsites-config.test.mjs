import assert from "node:assert/strict"
import test from "node:test"

import {
  createDefaultMicrositeConfig,
  resolveMicrositeConfig,
} from "../lib/microsites.ts"

const partner = {
  id: "partner-1",
  name: "Test Restaurant",
  type: "Gastronomie",
  category: ["Pizza"],
  city_name: "Annweiler",
}

test("microsites default to light mode and preserve a valid dark mode", () => {
  assert.equal(createDefaultMicrositeConfig(partner).appearance.mode, "light")
  assert.equal(
    resolveMicrositeConfig({ appearance: { mode: "dark" } }, partner).appearance.mode,
    "dark",
  )
})

test("invalid or missing appearance data falls back safely to light mode", () => {
  assert.equal(resolveMicrositeConfig({}, partner).appearance.mode, "light")
  assert.equal(
    resolveMicrositeConfig({ appearance: { mode: "sepia" } }, partner).appearance.mode,
    "light",
  )
})

test("microsites expose one three-color default template with editable quote copy", () => {
  const config = createDefaultMicrositeConfig(partner)

  assert.equal(config.template, "restaurant-premium")
  assert.equal(config.branding.paletteMode, "auto")
  assert.equal(config.branding.accent, "#118cff")
  assert.equal(config.branding.accentSecondary, "#061829")
  assert.equal(config.branding.accentTertiary, "#17d4d7")
  assert.ok(config.content.quoteText.length > 0)
  assert.ok(config.content.quoteAttribution.length > 0)
})

test("microsite defaults do not invent a partner-specific two-for-one item", () => {
  const config = createDefaultMicrositeConfig(partner)

  assert.equal(config.deals.topDealHeadline, "Aktueller Vorteil")
  assert.equal(
    config.deals.topDealDescription,
    "Entdecke den aktuellen Vorteil in der Benefitsi-App.",
  )
  assert.deepEqual(config.deals.topDealBullets, [
    "Gültig gemäß Vorteilsbedingungen",
    "In der Benefitsi-App auswählen",
    "Nur in Annweiler",
  ])
  assert.doesNotMatch(JSON.stringify(config.deals), /döner/i)
})

test("legacy hardcoded doner fallback is normalized when a microsite is loaded", () => {
  const config = resolveMicrositeConfig(
    {
      deals: {
        topDealHeadline: "2 für 1 Döner",
        topDealDescription: "Zwei Döner genießen – nur einen bezahlen!",
        topDealBullets: [
          "Gültig für alle Döner",
          "Täglich einlösbar",
          "Nur in Annweiler",
        ],
      },
    },
    partner,
  )

  assert.equal(config.deals.topDealHeadline, "Aktueller Vorteil")
  assert.equal(
    config.deals.topDealDescription,
    "Entdecke den aktuellen Vorteil in der Benefitsi-App.",
  )
  assert.doesNotMatch(JSON.stringify(config.deals), /döner/i)
})

test("legacy top-deal labels are normalized to the neutral benefit label", () => {
  const config = resolveMicrositeConfig(
    {
      deals: {
        topDealLabel: "Top Deal",
      },
    },
    partner,
  )

  assert.equal(config.deals.topDealLabel, "Vorteil")
})

test("legacy template ids resolve to the only supported default template", () => {
  assert.equal(
    resolveMicrositeConfig({ template: "festival-neon" }, partner).template,
    "restaurant-premium",
  )
})
