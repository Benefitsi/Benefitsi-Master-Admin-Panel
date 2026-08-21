import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")

test("city editor exposes Memory Stamps as a nested city workspace", async () => {
  const page = await read("app/city-pages/[citySlug]/page.tsx")
  const shell = await read("app/admin-shell.tsx")

  assert.match(page, /city-pages\/\$\{city\.slug\}\/memory-stamps/)
  assert.match(page, /Memory Stamps/)
  assert.match(shell, /memory-stamps/)
})

test("memory configuration keeps ten stable slots and protects the pending Bahnhof", async () => {
  const config = await read("lib/city-memory/config.ts")

  assert.match(config, /PENDING_PLACE_RELATION/)
  assert.match(config, /Bahnhof Annweiler am Trifels/)
  assert.match(config, /annweiler-memory-10/)
  assert.match(config, /placeId: undefined/)
  assert.equal((config.match(/number: \d+/g) ?? []).length, 10)
})

test("memory admin uses the shared media library contract", async () => {
  const [manager, route, assetRoute, assignmentRoute] = await Promise.all([
    read("components/city-memory/memory-stamp-manager.tsx"),
    read("app/api/city-pages/[citySlug]/memory-stamps/route.ts"),
    read("app/api/media/[assetId]/route.ts"),
    read("app/api/media/[assetId]/assignments/route.ts"),
  ])

  assert.match(manager, /\/api\/media/)
  assert.match(manager, /\/assignments/)
  assert.match(manager, /entityType: "COLLECTION"/)
  assert.match(manager, /role: "CARD"/)
  assert.match(manager, /status.*DRAFT|DRAFT.*status/)
  assert.match(route, /PENDING_PLACE_RELATION/)
  assert.match(route, /publish|review/i)
  assert.match(assetRoute, /pending_place_relation/)
  assert.match(assignmentRoute, /isPendingCityMemorySlot/)
})
