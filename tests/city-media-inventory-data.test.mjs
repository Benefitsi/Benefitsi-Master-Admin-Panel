import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import { trustedMediaThumbnail } from "../lib/city-media/inventory.ts"

function setup(session, overrides = {}, factoryFails = false) {
  const events = []
  const privateMarker = "private-audit-content-not-for-browser"
  const results = {
    city_media_assets: [{ id: "asset-1", city_id: "city-a", title: "Test", status: "PUBLISHED", source_type: "MANUAL_UPLOAD", created_by: privateMarker, provenance: privateMarker, public_url: "https://external.example/private.jpg", mime_type: "image/jpeg" }],
    city_media_assignments: [{ id: "assignment-1", city_id: "city-a", media_asset_id: "asset-1", entity_type: "PLACE", entity_id: "place-1", entity_key: "trifels", role: "CARD" }],
    cities: [{ id: "city-a", name: "Annweiler", slug: "annweiler" }],
    city_places: [{ id: "place-1", city_id: "city-a", name: "Trifels", canonical_slug: "trifels", private: privateMarker }],
    ...overrides,
  }
  const client = { from() { throw new Error("Unexpected unprivileged table read") } }
  const modules = {
    "server-only": {},
    "../admin": { getAdminSession: async (input) => { assert.equal(input, client); events.push(["auth"]); return await session } },
    "../supabase/admin": { createAdminClient() {
      events.push(["service-created"])
      if (factoryFails) throw new Error("Synthetic missing config")
      return { from(table) {
        events.push(["table", table])
        const value = results[table]
        if (value instanceof Error) throw value
        const result = Array.isArray(value) ? { data: value, error: null } : value
        const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) }
        for (const method of ["select", "order", "limit", "in"]) query[method] = (...args) => { events.push([method, table, ...args]); return query }
        return query
      } }
    } },
    "./inventory": { trustedMediaThumbnail },
  }
  const source = readFileSync(new URL("../lib/city-media/inventory-data.ts", import.meta.url), "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const loadedModule = { exports: {} }
  new Function("require", "module", "exports", "process", compiled)((name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency ${name}`)
    return modules[name]
  }, loadedModule, loadedModule.exports, { env: {} })
  return { events, run: () => loadedModule.exports.loadMediaInventory(client), privateMarker }
}

test("missing, partner and non-boolean admin sessions cannot construct a service client or read media", async () => {
  for (const session of [null, { isAdmin: false }, { isAdmin: "true" }]) {
    const check = setup(session)
    await assert.rejects(check.run(), /Admin-Zugriff erforderlich/)
    assert.deepEqual(check.events, [["auth"]])
  }
})

test("auth completes before service construction; media projection excludes private metadata and external URLs", async () => {
  let resolve
  const check = setup(new Promise(done => { resolve = done }))
  const pending = check.run()
  assert.deepEqual(check.events, [["auth"]])
  resolve({ isAdmin: true })
  const result = await pending
  assert.equal(result.assets.state, "ok")
  assert.equal(result.assets.rows[0].thumbnail, null)
  assert.equal(JSON.stringify(result).includes(check.privateMarker), false)
  assert.equal(JSON.stringify(result).includes("external.example"), false)
  assert.deepEqual(check.events.filter(event => event[0] === "table").map(event => event[1]), ["city_media_assets", "city_media_assignments", "cities", "city_places"])
  for (const selection of check.events.filter(event => event[0] === "select")) assert.equal(selection[2].includes("*"), false)
  assert.ok(check.events.some(event => event[0] === "in" && event[1] === "city_places" && event[2] === "city_id" && event[3][0] === "city-a"))
})

test("denied, missing configuration and thrown transports stay unknown, while genuine empty stays empty", async () => {
  for (const failure of [{ data: null, error: { message: "denied" } }, new Error("offline")]) {
    const result = await setup({ isAdmin: true }, { city_media_assignments: failure }).run()
    assert.equal(result.assignments.state, "unavailable")
    assert.equal(result.places.state, "unavailable")
    assert.equal(result.assets.rows.length, 1)
  }
  const missing = await setup({ isAdmin: true }, {}, true).run()
  for (const source of [missing.assets, missing.assignments, missing.places, missing.cities]) assert.equal(source.state, "unavailable")
  const empty = await setup({ isAdmin: true }, { city_media_assets: [], city_media_assignments: [] }).run()
  assert.deepEqual(empty.assets, { rows: [], state: "ok" })
  assert.deepEqual(empty.assignments, { rows: [], state: "ok" })
})

test("a capped response is marked limited, never represented as a complete inventory", async () => {
  const result = await setup({ isAdmin: true }, { city_media_assets: Array.from({ length: 200 }, (_, i) => ({ id: `asset-${i}` })) }).run()
  assert.equal(result.assets.state, "limited")
})
