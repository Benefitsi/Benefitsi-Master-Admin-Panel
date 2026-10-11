import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { loadTypescript } from "./helpers/load-typescript.mjs"

const require = createRequire(import.meta.url)
const partner = "11111111-1111-4111-8111-111111111111"

function fixture({ denied = false } = {}) {
  const writes = []
  const db = { from(table) {
    const query = {
      delete() { writes.push({ table, operation: "delete" }); return query },
      eq(column, value) { assert.equal(column, "partner_id"); assert.equal(value, partner); return query },
      insert(rows) { writes.push({ table, operation: "insert", rows }); return query },
      then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject) },
    }
    return query
  }, async rpc(name, args) {
    assert.equal(name, "save_partner_related_details")
    const rows = args.p_opening_hours.map((row, index) => ({ ...row, id: `hours-${index}`, partner_id: partner }))
    writes.push({ table: "partner_opening_hours", operation: "insert", rows })
    return { data: { partner_id: partner, opening_hours: rows, holidays: [], socials: [] }, error: null }
  } }
  const actions = loadTypescript("app/partner-actions.ts", {
    "next/cache": { revalidatePath() {} }, "next/server": { after() {} },
    "@/lib/partner-portal": { getPartnerPortalSession: async () => ({ user: { id: "editor" }, isAdmin: true }), canManagePartner: () => !denied },
    "@/lib/supabase/server": { createClient: async () => db }, "@/lib/supabase/config": {}, "@supabase/supabase-js": {},
    "@/lib/admin": {}, "@/lib/deal-copy": {}, "@/lib/content-agent": {},
    "@/lib/deal-form": require("../lib/deal-form.ts"),
    "@/lib/menu-import.js": {}, "@/lib/menu-zip-import.js": {}, "@/lib/menu-ai-import": {},
    "@/lib/partners/entitlements": {}, "@/lib/partners/menu-quota": {}, "@/lib/partners/workspace-data": {},
  }, { FormData, File })
  return { actions, writes }
}

function schedule(ranges = [["00:00", "00:00"]]) {
  const form = new FormData()
  form.set("partner_id", partner)
  for (let day = 1; day <= 7; day++) {
    form.set(`slot_count_${day}`, String(ranges.length))
    ranges.forEach(([opens, closes], index) => {
      const suffix = index ? `_${index}` : ""
      form.set(`opens_at_${day}${suffix}`, opens)
      form.set(`closes_at_${day}${suffix}`, closes)
    })
  }
  return form
}

test("midnight to midnight saves 24-hour operating hours for all seven days", async () => {
  const { actions, writes } = fixture()
  const result = await actions.saveWeeklyOpeningHours({}, schedule())
  assert.equal(result.ok, true, result.message)
  const rows = writes.find(write => write.table === "partner_opening_hours" && write.operation === "insert").rows
  assert.equal(rows.length, 7)
  assert.deepEqual(Array.from(rows, row => row.weekday), [1, 2, 3, 4, 5, 6, 7])
  for (const row of rows) {
    assert.equal(row.opens_at, "00:00")
    assert.equal(row.closes_at, "00:00")
    assert.equal(row.is_closed, false)
    assert.equal(row.partner_id, partner)
  }
})

test("24-hour schedules preserve explicitly closed days", async () => {
  const { actions, writes } = fixture()
  const form = schedule()
  form.set("is_closed_7", "on")
  assert.equal((await actions.saveWeeklyOpeningHours({}, form)).ok, true)
  const sunday = writes.find(write => write.operation === "insert").rows.find(row => row.weekday === 7)
  assert.equal(sunday.is_closed, true)
  assert.equal(sunday.opens_at, null)
  assert.equal(sunday.closes_at, null)
})

test("a full-day range cannot overlap another slot or duplicate full-day range", async () => {
  for (const ranges of [
    [["00:00", "00:00"], ["09:00", "18:00"]],
    [["09:00", "18:00"], ["00:00", "00:00"]],
    [["00:00", "00:00"], ["00:00", "00:00"]],
  ]) {
    const { actions, writes } = fixture()
    const result = await actions.saveWeeklyOpeningHours({}, schedule(ranges))
    assert.equal(result.ok, false)
    assert.match(result.message, /must not overlap/)
    assert.equal(writes.length, 0)
  }
})

test("invalid, missing and overlapping ordinary times are rejected before changing saved hours", async () => {
  for (const ranges of [
    [["09:00", "09:00"]], [["18:00", "09:00"]], [["", "00:00"]],
    [["09:00", "12:00"], ["11:00", "18:00"]],
  ]) {
    const { actions, writes } = fixture()
    assert.equal((await actions.saveWeeklyOpeningHours({}, schedule(ranges))).ok, false)
    assert.equal(writes.length, 0)
  }
})

test("ordinary split shifts still save and unauthorized full-day changes cannot write", async () => {
  const allowed = fixture()
  assert.equal((await allowed.actions.saveWeeklyOpeningHours({}, schedule([["09:00", "12:00"], ["12:00", "18:00"]]))).ok, true)
  const denied = fixture({ denied: true })
  assert.equal((await denied.actions.saveWeeklyOpeningHours({}, schedule())).ok, false)
  assert.equal(denied.writes.length, 0)
})
