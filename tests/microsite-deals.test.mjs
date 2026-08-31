import assert from "node:assert/strict"
import test from "node:test"
import { isMicrositeTwoForOneDeal } from "../lib/microsite-deals.ts"

test("shows the 2-for-1 image option only for an active matching deal", () => {
  assert.equal(
    isMicrositeTwoForOneDeal({
      active: true,
      reward_item: "2 für 1 Hauptgericht",
      stock_remaining: 20,
    }),
    true,
  )
  assert.equal(
    isMicrositeTwoForOneDeal({
      active: false,
      reward_item: "2 für 1 Hauptgericht",
      stock_remaining: 20,
    }),
    false,
  )
  assert.equal(
    isMicrositeTwoForOneDeal({
      active: true,
      reward_item: "10% Rabatt",
      stock_remaining: 20,
    }),
    false,
  )
})
