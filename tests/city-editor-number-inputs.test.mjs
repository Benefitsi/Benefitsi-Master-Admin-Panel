import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { parseBoundedDecimalInput, parseLocalizedDecimal } from "../lib/city-pages/number-inputs.ts"

const definitions = new URL("../lib/city-pages/content-editor.ts", import.meta.url)
const editorPage = new URL("../app/city-pages/[citySlug]/content/[contentType]/[contentId]/page.tsx", import.meta.url)
const contentAction = new URL("../app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions.ts", import.meta.url)
const profileAction = new URL("../app/city-pages/[citySlug]/actions.ts", import.meta.url)

test("preserves seven-decimal coordinates and accepts German decimal commas", () => {
  assert.equal(parseLocalizedDecimal("49.1965846"), 49.1965846)
  assert.equal(parseLocalizedDecimal("49,1965846"), 49.1965846)
  assert.equal(parseLocalizedDecimal("1.234,56"), 1234.56)
  assert.equal(parseBoundedDecimalInput("49,1965846", -90, 90), 49.1965846)
  assert.equal(parseBoundedDecimalInput("7.1234567", -180, 180), 7.1234567)
})

test("bounded coordinate parsing rejects only invalid or out-of-range values", () => {
  assert.equal(parseBoundedDecimalInput("90.000001", -90, 90), undefined)
  assert.equal(parseBoundedDecimalInput("-180.000001", -180, 180), undefined)
  assert.equal(parseBoundedDecimalInput("180.000001", -180, 180), undefined)
  assert.equal(parseBoundedDecimalInput("", -90, 90), null)
  assert.equal(parseBoundedDecimalInput("not-a-number", -90, 90), undefined)
})

test("City Editor numeric controls cannot block unrelated edits with stale precision", async () => {
  const [definitionSource, pageSource, contentSource, profileSource] = await Promise.all([
    readFile(definitions, "utf8"),
    readFile(editorPage, "utf8"),
    readFile(contentAction, "utf8"),
    readFile(profileAction, "utf8"),
  ])
  assert.match(definitionSource, /name: "latitude"[\s\S]*step: "any"/)
  assert.match(definitionSource, /name: "longitude"[\s\S]*step: "any"/)
  assert.match(pageSource, /step=\{field\.kind === "number" \? "any" : field\.step\}/)
  assert.match(contentSource, /parseLocalizedDecimal\(value\)/)
  assert.match(profileSource, /parseBoundedDecimalInput\(raw, minimum, maximum\)/)
})
