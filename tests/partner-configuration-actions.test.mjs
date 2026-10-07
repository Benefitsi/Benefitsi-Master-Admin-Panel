import assert from "node:assert/strict"
import test from "node:test"
import { existsSync } from "node:fs"
import { loadTypescript } from "./helpers/load-typescript.mjs"

const partner = "11111111-1111-4111-8111-111111111111"
const first = "22222222-2222-4222-8222-222222222222"
const second = "33333333-3333-4333-8333-333333333333"
function fixture({ admin = true, manage = true, data = null, error = null } = {}) {
  assert.ok(existsSync(new URL("../app/partner-configuration-actions.ts", import.meta.url)), "the protected configuration actions are missing")
  const calls = []
  const db = { rpc: async (name, args) => { calls.push([name, args]); return { data, error } } }
  const actions = loadTypescript("app/partner-configuration-actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/admin": { requireAdmin: async () => { if (!admin) throw new Error("admin_required"); return { supabase: db } } },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/partner-portal": { getPartnerPortalSession: async () => ({ isAdmin: admin }), canManagePartner: () => manage },
  })
  return { actions, calls }
}
test("private contact and badge/history reads reject a partner before sending any RPC", async () => {
  const { actions, calls } = fixture({ admin: false })
  for (const read of [actions.loadInternalContact, actions.loadPartnerBadges, actions.loadConfigurationHistory]) {
    const result = await read(partner)
    assert.equal(result.ok, false)
    assert.equal(result.data, undefined)
  }
  assert.equal(calls.length, 0)
})
test("contact save sends only the protected contact contract and reports a concurrent change", async () => {
  const { actions, calls } = fixture({ error: { message: "partner_contact_conflict" } })
  const result = await actions.saveInternalContact(partner, { email: " owner@example.test ", mobile: "+49 123", updated_at: "2026-10-07T10:00:00Z" })
  assert.equal(result.ok, false)
  assert.match(result.message, /geändert/)
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["save_partner_internal_contact", { p_partner_id: partner, p_email: "owner@example.test", p_mobile: "+49 123", p_expected_updated_at: "2026-10-07T10:00:00Z" }]])
})
test("reordering requires a complete confirmed permutation and never reports partial success", async () => {
  const missing = fixture({ data: [{ id: first, display_order: 0 }] })
  assert.equal((await missing.actions.reorderPartnerDeals(partner, [first, second])).ok, false)
  const accepted = fixture({ data: [{ id: first, display_order: 0 }, { id: second, display_order: 1 }] })
  assert.equal((await accepted.actions.reorderPartnerDeals(partner, [first, second])).ok, true)
  const denied = fixture({ manage: false })
  assert.equal((await denied.actions.reorderPartnerDeals(partner, [first])).ok, false)
  assert.equal(denied.calls.length, 0)
})
test("badge editing cannot submit a new partner, requirement, or target", async () => {
  const { actions, calls } = fixture()
  for (const input of [{ partner_id: second }, { requirement_type: "other" }, { target_count: 8 }, { available_from: "2026-10-01" }, { available_until: "2026-12-31" }, { max_claims: 2 }, { one_time: false }]) {
    assert.equal((await actions.savePartnerBadge(partner, first, input, "2026-10-07T10:00:00Z")).ok, false)
  }
  assert.equal(calls.length, 0)
})
