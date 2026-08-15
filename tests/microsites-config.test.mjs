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
  assert.match(config.branding.accent, /^#[0-9a-f]{6}$/i)
  assert.match(config.branding.accentSecondary, /^#[0-9a-f]{6}$/i)
  assert.match(config.branding.accentTertiary, /^#[0-9a-f]{6}$/i)
  assert.ok(config.content.quoteText.length > 0)
  assert.ok(config.content.quoteAttribution.length > 0)
})

test("legacy template ids resolve to the only supported default template", () => {
  assert.equal(
    resolveMicrositeConfig({ template: "festival-neon" }, partner).template,
    "restaurant-premium",
  )
})
