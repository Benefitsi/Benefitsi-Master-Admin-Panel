import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import React, { act } from "react"
import * as jsx from "react/jsx-runtime"
import ts from "typescript"

const require = createRequire(import.meta.url)
const { JSDOM } = require(process.env.BENEFITSI_TEST_JSDOM_PATH || "jsdom")
const languageBoundary = {
  useAdminLanguage: () => ({ language: "de", tr: value => value }),
  useAdminLocale: require("../app/admin-language.tsx").useAdminLocale,
}
function loadEditor() {
  const boundaries = {
    react: React, "react/jsx-runtime": jsx, "react-dom": require("react-dom"),
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "./partner-actions": {}, "./partner-enrichment-actions": {}, "./microsite-panel": {},
    "./partner-configuration-actions": {},
    "./use-partner-capabilities": {}, "./streak-rule-fields": require("../app/streak-rule-fields.tsx"),
    "./admin-language": languageBoundary,
    "@/app/admin-language": languageBoundary,
    "@/components/admin-format": require("../components/admin-format.tsx"),
    "@/components/loading-ui": { LoadingSpinner: () => null },
  }
  const source = readFileSync(new URL("../app/partner-admin.tsx", import.meta.url), "utf8") + "\nexport { DealFields };"
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", js)(id => {
    if (Object.hasOwn(boundaries, id)) return boundaries[id]
    if (id.startsWith("@/lib/")) return require(`../lib/${id.slice(6)}`)
    if (id.startsWith("@/components/")) return {}
    return require(id)
  }, loaded, loaded.exports)
  return loaded.exports.DealFields
}

async function withEditor(props, run) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://admin.example.test", pretendToBeVisual: true })
  const names = ["window", "document", "HTMLElement", "HTMLFormElement", "FormData", "File", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]))
  Object.assign(globalThis, Object.fromEntries(names.map(name => [name, name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name]])))
  const root = require("react-dom/client").createRoot(document.getElementById("root"))
  try {
    const Editor = loadEditor()
    await act(async () => root.render(React.createElement("form", {}, React.createElement(Editor, { defaultActive: true, ...props }))))
    const form = document.querySelector("form")
    const choose = async (name, value) => { const field = form.elements.namedItem(name); await act(async () => { field.value = value; field.dispatchEvent(new dom.window.Event("change", { bubbles: true })) }) }
    await run({ form, choose, click: async element => { await act(async () => element.click()) } })
  } finally {
    await act(async () => root.unmount())
    Object.assign(globalThis, previous); dom.window.close()
  }
}

test("selecting a Premium campaign updates the actual submitted audience and keeps the admin override editable", async () => {
  await withEditor({}, async ({ form, choose }) => {
    await choose("deal_concept", "welcome")
    assert.equal(new FormData(form).get("audience"), "premium")
    await choose("audience", "both")
    assert.equal(new FormData(form).get("audience"), "both")
    assert.equal(form.querySelector('option[value="free_trial_only"]'), null)
  })
})
test("the partner editor submits the locked audience, including a previously saved admin exception", async () => {
  for (const deal of [undefined, { type: "welcome", audience: "free", premium_only: false }]) {
    await withEditor({ portalMode: true, deal }, async ({ form, choose }) => {
      if (!deal) await choose("deal_concept", "welcome")
      assert.equal(form.querySelector('select[name="audience"]'), null)
      assert.equal(new FormData(form).get("audience"), deal ? "free" : "premium")
    })
  }
})
test("reopening a saved Drop formats UTC in its partner timezone and keeps explanation collapsed", async () => {
  await withEditor({ deal: { id: "drop", type: "limited_drop", audience: "premium", discount_type: "item", starts_at: "2026-10-07T09:00:00Z", ends_at: "2026-10-14T09:00:00Z", timezone: "Europe/Berlin" } }, async ({ form }) => {
    assert.equal(form.elements.namedItem("starts_at").value, "2026-10-07T11:00")
    assert.equal(form.elements.namedItem("ends_at").value, "2026-10-14T11:00")
    assert.equal(form.querySelector('[name="allow_free_trial"]'), null)
    const explanation = [...form.querySelectorAll("details")].find(el => el.querySelector(":scope > summary")?.textContent.trim() === "Weitere Infos")
    assert.ok(explanation)
    assert.equal(explanation.open, false)
  })
})
test("reopening a regular benefit retains stored ISO weekday restrictions in the submitted form", async () => {
  await withEditor({ deal: { id: "discount", type: "permanent_discount", discount_type: "fixed", discount_value: 2, weekdays: null, valid_weekdays: [2, 6] } }, async ({ form }) => {
    assert.deepEqual(new FormData(form).getAll("weekdays"), ["tuesday", "saturday"])
  })
})

test("changing a reward format keeps an explicit admin audience override within the same campaign", async () => {
  await withEditor({ deal: { type: "welcome", discount_type: "fixed", audience: "both", premium_only: false } }, async ({ form, choose }) => {
    await choose("discount_type", "percent")
    assert.equal(new FormData(form).get("audience"), "both")
    await choose("discount_type", "2for1")
    assert.equal(new FormData(form).get("audience"), "premium")
  })
})
test("choosing existing partner media updates the submitted selection and real card preview", async () => {
  const url = "https://images.example.test/partner-card.webp"
  await withEditor({ partnerName: "Testcafé", mediaOptions: [{ url, label: "Profilbild" }], deal: { type: "limited_drop", discount_type: "item", reward_item: "Kaffee", audience: "premium", stock_total: 10, stock_remaining: 10 } }, async ({ form, click }) => {
    await click(form.querySelector('button[aria-label="Profilbild als Kartenbild verwenden"]'))
    assert.equal(new FormData(form).get("selected_deal_drop_image_url"), url)
    assert.equal(form.querySelector('[data-deal-drop-preview] img')?.getAttribute("src"), url)
    assert.match(form.querySelector('[data-deal-drop-preview]')?.textContent, /Testcafé/)
    assert.match(form.querySelector('[data-deal-drop-preview]')?.textContent, /Gratis Kaffee/)
  })
})

test("the German Drop preview uses German stock and countdown copy", async () => {
  await withEditor({ deal: { type: "limited_drop", audience: "premium", discount_type: "item", reward_item: "Kaffee", stock_total: 20, stock_remaining: 12, ends_at: "2100-01-01T11:00:00Z", timezone: "Europe/Berlin" } }, async ({ form }) => {
    const preview = [...form.querySelectorAll("details")].find(el => el.querySelector(":scope > summary")?.textContent.includes("Live-Vorschau"))
    assert.match(preview.textContent, /Nur noch 12 verfügbar/)
    assert.match(preview.textContent, /Endet in/)
    assert.doesNotMatch(preview.textContent, /Only|Ends in/)
  })
})

test("a canonical Drop opens the actual Drop date, image and stock controls", async () => {
  await withEditor({ deal: { type: "free_item", campaign_type: "deal_drop", reward_format: "free_item", discount_type: "item", reward_item: "Kaffee", audience: "premium", stock_total: 20, stock_remaining: 12, valid_from: "2026-10-07T09:00:00Z", valid_until: "2026-10-14T09:00:00Z", timezone: "Europe/Berlin" } }, async ({ form }) => {
    assert.equal(form.elements.type.value, "limited_drop")
    assert.equal(form.elements.starts_at.value, "2026-10-07T11:00")
    assert.equal(form.elements.stock_total.value, "20")
    assert.ok(form.querySelector('[data-deal-drop-preview]'))
  })
})
