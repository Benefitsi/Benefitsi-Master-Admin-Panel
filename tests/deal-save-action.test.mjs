import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { loadTypescript } from "./helpers/load-typescript.mjs"

const require = createRequire(import.meta.url)
const partner = "11111111-1111-4111-8111-111111111111"
const request = "22222222-2222-4222-8222-222222222222"
// public.deals column contract verified against production on 2026-10-07.
const dealColumns = new Set(`id partner_id type discount_type discount_value premium_only active
  happy_hour_start happy_hour_end trigger_value expiry_days twoforone_usage_limit twoforone_trial_limit
  reward_item benefit_count estimated_savings created_at updated_at is_directDeal benefit_category audience
  activation_required allow_free_trial valid_from valid_until max_redemptions_global max_redemptions_per_user
  cooldown_hours stock_total stock_remaining selection_expires_minutes priority customer_description
  staff_instructions terms min_spend max_discount_amount reward_track_target timezone weekdays reserve_on_selection
  metadata display_title display_subtitle reward_format trigger_key campaign_type activation_mode public_title
  public_subtitle display_order`.split(/\s+/))
function schemaError(values) {
  for (const row of Array.isArray(values) ? values : [values]) {
    const unknown = Object.keys(row).sort().find(key => !dealColumns.has(key))
    if (unknown) return { message: `Could not find the '${unknown}' column of 'deals' in the schema cache` }
    if (row.weekdays?.some(day => !Number.isInteger(day))) return { message: "weekdays must contain integers" }
  }
  return null
}
function fixture({ denied = false, isAdmin = true, mutationError = null, existing = [], beforeUpdate, media = {} } = {}) {
  const rows = new Map(existing.map(row => [row.id, structuredClone(row)])), writes = [], invalidations = []
  const db = { from(table) {
    if (table !== "deals") {
      const filters = [], query = {}, records = media[table] || []
      query.select = () => query
      query.eq = (key, value) => { filters.push(row => row[key] === value); return query }
      query.in = (key, values) => { filters.push(row => values.includes(row[key])); return query }
      const get = () => records.filter(row => filters.every(matches => matches(row)))
      query.single = () => Promise.resolve({ data: get()[0] || null, error: null })
      query.then = resolve => Promise.resolve({ data: get(), error: null }).then(resolve)
      return query
    }
    const filters = [], query = {}, get = () => [...rows.values()].filter(row => filters.every(([key, value]) => row[key] === value))
    query.select = query.order = query.limit = () => query
    query.eq = (key, value) => { filters.push([key, value]); return query }
    query.in = () => query
    query.neq = () => query
    query.maybeSingle = query.single = () => Promise.resolve({ data: get()[0] ?? null, error: null })
    query.then = resolve => Promise.resolve({ data: get(), error: null }).then(resolve)
    query.insert = values => {
      writes.push(values)
      const error = mutationError ? { message: mutationError } : schemaError(values)
      if (error) { query.then = resolve => Promise.resolve({ data: null, error }).then(resolve); return query }
      for (const row of values) {
        if (rows.has(row.id)) return Promise.resolve({ error: { message: "duplicate key value violates unique constraint" } })
        rows.set(row.id, structuredClone(row))
      }
      query.then = resolve => Promise.resolve({ data: get(), error: null }).then(resolve)
      return query
    }
    query.update = value => {
      writes.push(value)
      const error = mutationError ? { message: mutationError } : schemaError(value)
      if (error) { query.then = resolve => Promise.resolve({ data: null, error }).then(resolve); return query }
      query.then = resolve => {
        beforeUpdate?.(rows)
        for (const row of get()) rows.set(row.id, { ...row, ...structuredClone(value) })
        return Promise.resolve({ data: get(), error: null }).then(resolve)
      }
      return query
    }
    return query
  } }
  const actions = loadTypescript("app/partner-actions.ts", {
    "next/cache": { revalidatePath: path => invalidations.push(path) }, "next/server": { after() {} },
    "@/lib/partner-portal": { getPartnerPortalSession: async () => ({ user: { id: "editor-1" }, isAdmin }), canManagePartner: () => !denied },
    "@/lib/supabase/server": { createClient: async () => db }, "@/lib/supabase/config": {}, "@supabase/supabase-js": {},
    "@/lib/admin": {}, "@/lib/deal-copy": {}, "@/lib/content-agent": {},
    "@/lib/deal-form": require("../lib/deal-form.ts"),
    "@/lib/menu-import.js": {}, "@/lib/menu-zip-import.js": {}, "@/lib/menu-ai-import": {},
    "@/lib/partners/entitlements": {}, "@/lib/partners/menu-quota": {},
    "@/lib/partners/workspace-data": {},
  }, { FormData, File })
  return { actions, rows, writes, invalidations }
}
function form(values = {}, days = [1, 2, 3, 4, 5, 6, 7]) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ partner_id: partner, create_request_id: request, type: "happy_hour", discount_type: "fixed", discount_value: "2", happy_hour_start: "15:00", happy_hour_end: "17:00", audience: "both", active: "on", valid_weekdays_present: "1", ...values })) data.set(key, String(value))
  days.forEach(day => data.append("valid_weekdays", String(day)))
  return data
}

