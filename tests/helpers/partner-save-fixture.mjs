import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { loadTypescript } from "./load-typescript.mjs"

const require = createRequire(import.meta.url)
export const partnerId = "11111111-1111-4111-8111-111111111111"
export const ownerId = "22222222-2222-4222-8222-222222222222"
export const screenshotSchedule = [["14:00", "22:00"], ["14:00", "22:00"], ["14:00", "22:00"], ["14:00", "22:00"], ["14:00", "01:00"], ["12:00", "01:00"], ["12:00", "22:00"]]
export const seedPartner = {
  id: partnerId, owner_id: ownerId, name: "Test café", city_id: "33333333-3333-4333-8333-333333333333",
  type: "Food & Drink", category: ["Cafe"], address: "Test street 1", coordinates: '{"latitude":49,"longitude":8}',
  description: "Test café description", is_featured: true, slug: "test-cafe", status: "active", is_active: true,
  logo_url: "", feature_card_url: "", discover_card_image_url: "", cover_urls: [],
  deals: [], reward_milestones: [], menus: [], holidays: [], socials: [], opening_hours: [],
}

export function partnerSaveFixture({ isAdmin = true, allowed = true, signedIn = true, rpcError = null, badConfirmation = false, partnerMissing = false, confirmationTransform = data => data } = {}) {
  const tables = new Map([
    ["partners", partnerMissing ? [] : [structuredClone(seedPartner)]],
    ["partner_socials", [{ id: "existing-social", partner_id: partnerId, platform: "instagram", handle: "old", url: "https://www.instagram.com/old", sort_order: 0 }]],
    ["partner_opening_hours", [{ id: "existing-hours", partner_id: partnerId, weekday: 1, opens_at: "09:00:00", closes_at: "18:00:00", is_closed: false, label: null, sort_order: 10 }]],
    ["partner_holidays", [{ id: "existing-holiday", partner_id: partnerId, holiday_date: "2026-12-25", is_closed: true, opens_at: null, closes_at: null, label: "Christmas", repeats_yearly: true }]],
    ["partner_reward_milestones", []], ["users", [{ id: ownerId }]],
  ])
  const writes = [], rpcCalls = []
  let serial = 0
  const db = {
    from(table) {
      assert.ok(tables.has(table), `Unexpected table ${table}`)
      const filters = [], query = {}, get = () => tables.get(table).filter(row => filters.every(([key, value]) => row[key] === value))
      let operation = null, payload = null
      query.select = () => query
      query.eq = (key, value) => { filters.push([key, value]); return query }
      query.maybeSingle = () => Promise.resolve({ data: get()[0] ?? null, error: null })
      query.update = value => { operation = "update"; payload = value; return query }
      query.insert = value => { operation = "insert"; payload = value; return query }
      query.delete = () => { operation = "delete"; return query }
      query.then = (resolve, reject) => {
        let data = get()
        if (operation) writes.push({ table, operation, payload })
        if (operation === "update") { data.forEach(row => Object.assign(row, payload)); data = get() }
        if (operation === "insert") { data = (Array.isArray(payload) ? payload : [payload]).map(row => ({ id: row.id || `row-${++serial}`, ...row })); tables.get(table).push(...data) }
        if (operation === "delete") tables.set(table, tables.get(table).filter(row => !data.includes(row)))
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      }
      return query
    },
    async rpc(name, args) {
      assert.equal(name, "save_partner_related_details")
      rpcCalls.push(structuredClone(args))
      if (rpcError) return { data: null, error: { message: rpcError } }
      const id = args.p_partner_id
      for (const [key, table] of [["p_socials", "partner_socials"], ["p_opening_hours", "partner_opening_hours"], ["p_holidays", "partner_holidays"]]) {
        if (args[key] === null) continue
        tables.set(table, [...tables.get(table).filter(row => row.partner_id !== id), ...args[key].map(row => ({
          ...row, id: `saved-${++serial}`, partner_id: id,
          ...(table !== "partner_socials" ? {
            opens_at: row.opens_at ? `${row.opens_at.slice(0, 5)}:00` : null,
            closes_at: row.closes_at ? `${row.closes_at.slice(0, 5)}:00` : null,
          } : {}),
        }))])
      }
      const data = { partner_id: id, socials: tables.get("partner_socials").filter(row => row.partner_id === id), opening_hours: tables.get("partner_opening_hours").filter(row => row.partner_id === id), holidays: tables.get("partner_holidays").filter(row => row.partner_id === id) }
      return { data: confirmationTransform(structuredClone(badConfirmation ? { ...data, partner_id: ownerId } : data)), error: null }
    },
  }
  const actions = loadTypescript("app/partner-actions.ts", {
    "next/cache": { revalidatePath() {} }, "next/server": { after() {} },
    "@/lib/partner-portal": { getPartnerPortalSession: async () => signedIn ? { user: { id: ownerId }, isAdmin } : null, canManagePartner: () => allowed },
    "@/lib/supabase/server": { createClient: async () => db }, "@/lib/supabase/config": {}, "@supabase/supabase-js": {},
    "@/lib/admin": {}, "@/lib/deal-copy": {}, "@/lib/content-agent": {},
    "@/lib/deal-form": require("../../lib/deal-form.ts"),
    "@/lib/menu-import.js": {}, "@/lib/menu-zip-import.js": {}, "@/lib/menu-ai-import": {},
    "@/lib/partners/entitlements": {}, "@/lib/partners/menu-quota": {},
    "@/lib/partners/workspace-data": { readPartnerWorkspace: async (_, id) => ({ partner: { ...tables.get("partners").find(row => row.id === id), socials: tables.get("partner_socials").filter(row => row.partner_id === id), opening_hours: tables.get("partner_opening_hours").filter(row => row.partner_id === id), holidays: tables.get("partner_holidays").filter(row => row.partner_id === id) } }) },
    // The shared helper uses a relative import for types only; these are erased.
  }, { FormData, File })
  return { actions, tables, writes, rpcCalls, setRpcError(value) { rpcError = value } }
}

export function partnerForm({ create = false, socials = [["instagram", "@new"], ["youtube", "https://www.youtube.com/channel/UC-test"]], hours = true, holidays = true } = {}) {
  const data = new FormData()
  const values = { id: create ? "" : partnerId, owner_id: ownerId, name: seedPartner.name, city_id: seedPartner.city_id, type: "Food & Drink", address: seedPartner.address, coordinates: "49, 8", description: seedPartner.description, active: "on", category: "Cafe", existing_slug: "test-cafe", social_count: String(socials.length) }
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  socials.forEach(([platform, handle], index) => { data.set(`social_${index}_platform`, platform); data.set(`social_${index}_handle`, handle) })
  if (hours) for (let day = 1; day <= 7; day++) { data.set(`opens_at_${day}`, "00:00"); data.set(`closes_at_${day}`, "00:00"); data.set(`slot_count_${day}`, "1") }
  if (holidays) data.set("holiday_count", "0")
  if (create) {
    data.set("initial_milestone_count", "1")
    data.set("initial_milestone_0_required_stamps", "5")
    data.set("initial_milestone_0_reward_type", "item")
    data.set("initial_milestone_0_reward_item", "Coffee")
    data.set("initial_milestone_0_audience", "both")
    data.set("initial_milestone_0_active", "on")
  }
  return data
}
