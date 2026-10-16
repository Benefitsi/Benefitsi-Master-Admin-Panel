import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import test from "node:test"
import ts from "typescript"
import { resolveMicrositeConfig } from "../lib/microsites.ts"
import * as richMedia from "../lib/microsite-rich-media.ts"
import * as publicContract from "../lib/public-microsite-contract.ts"
import { unavailablePublishedImages } from "../lib/microsite-publish-media.ts"

export function publicationFixture({ authorized = true, delivery = { ok: true }, writeError = false, emptyWorkflow = false, missingMediaPaths = [], mediaInfoError = false } = {}) {
  const partner = { id: "test-partner-id", name: "Synthetic restaurant", slug: "test-partner", cities: { slug: "annweiler" } }
  const microsite = { id: "test-microsite", partner_id: partner.id, slug: partner.slug, status: "published", published_version_id: "version-old" }
  const writes = [], invalidations = [], localInvalidations = [], mediaInfoRequests = []
  const db = { storage: { from(bucket) { return { async info(path) {
    mediaInfoRequests.push([bucket, path])
    return missingMediaPaths.includes(path) || mediaInfoError
      ? { data: null, error: { message: "Unavailable" } }
      : { data: { contentType: "image/png", size: 1024 }, error: null }
  } } } }, from(table) {
    let payload, operation
    const query = {}
    for (const method of ["select", "eq", "order", "limit", "maybeSingle", "single"]) query[method] = () => query
    for (const method of ["update", "insert"]) query[method] = value => { payload = value; operation = method; return query }
    query.then = (resolve, reject) => {
      if (operation) {
        writes.push({ table, operation, payload })
        if (writeError) return Promise.resolve({ data: null, error: { message: "Synthetic write failure" } }).then(resolve, reject)
        if (emptyWorkflow && table === "microsites" && operation === "update") return Promise.resolve({ data: null, error: null }).then(resolve, reject)
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
    "@/lib/microsite-publish-media": { unavailablePublishedImages },
    "@/lib/supabase/config": { getSupabaseConfig: () => ({ isConfigured: true, url: "https://example.supabase.co" }) },
    "@/lib/microsite-rich-media": richMedia,
    "@/lib/admin-data": { getDashboardData: async () => ({ partners: [partner], errors: [] }) },
    "@/lib/microsite-readiness": { createMicrositeReadinessReport: () => ({ items: [] }) },
    "@/lib/partner-portal": { canEditPartnerMicrosite: () => authorized, getPartnerPortalSession: async () => ({ isAdmin: authorized,user:{id:"synthetic-admin"} }) },
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
  return { microsite, writes, invalidations, localInvalidations, mediaInfoRequests, async save(intent, values = {}) {
    const form = new FormData()
    form.set("partner_id", partner.id)
    form.set("intent", intent)
    for (const [key, value] of Object.entries(values)) form.set(key, value)
    return loadedModule.exports.saveMicrositeVersion({ ok: false, message: "" }, form)
  } }
}

test("publish blocks a missing own image before version or pointer writes", async () => {
  const path = "staged-covers/missing.png"
  const url = `https://example.supabase.co/storage/v1/object/public/partner-assets/${path}`
  const c = resolveMicrositeConfig({}, { name: "Synthetic restaurant", slug: "test-partner" })
  c.hero.backgroundImageUrl = url
  const f = publicationFixture({ missingMediaPaths: [path] })
  const result = await f.save("publish", { existing_config: JSON.stringify(c) })
  assert.equal(result.ok, false)
  assert.match(result.message, /hero\.backgroundImageUrl/)
  assert.deepEqual(f.mediaInfoRequests, [["partner-assets", path]])
  assert.equal(f.writes.length, 0)
  assert.equal(f.microsite.published_version_id, "version-old")
})

test("publish accepts present staged covers, checks shared slots once, and ignores unused library or external assets", async () => {
  const path = "staged-covers/kept.png"
  const url = `https://example.supabase.co/storage/v1/object/public/partner-assets/${path}`
  const c = resolveMicrositeConfig({}, { name: "Synthetic restaurant", slug: "test-partner" })
  c.hero.backgroundImageUrl = url
  c.seo.ogImageUrl = url
  c.deals.topDealImageUrl = "https://images.example.org/meal.png"
  c.assets.library.push({ id: "old", url: "https://example.supabase.co/storage/v1/object/public/partner-assets/missing-old.png", label: "old", slot: "", source: "upload" })
  const f = publicationFixture()
  const result = await f.save("publish", { existing_config: JSON.stringify(c) })
  assert.equal(result.ok, true, result.message)
  assert.deepEqual(f.mediaInfoRequests, [["partner-assets", path]])
})

test("publish fails closed if own media cannot be inspected", async () => {
  const c = resolveMicrositeConfig({}, { name: "Synthetic restaurant", slug: "test-partner" })
  c.hero.backgroundImageUrl = "https://example.supabase.co/storage/v1/object/public/partner-assets/staged-covers/unavailable.png"
  const f = publicationFixture({ mediaInfoError: true })
  const result = await f.save("publish", { existing_config: JSON.stringify(c) })
  assert.equal(result.ok, false)
  assert.match(result.message, /hero\.backgroundImageUrl/)
  assert.equal(f.writes.length, 0)
})

test("publish ignores a hidden menu-item image override that the public renderer does not use", async () => {
  const path = "staged-covers/hidden-missing.png"
  const c = resolveMicrositeConfig({}, { name: "Synthetic restaurant", slug: "test-partner" })
  c.elementText["content.menuItem.synthetic-item.imageUrl"] = `https://example.supabase.co/storage/v1/object/public/partner-assets/${path}`
  c.elementText["content.menuItem.synthetic-item.showImage"] = "false"
  const f = publicationFixture({ missingMediaPaths: [path] })
  const result = await f.save("publish", { existing_config: JSON.stringify(c) })
  assert.equal(result.ok, true, result.message)
  assert.deepEqual(f.mediaInfoRequests, [])
})

test("publish rejects an image on the own Supabase origin outside approved Storage paths", async () => {
  const c = resolveMicrositeConfig({}, { name: "Synthetic restaurant", slug: "test-partner" })
  c.hero.backgroundImageUrl = "https://example.supabase.co/missing.png"
  const f = publicationFixture()
  const result = await f.save("publish", { existing_config: JSON.stringify(c) })
  assert.equal(result.ok, false)
  assert.match(result.message, /hero\.backgroundImageUrl.*ungültiger eigener Storagepfad/)
  assert.deepEqual(f.mediaInfoRequests, [])
  assert.equal(f.writes.length, 0)
})
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
test("successful saves identify the actual committed version for the editor", async () => {
  for (const intent of ["draft", "publish"]) {
    const f = publicationFixture()
    const result = await f.save(intent)
    const inserted = f.writes.find(w => w.table === "microsite_versions").payload
    assert.deepEqual(result.savedVersion, { id: inserted.id, version_number: inserted.version_number, status: intent === "publish" ? "published" : "draft" })
  }
})
test("a zero-row workflow update cannot report a saved publication or withdrawal", async () => {
  for (const intent of ["draft", "publish", "withdraw"]) {
    const f = publicationFixture({ emptyWorkflow: true })
    const result = await f.save(intent)
    assert.equal(result.ok, false, intent)
    assert.equal(result.savedVersion, undefined)
    assert.notEqual(result.publicationWithdrawn, true)
    assert.equal(f.microsite.status, "published")
    assert.equal(f.microsite.published_version_id, "version-old")
    assert.equal(f.invalidations.length, 0)
  }
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