const drop = (values = {}) => form({ type: "limited_drop", discount_type: "item", reward_item: "Kaffee", stock_total: "100", stock_remaining: "100", timezone: "Europe/Berlin", starts_at: "2026-10-07T11:00", ends_at: "2026-10-14T11:00", ...values })
test("Drop save interprets the configured partner wall time in summer and winter", async () => {
  for (const [local, expected] of [["2026-10-07T11:00", "2026-10-07T09:00:00.000Z"], ["2027-01-07T11:00", "2027-01-07T10:00:00.000Z"]]) {
    const { actions, rows } = fixture()
    const result = await actions.saveDeal({}, drop({ starts_at: local, ends_at: "2027-02-01T11:00" }))
    assert.equal(result.ok, true, result.message)
    assert.equal(rows.get(request).valid_from, expected)
    assert.equal(rows.get(request).valid_until, "2027-02-01T10:00:00.000Z")
  }
})
test("new and edited benefits persist availability using the actual deals schema", async () => {
  for (const type of ["happy_hour", "limited_drop", "permanent_discount"]) {
    const { actions, rows, writes } = fixture()
    const data = type === "limited_drop" ? drop() : form({ type, valid_from: "2026-10-07T11:00", valid_until: "2026-10-14T11:00" })
    data.delete("valid_weekdays")
    if (type === "permanent_discount") {
      data.append("weekdays", "tuesday")
      data.append("weekdays", "saturday")
    } else {
      data.append("valid_weekdays", "2")
      data.append("valid_weekdays", "6")
    }
    for (const editing of [false, true]) {
      if (editing) data.set("id", request)
      const result = await actions.saveDeal({}, data)
      assert.equal(result.ok, true, `${type}, editing=${editing}: ${result.message}`)
      const row = rows.get(request)
      assert.equal(row.valid_from, "2026-10-07T09:00:00.000Z")
      assert.equal(row.valid_until, "2026-10-14T09:00:00.000Z")
      assert.deepEqual([...row.weekdays], [2, 6])
    }
    assert.equal(writes.length, 2)
  }
})
test("nonexistent and ambiguous local times are rejected with the unsaved form retained", async () => {
  for (const starts_at of ["2026-03-29T02:30", "2026-10-25T02:30", "2026-02-30T11:00"]) {
    const { actions, writes } = fixture()
    const result = await actions.saveDeal({}, drop({ starts_at, ends_at: "2027-02-01T11:00" }))
    assert.equal(result.ok, false, starts_at)
    assert.equal(result.dealDraft.rewardItem, "Kaffee")
    assert.equal(writes.length, 0)
  }
})
test("an update returning no persisted row cannot report a successful save", async () => {
  const existing = { id: request, partner_id: partner, type: "happy_hour", customer_description: null, staff_instructions: null, terms: null, reward_item: null }
  const { actions, invalidations } = fixture({ existing: [existing], beforeUpdate: rows => rows.delete(request) })
  const result = await actions.saveDeal({}, form({ id: request }))
  assert.equal(result.ok, false)
  assert.equal(result.dealDraft.discountType, "fixed")
  assert.equal(invalidations.length, 0)
})
test("missing schema columns fail without silently deleting configured values and retrying", async () => {
  const { actions, writes } = fixture({ mutationError: "Could not find the 'terms' column of 'deals' in the schema cache" })
  const result = await actions.saveDeal({}, form({ terms: "Nur vor Ort" }))
  assert.equal(result.ok, false)
  assert.equal(writes.length, 1)
  assert.equal(writes[0][0].terms, "Nur vor Ort")
})
test("normal Drop edits never restore already redeemed remaining stock", async () => {
  const existing = { id: request, partner_id: partner, type: "limited_drop", stock_total: 100, stock_remaining: 70, customer_description: null, staff_instructions: null, terms: null, reward_item: "Kaffee" }
  const { actions, rows, writes } = fixture({ existing: [existing], beforeUpdate: stored => { stored.get(request).stock_remaining = 69 } })
  const result = await actions.saveDeal({}, drop({ id: request, stock_remaining: "100" }))
  assert.equal(result.ok, true, result.message)
  assert.equal(rows.get(request).stock_remaining, 69)
  assert.equal(Object.hasOwn(writes[0], "stock_remaining"), false)
})
test("partner requests cannot broaden Premium campaign eligibility; internal overrides remain allowed", async () => {
  for (const values of [{ type: "welcome" }, { type: "two_for_one", discount_type: "2for1", reward_item: "Kaffee" }, { type: "limited_drop", discount_type: "item", reward_item: "Kaffee" }]) {
    const partnerFixture = fixture({ isAdmin: false })
    const refused = await partnerFixture.actions.saveDeal({}, drop({ ...values, audience: "both" }))
    assert.equal(refused.ok, false, values.type)
    assert.equal(partnerFixture.writes.length, 0)
    const adminFixture = fixture()
    const saved = await adminFixture.actions.saveDeal({}, drop({ ...values, audience: "free" }))
    assert.equal(saved.ok, true, saved.message)
    assert.equal(adminFixture.rows.get(request).audience, "free")
  }
})
test("an existing admin audience exception survives an unrelated partner edit", async () => {
  const existing = { id: request, partner_id: partner, type: "welcome", audience: "free", premium_only: false, allow_free_trial: false, customer_description: null, staff_instructions: null, terms: null, reward_item: null }
  const { actions, rows } = fixture({ isAdmin: false, existing: [existing] })
  const result = await actions.saveDeal({}, form({ id: request, type: "welcome", audience: "free", discount_type: "fixed" }))
  assert.equal(result.ok, true, result.message)
  assert.equal(rows.get(request).audience, "free")
})
test("new Premium campaigns choose Premium when no audience is submitted", async () => {
  const { actions, rows } = fixture()
  const data = form({ type: "welcome" }); data.delete("audience")
  assert.equal((await actions.saveDeal({}, data)).ok, true)
  assert.equal(rows.get(request).audience, "premium")
})

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
  assert.deepEqual([...rows.get(request).weekdays], [1,2,3,4,5,6,7])
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
      valid_from: "2026-10-01T00:00:00Z", valid_until: "2026-11-01T00:00:00Z", stock_total: 12, stock_remaining: 9,
      selection_expires_minutes: 15, reserve_on_selection: false, customer_description: null, staff_instructions: null, terms: null, reward_item: null }
    const { actions, rows } = fixture({ existing: [existing] })
    const result = await actions.saveDeal({}, form({ id: request, discount_type, discount_value: "2.5", benefit_count: "2", reward_item: "Kaffee", valid_from: existing.valid_from, valid_until: existing.valid_until,
      benefit_category: "direct_selectable", activation_required: "true", trigger_key: "forged", priority: "" }))
    assert.equal(result.ok, true, `${discount_type}: ${result.message}`)
    const row = rows.get(request)
    const types = { fixed: "discount", percent: "discount", item: "free_item", "2for1": "two_for_one", bonus_stamp: "bonus_stamp" }
    assert.equal(row.type, types[discount_type])
    for (const key of ["campaign_type", "trigger_key", "trigger_value", "expiry_days", "benefit_category", "activation_mode", "activation_required", "valid_from", "valid_until", "stock_total", "stock_remaining", "selection_expires_minutes", "reserve_on_selection"]) assert.equal(/^(valid_from|valid_until)$/.test(key) ? Date.parse(row[key]) : row[key], /^(valid_from|valid_until)$/.test(key) ? Date.parse(existing[key]) : existing[key], key)
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
  for (const key of ["type", "reward_format", "trigger_key", "campaign_type", "benefit_category", "activation_mode", "activation_required"]) assert.equal(/^(starts_at|ends_at)$/.test(key) ? Date.parse(row[key]) : row[key], /^(starts_at|ends_at)$/.test(key) ? Date.parse(existing[key]) : existing[key], key)
  assert.equal(row.metadata.required_visits_per_period, 2)
  assert.equal(row.metadata.required_consecutive_periods, 4)
  assert.match(row.customer_description, /Kalenderwoche.*einmal pro Serienlauf/)
})

