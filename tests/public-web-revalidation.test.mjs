import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"

const loadedModule = { exports: {} }
const code = ts.transpileModule(readFileSync(new URL("../lib/public-web-revalidation.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
new Function("require", "module", "exports", code)(id => { assert.equal(id, "server-only"); return {} }, loadedModule, loadedModule.exports)
const { invalidatePublicPartner } = loadedModule.exports
const secret = "synthetic-secret-for-local-tests-only"
const originalFetch = globalThis.fetch
const originalEnv = { ...process.env }
test.afterEach(() => { globalThis.fetch = originalFetch; process.env = { ...originalEnv } })

function setup({ row = { slug: "test-partner", cities: { slug: "annweiler" } }, responses = [new Response('{"ok":true}')], endpoint = "https://web.example/api/revalidate" } = {}) {
  process.env.BENEFITSI_WEB_REVALIDATION_URL = endpoint
  process.env.BENEFITSI_WEB_REVALIDATION_SECRET = secret
  const calls = [], selects = []
  const query = { select(value) { selects.push(value); return this }, eq() { return this }, async maybeSingle() { return { data: row, error: null } } }
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), ...options })
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next
  }
  return { db: { from(table) { assert.equal(table, "partners"); return query } }, calls, selects }
}
test("server-side identity lookup sends only bounded resource slugs, with no arbitrary paths", async () => {
  const f = setup()
  assert.deepEqual(await invalidatePublicPartner(f.db, "partner-id"), { ok: true })
  assert.deepEqual(JSON.parse(f.calls[0].body), { resource: "partner", partnerSlug: "test-partner", citySlug: "annweiler" })
  assert.equal(f.calls[0].redirect, "error")
  assert.equal(f.calls[0].cache, "no-store")
  assert.equal(f.calls[0].headers.authorization, `Bearer ${secret}`)
  assert.ok(f.calls[0].signal instanceof AbortSignal)
  assert.deepEqual(f.selects, ["slug,cities(slug)"])
})
test("lost response gets one idempotent retry; persistent failure stays distinguishable", async () => {
  const f = setup({ responses: [Error("synthetic timeout"), new Response('{"ok":true}')] })
  assert.deepEqual(await invalidatePublicPartner(f.db, "partner-id"), { ok: true })
  assert.equal(f.calls.length, 2)
  assert.equal(f.calls[0].body, f.calls[1].body)
  const failed = setup({ responses: [new Response("", { status: 503 }), new Response("", { status: 503 })] })
  assert.deepEqual(await invalidatePublicPartner(failed.db, "partner-id"), { ok: false, reason: "unavailable" })
  assert.equal(failed.calls.length, 2)
})
test("unauthorized destination responses are not retried", async () => {
  const f = setup({ responses: [new Response("", { status: 401 })] })
  assert.equal((await invalidatePublicPartner(f.db, "partner-id")).ok, false)
  assert.equal(f.calls.length, 1)
})
test("invalid target configuration and malformed database slugs do not emit requests", async () => {
  for (const endpoint of ["https://web.example/api/revalidate?path=/", "https://user:password@web.example/api/revalidate", "https://web.example/admin", "http://web.example/api/revalidate"]) {
    const f = setup({ endpoint })
    assert.deepEqual(await invalidatePublicPartner(f.db, "partner-id"), { ok: false, reason: "invalid_target" })
    assert.equal(f.calls.length, 0)
  }
  const f = setup({ row: { slug: "../admin", cities: null } })
  assert.equal((await invalidatePublicPartner(f.db, "partner-id")).reason, "lookup_failed")
  assert.equal(f.calls.length, 0)
})
test("missing configuration is visible and aliases invalidate both exact partner keys", async () => {
  const f = setup({ responses: [new Response('{"ok":true}'), new Response('{"ok":true}')] })
  assert.equal((await invalidatePublicPartner(f.db, "partner-id", "old-partner")).ok, true)
  assert.deepEqual(f.calls.map(c => JSON.parse(c.body).partnerSlug), ["test-partner", "old-partner"])
  delete process.env.BENEFITSI_WEB_REVALIDATION_SECRET
  assert.deepEqual(await invalidatePublicPartner(f.db, "partner-id"), { ok: false, reason: "not_configured" })
  assert.equal(f.calls.length, 2)
})
