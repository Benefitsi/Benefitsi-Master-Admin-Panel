import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import React, { act, useActionState } from "react"
import * as jsx from "react/jsx-runtime"
import ts from "typescript"
import { partnerSaveFixture, seedPartner, ownerId, screenshotSchedule } from "./helpers/partner-save-fixture.mjs"

const require = createRequire(import.meta.url)
const { JSDOM } = require(process.env.BENEFITSI_TEST_JSDOM_PATH || "jsdom")
function loadUi(action, configurationActions = {}) {
  const actions = new Proxy({}, { get: () => action })
  const boundaries = {
    react: React, "react/jsx-runtime": jsx, "react-dom": require("react-dom"),
    "next/navigation": { useRouter: () => ({ refresh() {}, replace() {}, push() {} }) },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/image": { default: () => null }, "lucide-react": require("lucide-react"),
    "@/app/partner-actions": actions, "./partner-actions": actions,
    "./partner-enrichment-actions": {}, "./microsite-panel": {},
    "./partner-configuration-actions": configurationActions,
    "@/components/partner/partner-internal-tools": {},
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
  const source = readFileSync(new URL("../app/partner-admin.tsx", import.meta.url), "utf8") + "\nexport { DealForm, MilestoneForm, useActionSuccess, WeekdayChipField, DealsPanel, WeeklyHoursFields, PartnerForm, HolidayEditorDialog };"
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
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost", pretendToBeVisual: true })
  const names = ["window", "document", "HTMLElement", "HTMLFormElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "HTMLDetailsElement", "FormData", "MutationObserver", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]))
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLFormElement: dom.window.HTMLFormElement, FormData: dom.window.FormData, MutationObserver: dom.window.MutationObserver, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })
  for (const name of ["HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "HTMLDetailsElement"]) globalThis[name] = dom.window[name]
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  const root = require("react-dom/client").createRoot(document.getElementById("root"))
  try { await run(root, dom.window) } finally {
    await act(async () => root.unmount())
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}

for (const [mode, portalMode, overnight] of [["edit", false, false], ["edit", true, false], ["create", false, false], ["edit", false, true], ["edit", true, true], ["create", false, true]]) {
  test(`${portalMode ? "partner" : "admin"} ${mode} form submits social links and ${overnight ? "the screenshot overnight schedule" : "24-hour days"} with the sections collapsed`, async () => {
    const schedule = overnight ? screenshotSchedule : Array.from({ length: 7 }, () => ["00:00", "00:00"])
    const calls = []
    const ServerFormData = globalThis.FormData
    const f = partnerSaveFixture({ isAdmin: !portalMode })
    const { PartnerForm } = loadUi(async (_, data) => {
      // Convert browser FormData (including empty file controls) to the server contract.
      const submitted = new ServerFormData()
      for (const [key, value] of data) if (typeof value === "string") submitted.append(key, value)
      const result = await f.actions.savePartner({}, submitted)
      calls.push({ ...Object.fromEntries(submitted), result })
      return result
    })
    await withDom(async (root, win) => {
      const partner = { ...seedPartner, socials: [{ id: "youtube", platform: "youtube", handle: "UC-test", url: "https://www.youtube.com/channel/UC-test", sort_order: 0 }], opening_hours: schedule.map(([opens, closes], index) => ({ weekday: index + 1, opens_at: `${opens}:00`, closes_at: `${closes}:00`, is_closed: false, sort_order: index })) }
      await act(async () => root.render(React.createElement(PartnerForm, {
        partner: mode === "edit" ? partner : undefined, mode, portalMode,
        cities: [{ id: seedPartner.city_id, name: "Test city" }], owners: [{ id: ownerId, email: "owner@example.test" }],
      })))
      const form = document.querySelector("form")
      assert.equal(document.querySelectorAll("form").length, 1, "all fields belong to the one partner save")
      if (mode === "create") {
        const addSocial = [...form.querySelectorAll("button")].find(button => button.textContent === "Add social handle")
        await act(async () => addSocial.click())
        const platform = form.elements.namedItem("social_0_platform")
        platform.value = "youtube"
        await act(async () => platform.dispatchEvent(new win.Event("change", { bubbles: true })))
        for (const [key, value] of Object.entries({ name: "Test café", city_id: seedPartner.city_id, type: "Food & Drink", address: "Test street 1", coordinates: "49, 8", description: "Test café description", owner_id: ownerId, owner_selection: ownerId, initial_milestone_0_reward_item: "Coffee" })) {
          const field = form.elements.namedItem(key)
          if (field) field.value = value
        }
        form.elements.namedItem("social_0_handle").value = "https://www.youtube.com/channel/UC-test"
        for (let day = 1; day <= 7; day++) { form.elements.namedItem(`opens_at_${day}`).value = schedule[day - 1][0]; form.elements.namedItem(`closes_at_${day}`).value = schedule[day - 1][1] }
        // Category selection is represented by hidden fields while the menu is closed.
        const category = win.document.createElement("input"); category.type = "hidden"; category.name = "category"; category.value = "Cafe"; form.append(category)
      } else {
        assert.equal(form.elements.namedItem("social_0_handle").value, "https://www.youtube.com/channel/UC-test")
        if (overnight) assert.equal([...form.querySelectorAll("span")].filter(span => span.textContent === "Closes next day").length, 2)
      }
      for (const details of form.querySelectorAll("details")) details.open = false
      await act(async () => form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true })))
      assert.equal(calls.length, 1, document.body.textContent)
      assert.equal(calls[0].social_count, "1")
      assert.equal(calls[0].social_0_platform, "youtube")
      assert.equal(calls[0].social_0_handle, "https://www.youtube.com/channel/UC-test")
      assert.equal(calls[0].result.ok, true, calls[0].result.message)
      assert.equal(calls[0].result.savedPartner.socials[0].url, "https://www.youtube.com/channel/UC-test")
      for (let day = 1; day <= 7; day++) {
        assert.equal(calls[0][`opens_at_${day}`], schedule[day - 1][0])
        assert.equal(calls[0][`closes_at_${day}`], schedule[day - 1][1])
      }
    })
  })
}

