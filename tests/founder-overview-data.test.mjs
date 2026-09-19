import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import { normalizeFounderCount } from "../lib/founder-overview.ts"

// Exercise the real loader with inert auth/transports; no credentials or network.
function setup(session) {
  const events = []
  const builder = (result) => {
    const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) }
    for (const method of ["select", "eq", "lt", "order", "limit", "maybeSingle"]) {
      query[method] = (...args) => { events.push([method, ...args]); return query }
    }
    return query
  }
  const client = { from(table) {
    events.push(["user-table", table])
    return builder(table === "city_agent_runs"
      ? { data: null, error: { message: "synthetic denied" } }
      : { count: 0, error: null })
  } }
  const modules = {
    "server-only": {},
    "./admin": { getAdminSession: async (supabase) => {
      assert.equal(supabase, client)
      events.push(["auth"])
      return await session
    } },
    "./supabase/admin": { createAdminClient() {
      events.push(["service-created"])
      return { from(table) {
        events.push(["service-table", table])
        if (table === "city_agent_runs") return builder({ data: null, error: { message: "synthetic denied" } })
        if (table !== "annweiler_event_pipeline_health") return builder({ count: 3, error: null })
        return builder({ error: null, data: { last_run_at: "2026-09-19T10:00:00Z", summary: {
          private_report: "must never leave loader",
          health: { technical_ok: true, research_checked_at: "2026-09-19T09:00:00Z", extra: "not needed" },
        } } })
      } }
    } },
    "./founder-overview": { normalizeFounderCount },
  }
  const source = readFileSync(new URL("../lib/founder-overview-data.ts", import.meta.url), "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  new Function("require", "module", "exports", compiled)((name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`)
    return modules[name]
  }, module, module.exports)
  return { events, run: () => module.exports.loadFounderOverview(client) }
}

test("missing and partner sessions cannot read founder data or construct the privileged client", async () => {
  for (const session of [null, { isAdmin: false }]) {
    const check = setup(session)
    await assert.rejects(check.run(), /Admin-Zugriff erforderlich/)
    assert.deepEqual(check.events, [["auth"]])
  }
})

test("the admin check must finish before any database access; heartbeat is minimally projected", async () => {
  let resolveSession
  const check = setup(new Promise(resolve => { resolveSession = resolve }))
  const pending = check.run()
  assert.deepEqual(check.events, [["auth"]])
  resolveSession({ isAdmin: true })
  const result = await pending
  assert.deepEqual(result.activePartners, { value: 0, unavailable: false })
  assert.deepEqual(result.failedJobs, { value: 3, unavailable: false })
  assert.deepEqual(check.events.filter(entry => entry[0] === "user-table"), [["user-table", "partners"]])
  assert.equal(result.cityRunUnavailable, true)
  assert.equal(result.cityRun, null)
  assert.deepEqual(result.pipeline, {
    technicalOk: true, lastRunAt: "2026-09-19T10:00:00Z", researchCheckedAt: "2026-09-19T09:00:00Z",
  })
  assert.ok(check.events.some(entry => entry[0] === "eq" && entry[1] === "city_id" && entry[2] === "b9e684e4-54b3-41ff-8f97-4426423893c2"))
  assert.equal(JSON.stringify(result).includes("private_report"), false)
})
