import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import vm from "node:vm"
import ts from "typescript"
import * as contracts from "../lib/city-pages/discovery-images.ts"

const cityId = "b9e684e4-54b3-41ff-8f97-4426423893c2"
const assetId = "b13b5d5f-3bc4-4e7b-a7a2-4ca64a1f07e1"
const assignmentId = "e74c45e0-ca1b-42db-963f-54242cd2e0dd"
const actorId = "8db2fd02-96f5-4491-a479-b5de535c6d9d"
const updatedAt = "2026-09-17T13:19:19.012981+00:00"
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://slscoqdhbxftcournvut.supabase.co"
const asset = { id: assetId, city_id: cityId, public_url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/city-media/photo.jpg`, title: "Reichsburg Trifels", alt_text: "Reichsburg Trifels", status: "PUBLISHED", media_type: "image" }
const current = { id: assignmentId, city_id: cityId, media_asset_id: assetId, entity_type: "CITY_HOMEPAGE", entity_id: null, entity_key: "discovery:family", role: "CARD", manual_lock: true, focal_x: 0.5, focal_y: 0.5, updated_at: updatedAt }
const input = overrides => ({ cityId, category: "family", mode: "manual", assetId, focalX: 0.25, focalY: 0.7, expectedId: null, expectedUpdatedAt: null, ...overrides })

async function action(options = {}) {
  const calls = []
  const result = (table, operation, payload) => {
    if (table === "cities") return { data: { id: cityId, slug: "annweiler" }, error: null }
    if (table === "city_media_assets") return { data: options.asset ?? asset, error: null }
    if (table === "city_media_audit") return { data: null, error: options.auditError ?? null }
    if (operation === "read") return { data: options.current ?? null, error: options.readError ?? null }
    if (options.race) return { data: null, error: operation === "insert" ? { code: "23505" } : null }
    return { data: { ...current, ...payload, updated_at: payload?.updated_at ?? updatedAt }, error: null }
  }
  const client = { from(table) {
    const call = { table, operation: "read", filters: [], payload: null }
    calls.push(call)
    const q = {
      select() { return q }, maybeSingle() { return Promise.resolve(result(table, call.operation, call.payload)) },
      eq(...args) { call.filters.push(["eq", ...args]); return q }, is(...args) { call.filters.push(["is", ...args]); return q },
      insert(payload) { call.operation = "insert"; call.payload = payload; return q },
      update(payload) { call.operation = "update"; call.payload = payload; return q },
      delete() { call.operation = "delete"; return q },
      then(resolve, reject) { return Promise.resolve(result(table, call.operation, call.payload)).then(resolve, reject) },
    }
    return q
  } }
  const loadedModule = { exports: {} }
  const imports = {
    "next/cache": { revalidatePath: path => calls.push({ local: path }) },
    "@/lib/admin": { requireAdmin: async () => { calls.push({ auth: true }); if (options.denied) throw new Error("denied"); return { adminSession: { user: { id: actorId, email: "admin@example.test" } } } } },
    "@/lib/supabase/admin": { createAdminClient: () => { calls.push({ client: true }); return client } },
    "@/lib/city-pages/discovery-images": contracts,
    "@/lib/city-pages/public-revalidation": { refreshPublicCity: async (...args) => { calls.push({ refresh: args }); return options.refresh ?? "ok" } },
  }
  const source = await readFile(new URL("../app/city-pages/[citySlug]/discovery/actions.ts", import.meta.url), "utf8")
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(js, { module: loadedModule, exports: loadedModule.exports, require: name => { assert.ok(imports[name], `unmocked ${name}`); return imports[name] }, Date, console })
  return { save: loadedModule.exports.saveDiscoveryImage, calls }
}

test("input rejects unknown categories, invalid focal points and incomplete edit versions", () => {
  assert.ok(contracts.parseDiscoveryChoice(input()))
  for (const change of [{ category: "hero" }, { focalX: -1 }, { focalY: NaN }, { focalX: "0.5" }, { expectedId: assignmentId }, { expectedUpdatedAt: updatedAt }, { assetId: "oops" }, { mode: "publish" }]) assert.equal(contracts.parseDiscoveryChoice(input(change)), null)
})

test("only published images from this city or the shared library can be chosen", () => {
  assert.ok(contracts.isSelectableDiscoveryAsset(asset, cityId))
  assert.ok(contracts.isSelectableDiscoveryAsset({ ...asset, city_id: null }, cityId))
  for (const change of [{ city_id: actorId }, { status: "DRAFT" }, { media_type: "video" }, { public_url: "https://example.test/photo.jpg" }]) assert.equal(contracts.isSelectableDiscoveryAsset({ ...asset, ...change }, cityId), false)
})

test("authentication happens before constructing a privileged client", async () => {
  const a = await action({ denied: true })
  await assert.rejects(a.save(input()), /denied/)
  assert.deepEqual(a.calls, [{ auth: true }])
})

test("saving uses the authenticated actor, exact homepage key and city cache identity", async () => {
  const a = await action()
  const r = await a.save(input({ actorId: "spoofed" }))
  assert.equal(r.ok, true)
  const write = a.calls.find(c => c.table === "city_media_assignments" && c.operation === "insert")
  assert.equal(write.payload.updated_by, actorId)
  assert.equal(write.payload.created_by, actorId)
  assert.equal(write.payload.entity_key, "discovery:family")
  assert.equal(write.payload.entity_type, "CITY_HOMEPAGE")
  assert.equal(write.payload.role, "CARD")
  assert.equal(write.payload.entity_id, null)
  assert.equal(write.payload.manual_lock, true)
  assert.equal(write.payload.city_id, cityId)
  assert.equal(write.payload.focal_x, 0.25)
  assert.deepEqual(a.calls.find(c => c.refresh)?.refresh, ["annweiler", cityId])
})

test("stale editors and unavailable assets cannot write or invalidate public data", async () => {
  for (const options of [{ current }, { readError: { message: "db" } }, { asset: { ...asset, status: "DRAFT" } }, { asset: { ...asset, city_id: actorId } }]) {
    const a = await action(options)
    assert.equal((await a.save(input())).ok, false)
    assert.equal(a.calls.some(c => ["insert", "update", "delete"].includes(c.operation)), false)
    assert.equal(a.calls.some(c => c.refresh), false)
  }
})

test("racing updates, resets and initial inserts report conflict instead of success", async () => {
  for (const mode of ["manual", "automatic"]) {
    const a = await action({ current, race: true })
    assert.equal((await a.save(input({ mode, expectedId: assignmentId, expectedUpdatedAt: updatedAt }))).code, "conflict")
    const write = a.calls.find(c => ["update", "delete"].includes(c.operation))
    for (const filter of [["eq", "city_id", cityId], ["eq", "entity_key", "discovery:family"], ["eq", "role", "CARD"], ["eq", "entity_type", "CITY_HOMEPAGE"], ["is", "entity_id", null], ["eq", "id", assignmentId], ["eq", "updated_at", updatedAt]]) assert.ok(write.filters.some(f => JSON.stringify(f) === JSON.stringify(filter)))
    assert.equal(a.calls.some(c => c.refresh), false)
  }
  const a = await action({ race: true })
  assert.equal((await a.save(input())).code, "conflict")
})

test("reset removes only this assignment and records the former state without a deleted FK", async () => {
  const a = await action({ current })
  const r = await a.save(input({ mode: "automatic", expectedId: assignmentId, expectedUpdatedAt: updatedAt }))
  assert.equal(r.ok, true)
  assert.equal(r.assignment, null)
  const audit = a.calls.find(c => c.table === "city_media_audit")
  assert.equal(audit.payload.assignment_id, null)
  assert.equal(audit.payload.previous_state.id, assignmentId)
  assert.equal(audit.payload.action, "UNASSIGN")
  assert.equal(a.calls.some(c => c.table === "city_media_assets" && c.operation !== "read"), false)
})

test("saved data remains distinguishable from cache or audit warnings", async () => {
  const a = await action({ refresh: "failed", auditError: { message: "audit unavailable" } })
  const r = await a.save(input())
  assert.equal(r.ok, true)
  assert.equal(r.refresh, "failed")
  assert.equal(r.auditSaved, false)
})