test("saved midnight-to-midnight hours reopen as valid time inputs and submit unchanged", async () => {
  const { WeeklyHoursFields } = loadUi(async () => ({ ok: true }))
  const hoursByWeekday = new Map(Array.from({ length: 7 }, (_, index) => [index + 1, [{
    weekday: index + 1, opens_at: "00:00:00", closes_at: "00:00:00", is_closed: false, sort_order: 0,
  }]]))
  await withDom(async root => {
    await act(async () => root.render(React.createElement("form", {}, React.createElement(WeeklyHoursFields, { hoursByWeekday }))))
    const form = document.querySelector("form")
    assert.equal(form.checkValidity(), true)
    const data = new FormData(form)
    for (let day = 1; day <= 7; day++) {
      assert.equal(data.get(`opens_at_${day}`), "00:00")
      assert.equal(data.get(`closes_at_${day}`), "00:00")
      assert.equal(data.get(`slot_count_${day}`), "1")
      assert.equal(data.has(`is_closed_${day}`), false)
    }
  })
})

for (const [opens, closes, accepted] of [["00:00", "00:00", true], ["14:00", "01:00", true], ["09:00", "09:00", false]]) {
  test(`holiday editor ${accepted ? "accepts" : "rejects"} ${opens} to ${closes}`, async () => {
    const { HolidayEditorDialog } = loadUi(async () => ({ ok: true }))
    const saved = []
    await withDom(async root => {
      await act(async () => root.render(React.createElement(HolidayEditorDialog, {
        editor: { mode: "edit", holiday: { id: "holiday", date: "2026-12-31", label: "", kind: "hours", opensAt: opens, closesAt: closes, repeatsYearly: false } },
        existingHolidays: [], onClose() {}, onSave: holiday => saved.push(holiday),
      })))
      const apply = [...document.querySelectorAll("button")].find(button => button.textContent === "Apply changes")
      await act(async () => apply.click())
      assert.equal(saved.length, accepted ? 1 : 0)
      if (accepted) assert.equal(saved[0].closesAt, closes)
      else assert.match(document.querySelector('[role="alert"]').textContent, /different opening and closing times/)
    })
  })
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
test("retired canonical series never open an editor, including a forged Happy Hour wrapper", async () => {
  const { DealForm } = loadUi(async () => ({ ok: true, message: "Gespeichert" }))
  await withDom(async root => {
    const metadata = { streak_mode: "calendar_frequency", required_visits_per_period: 2, period_unit: "weeks", required_consecutive_periods: 4 }
    const deal = { id: "synthetic-series", type: "free_item", trigger_key: "streak", discount_type: "item", reward_item: "Kaffee", metadata, audience: "both", active: true }
    for (const hh of [{}, { campaign_type: "happy_hour" }, { type: "happy_hour" }]) {
      await act(async () => root.render(React.createElement(DealForm, { key: JSON.stringify(hh), partnerId: "synthetic-partner", mode: "edit", deal: { ...deal, ...hh } })))
      assert.equal(document.querySelector("form"), null)
    }
  })
})

test('partner offer cards filter actual offers and open the existing editor with the chosen offer', async () => {
  const { DealsPanel } = loadUi(async () => ({ok:false,message:'No test mutation'}))
  const partner={id:'partner-test',name:'Cafe',visits:[],deals:[
    {id:'active-offer',partner_id:'partner-test',type:'discount',active:true,display_title:'Mittag',discount_type:'percent',discount_value:15,audience:'both'},
    {id:'paused-offer',partner_id:'partner-test',type:'happy_hour',active:false,display_title:'Abend',discount_type:'percent',discount_value:10,audience:'both',happy_hour_start:'17:00',happy_hour_end:'18:00'}
  ]}
  await withDom(async (root,win) => {
    await act(async()=>root.render(React.createElement(DealsPanel,{partner,embedded:true,portalMode:true})))
    const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
    assert.ok(button('Alle'),'status filters must exist')
    await act(async()=>button('Pausiert').dispatchEvent(new win.MouseEvent('click',{bubbles:true})))
    assert.equal(document.querySelectorAll('[data-partner-offer]').length,1)
    assert.match(document.querySelector('[data-partner-offer]').textContent,/Abend/)
    await act(async()=>button('Bearbeiten').dispatchEvent(new win.MouseEvent('click',{bubbles:true})))
    assert.ok(document.querySelector('[role="dialog"]'))
    assert.equal(document.querySelector('input[name="display_title"]').value,'Abend')
  })
})

test('Happy Hour shortcut selects canonical campaign offers and create opens the real dialog', async()=>{
 const {DealsPanel}=loadUi(async()=>({ok:false,message:'No test mutation'}))
 const partner={id:'partner-test',name:'Cafe',visits:[],deals:[{id:'happy',type:'discount',campaign_type:'happy_hour',active:true,display_title:'Kaffeezeit',discount_type:'percent',discount_value:15,audience:'both',metadata:{}}]}
 await withDom(async root=>{
  await act(async()=>root.render(React.createElement(DealsPanel,{partner,embedded:true,portalMode:true,initialType:'happy_hour'})))
  assert.equal(document.querySelectorAll('[data-partner-offer]').length,1)
  await act(async()=>root.render(React.createElement(DealsPanel,{key:'create',partner,embedded:true,portalMode:true,initialCreate:true})))
  assert.ok(document.querySelector('[role="dialog"]'))
 })
})

test("keyboard order saves the complete list only after confirmation and keeps an active Drop pinned", async () => {
  let resolveOrder
  const calls = []
  const { DealsPanel } = loadUi(async () => ({ ok: false }), { reorderPartnerDeals: async (id, ids) => { calls.push([id, ids]); return await new Promise(resolve => { resolveOrder = resolve }) } })
  const partner = { id: "partner-test", name: "Cafe", visits: [], deals: [
    { id: "plain", type: "discount", active: true, display_title: "Rabatt", discount_type: "percent", discount_value: 10 },
    { id: "two", type: "two_for_one", active: true, display_title: "Zwei", discount_type: "2for1", reward_item: "Kaffee" },
    { id: "drop", type: "limited_drop", active: true, display_title: "Drop", stock_remaining: 5, valid_from: "2010-01-01T00:00:00Z", valid_until: "2100-01-01T00:00:00Z" },
  ] }
  await withDom(async root => {
    await act(async () => root.render(React.createElement(DealsPanel, { partner, embedded: true, portalMode: true })))
    const cards = () => [...document.querySelectorAll("[data-partner-offer]")]
    const titles = () => cards().map(card => card.querySelector("h3").textContent.trim())
    assert.deepEqual(titles(), ["Drop", "Zwei", "Rabatt"])
    assert.equal(cards()[0].draggable, false)
    assert.ok([...cards()[0].querySelectorAll("button[aria-label]")].every(button => button.disabled))
    const down = cards()[1].querySelector('button[aria-label$="nach unten verschieben"]')
    await act(async () => down.click())
    assert.deepEqual(calls[0], ["partner-test", ["drop", "plain", "two"]])
    assert.deepEqual(titles(), ["Drop", "Zwei", "Rabatt"])
    await act(async () => resolveOrder({ ok: false, message: "Stand wurde geändert" }))
    assert.deepEqual(titles(), ["Drop", "Zwei", "Rabatt"])
    assert.match(document.querySelector('[role="status"]').textContent, /Stand wurde geändert/)
    await act(async () => down.click())
    await act(async () => resolveOrder({ ok: true, message: "Gespeichert", data: calls[1][1].map((id, display_order) => ({ id, display_order })) }))
    assert.deepEqual(titles(), ["Drop", "Rabatt", "Zwei"])
  })
})
test("drag and drop uses the same persisted full-list order", async () => {
  const calls = []
  const { DealsPanel } = loadUi(async () => ({ ok: false }), { reorderPartnerDeals: async (_partner, ids) => { calls.push(ids); return { ok: true, message: "Gespeichert", data: ids.map((id, display_order) => ({ id, display_order })) } } })
  const partner = { id: "partner", visits: [], deals: [{ id: "a", active: true, type: "discount", display_title: "A" }, { id: "b", active: true, type: "discount", display_title: "B" }] }
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(DealsPanel, { partner, embedded: true, portalMode: true })))
    const [a, b] = document.querySelectorAll("[data-partner-offer]")
    const start = new window.Event("dragstart", { bubbles: true }); Object.defineProperty(start, "dataTransfer", { value: { setData() {}, effectAllowed: "" } })
    await act(async () => b.dispatchEvent(start))
    await act(async () => a.dispatchEvent(new window.Event("drop", { bubbles: true, cancelable: true })))
    assert.deepEqual(calls, [["b", "a"]])
    assert.deepEqual([...document.querySelectorAll("[data-partner-offer] h3")].map(el => el.textContent), ["B", "A"])
  })
})

test("cached raw deal panels discard active and paused retired variants before offering list actions", async () => {
  const { DealsPanel } = loadUi(async () => ({ ok: false }))
  const retired = [{ type: "streak" }, { type: "streak_bonus", active: false }, { type: "free_item", trigger_key: " StReAk " }, { type: "bonus_stamp", campaign_type: "streak_bonus" }, { type: "discount", metadata: { streak_mode: "calendar_frequency" } }]
  const partner = { id: "partner-test", name: "Cafe", visits: [], deals: [
    { id: "ordinary", type: "discount", active: true, discount_type: "percent", discount_value: 15, display_title: "Mittag", audience: "both" },
    ...retired.map((deal, i) => ({ id: `retired-${i}`, active: true, discount_type: "item", reward_item: "Kaffee", audience: "both", ...deal })),
  ] }
  await withDom(async root => {
    await act(async () => root.render(React.createElement(DealsPanel, { partner, embedded: true, portalMode: true })))
    assert.equal(document.querySelectorAll("[data-partner-offer]").length, 1)
    assert.match(document.querySelector("[data-partner-offer]").textContent, /Mittag/)
    assert.doesNotMatch(document.body.textContent, /Streak|Besuchsserie|Kalenderserie/)
  })
})
