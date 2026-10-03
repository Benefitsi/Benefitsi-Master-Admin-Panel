import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { loadTypescript } from "./helpers/load-typescript.mjs"

const require = createRequire(import.meta.url)
const partner = "11111111-1111-4111-8111-111111111111"
const request = "22222222-2222-4222-8222-222222222222"
function fixture({ denied = false, mutationError = null, existing = [], beforeUpdate } = {}) {
  const rows = new Map(existing.map(row => [row.id, structuredClone(row)])), writes = [], invalidations = []
  const db = { from(table) {
    assert.equal(table, "deals")
    const filters = [], query = {}, get = () => [...rows.values()].filter(row => filters.every(([key, value]) => row[key] === value))
    query.select = query.order = query.limit = () => query
    query.eq = (key, value) => { filters.push([key, value]); return query }
    query.in = () => query
    query.neq = () => query
    query.maybeSingle = query.single = () => Promise.resolve({ data: get()[0] ?? null, error: null })
    query.then = resolve => Promise.resolve({ data: get(), error: null }).then(resolve)
    query.insert = values => {
      writes.push(values)
      if (mutationError) return Promise.resolve({ error: { message: mutationError } })
      for (const row of values) {
        if (rows.has(row.id)) return Promise.resolve({ error: { message: "duplicate key value violates unique constraint" } })
        rows.set(row.id, structuredClone(row))
      }
      return Promise.resolve({ error: null })
    }
    query.update = value => {
      writes.push(value)
      query.then = resolve => {
        beforeUpdate?.(rows)
        for (const row of get()) rows.set(row.id, { ...row, ...structuredClone(value) })
        return Promise.resolve({ error: null }).then(resolve)
      }
      return query
    }
    return query
  } }
  const actions = loadTypescript("app/partner-actions.ts", {
    "next/cache": { revalidatePath: path => invalidations.push(path) }, "next/server": { after() {} },
    "@/lib/partner-portal": { getPartnerPortalSession: async () => ({ user: { id: "editor-1" }, isAdmin: true }), canManagePartner: () => !denied },
    "@/lib/supabase/server": { createClient: async () => db }, "@/lib/supabase/config": {}, "@supabase/supabase-js": {},
    "@/lib/admin": {}, "@/lib/deal-copy": {}, "@/lib/content-agent": {},
    "@/lib/deal-form": require("../lib/deal-form.ts"),
    "@/lib/menu-import.js": {}, "@/lib/menu-zip-import.js": {}, "@/lib/menu-ai-import": {},
    "@/lib/partners/entitlements": {}, "@/lib/partners/menu-quota": {},
  }, { FormData, File })
  return { actions, rows, writes, invalidations }
}
function form(values = {}, days = [1, 2, 3, 4, 5, 6, 7]) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ partner_id: partner, create_request_id: request, type: "happy_hour", discount_type: "fixed", discount_value: "2", happy_hour_start: "15:00", happy_hour_end: "17:00", audience: "both", active: "on", valid_weekdays_present: "1", ...values })) data.set(key, String(value))
  days.forEach(day => data.append("valid_weekdays", String(day)))
  return data
}

