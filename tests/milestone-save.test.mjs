import assert from "node:assert/strict"
import test from "node:test"
import { loadTypescript } from "./helpers/load-typescript.mjs"

function fixture({ error = null, throws = false, signedIn = true, commitFailure = null, noRows = false } = {}) {
  const writes = [], invalidations = [], rows = new Map()
  let commitFailed = false
  const db = { from(table) {
    const query = { select: () => query, eq: () => query, maybeSingle: () => query }
    query.insert = query.update = payload => {
      writes.push({ table, payload })
      if (commitFailure && !commitFailed) {
        rows.set(payload.id, structuredClone(payload))
        commitFailed = true
        query.then = (resolve, reject) => (commitFailure === "throw" ? Promise.reject(new Error("Response lost after commit")) : Promise.resolve({ data: null, error: { message: "Response lost after commit" } })).then(resolve, reject)
        return query
      }
      if (!error && !throws) rows.set(payload.id, structuredClone(payload))
      query.then = (resolve, reject) => (throws ? Promise.reject(new Error("Network interrupted")) : Promise.resolve({ data: noRows ? [] : [payload], error })).then(resolve, reject)
      return query
    }
    query.then = resolve => Promise.resolve({ data: table === "partner_reward_milestones" ? null : { id: "partner-1" }, error: null }).then(resolve)
    let rowId
    query.eq = (key, value) => { if (key === "id") rowId = value; return query }
    query.maybeSingle = () => Promise.resolve({ data: rows.get(rowId) ?? null, error: null })
    return query
  } }
  const session = signedIn ? { user: { id: "editor-1" }, isAdmin: true } : null
  const actions = loadTypescript("app/partner-actions.ts", {
    "next/cache": { revalidatePath: path => invalidations.push(path) },
    "next/server": { after() {} },
    "@/lib/partner-portal": { getPartnerPortalSession: async () => session, canManagePartner: () => true },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/supabase/config": {},
    "@/lib/admin": {},
    "@/lib/deal-copy": {},
    "@/lib/deal-form": {},
    "@/lib/content-agent": {},
    "@/lib/menu-import.js": {},
    "@/lib/menu-zip-import.js": {},
    "@/lib/menu-ai-import": {},
    "@supabase/supabase-js": {},
    "@/lib/partners/entitlements": {},
    "@/lib/partners/menu-quota": {},
    "@/lib/partners/workspace-data": {},
  }, { FormData })
  return { actions, writes, invalidations, rows }
}
test("a milestone save with no confirmed row is reported as failed", async () => {
  const { actions, invalidations } = fixture({ noRows: true })
  const result = await actions.saveRewardMilestone({}, form())
  assert.equal(result.ok, false)
  assert.equal(invalidations.length, 0)
})
function form(values = {}) {
  const data = new FormData()
  Object.entries({ partner_id: "partner-1", required_stamps: "5", reward_type: "item", reward_item: "Kaffee", audience: "both", active: "on", ...values }).forEach(([key, value]) => data.set(key, value))
  return data
}

test("an optional blank milestone title becomes a usable non-null reward title", async () => {
  const { actions, writes, invalidations } = fixture()
  const result = await actions.saveRewardMilestone({}, form({ title: "  " }))
  assert.equal(result.ok, true)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].payload.title, "5 Stempel: Kaffee")
  assert.deepEqual(invalidations, ["/"])
})
test("custom milestone title and all custom copy reach the database unchanged", async () => {
  const { actions, writes } = fixture()
  const result = await actions.saveRewardMilestone({}, form({ title: "Mein Bonus", customer_description: "Für Dich", staff_instructions: "Kaffee ausgeben", terms: "Bis Sonntag" }))
  assert.equal(result.ok, true)
  assert.equal(writes[0].payload.title, "Mein Bonus")
  assert.equal(writes[0].payload.customer_description, "Für Dich")
  assert.equal(writes[0].payload.staff_instructions, "Kaffee ausgeben")
  assert.equal(writes[0].payload.terms, "Bis Sonntag")
})
test("invalid stamps return a field error without writing or refreshing", async () => {
  const { actions, writes, invalidations } = fixture()
  const result = await actions.saveRewardMilestone({}, form({ required_stamps: "0" }))
  assert.equal(result.ok, false)
  assert.match(result.fieldErrors.required_stamps, /1/)
  assert.deepEqual(writes, [])
  assert.deepEqual(invalidations, [])
})
test("a failed milestone save resolves with a readable error and allows retry", async () => {
  const { actions, writes, invalidations } = fixture({ throws: true })
  const result = await actions.saveRewardMilestone({}, form())
  assert.equal(result.ok, false)
  assert.match(result.message, /speicher|erneut/i)
  assert.equal(writes.length, 1)
  assert.deepEqual(invalidations, [])
})
test("unsigned milestone requests never write", async () => {
  const { actions, writes } = fixture({ signedIn: false })
  assert.equal((await actions.saveRewardMilestone({}, form())).ok, false)
  assert.deepEqual(writes, [])
})
test("an uncertain milestone commit is confirmed by the same-form retry with one saved row", async () => {
  const { actions, rows, writes } = fixture({ commitFailure: "throw" })
  const data = form({ create_request_id: "22222222-2222-4222-8222-222222222222" })
  const uncertain = await actions.saveRewardMilestone({}, data)
  assert.equal(uncertain.ok, false)
  assert.match(uncertain.message, /dasselbe Formular/)
  const retried = await actions.saveRewardMilestone({}, data)
  assert.equal(retried.ok, true)
  assert.equal(rows.size, 1)
  assert.equal(writes.length, 1)
})
test("an error response after a milestone commit recovers the successful write immediately", async () => {
  const { actions, rows, writes } = fixture({ commitFailure: "error" })
  const result = await actions.saveRewardMilestone({}, form({ create_request_id: "22222222-2222-4222-8222-222222222222" }))
  assert.equal(result.ok, true)
  assert.equal(rows.size, 1)
  assert.equal(writes.length, 1)
})
test("fractional or partially numeric milestone goals are rejected without truncation", async () => {
  for (const required_stamps of ["5.5", "5extra"]) {
    const { actions, writes } = fixture()
    const result = await actions.saveRewardMilestone({}, form({ required_stamps }))
    assert.equal(result.ok, false, required_stamps)
    assert.ok(result.fieldErrors.required_stamps)
    assert.equal(writes.length, 0)
  }
})
