import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import React, { act } from "react"
import { loadTypescript } from "./helpers/load-typescript.mjs"

const require = createRequire(import.meta.url)
const { JSDOM } = require(process.env.BENEFITSI_TEST_JSDOM_PATH || "jsdom")
const partnerId = "11111111-1111-4111-8111-111111111111"
async function withTools(actions, render, run) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>')
  const names = ["window", "document", "HTMLElement", "HTMLFormElement", "FormData", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]))
  Object.assign(globalThis, Object.fromEntries(names.map(name => [name, name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name]])))
  const root = require("react-dom/client").createRoot(document.getElementById("root"))
  try {
    const components = loadTypescript("components/partner/partner-internal-tools.tsx", { react: React, "@/app/partner-configuration-actions": actions }, { FormData: dom.window.FormData })
    await act(async () => root.render(render(components)))
    await run()
  } finally {
    await act(async () => root.unmount())
    Object.assign(globalThis, previous); dom.window.close()
  }
}
test("a lost internal-contact save response shows an error while keeping the private form values", async () => {
  const contact = { partner_id: partnerId, email: "owner@example.test", mobile: "+49 123", updated_at: null }
  await withTools({ loadInternalContact: async () => ({ ok: true, data: contact }), saveInternalContact: async () => { throw new Error("offline") } },
    ({ PartnerInternalContact }) => React.createElement(PartnerInternalContact, { partnerId }), async () => {
      await act(async () => document.querySelector("form").requestSubmit())
      assert.match(document.querySelector('[role="alert"]')?.textContent, /Eingaben bleiben erhalten/)
      assert.equal(document.querySelector('input[type="email"]').value, contact.email)
      assert.equal(document.querySelector('input[type="tel"]').value, contact.mobile)
    })
})
test("badge edits preserve values on a failed transport and keep unsupported award controls absent", async () => {
  const badge = { id: "badge", partner_id: partnerId, title: "Erster Besuch", icon_key: "visit", accent_key: "blue", rarity: "common", layer_count: 1, sort_order: 0, active: true, target_count: 1, requirement_type: "partner_visit_count", updated_at: "2026-10-07T10:00:00Z" }
  await withTools({ loadPartnerBadges: async () => ({ ok: true, data: [badge] }), savePartnerBadge: async () => { throw new Error("offline") } },
    ({ PartnerBadgeManager }) => React.createElement(PartnerBadgeManager, { partnerId }), async () => {
      const form = document.querySelector("form")
      form.elements.title.value = "Mein neuer Titel"
      await act(async () => form.requestSubmit())
      assert.match(document.querySelector('[role="alert"]')?.textContent, /Eingaben bleiben erhalten/)
      assert.equal(form.elements.title.value, "Mein neuer Titel")
      for (const name of ["target_count", "available_from", "available_until", "max_claims", "one_time"]) assert.equal(form.elements.namedItem(name), null)
    })
})

test("editing a paused partner's badge title retains its configured activation", async () => {
  const calls = []
  const badge = { id: "badge", partner_id: partnerId, title: "Erster Besuch", icon_key: "visit", accent_key: "blue", rarity: "common", layer_count: 1, sort_order: 0, active: false, configured_active: true, target_count: 1, requirement_type: "partner_visit_count", updated_at: "2026-10-07T10:00:00Z" }
  await withTools({ loadPartnerBadges: async () => ({ ok: true, data: [badge] }), savePartnerBadge: async (...args) => { calls.push(args); return { ok: false, message: "Test gespeichert" } } },
    ({ PartnerBadgeManager }) => React.createElement(PartnerBadgeManager, { partnerId }), async () => {
      const form = document.querySelector("form")
      assert.equal(form.elements.active.checked, true)
      form.elements.title.value = "Geänderter Titel"
      await act(async () => form.requestSubmit())
      assert.equal(calls[0][2].active, true)
      assert.equal(calls[0][2].title, "Geänderter Titel")
    })
})
