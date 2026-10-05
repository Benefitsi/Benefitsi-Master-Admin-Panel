import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_MENU_STATUS, partnerMediaSpecs } from "../lib/partner-config.ts"

test("new menus default to published", () => {
  assert.equal(DEFAULT_MENU_STATUS, "published")
})

test("discovery cards use the shared recommended dimensions", () => {
  assert.equal(partnerMediaSpecs.discover.width, 880)
  assert.equal(partnerMediaSpecs.discover.height, 960)
})

test("logo previews fill a square circular mask", () => {
  assert.equal(partnerMediaSpecs.logo.previewAspectWidth, 1)
  assert.equal(partnerMediaSpecs.logo.previewAspectHeight, 1)
  assert.equal(partnerMediaSpecs.logo.previewFit, "cover")
})
