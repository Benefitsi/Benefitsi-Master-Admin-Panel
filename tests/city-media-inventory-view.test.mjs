import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"
import * as inventory from "../lib/city-media/inventory.ts"
import * as jsxRuntime from "react/jsx-runtime"

const source = readFileSync(new URL("../components/city-media/media-inventory.tsx", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
const module = { exports: {} }
new Function("require", "module", "exports", compiled)((name) => {
  if (name === "react/jsx-runtime") return jsxRuntime
  if (name === "@/lib/city-media/inventory") return inventory
  throw new Error(`Unexpected dependency: ${name}`)
}, module, module.exports)
const { MediaInventory } = module.exports
const ok = rows => ({ rows, state: "ok" })
const data = {
  checkedAt: "2026-09-20T00:00:00Z",
  cities: ok([{ id: "city-a", slug: "annweiler", name: "Annweiler" }]),
  places: ok([{ id: "place-1", cityId: "city-a", canonicalSlug: "trifels", name: "Trifels" }]),
  assets: ok([{ id: "asset-1", cityId: "city-a", title: "<script>bad</script>", status: "PUBLISHED", sourceType: "MANUAL_UPLOAD", altText: null, thumbnail: null }]),
  assignments: ok(["CARD", "HERO"].map(role => ({ id: role, assetId: "asset-1", cityId: "city-a", entityType: "PLACE", entityId: "place-1", entityKey: "trifels", role, isPrimary: false, manualLock: true }))),
}
const render = overrides => renderToStaticMarkup(createElement(MediaInventory, { data: { ...data, ...overrides } }))

test("real inventory view emits distinct verified CARD/HERO links, escaped text, and only a GET filter form", () => {
  const html = render({})
  assert.match(html, /href="https:\/\/benefitsi.de\/stadt\/annweiler\/sehenswuerdigkeiten#place-place-1"/)
  assert.match(html, /href="https:\/\/benefitsi.de\/stadt\/annweiler\/entdecken\/ort\/trifels"/)
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script|method="post"|type="file"/i)
  assert.match(html, /action="\/media" method="get"/)
  assert.match(html, /Bildbeschreibung fehlt/)
})

test("missing usage is unknown, never an assertion of zero or no assignments", () => {
  const html = render({ assignments: { rows: [], state: "unavailable" } })
  assert.match(html, /Verwendung unbekannt/)
  assert.match(html, /Zuordnungen unbekannt/)
  assert.doesNotMatch(html, /0 Zuordnungen|Keine Zuordnung hinterlegt/)
})

test("limited and unresolved data stays visible without unverified public links", () => {
  const html = render({ assignments: { ...data.assignments, state: "limited" }, places: { rows: [], state: "unavailable" } })
  assert.match(html, /keine Gesamtzahl/)
  assert.match(html, /Vorschauziel nicht verifiziert/)
  assert.doesNotMatch(html, /href="https:/)
  const empty = render({ assignments: { rows: [], state: "limited" } })
  assert.match(empty, /Keine Zuordnung im geladenen Ausschnitt/)
  assert.doesNotMatch(empty, /Keine Zuordnung hinterlegt/)
})
