import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
import test from "node:test"
import React, { act, useEffect, useRef, useState } from "react"
import { JSDOM } from "jsdom"
import ts from "typescript"
import { openingHourInterval } from "../lib/partner-hours.ts"

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost", pretendToBeVisual: true })
const names = ["window", "self", "document", "Element", "Text", "Node", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"]
const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] })
const { createRoot } = await import("react-dom/client")
test.after(() => {
  dom.window.close()
  for (const name of names) {
    if (previous[name]) Object.defineProperty(globalThis, name, previous[name])
    else delete globalThis[name]
  }
})

// Exercise the shared private editor without loading unrelated server actions.
const source = readFileSync(new URL("../app/partner-admin.tsx", import.meta.url), "utf8")
const parsed = ts.createSourceFile("partner-admin.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const component = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "WeeklyHoursFields")
assert.ok(component)
const context = {
  exports: {},
  require: createRequire(import.meta.url), useState, useRef, useEffect, window: dom.window,
  openingHourInterval,
  openingWeekdayOptions: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((label, index) => ({ label, value: String(index + 1) })),
  formatTimeInput: value => value?.slice(0, 5) ?? "",
}
vm.runInNewContext(ts.transpileModule(component.getText(parsed) + "\nglobalThis.Editor = WeeklyHoursFields", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, context)

const button = text => [...document.querySelectorAll("button")].find(item => item.textContent.trim() === text)
const click = async element => { assert.ok(element); await act(async () => element.click()) }
const fill = async (label, value) => {
  const element = document.querySelector(`[aria-label="${label}"]`)
  assert.ok(element)
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, value)
    element.dispatchEvent(new window.Event("input", { bubbles: true }))
  })
}
const data = () => new window.FormData(document.querySelector("form"))
const closure = () => [...document.querySelectorAll("label")].find(item => item.textContent.includes("Temporarily closed")).querySelector("input")
async function withEditor(hoursByWeekday, run) {
  const root = createRoot(document.getElementById("root"))
  try {
    await act(async () => root.render(React.createElement("form", null, React.createElement(context.Editor, { hoursByWeekday }))))
    await run()
  } finally { await act(async () => root.unmount()) }
}

test("bulk split shifts apply to open days and serialize both ranges, preserving closed days", async () => {
  await withEditor(new Map([[7, [{ is_closed: true }]]]), async () => {
    await fill("Bulk closing time 1", "12:00")
    await click(button("Add another time range for all open days"))
    assert.equal(button("Apply to all open days").disabled, true)
    await fill("Bulk opening time 2", "14:00")
    await fill("Bulk closing time 2", "22:00")
    await click(button("Apply to all open days"))
    for (let day = 1; day <= 6; day++) {
      assert.equal(data().get(`slot_count_${day}`), "2")
      assert.equal(data().get(`closes_at_${day}`), "12:00")
      assert.equal(data().get(`opens_at_${day}_1`), "14:00")
      assert.equal(data().get(`closes_at_${day}_1`), "22:00")
    }
    assert.equal(data().get("is_closed_7"), "on")
    assert.equal(data().get("opens_at_7"), null)
    await click(document.querySelector('[aria-label="Remove bulk time range 2"]'))
    await click(button("Apply to all open days"))
    assert.equal(data().get("slot_count_1"), "1")
    assert.equal(data().get("opens_at_1_1"), null)
  })
})

test("temporary closure closes all seven days and restores draft ranges and closed days when cleared", async () => {
  await withEditor(new Map([[7, [{ is_closed: true }]], [1, [{ opens_at: "10:00", closes_at: "13:00" }, { opens_at: "16:00", closes_at: "23:00" }]]]), async () => {
    const before = [...data().entries()]
    await click(closure())
    assert.equal(closure().checked, true)
    for (let day = 1; day <= 7; day++) {
      assert.equal(data().get(`is_closed_${day}`), "on")
      assert.equal(data().get(`opens_at_${day}`), null)
    }
    assert.equal(button("Apply to all open days").disabled, true)
    await click(closure())
    assert.deepEqual([...data().entries()], before)
  })
})

test("saved all-closed schedules can be reopened and individually adjusted", async () => {
  await withEditor(new Map(Array.from({ length: 7 }, (_, index) => [index + 1, [{ is_closed: true }]])), async () => {
    assert.equal(closure().checked, true)
    await click(closure())
    assert.equal(closure().checked, false)
    assert.equal(data().get("opens_at_1"), "09:00")
    await click(document.querySelector('[name="is_closed_1"]'))
    assert.equal(data().get("is_closed_1"), "on")
    assert.equal(data().get("is_closed_2"), null)
  })
})
