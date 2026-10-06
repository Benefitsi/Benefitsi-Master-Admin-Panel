import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import React, { act, useActionState } from "react"
import * as jsx from "react/jsx-runtime"
import { JSDOM } from "jsdom"
import ts from "typescript"

const require = createRequire(import.meta.url)
function loadUi(action) {
  const actions = new Proxy({}, { get: () => action })
  const boundaries = {
    react: React, "react/jsx-runtime": jsx, "react-dom": require("react-dom"),
    "next/navigation": { useRouter: () => ({ refresh() {}, replace() {}, push() {} }) },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/image": { default: () => null }, "lucide-react": require("lucide-react"),
    "@/app/partner-actions": actions, "./partner-actions": actions,
    "./partner-enrichment-actions": {}, "./microsite-panel": {},
    "./use-partner-capabilities": require("../app/use-partner-capabilities.ts"),
    "./streak-rule-fields": require("../app/streak-rule-fields.tsx"),
    "./admin-language": { useAdminLanguage: () => ({ language: "de" }) },
    "@/app/admin-language": { useAdminLanguage: () => ({ language: "de" }) },
    "@/lib/supabase/client": {}, "@/components/loading-ui": { LoadingSpinner: () => null },
    "@/components/partner/partner-feedback-settings-loader": {},
    "@/components/microsite-read-only-notice": {},
    "@/components/menu-ai-import-dialog": {}, "@/components/partner/partner-plan-panel": {},
    "@/components/menu-item-video-field": require("../components/menu-item-video-field.tsx"),
  }
  const source = readFileSync(new URL("../app/partner-admin.tsx", import.meta.url), "utf8") + "\nexport { DealForm, MilestoneForm, useActionSuccess, WeekdayChipField };"
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", js)(id => {
    if (Object.hasOwn(boundaries, id)) return boundaries[id]
    if (id.startsWith("@/lib/")) return require(`../lib/${id.slice(6)}`)
    throw new Error(`Unmocked boundary ${id}`)
  }, loaded, loaded.exports)
  return loaded.exports
}
async function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost" })
  const names = ["window", "document", "HTMLElement", "HTMLFormElement", "FormData", "MutationObserver", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]))
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLFormElement: dom.window.HTMLFormElement, FormData: dom.window.FormData, MutationObserver: dom.window.MutationObserver, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })
  const root = require("react-dom/client").createRoot(document.getElementById("root"))
  try { await run(root, dom.window) } finally {
    await act(async () => root.unmount())
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}

test("failed React form actions preserve text, numbers, textarea, select and checkbox drafts", async () => {
  const { useActionSuccess } = loadUi(async () => ({ ok: false, message: "Speichern fehlgeschlagen" }))
  await withDom(async root => {
    let onSuccess = 0
    function Form() {
      const [state, action] = useActionState(async () => ({ ok: false, message: "Speichern fehlgeschlagen" }), { ok: false, message: "" })
      const ref = useActionSuccess(state, () => onSuccess++)
      return React.createElement("form", { ref, action },
        React.createElement("input", { name: "title", defaultValue: "" }),
        React.createElement("input", { name: "count", type: "number", defaultValue: 1 }),
        React.createElement("textarea", { name: "terms", defaultValue: "" }),
        React.createElement("select", { name: "audience", defaultValue: "both" }, React.createElement("option", { value: "both" }, "Both"), React.createElement("option", { value: "premium" }, "Premium")),
        React.createElement("input", { name: "active", type: "checkbox", defaultChecked: true }),
        React.createElement("button", { type: "submit" }, "Save"))
    }
    await act(async () => root.render(React.createElement(Form)))
    const form = document.querySelector("form")
    form.elements.title.value = "Entwurf"
    form.elements.count.value = "7"
    form.elements.terms.value = "Nur Samstag"
    form.elements.audience.value = "premium"
    form.elements.active.checked = false
    await act(async () => form.requestSubmit())
    assert.equal(form.elements.title.value, "Entwurf")
    assert.equal(form.elements.count.value, "7")
    assert.equal(form.elements.terms.value, "Nur Samstag")
    assert.equal(form.elements.audience.value, "premium")
    assert.equal(form.elements.active.checked, false)
    assert.equal(onSuccess, 0)
  })
})

