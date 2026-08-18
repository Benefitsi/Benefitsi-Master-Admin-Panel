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
