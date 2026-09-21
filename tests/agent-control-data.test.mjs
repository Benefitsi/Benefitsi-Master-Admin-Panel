import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import { cityDisplayName, normalizeRuntimeSnapshot } from "../lib/agent-control.ts"

function setup({ session = { isAdmin: true }, failures = [], empty = [], equivalentTimestamp = false } = {}) {
  const events = []
  let releaseAuth
  const auth = session instanceof Promise ? session : Promise.resolve(session)
  const rows = {
    benefitsi_agent_runtime_snapshots: { host_id: "m1-benefitsi", observed_at: "2026-09-21T10:00:00Z", schema_version: 1, snapshot: {
      schemaVersion: 1, hostId: "m1-benefitsi", observedAt: "2026-09-21T10:00:00Z", collectorVersion: "1",
      profiles: [], extra: "private",
    }, received_at: "2026-09-21T10:01:00Z" },
    city_agent_city_controls: [{ city_id: "b9e684e4-54b3-41ff-8f97-4426423893c2", operating_mode: "review", orchestrator_profile: "ben", city_profile: "city-annweiler", timezone: "Europe/Berlin", auto_publish_enabled: false, last_full_check_at: "2026-09-21T08:00:00Z", next_full_check_at: "2026-09-22T08:00:00Z", health_status: "partial" }],
    city_agent_schedules: [{ id: "s1", city_id: "b9e684e4-54b3-41ff-8f97-4426423893c2", module_key: "events", cadence_minutes: 60, enabled: true, next_run_at: null, last_run_at: "2026-09-21T09:00:00Z", last_status: "editorial_pending", actual_trigger: "launchd", last_trigger_at: "2026-09-21T09:00:00Z", last_missed_at: null, consecutive_missed_runs: 0 }],
    annweiler_event_pipeline_health: { city_id: "b9e684e4-54b3-41ff-8f97-4426423893c2", last_run_at: "2026-09-21T09:00:00Z", last_run_ok: true, summary: { health: { technical_ok: true, editorial_review_pending: true, research_checked_at: "2026-09-21T08:55:00Z" }, raw_log: "private" } },
  }
  if (equivalentTimestamp) rows.benefitsi_agent_runtime_snapshots.observed_at = "2026-09-21T12:00:00+02:00"
  const builder = (table) => {
    const data = empty.includes(table) ? (table === "city_agent_city_controls" || table === "city_agent_schedules" ? [] : null) : rows[table]
    const result = failures.includes(table) ? { data: null, error: { message: `secret ${table}` } } : { data, error: null }
    const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) }
    for (const method of ["select", "eq", "order", "limit", "maybeSingle"]) query[method] = (...args) => { events.push([method, table, ...args]); return query }
    return query
  }
  const client = { from(table) { events.push(["user-table", table]); return builder(table) } }
  const modules = {
    "server-only": {},
    "./admin": { getAdminSession: async (input) => { assert.equal(input, client); events.push(["auth"]); return auth } },
    "./supabase/admin": { createAdminClient: () => { events.push(["service-created"]); return { from(table) { events.push(["service-table", table]); return builder(table) } } } },
    "./agent-control": { cityDisplayName, normalizeRuntimeSnapshot },
  }
  const source = readFileSync(new URL("../lib/agent-control-data.ts", import.meta.url), "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", compiled)((name) => { assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`); return modules[name] }, loaded, loaded.exports)
  return { events, run: () => loaded.exports.loadAgentControl(client, new Date("2026-09-21T10:30:00Z")), releaseAuth }
}

test("denied sessions cannot construct a service client or touch data", async () => {
  for (const session of [null, { isAdmin: false }]) {
    const check = setup({ session })
    await assert.rejects(check.run(), /Admin-Zugriff erforderlich/)
    assert.deepEqual(check.events, [["auth"]])
  }
})

test("authentication resolves before service construction and all reads use narrow projections", async () => {
  let resolveAuth
  const check = setup({ session: new Promise(resolve => { resolveAuth = resolve }) })
  const pending = check.run()
  assert.deepEqual(check.events, [["auth"]])
  resolveAuth({ isAdmin: true })
  const result = await pending
  assert.equal(result.runtime.state, "fresh")
  assert.equal(result.cities.state, "available")
  assert.equal(result.cities.items[0].cityName, "Annweiler am Trifels")
  assert.equal(result.pipeline.item.technicalOk, true)
  assert.equal(result.pipeline.item.editorialReviewPending, true)
  assert.equal(JSON.stringify(result).includes("raw_log"), false)
  assert.equal(JSON.stringify(result).includes("secret"), false)
  assert.deepEqual(check.events.filter(event => event[0] === "user-table"), [])
  const selects = check.events.filter(event => event[0] === "select").map(event => [event[1], event[2]])
  assert.deepEqual(selects, [
    ["benefitsi_agent_runtime_snapshots", "host_id,observed_at,schema_version,snapshot,received_at"],
    ["city_agent_city_controls", "city_id,operating_mode,orchestrator_profile,city_profile,timezone,auto_publish_enabled,last_full_check_at,next_full_check_at,health_status"],
    ["city_agent_schedules", "id,city_id,module_key,cadence_minutes,enabled,next_run_at,last_run_at,last_status,actual_trigger,last_trigger_at,last_missed_at,consecutive_missed_runs"],
    ["annweiler_event_pipeline_health", "city_id,last_run_at,last_run_ok,summary"],
  ])
})

test("wrapper and snapshot timestamps compare as instants across ISO offsets", async () => {
  const result = await setup({ equivalentTimestamp: true }).run()
  assert.equal(result.runtime.state, "fresh")
})

test("each failed or empty source stays unknown while other sources remain visible", async () => {
  for (const table of ["benefitsi_agent_runtime_snapshots", "city_agent_city_controls", "city_agent_schedules", "annweiler_event_pipeline_health"]) {
    const result = await setup({ failures: [table] }).run()
    const key = ({ benefitsi_agent_runtime_snapshots: "runtime", city_agent_city_controls: "cities", city_agent_schedules: "citySchedules", annweiler_event_pipeline_health: "pipeline" })[table]
    assert.equal(result[key].state, "unavailable")
    assert.equal(JSON.stringify(result).includes(`secret ${table}`), false)
    assert.ok(Object.entries(result).some(([name, source]) => name !== key && source.state !== "unavailable"))
  }
  for (const table of ["benefitsi_agent_runtime_snapshots", "city_agent_city_controls", "city_agent_schedules", "annweiler_event_pipeline_health"]) {
    const result = await setup({ empty: [table] }).run()
    const key = ({ benefitsi_agent_runtime_snapshots: "runtime", city_agent_city_controls: "cities", city_agent_schedules: "citySchedules", annweiler_event_pipeline_health: "pipeline" })[table]
    assert.equal(result[key].state, "unavailable")
  }
})
