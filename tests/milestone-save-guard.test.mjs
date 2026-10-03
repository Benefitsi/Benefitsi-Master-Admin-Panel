import assert from "node:assert/strict"
import test from "node:test"
import { prepareMilestoneCreate, recoverMilestoneCreate } from "../lib/milestone-save-guard.ts"

const request = "22222222-2222-4222-8222-222222222222"
const payload = { partner_id: "partner-1", required_stamps: 5, reward_type: "item", reward_item: "Kaffee", discount_type: "item", discount_value: null, estimated_savings: 3.5, title: "5 Stempel: Kaffee", customer_description: "Erhalte Kaffee", staff_instructions: "Kaffee ausgeben", terms: "Nur Samstag", audience: "both", active: true, reward_track_target: "base" }
function client(row) { return { from() { const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row, error: null }) }; return query } } }
test("one milestone request id resolves the same saved reward and tolerates numeric DB representations", async () => {
  const first = await prepareMilestoneCreate(client(null), payload, request)
  assert.equal(first.id, request)
  const stored = { ...payload, id: request, estimated_savings: "3.5", required_stamps: "5", created_at: "2026-10-03T12:00:00Z" }
  assert.equal((await prepareMilestoneCreate(client(stored), payload, request)).replayed, true)
  assert.equal(await recoverMilestoneCreate(client(stored), request, payload), true)
})
test("a reused milestone request cannot overwrite another partner or a changed reward", async () => {
  const stored = { ...payload, id: request }
  for (const changed of [{ partner_id: "other" }, { required_stamps: 8 }, { title: "Other title" }]) {
    assert.ok((await prepareMilestoneCreate(client(stored), { ...payload, ...changed }, request)).error)
    assert.equal(await recoverMilestoneCreate(client(stored), request, { ...payload, ...changed }), false)
  }
  assert.ok((await prepareMilestoneCreate(client(null), payload, "invalid")).error)
})