test("only a successful action resets its draft and invokes the success callback", async () => {
  const { useActionSuccess } = loadUi(async () => ({ ok: true, message: "Gespeichert" }))
  await withDom(async root => {
    let saved = 0
    function Form() {
      const [state, action] = useActionState(async () => ({ ok: true, message: "Gespeichert" }), { ok: false, message: "" })
      const ref = useActionSuccess(state, () => saved++)
      return React.createElement("form", { ref, action }, React.createElement("input", { name: "title", defaultValue: "" }), React.createElement("button", { type: "submit" }, "Save"))
    }
    await act(async () => root.render(React.createElement(Form)))
    const form = document.querySelector("form")
    form.elements.title.value = "Saved draft"
    await act(async () => form.requestSubmit())
    assert.equal(form.elements.title.value, "")
    assert.equal(saved, 1)
  })
})

test("benefit confirmation ignores repeat submissions and keeps the request id for a retry", async () => {
  let resolveSave
  const calls = []
  const { DealForm } = loadUi(async (_state, data) => {
    calls.push(new Map(data))
    return await new Promise(resolve => { resolveSave = resolve })
  })
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(DealForm, { partnerId: "synthetic-partner", mode: "create", deal: { type: "discount", discount_type: "percent", discount_value: 10, audience: "both", active: true } })))
    const form = document.querySelector("form")
    await act(async () => form.requestSubmit())
    const confirm = [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === "Add benefit")
    assert.ok(confirm)
    await act(async () => { confirm.click(); confirm.click(); form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })) })
    assert.equal(calls.length, 1)
    assert.match(calls[0].get("create_request_id"), /^[0-9a-f-]{36}$/i)
    assert.equal(form.getAttribute("aria-busy"), "true")
    await act(async () => resolveSave({ ok: false, message: "Bitte erneut versuchen" }))
    await act(async () => form.requestSubmit())
    const retry = [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === "Add benefit")
    await act(async () => retry.click())
    assert.equal(calls.length, 2)
    assert.equal(calls[0].get("create_request_id"), calls[1].get("create_request_id"))
    await act(async () => resolveSave({ ok: true, message: "Gespeichert" }))
  })
})
test("a rejected milestone retains all input and remains open with a field error", async () => {
  let calls = 0, closed = 0
  const { MilestoneForm } = loadUi(async () => { calls++; return { ok: false, message: "Bitte Stempelziel prüfen", fieldErrors: { required_stamps: "Bitte Ziel korrigieren" } } })
  await withDom(async root => {
    await act(async () => root.render(React.createElement(MilestoneForm, { partner: { id: "synthetic-partner" }, mode: "create", onSaved: () => closed++ })))
    const form = document.querySelector("form")
    form.elements.required_stamps.value = "8"
    form.elements.reward_item.value = "Limonade"
    form.elements.customer_description.value = "Meine Beschreibung"
    form.elements.staff_instructions.value = "Kalt servieren"
    form.elements.terms.value = "Nur Samstag"
    form.elements.estimated_savings.value = "3.5"
    form.elements.audience.value = "premium"
    form.elements.active.checked = false
    await act(async () => { form.requestSubmit(); form.requestSubmit() })
    assert.equal(calls, 1)
    assert.equal(closed, 0)
    for (const [key, value] of [["required_stamps", "8"], ["reward_item", "Limonade"], ["customer_description", "Meine Beschreibung"], ["staff_instructions", "Kalt servieren"], ["terms", "Nur Samstag"], ["estimated_savings", "3.5"], ["audience", "premium"]]) assert.equal(form.elements[key].value, value, key)
    assert.equal(form.elements.title.required, false)
    assert.equal(form.elements.active.checked, false)
    assert.equal(form.getAttribute("aria-busy"), "false")
    assert.equal(document.activeElement, form.elements.required_stamps)
    assert.match(form.textContent, /Bitte Ziel korrigieren/)
  })
})
test("an existing canonical Happy Hour opens the weekday and time editor", async () => {
  const { DealForm } = loadUi(async () => ({ ok: true, message: "Gespeichert" }))
  await withDom(async root => {
    await act(async () => root.render(React.createElement(DealForm, { partnerId: "synthetic-partner", mode: "edit", deal: {
      id: "synthetic-hh", type: "discount", campaign_type: "happy_hour", discount_type: "fixed", discount_value: 2,
      benefit_category: "automatic_fallback", activation_mode: "automatic_fallback", activation_required: false, audience: "both", active: true,
      happy_hour_start: "15:00", happy_hour_end: "17:00", valid_weekdays: [1, 2, 3, 4, 5], starts_at: "2026-10-01T12:00:00Z", ends_at: "2026-11-01T12:00:00Z"
    } })))
    const form = document.querySelector("form")
    assert.equal(form.elements.type.value, "happy_hour")
    assert.equal(form.elements.happy_hour_start.value, "15:00")
    assert.equal(form.elements.happy_hour_end.value, "17:00")
    assert.ok(form.elements.valid_from.value.startsWith("2026-10-01"))
    assert.ok(form.elements.valid_until.value.startsWith("2026-11-01"))
    assert.equal([...form.querySelectorAll('[name="valid_weekdays"]:checked')].length, 5)
  })
})
test("Happy Hour weekdays show blue checks and red exclusions without changing other weekday fields", async () => {
  const { WeekdayChipField } = loadUi(async () => ({ ok: true, message: "Gespeichert" }))
  await withDom(async root => {
    await act(async () => root.render(React.createElement("form", {},
      React.createElement(WeekdayChipField, { label: "Happy Hour", name: "hh_days", defaultValues: [2, 3, 4, 5, 6, 7], markExcluded: true }),
      React.createElement(WeekdayChipField, { label: "Other weekdays", name: "other_days", defaultValues: [2] }))))
    const tuesday = document.querySelector('[name="hh_days"][value="2"]')
    const monday = document.querySelector('[name="hh_days"][value="1"]')
    assert.equal(tuesday.nextElementSibling.querySelector('[aria-hidden="true"]')?.textContent, "✓")
    assert.match(tuesday.nextElementSibling.className, /border-\[#118cff\] bg-\[#118cff\]/)
    assert.equal(monday.nextElementSibling.querySelector('[aria-hidden="true"]')?.textContent, "×")
    assert.match(monday.nextElementSibling.className, /border-rose-700 bg-rose-700/)
    assert.ok(tuesday.getAttribute("aria-label"))
    assert.equal(tuesday.className, "peer sr-only")
    assert.match(tuesday.nextElementSibling.className, /peer-focus-visible:outline-2/)
    assert.deepEqual(new FormData(document.querySelector("form")).getAll("hh_days"), ["2", "3", "4", "5", "6", "7"])
    await act(async () => tuesday.click())
    assert.equal(tuesday.checked, false)
    assert.equal(tuesday.nextElementSibling.querySelector('[aria-hidden="true"]')?.textContent, "×")
    assert.match(tuesday.nextElementSibling.className, /border-rose-700 bg-rose-700/)
    assert.deepEqual(new FormData(document.querySelector("form")).getAll("hh_days"), ["3", "4", "5", "6", "7"])
    for (const other of document.querySelectorAll('[name="other_days"]')) {
      assert.equal(other.nextElementSibling.querySelector('[aria-hidden="true"]'), null)
      if (other.checked) assert.match(other.nextElementSibling.className, /border-teal-700 bg-teal-700/)
    }
  })
})
test("canonical streak triggers open the calendar editor while a Happy Hour campaign keeps priority", async () => {
  const { DealForm } = loadUi(async () => ({ ok: true, message: "Gespeichert" }))
  await withDom(async root => {
    const metadata = { streak_mode: "calendar_frequency", required_visits_per_period: 2, period_unit: "weeks", required_consecutive_periods: 4 }
    const deal = { id: "synthetic-series", type: "free_item", trigger_key: "streak", discount_type: "item", reward_item: "Kaffee", trigger_value: 4, metadata, audience: "both", active: true }
    await act(async () => root.render(React.createElement(DealForm, { partnerId: "synthetic-partner", mode: "edit", deal })))
    assert.equal(document.querySelector("form").elements.type.value, "streak")
    assert.equal(document.querySelector("form").elements.required_visits_per_period.value, "2")
    assert.equal(document.querySelector("form").elements.required_consecutive_periods.value, "4")
    for (const hh of [{ campaign_type: "happy_hour" }, { type: "happy_hour" }]) {
      await act(async () => root.render(React.createElement(DealForm, { key: JSON.stringify(hh), partnerId: "synthetic-partner", mode: "edit", deal: { ...deal, ...hh, happy_hour_start: "15:00", happy_hour_end: "17:00" } })))
      assert.equal(document.querySelector("form").elements.type.value, "happy_hour")
      assert.equal(document.querySelector("form").elements.required_visits_per_period, undefined)
    }
  })
})
