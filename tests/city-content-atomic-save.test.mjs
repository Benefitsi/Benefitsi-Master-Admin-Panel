import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"

function compile(path, boundaries) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loadedModule = { exports: {} }
  new Function("require", "module", "exports", code)((id) => {
    assert.ok(Object.hasOwn(boundaries, id), `Unexpected dependency: ${id}`)
    return boundaries[id]
  }, loadedModule, loadedModule.exports)
  return loadedModule.exports
}
const guideEditor = compile("../lib/city-pages/guide-editor.ts", {})
const editor = compile("../lib/city-pages/content-editor.ts", {
  "server-only": {}, "@/lib/supabase/admin": {},
})
const contracts = compile("../lib/city-operations/contracts.ts", {})
const city = "a1000000-0000-4000-8000-000000000001"
const content = "b1000000-0000-4000-8000-000000000001"
const actor = "c1000000-0000-4000-8000-000000000001"
const revision = "2026-09-12T10:00:00.123456Z"

async function save({ resultError = null, isNew = false, authorized = true, expected = revision, intent = "draft", kind = "places", recurring = false, fields = {} } = {}) {
  const writes = [], rpcs = [], revalidated = []
  const db = {
    from(table) {
      const query = {}
      for (const method of ["select", "eq", "maybeSingle", "single"]) query[method] = () => query
      for (const method of ["insert", "upsert", "update"]) query[method] = (payload) => {
        writes.push({ table, method, payload }); return query
      }
      query.then = (resolve, reject) => Promise.resolve({ data: { id: table === "cities" ? city : content }, error: null }).then(resolve, reject)
      return query
    },
    async rpc(name, args) {
      rpcs.push({ name, args })
      return { data: resultError ? null : { ok: true, content_id: content, review_id: "test-review" }, error: resultError }
    },
  }
  const action = compile("../app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions.ts", {
    "next/cache": { revalidatePath: path => revalidated.push(path) },
    "next/navigation": { redirect: path => { throw new Error(`redirect:${path}`) } },
    "@/lib/admin": { requireAdmin: async () => {
      if (!authorized) throw new Error("unauthorized")
      return { adminSession: { user: { id: actor }, profile: { display_name: "Test admin" } }, supabase: db }
    } },
    "@/lib/city-pages/content-editor": editor,
    "@/lib/city-pages/guide-editor": guideEditor,
    "@/lib/city-operations/contracts": contracts,
    "@/lib/supabase/admin": { createAdminClient: () => db },
  })
  const form = new FormData()
  for (const [key, value] of Object.entries({ cityId: city, citySlug: "annweiler", contentType: kind, contentId: isNew ? "new" : content, expectedUpdatedAt: expected, intent, name: "Pending place", description: "Pending description", category: "sight", access: "public", admission_type: "unknown" })) form.set(key, value)
  if (kind === "events") {
    for (const [key, value] of Object.entries({ title: "Pending event", category: "culture", start_date: "2099-10-11T10:00:00Z", end_date: "2099-10-11T12:00:00Z", expires_at: "2100-01-01T00:00:00Z", location_name: "Fixture venue", price_type: "free", source_url: "https://example.test/source" })) form.set(key, value)
  }
  if (recurring) {
    for (const [key, value] of Object.entries({ recurrence_frequency: "weekly", recurrence_interval_count: "2", recurrence_start_time: "10:00", recurrence_end_time: "12:00", recurrence_starts_on: "2099-10-01", recurrence_ends_on: "2099-11-01", recurrence_display_text: "Every second week", recurrence_exception_dates: "2099-10-12" })) form.set(key, value)
    form.append("recurrence_weekdays", "1")
    form.append("recurrence_weekdays", "3")
  }
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  let outcome
  try { await action.saveCityContent(form) } catch (error) { outcome = error.message }
  return { writes, rpcs, revalidated, outcome }
}

test("authenticated editor sends one atomic RPC without direct content/review writes", async () => {
  const result = await save({ intent: "review" })
  assert.deepEqual(result.writes, [])
  assert.equal(result.rpcs.length, 1)
  assert.equal(result.rpcs[0].name, "save_city_content_draft_atomic")
  assert.equal(result.rpcs[0].args.p_expected_updated_at, revision)
  assert.equal(result.rpcs[0].args.p_content_id, content)
  assert.equal(result.rpcs[0].args.p_actor_id, actor)
  assert.equal(result.rpcs[0].args.p_intent, "review")
  assert.equal(result.rpcs[0].args.p_schedule, null)
  assert.match(result.outcome, /success=review_queued$/)
  assert.ok(result.revalidated.length > 0)
})

test("new content uses the ID returned from the transaction", async () => {
  const result = await save({ isNew: true, expected: "" })
  assert.equal(result.rpcs[0]?.args.p_content_id, null)
  assert.equal(result.rpcs[0]?.args.p_expected_updated_at, null)
  assert.match(result.outcome, new RegExp(`${content}\\?success=draft_saved$`))
})

test("stale revision fails visibly and does not report success or revalidate", async () => {
  const result = await save({ resultError: { message: "content_conflict" } })
  assert.match(result.outcome, /error=content_conflict$/)
  assert.deepEqual(result.revalidated, [])
})