test("a stale configuration revision cannot overwrite a concurrent editor", async () => {
  const existing = { id: request, partner_id: partner, type: "limited_drop", updated_at: "2026-10-07T10:00:00Z", reward_item: "Kaffee" }
  const { actions, rows } = fixture({ existing: [existing], beforeUpdate: stored => { stored.get(request).updated_at = "2026-10-07T10:01:00Z"; stored.get(request).reward_item = "Tee" } })
  const result = await actions.saveDeal({}, drop({ id: request, expected_updated_at: existing.updated_at, reward_item: "Saft" }))
  assert.equal(result.ok, false)
  assert.equal(rows.get(request).reward_item, "Tee")
  assert.equal(result.dealDraft.rewardItem, "Saft")
})
test("only media attached to the authorized partner can become a Drop card image", async () => {
  const url = "https://images.example.test/own.webp", foreign = "https://images.example.test/other.webp"
  const media = { partners: [{ id: partner, feature_card_url: url }, { id: "other", feature_card_url: foreign }] }
  const allowed = fixture({ media })
  const saved = await allowed.actions.saveDeal({}, drop({ selected_deal_drop_image_url: url }))
  assert.equal(saved.ok, true, saved.message)
  assert.equal(allowed.rows.get(request).metadata.card_image_url, url)
  const refused = fixture({ media })
  assert.equal((await refused.actions.saveDeal({}, drop({ selected_deal_drop_image_url: foreign }))).ok, false)
  assert.equal(refused.writes.length, 0)
})
test("removing a reused card image only detaches it, and ignores a forged existing image field", async () => {
  const existing = { id: request, partner_id: partner, type: "limited_drop", metadata: { card_image_url: "https://images.example.test/shared.webp" } }
  const { actions, rows } = fixture({ existing: [existing] })
  const removed = await actions.saveDeal({}, drop({ id: request, remove_deal_drop_image: "on", existing_deal_drop_image_url: "https://images.example.test/other.webp" }))
  assert.equal(removed.ok, true, removed.message)
  assert.equal(rows.get(request).metadata.card_image_url, undefined)
})
test("a create retry with a different selected image is never acknowledged as the original save", async () => {
  const a = "https://images.example.test/a.webp", b = "https://images.example.test/b.webp"
  const { actions, rows } = fixture({ media: { partners: [{ id: partner, cover_urls: [a, b] }] } })
  assert.equal((await actions.saveDeal({}, drop({ selected_deal_drop_image_url: a }))).ok, true)
  const changed = await actions.saveDeal({}, drop({ selected_deal_drop_image_url: b }))
  assert.equal(changed.ok, false)
  assert.equal(rows.get(request).metadata.card_image_url, a)
})

