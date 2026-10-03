import assert from "node:assert/strict"
import test from "node:test"
import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { JSDOM } from "jsdom"
import { loadTypescript } from "./helpers/load-typescript.mjs"
import { usePartnerCapabilities } from "../app/use-partner-capabilities.ts"

const partnerId = "11111111-1111-4111-8111-111111111111"
function route({ admin = true, error = null, authThrows = false } = {}) {
  const calls = []
  const client = { rpc: async (name, args) => {
    calls.push({ name, args: structuredClone(args) })
    return { data: { schema_version: 1, partner_id: args.p_partner_id, role: "benefitsi_admin", plan_code: "pro", features: { "media.rich": true, "menu.ai_import": false } }, error }
  } }
  const handler = loadTypescript("app/api/partners/[partnerId]/capabilities/route.ts", {
    "@/lib/admin": { getAdminSession: async () => { if (authThrows) throw new Error("Timeout"); return admin ? { isAdmin: true } : null } },
    "@/lib/supabase/server": { createClient: async () => client },
  }, { Response }).GET
  return { calls, run: id => handler(new Request("http://localhost"), { params: Promise.resolve({ partnerId: id }) }) }
}
test("capability reads require an admin session and return only selected partner UI flags without caching", async () => {
  const denied = route({ admin: false })
  assert.equal((await denied.run(partnerId)).status, 403)
  assert.deepEqual(denied.calls, [])
  const allowed = route()
  const response = await allowed.run(partnerId)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { media_rich_enabled: true, menu_ai_import_enabled: false })
  assert.deepEqual(allowed.calls, [{ name: "get_partner_entitlements", args: { p_partner_id: partnerId } }])
  assert.match(response.headers.get("Cache-Control"), /no-store/)
})
test("invalid partner ids do not reach the database and auth/rights failures remain retryable", async () => {
  const invalid = route()
  assert.equal((await invalid.run("invalid")).status, 400)
  assert.deepEqual(invalid.calls, [])
  for (const options of [{ error: { message: "Transport error" } }, { authThrows: true }]) {
    const response = await route(options).run(partnerId)
    assert.equal(response.status, 503)
    assert.match((await response.json()).error, /geladen/)
    assert.match(response.headers.get("Cache-Control"), /no-store/)
  }
})
test("changing selected partner cancels stale capability responses; failures allow an explicit retry", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const previous = Object.fromEntries(["window", "document", "fetch", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, globalThis[key]]))
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const requests = []
  globalThis.fetch = (url, init) => new Promise(resolve => requests.push({ url, signal: init.signal, resolve }))
  let state
  function Host({ partner }) { state = usePartnerCapabilities(partner, true); return null }
  const root = createRoot(document.getElementById("root"))
  try {
    const first = { id: partnerId }, second = { id: "22222222-2222-4222-8222-222222222222" }
    await act(async () => root.render(React.createElement(Host, { partner: first })))
    await act(async () => root.render(React.createElement(Host, { partner: second })))
    assert.equal(requests.length, 2)
    assert.equal(requests[0].signal.aborted, true)
    await act(async () => requests[0].resolve(Response.json({ media_rich_enabled: true, menu_ai_import_enabled: true })))
    assert.equal(state.partner.id, second.id)
    assert.equal(state.partner.menu_ai_import_enabled, undefined)
    await act(async () => requests[1].resolve(Response.json({ error: "Failed" }, { status: 503 })))
    assert.match(state.error, /geladen/)
    assert.equal(state.partner.menu_ai_import_enabled, undefined)
    await act(async () => state.retry())
    assert.equal(requests.length, 3)
    await act(async () => requests[2].resolve(Response.json({ media_rich_enabled: false, menu_ai_import_enabled: true })))
    assert.equal(state.partner.id, second.id)
    assert.equal(state.partner.media_rich_enabled, false)
    assert.equal(state.partner.menu_ai_import_enabled, true)
    assert.equal(state.error, undefined)
    await act(async () => root.render(React.createElement(Host, { partner: { id: partnerId } })))
    await act(async () => root.unmount())
    assert.equal(requests[3].signal.aborted, true)
  } finally {
    await act(async () => root.unmount())
    Object.assign(globalThis, previous)
    dom.window.close()
  }
})