test("transaction failure leaves a single failure path without partial-success claims", async () => {
  const result = await save({ resultError: { message: "injected audit failure" } })
  assert.match(result.outcome, /error=save_failed$/)
  assert.deepEqual(result.revalidated, [])
  assert.deepEqual(result.writes, [])
})

test("authorization and revision validation happen before mutations", async () => {
  for (const options of [{ authorized: false }, { expected: "" }]) {
    const result = await save(options)
    assert.deepEqual(result.rpcs, [])
    assert.deepEqual(result.writes, [])
    assert.doesNotMatch(result.outcome, /success=/)
  }
})

test("event recurrence is part of the same atomic RPC payload", async () => {
  const result = await save({ kind: "events", recurring: true, intent: "review" })
  assert.equal(result.rpcs.length, 1)
  assert.deepEqual(result.writes, [])
  assert.deepEqual(result.rpcs[0].args.p_schedule, {
    frequency: "weekly", interval_count: 2, weekdays: [1, 3], month_day: null,
    start_time: "10:00", end_time: "12:00", starts_on: "2099-10-01", ends_on: "2099-11-01",
    exception_dates: ["2099-10-12"], display_text: "Every second week",
  })
  assert.equal(result.rpcs[0].args.p_payload.source_url, "https://example.test/source")
  assert.match(result.outcome, /success=review_queued$/)
})

test("removing recurrence is explicit and an editor intent cannot publish", async () => {
  assert.equal((await save({ kind: "events" })).rpcs[0].args.p_schedule, null)
  const invalid = await save({ intent: "publish" })
  assert.deepEqual(invalid.rpcs, [])
  assert.deepEqual(invalid.writes, [])
})

const guideFields = {
  slug: "wochenende-in-annweiler", title: "Ein Wochenende", category: "guides",
  blocks: JSON.stringify([{ id: "day-one", blockType: "TEXT", sortOrder: 0, title: "Tag 1", text: "Altstadt entdecken.\n\n[Auskunft](https://example.test/quelle)" }]),
  source_meta: JSON.stringify({ sourceType: "PRIMARY", sourceUrl: "https://example.test/quelle", lastVerifiedAt: "2026-09-20T00:00:00.000Z", confidence: "high", verificationStatus: "VERIFIED", freshnessTtlDays: 90 }),
}
test("complete guide content reaches the draft transaction and evidence cannot self-verify", async () => {
  const result = await save({ kind: "guides", intent: "review", fields: guideFields })
  assert.equal(result.rpcs.length, 1)
  const payload = result.rpcs[0].args.p_payload
  assert.deepEqual(payload.blocks, [{ id: "day-one", blockType: "TEXT", sortOrder: 0, title: "Tag 1", text: "Altstadt entdecken.\n\n[Auskunft](https://example.test/quelle)" }])
  assert.equal(payload.source_meta.verificationStatus, "NEEDS_REVIEW")
  assert.equal(payload.source_meta.lastVerifiedAt, "2026-09-20T00:00:00.000Z")
  assert.equal(payload.status, undefined)
  assert.deepEqual(result.writes, [])
})
test("malformed blocks and unsafe links never reach the transaction", async () => {
  for (const blocks of ['{}', '[{"id":"x","blockType":"SCRIPT","sortOrder":0}]', JSON.stringify([{id:"x",blockType:"TEXT",sortOrder:0,text:"[link](javascript:alert(1))"}]), JSON.stringify([{id:"x",blockType:"TEXT",sortOrder:0,text:"x".repeat(20001)}])]) {
    const result = await save({ kind: "guides", fields: { ...guideFields, blocks } })
    assert.equal(result.rpcs.length, 0)
    assert.match(result.outcome, /field_validation/)
  }
})
test("business profiles use ordinary review and cannot assign themselves a partner", async () => {
  for (const category of ["grocery", "shopping", "health", "service", "food"]) {
    const result = await save({ fields: { category, partner_id: actor }, intent: "review" })
    assert.equal(result.rpcs.length, 1, category)
    assert.equal(result.rpcs[0].args.p_payload.category, category)
    assert.equal(result.rpcs[0].args.p_payload.partner_id, undefined)
    assert.equal(result.rpcs[0].args.p_intent, "review")
  }
})

test("older guide forms omit new JSON fields instead of clearing existing content", async () => {
  const result = await save({ kind: "guides", fields: {slug:"existing-guide",title:"Edited title",category:"guides"} })
  assert.equal(result.rpcs.length,1)
  assert.equal(Object.hasOwn(result.rpcs[0].args.p_payload,"blocks"),false)
  assert.equal(Object.hasOwn(result.rpcs[0].args.p_payload,"source_meta"),false)
})
test("editor accepts a researched calendar date without inventing a check time", async () => {
  const meta = JSON.parse(guideFields.source_meta); meta.lastVerifiedAt = "2026-09-20"
  const result = await save({ kind: "guides", fields: { ...guideFields, source_meta: JSON.stringify(meta) } })
  assert.equal(result.rpcs[0]?.args.p_payload.source_meta.lastVerifiedAt, "2026-09-20")
})
