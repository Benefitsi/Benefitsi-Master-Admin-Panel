import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import test from "node:test"
import ts from "typescript"
import sharp from "sharp"

const partnerId = "44444444-4444-4444-8444-444444444444"
const staged = `microsites/${partnerId}/staging/${randomUUID()}.png`
function fixture({ authorized = true, size = 100, type = "image/png", bytes, uploadError = false } = {}) {
  const calls = []
  const storage = {
    async createSignedUploadUrl(path, options) { calls.push(["sign", path, options]); return { data: { path, token: "scoped-token" }, error: null } },
    async info(path) { calls.push(["info", path]); return { data: { size, contentType: type }, error: null } },
    async download(path) { calls.push(["download", path]); return { data: new Blob([bytes || "broken image"], { type }), error: null } },
    async upload(path, body, options) { calls.push(["upload", path, body, options]); return { error: uploadError ? { message: "unavailable" } : null } },
    async remove(paths) { calls.push(["remove", paths]); return { error: null } },
    getPublicUrl(path) { return { data: { publicUrl: `https://assets.example.org/${path}` } } },
  }
  const boundaries = {
    "node:crypto": { randomUUID }, sharp: { default: sharp },
    "@/lib/supabase/server": { createClient: async () => ({ storage: { from: () => storage } }) },
    "@/lib/partner-portal": { getPartnerPortalSession: async () => ({ user: { id: "editor" } }), canEditPartnerMicrosite: () => authorized },
  }
  const loadedModule = { exports: {} }
  const js = ts.transpileModule(readFileSync(new URL("../app/microsite-upload-actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function("require", "module", "exports", js)(id => {
    assert.ok(Object.hasOwn(boundaries, id), id)
    return boundaries[id]
  }, loadedModule, loadedModule.exports)
  return { ...loadedModule.exports, calls }
}

test("signed uploads are scoped to an authorized partner and validate file metadata", async () => {
  const f = fixture()
  const result = await f.prepareMicrositeImageUpload(partnerId, { name: "photo.png", type: "image/png", size: 100 })
  assert.equal(result.ok, true)
  assert.match(result.path, new RegExp(`^microsites/${partnerId}/staging/[a-f0-9-]+\\.png$`))
  assert.equal(result.token, "scoped-token")
  assert.deepEqual(f.calls[0][2], { upsert: false })
  for (const file of [{ size: 11 * 1024 * 1024, type: "image/png" }, { size: 100, type: "text/html" }, { size: -1, type: "image/png" }]) {
    const bad = fixture()
    assert.equal((await bad.prepareMicrositeImageUpload(partnerId, { name: "invalid", ...file })).ok, false)
    assert.equal(bad.calls.length, 0)
  }
  const denied = fixture({ authorized: false })
  assert.equal((await denied.prepareMicrositeImageUpload(partnerId, { name: "photo.png", type: "image/png", size: 100 })).ok, false)
  assert.equal((await denied.completeMicrositeImageUpload(partnerId, staged)).ok, false)
  assert.equal((await denied.discardMicrositeImageUpload(partnerId, staged)).ok, false)
  assert.equal(denied.calls.length, 0)
})

test("completion decodes and optimizes the actual image, then removes only staging", async () => {
  const bytes = await sharp({ create: { width: 24, height: 16, channels: 3, background: "blue" } }).png().toBuffer()
  const f = fixture({ bytes, size: bytes.length })
  const result = await f.completeMicrositeImageUpload(partnerId, staged)
  assert.equal(result.ok, true)
  assert.match(result.url, /image-[a-f0-9-]+-24x16\.webp$/)
  const uploaded = f.calls.find(c => c[0] === "upload")
  assert.equal((await sharp(uploaded[2]).metadata()).format, "webp")
  assert.deepEqual(uploaded[3], { contentType: "image/webp", upsert: false })
  assert.deepEqual(f.calls.at(-1), ["remove", [staged]])
})

test("oversized, invalid and failed uploads cannot produce saved URLs and clean staging", async () => {
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer()
  for (const options of [{ size: 11 * 1024 * 1024 }, { type: "text/html" }, {}, { bytes, uploadError: true }]) {
    const f = fixture(options)
    const result = await f.completeMicrositeImageUpload(partnerId, staged)
    assert.equal(result.ok, false)
    assert.equal(result.url, undefined)
    assert.deepEqual(f.calls.at(-1), ["remove", [staged]])
    if (options.size || options.type) assert.ok(!f.calls.some(c => c[0] === "download"))
  }
})

test("completion and discard reject foreign, final, traversal and URL paths without storage access", async () => {
  for (const path of [staged.replace(partnerId, randomUUID()), `microsites/${partnerId}/image-${randomUUID()}-24x16.webp`, staged.replace("staging/", "staging/../"), `https://evil.example/${staged}`]) {
    const f = fixture()
    assert.equal((await f.completeMicrositeImageUpload(partnerId, path)).ok, false)
    assert.equal((await f.discardMicrositeImageUpload(partnerId, path)).ok, false)
    assert.equal(f.calls.length, 0)
  }
  const f = fixture()
  assert.equal((await f.discardMicrositeImageUpload(partnerId, staged)).ok, true)
  assert.deepEqual(f.calls, [["remove", [staged]]])
})
