import assert from "node:assert/strict"
import test from "node:test"
import { existsSync } from "node:fs"

test("consumer display ordering keeps an eligible Drop first, honors explicit order and otherwise prefers 2-for-1", async () => {
  assert.ok(existsSync(new URL("../lib/deal-display-order.ts", import.meta.url)), "the shared display ordering policy is missing")
  const { sortDealsForDisplay } = await import("../lib/deal-display-order.ts")
  const now = new Date("2026-10-07T10:00:00Z")
  const fixtures = [
    { id: "regular", type: "discount", active: true },
    { id: "two", type: "two_for_one", active: true },
    { id: "drop", type: "limited_drop", active: true, valid_from: "2026-10-07T09:00:00Z", valid_until: "2026-10-08T09:00:00Z", stock_remaining: 4 },
  ]
  assert.deepEqual(sortDealsForDisplay(fixtures, now).map(row => row.id), ["drop", "two", "regular"])
  assert.deepEqual(sortDealsForDisplay(fixtures.map((row, display_order) => ({ ...row, display_order })), now).map(row => row.id), ["drop", "regular", "two"])
  assert.deepEqual(sortDealsForDisplay(fixtures.map(row => row.id === "drop" ? { ...row, stock_remaining: 0 } : row), now).map(row => row.id), ["two", "drop", "regular"])
  assert.equal(fixtures[0].id, "regular", "sorting must not mutate the loaded partner snapshot")
})
