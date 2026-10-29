import assert from "node:assert/strict"
import test from "node:test"
import { readAllMenuItems } from "../lib/paged-menu-items.ts"

function fixture(rows, failAt = -1) {
  const ranges = [], orders = []
  const client = { from(table) {
    assert.equal(table, "menu_items")
    const query = {
      select(columns) { assert.equal(columns, "*"); return query },
      order(column, options) { orders.push([column, options]); return query },
      async range(start, end) {
        ranges.push([start, end])
        return start === failAt
          ? { data: null, error: { message: "unavailable", code: "503" } }
          : { data: rows.slice(start, end + 1), error: null }
      },
    }
    return query
  } }
  return { client, ranges, orders }
}

test("loads every item beyond the database's 1,000-row cap with stable ordering", async () => {
  const rows = Array.from({ length: 1247 }, (_, id) => ({ id }))
  const { client, ranges, orders } = fixture(rows)
  assert.deepEqual(await readAllMenuItems(client), { data: rows, error: null })
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]])
  assert.deepEqual(orders.slice(0, 2), [
    ["sort_order", { ascending: true, nullsFirst: false }],
    ["id", { ascending: true }],
  ])
})

test("checks the page after an exact multiple and handles an empty catalogue", async () => {
  for (const length of [0, 1000]) {
    const rows = Array.from({ length }, (_, id) => ({ id }))
    const { client, ranges } = fixture(rows)
    assert.deepEqual((await readAllMenuItems(client)).data, rows)
    assert.equal(ranges.length, length / 500 + 1)
  }
})

test("returns the error instead of a misleading partial menu catalogue", async () => {
  const { client } = fixture(Array.from({ length: 750 }, (_, id) => ({ id })), 500)
  const result = await readAllMenuItems(client)
  assert.equal(result.data, null)
  assert.equal(result.error.message, "unavailable")
})
