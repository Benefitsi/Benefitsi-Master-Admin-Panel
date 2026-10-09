import assert from "node:assert/strict"
import test from "node:test"
import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { JSDOM } from "jsdom"
import { loadTypescript } from "./helpers/load-typescript.mjs"
import { AdminLanguageProvider, useAdminLanguage, translateValue } from "../app/admin-language.tsx"

test("partner configuration, feedback, plans and microsite operations follow the selected language", () => {
  const examples = [
    ["Reward feedback", "Feedback belohnen"],
    ["Internal contact saved.", "Interner Kontakt gespeichert."],
    ["Your plan", "Dein Tarif"],
    ["Contract & billing", "Vertrag & Abrechnung"],
    ["The saved microsite could not be loaded.", "Die gespeicherte Microsite konnte nicht geladen werden."],
    ["A menu is required for this change.", "Für diese Änderung ist eine Speisekarte erforderlich."],
  ]
  for (const [english, german] of examples) {
    assert.equal(translateValue(german, "en"), english)
    assert.equal(translateValue(english, "de"), german)
  }
})

test("partner operation templates preserve the exact supplied names and error identifiers", () => {
  assert.equal(translateValue("logo.png: Dieser Bildtyp wird nicht unterstützt.", "en"), "logo.png: This image type is not supported.")
  assert.equal(translateValue("logo.png: This image type is not supported.", "de"), "logo.png: Dieser Bildtyp wird nicht unterstützt.")
  assert.equal(translateValue("Speichern fehlgeschlagen. Bitte erneut versuchen. Fehlercode: ms-123", "en"), "Saving failed. Please try again. Error code: ms-123")
})

test("feedback settings translate controls while retaining authored benefit copy and submitted IDs", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://admin.example.test" })
  const names = ["window", "document", "Element", "Text", "Node", "NodeFilter", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] })
  const { PartnerFeedbackSettings } = loadTypescript("components/partner/partner-feedback-settings.tsx", {
    react: React,
    "@/app/partner/feedback-actions": { updateFeedbackReward: () => { throw new Error("This rendering test must not save") } },
    "@/app/admin-language": { useAdminLanguage },
  })
  const root = createRoot(document.getElementById("root"))
  let setLanguage
  function Switch() { setLanguage = useAdminLanguage().setLanguage; return null }
  const settle = () => new Promise(resolve => setTimeout(resolve, 15))
  try {
    await act(async () => {
      root.render(React.createElement(AdminLanguageProvider, null, React.createElement(Switch), React.createElement(PartnerFeedbackSettings, {
        partnerId: "partner-1", initial: { available: true, settings: { enabled: true, deal_id: "benefit-1", reward_valid_days: 30, available_deals: [{ id: "benefit-1", title: "Discount", description: "Save", terms: "Free" }] } },
      })))
      await settle()
    })
    await act(async () => { setLanguage("de"); await settle() })
    assert.equal(document.querySelector('option[value="benefit-1"]').textContent, "Discount")
    assert.equal(document.querySelector("select").value, "benefit-1")
    assert.match(document.querySelector("aside").textContent, /DiscountSave/)
    await act(async () => { setLanguage("en"); await settle() })
    assert.equal(document.querySelector("h2").textContent, "Reward feedback")
    assert.equal(document.querySelector('option[value="benefit-1"]').textContent, "Discount")
    assert.equal(document.querySelector("select").value, "benefit-1")
  } finally {
    await act(async () => root.unmount())
    for (const name of names) {
      if (previous[name]) Object.defineProperty(globalThis, name, previous[name])
      else delete globalThis[name]
    }
    dom.window.close()
  }
})

test("order deal controls translate while authored product names, terms and checked item IDs remain intact", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://admin.example.test" })
  const names = ["window", "document", "Element", "Text", "Node", "NodeFilter", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] })
  const { CommerceDealRules } = loadTypescript("app/partner/commerce/deal-rules.tsx", {
    react: React,
    "./deal-actions": { saveCommerceDealRule: () => { throw new Error("This rendering test must not save") } },
  })
  const root = createRoot(document.getElementById("root"))
  let setLanguage
  function Switch() { setLanguage = useAdminLanguage().setLanguage; return null }
  const settle = () => new Promise(resolve => setTimeout(resolve, 15))
  try {
    await act(async () => {
      root.render(React.createElement(AdminLanguageProvider, { initialLanguage: "de" }, React.createElement(Switch), React.createElement(CommerceDealRules, {
        providerId: "provider-1", testMode: true, available: true,
        deals: [{ id: "deal-1", public_title: "Discount", customer_description: "Save", terms: "Free", discount_type: "item" }],
        menu: [{ id: "item-1", title: "Save", active: true }], rules: [{ deal_id: "deal-1", menu_item_ids: ["item-1"], enabled: true }],
      })))
      await settle()
    })
    await act(async () => { setLanguage("de"); await settle() })
    assert.equal(document.querySelector("h3").textContent, "Discount")
    assert.equal(document.querySelector('input[name="menu_item_ids"]').parentElement.textContent, "Save")
    assert.equal(document.querySelector('input[name="menu_item_ids"]').value, "item-1")
    assert.equal(document.querySelector('input[name="menu_item_ids"]').checked, true)
    await act(async () => { setLanguage("en"); await settle() })
    assert.equal(document.querySelector("h2").textContent, "Deals for orders · test mode")
    assert.match(document.querySelector("form").textContent, /Terms: Free/)
    assert.equal(document.querySelector('input[name="menu_item_ids"]').checked, true)
  } finally {
    await act(async () => root.unmount())
    for (const name of names) {
      if (previous[name]) Object.defineProperty(globalThis, name, previous[name])
      else delete globalThis[name]
    }
    dom.window.close()
  }
})
