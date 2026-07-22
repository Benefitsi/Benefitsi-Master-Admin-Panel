import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_MENU_STATUS } from "../lib/partner-config.ts"

test("new menus default to published", () => {
  assert.equal(DEFAULT_MENU_STATUS, "published")
})
