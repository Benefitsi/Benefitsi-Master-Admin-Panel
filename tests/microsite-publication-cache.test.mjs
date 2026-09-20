import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import test from "node:test"
import ts from "typescript"
import { resolveMicrositeConfig } from "../lib/microsites.ts"
import * as publicContract from "../lib/public-microsite-contract.ts"

export function publicationFixture({ authorized = true, delivery = { ok: true }, writeError = false } = {}) {
  const partner = { id: "test-partner-id", name: "Synthetic restaurant", slug: "test-partner", cities: { slug: "annweiler" } }
  const microsite = { id: "test-microsite", partner_id: partner.id, slug: partner.slug, status: "published", published_version_id: "version-old" }
  const writes = [], invalidations = [], localInvalidations = []
  const db = { from(table) {
    let payload, operation
    const query = {}
    for (const method of ["select", "eq", "order", "limit", "maybeSingle", "single"]) query[method] = () => query
    for (const method of ["update", "insert"]) query[method] = value => { payload = value; operation = method; return query }
    query.then = (resolve, reject) => {
      if (operation) {
        writes.push({ table, operation, payload })
        if (writeError) return Promise.resolve({ data: null, error: { message: "Synthetic write failure" } }).then(resolve, reject)
        if (table === "microsites") Object.assign(microsite, payload)
      }
      const data = table === "partners" ? partner : table === "microsites" ? { ...microsite } : { id: "version-new", version_number: 1 }
      return Promise.resolve({ data, error: null }).then(resolve, reject)
    }
    return query
  } }
  const boundaries = {
    "node:crypto": { randomUUID }, "next/cache": { revalidatePath(path) { localInvalidations.push(path) } }, sharp: {},
    "@/lib/microsites": { resolveMicrositeConfig },
    "@/lib/public-microsite-contract": publicContract,
    "@/lib/admin-data": { getDashboardData: async () => ({ partners: [partner], errors: [] }) },
    "@/lib/microsite-readiness": { createMicrositeReadinessReport: () => ({ items: [] }) },
    "@/lib/partner-portal": { canEditPartnerMicrosite: () => authorized, getPartnerPortalSession: async () => ({ isAdmin: authorized }) },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/public-web-revalidation": { invalidatePublicPartner: async (...args) => {
      invalidations.push({ args, publicState: { ...microsite }, writes: writes.length })
      return delivery
    } },
  }
  const loadedModule = { exports: {} }
  const js = ts.transpileModule(readFileSync(new URL("../app/microsite-actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function("require", "module", "exports", js)(id => {
    assert.ok(Object.hasOwn(boundaries, id), id)
    return boundaries[id]
  }, loadedModule, loadedModule.exports)
  return { microsite, writes, invalidations, localInvalidations, async save(intent, values = {}) {
    const form = new FormData()
    form.set("partner_id", partner.id)
    form.set("intent", intent)
    for (const [key, value] of Object.entries(values)) form.set(key, value)
    return loadedModule.exports.saveMicrositeVersion({ ok: false, message: "" }, form)
  } }
}
test("draft/review/approval preserve an existing live publication and do not invalidate", async () => {
  for (const intent of ["draft", "review", "approve"]) {
    const f = publicationFixture()
    const result = await f.save(intent)
    assert.equal(result.ok, true)
    assert.equal(f.microsite.status, "published")
    assert.equal(f.microsite.published_version_id, "version-old")
    assert.ok(f.writes.filter(w => w.table === "microsites").every(w => !Object.hasOwn(w.payload, "status") && !Object.hasOwn(w.payload, "published_version_id")), "draft writes cannot race and restore a withdrawn status")
    assert.equal(f.invalidations.length, 0)
  }
})
test("publish invalidates only after the new public pointer was committed", async () => {
  const f = publicationFixture()
  assert.equal((await f.save("publish")).ok, true)
  assert.equal(f.invalidations.length, 1)
  assert.notEqual(f.invalidations[0].publicState.published_version_id, "version-old")
  assert.equal(f.invalidations[0].publicState.status, "published")
})
test("cache failure reports a saved publication with a separate retry state", async () => {
  const f = publicationFixture({ delivery: { ok: false, reason: "unavailable" } })
  const result = await f.save("publish")
  assert.equal(result.ok, true)
  assert.equal(result.publicRefreshPending, true)
  assert.match(result.message, /gespeichert.*Aktualisierung/i)
  assert.doesNotMatch(result.message, /nutzt jetzt/)
})
test("withdrawal expires the old page; cache retry performs no database writes", async () => {
  const f = publicationFixture()
  assert.equal((await f.save("withdraw")).ok, true)
  assert.equal(f.microsite.status, "archived")
  assert.equal(f.invalidations.length, 1)
  const before = f.writes.length
  assert.equal((await f.save("revalidate")).ok, true)
  assert.equal(f.writes.length, before)
  assert.equal(f.invalidations.length, 2)
  await f.save("draft")
  assert.equal(f.microsite.status, "archived", "draft after withdrawal must not republish")
})
test("unauthorized actions and failed database writes never invalidate public caches", async () => {
  for (const options of [{ authorized: false }, { writeError: true }]) {
    const f = publicationFixture(options)
    assert.equal((await f.save("publish")).ok, false)
    assert.equal(f.invalidations.length, 0)
  }
})


test("withdraw refreshes the loaded editor state even when public delivery is pending", async () => {
  const f = publicationFixture({ delivery: { ok: false, reason: "unavailable" } })
  const result = await f.save("withdraw")
  assert.equal(result.ok, true)
  assert.equal(f.microsite.status, "archived")
  assert.ok(f.localInvalidations.includes("/microsite-builder/test-partner"))
  assert.ok(f.localInvalidations.includes("/partner/microsite-builder/test-partner"))
  assert.equal(result.publicRefreshPending, true)
})