test("real benefit save retains each Happy Hour reward format and its exact reward values", async () => {
  for (const discount_type of ["fixed", "percent", "item", "2for1", "bonus_stamp"]) {
    const { actions, rows } = fixture()
    const result = await actions.saveDeal({}, form({ discount_type, reward_item: "Kaffee", benefit_count: "2", discount_value: "2.5" }))
    assert.equal(result.ok, true, `${discount_type}: ${result.message}`)
    const row = rows.get(request)
    assert.equal(row.discount_type, discount_type)
    assert.equal(row.benefit_category, "direct_selectable")
    assert.equal(row.activation_required, true)
    if (discount_type === "bonus_stamp") assert.equal(row.benefit_count, 2)
    if (["fixed", "percent"].includes(discount_type)) assert.equal(row.discount_value, 2.5)
    assert.match(row.customer_description, /automatisch.*kein anderer/)
  }
})
test("a same-form retry acknowledges the created benefit without a second insert", async () => {
  const { actions, rows, writes } = fixture()
  const first = await actions.saveDeal({}, form())
  const retry = await actions.saveDeal({}, form())
  assert.equal(first.ok, true)
  assert.equal(retry.ok, true)
  assert.equal(rows.size, 1)
  assert.equal(writes.length, 1)
})
test("excluding every HH weekday returns a field error and does not turn the offer into daily HH", async () => {
  const { actions, writes } = fixture()
  const result = await actions.saveDeal({}, form({}, []))
  assert.equal(result.ok, false)
  assert.match(result.fieldErrors.valid_weekdays, /mindestens einen/)
  assert.equal(writes.length, 0)
})
test("older HH form submissions without a weekday selector preserve the legacy all-days rule", async () => {
  const { actions, rows } = fixture()
  const data = form({}, [])
  data.delete("valid_weekdays_present")
  assert.equal((await actions.saveDeal({}, data)).ok, true)
  assert.deepEqual([...rows.get(request).valid_weekdays], [1,2,3,4,5,6,7])
})
test("calendar-series save stores separate rule dimensions, concrete copy and no lifetime redemption limit", async () => {
  const { actions, rows } = fixture()
  const result = await actions.saveDeal({}, form({ type: "streak", discount_type: "bonus_stamp", benefit_count: 1, trigger_value: 4, streak_mode: "calendar_frequency", required_visits_per_period: 2, period_unit: "weeks", required_consecutive_periods: 4 }))
  assert.equal(result.ok, true, result.message)
  const row = rows.get(request)
  assert.equal(row.metadata.streak_mode, "calendar_frequency")
  assert.equal(row.metadata.required_visits_per_period, 2)
  assert.equal(row.metadata.required_consecutive_periods, 4)
  assert.equal(row.metadata.period_unit, "weeks")
  assert.equal(row.max_redemptions_per_user, null)
  assert.match(row.customer_description, /2.*Kalenderwoche.*4.*Wochen.*einmal pro Serienlauf/)
})
test("invalid calendar minimum is rejected before a DB write with an actionable field error", async () => {
  const { actions, writes } = fixture()
  const result = await actions.saveDeal({}, form({ type: "streak", discount_type: "bonus_stamp", benefit_count: 1, trigger_value: 4, streak_mode: "calendar_frequency", required_visits_per_period: "1.5", period_unit: "weeks", required_consecutive_periods: 4 }))
  assert.equal(result.ok, false)
  assert.match(result.fieldErrors.required_visits_per_period, /ganze/)
  assert.equal(writes.length, 0)
})
test("database HH duplicate markers are readable and unauthorized benefit saves never write", async () => {
  const duplicate = fixture({ mutationError: "happy_hour_duplicate" })
  assert.match((await duplicate.actions.saveDeal({}, form())).message, /identische aktive Happy Hour/)
  const denied = fixture({ denied: true })
  assert.equal((await denied.actions.saveDeal({}, form())).ok, false)
  assert.equal(denied.writes.length, 0)
})
test("canonical Happy Hour edits preserve authoritative activation, qualifiers, availability and stock", async () => {
  for (const discount_type of ["fixed", "percent", "item", "2for1", "bonus_stamp"]) {
    const existing = { id: request, partner_id: partner, type: "discount", campaign_type: "happy_hour", trigger_key: "welcome", trigger_value: 2, expiry_days: 7,
      benefit_category: "automatic_fallback", activation_mode: "automatic_fallback", activation_required: false,
      starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z", stock_total: 12, stock_remaining: 9,
      selection_expires_minutes: 15, reserve_on_selection: false, customer_description: null, staff_instructions: null, terms: null, reward_item: null }
    const { actions, rows } = fixture({ existing: [existing] })
    const result = await actions.saveDeal({}, form({ id: request, discount_type, discount_value: "2.5", benefit_count: "2", reward_item: "Kaffee", valid_from: existing.starts_at, valid_until: existing.ends_at,
      benefit_category: "direct_selectable", activation_required: "true", trigger_key: "forged", priority: "" }))
    assert.equal(result.ok, true, `${discount_type}: ${result.message}`)
    const row = rows.get(request)
    const types = { fixed: "discount", percent: "discount", item: "free_item", "2for1": "two_for_one", bonus_stamp: "bonus_stamp" }
    assert.equal(row.type, types[discount_type])
    for (const key of ["campaign_type", "trigger_key", "trigger_value", "expiry_days", "benefit_category", "activation_mode", "activation_required", "starts_at", "ends_at", "stock_total", "stock_remaining", "selection_expires_minutes", "reserve_on_selection"]) assert.equal(row[key], existing[key], key)
    assert.match(row.customer_description, /Happy Hour.*automatisch.*kein anderer/)
  }
})
test("a Happy Hour edit cannot restore stock consumed between its authorized read and write", async () => {
  const existing = { id: request, partner_id: partner, type: "happy_hour", campaign_type: "happy_hour", benefit_category: "direct_selectable", activation_required: true, stock_total: 12, stock_remaining: 9,
    customer_description: null, staff_instructions: null, terms: null, reward_item: null }
  const { actions, rows, writes } = fixture({ existing: [existing], beforeUpdate: stored => { stored.get(request).stock_remaining = 8 } })
  const result = await actions.saveDeal({}, form({ id: request }))
  assert.equal(result.ok, true, result.message)
  assert.equal(rows.get(request).stock_remaining, 8)
  assert.equal(Object.hasOwn(writes[0], "stock_remaining"), false)
  assert.equal(Object.hasOwn(writes[0], "stock_total"), false)
})
test("canonical calendar-series edits retain their direct reward category and storage dimensions", async () => {
  const metadata = { streak_mode: "calendar_frequency", required_visits_per_period: 2, period_unit: "weeks", required_consecutive_periods: 4 }
  const existing = { id: request, partner_id: partner, type: "bonus_stamp", reward_format: "bonus_stamp", trigger_key: "streak", campaign_type: null, discount_type: "bonus_stamp",
    benefit_category: "direct_selectable", activation_mode: "direct_selectable", activation_required: true, metadata,
    customer_description: null, staff_instructions: null, terms: null, reward_item: null }
  const { actions, rows } = fixture({ existing: [existing] })
  const result = await actions.saveDeal({}, form({ id: request, type: "streak", discount_type: "bonus_stamp", benefit_count: "1", trigger_value: "4", metadata: JSON.stringify(metadata), ...metadata }))
  assert.equal(result.ok, true, result.message)
  const row = rows.get(request)
  for (const key of ["type", "reward_format", "trigger_key", "campaign_type", "benefit_category", "activation_mode", "activation_required"]) assert.equal(row[key], existing[key], key)
  assert.equal(row.metadata.required_visits_per_period, 2)
  assert.equal(row.metadata.required_consecutive_periods, 4)
  assert.match(row.customer_description, /Kalenderwoche.*einmal pro Serienlauf/)
})
