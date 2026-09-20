import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { JSDOM } from "jsdom"
import * as jsx from "react/jsx-runtime"

function compile(path, dependencies) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", source)(id => {
    assert.ok(id in dependencies, id); return dependencies[id]
  }, loaded, loaded.exports)
  return loaded.exports
}
const validators = compile("../lib/city-pages/guide-editor.ts", {})
const { GuideBlocksControl, GuideSourcesControl } = compile("../components/city-pages/guide-content-fields.tsx", {
  react: React, "react/jsx-runtime": jsx, "@/lib/city-pages/guide-editor": validators,
})
test("editing block order preserves complex data and serializes new readable blocks", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const root = createRoot(document.getElementById("root"))
  const original = { id: "timeline", blockType: "TIMELINE", sortOrder: 9, timeline: [{ id: "walk", period: "MORNING", label: "Vormittag", title: "Altstadt", description: "Ein Spaziergang", relationIds: [] }] }
  try {
    await act(async () => root.render(React.createElement("form", {}, React.createElement(GuideBlocksControl, { value: [original] }))))
    await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent === "Textabschnitt hinzufügen").click())
    const blocks = JSON.parse(document.querySelector('input[name="blocks"]').value)
    assert.equal(blocks.length, 2)
    assert.deepEqual(blocks[0].timeline, original.timeline)
    assert.equal(blocks[1].blockType, "TEXT")
    await act(async () => document.querySelector('[aria-label="Block 2 nach oben"]').click())
    const moved = JSON.parse(document.querySelector('input[name="blocks"]').value)
    assert.equal(moved[0].blockType, "TEXT")
    assert.equal(moved[1].id, "timeline")
    assert.equal(moved[1].sortOrder, 1)
    assert.deepEqual(moved[1].timeline, original.timeline)
  } finally { await act(async () => root.unmount()); dom.window.close() }
})
test("source controls do not manufacture a verification date or publish flag", async () => {
  const dom = new JSDOM('<div id="root"></div>')
  globalThis.window = dom.window; globalThis.document = dom.window.document
  const root = createRoot(document.getElementById("root"))
  try {
    await act(async () => root.render(React.createElement(GuideSourcesControl, { value: {} })))
    assert.deepEqual(JSON.parse(document.querySelector('input[name="source_meta"]').value), {})
    assert.equal(document.querySelector('[name="verificationStatus"]'), null)
    assert.match(document.body.textContent, /keine Veröffentlichungsfreigabe/)
  } finally { await act(async () => root.unmount()); dom.window.close() }
})