test("a canonical Happy Hour keeps its saved internal lifecycle exception on an unrelated partner edit", async () => {
  const existing = { id: request, partner_id: partner, type: "discount", campaign_type: "happy_hour", trigger_key: "welcome", audience: "free", premium_only: false, allow_free_trial: false, discount_type: "fixed" }
  const { actions, rows } = fixture({ isAdmin: false, existing: [existing] })
  const result = await actions.saveDeal({}, form({ id: request, type: "happy_hour", discount_type: "fixed", audience: "free" }))
  assert.equal(result.ok, true, result.message)
  assert.equal(rows.get(request).audience, "free")
  assert.equal(rows.get(request).trigger_key, "welcome")
})

test("an automatic benefit with a fixed priority acknowledges its identical create retry", async () => {
  const { actions, rows, writes } = fixture()
  const data = form({ type: "bonus_stamp", benefit_category: "automatic_background", priority: "73", audience: "premium", discount_type: "bonus_stamp", benefit_count: "1" })
  const first = await actions.saveDeal({}, data)
  assert.equal(first.ok, true, first.message)
  const retry = await actions.saveDeal({}, data)
  assert.equal(retry.ok, true, retry.message)
  assert.equal(rows.size, 1)
  assert.equal(writes.length, 1)
})

test("canonical Drop edits retain reward storage, lifecycle qualifiers and concurrent remaining stock", async () => {
  const existing = { id: request, partner_id: partner, type: "free_item", campaign_type: "deal_drop", trigger_key: "welcome", trigger_value: 2, expiry_days: 7, reward_format: "free_item", discount_type: "item", reward_item: "Kaffee", audience: "free", premium_only: false, allow_free_trial: false, stock_total: 100, stock_remaining: 70 }
  const { actions, rows } = fixture({ isAdmin: false, existing: [existing], beforeUpdate: stored => { stored.get(request).stock_remaining = 69 } })
  const result = await actions.saveDeal({}, drop({ id: request, audience: "free" }))
  assert.equal(result.ok, true, result.message)
  const saved = rows.get(request)
  assert.equal(saved.type, "free_item")
  assert.equal(saved.campaign_type, "deal_drop")
  assert.equal(saved.trigger_key, "welcome")
  assert.equal(saved.trigger_value, 2)
  assert.equal(saved.expiry_days, 7)
  assert.equal(saved.stock_remaining, 69)
  assert.equal(saved.valid_from, "2026-10-07T09:00:00.000Z")
})
