import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_MENU_STATUS, partnerMediaSpecs } from "../lib/partner-config.ts"

test("new menus default to published", () => {
  assert.equal(DEFAULT_MENU_STATUS, "published")
})

test("discovery cards are prepared at 384 by 420 pixels", () => {
  assert.equal(partnerMediaSpecs.discover.width, 384)
  assert.equal(partnerMediaSpecs.discover.height, 420)
})
