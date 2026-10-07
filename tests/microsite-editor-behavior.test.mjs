import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import React, { act } from "react"
import ts from "typescript"

const require = createRequire(import.meta.url)
const { JSDOM } = require(process.env.BENEFITSI_TEST_JSDOM_PATH || "jsdom")
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// Run the complete editor and renderers. Only the server action, navigation and
// CSS transport boundaries are replaced; selection, forms and effects stay real.
function loadEditor(save) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    if (file.endsWith(".json")) return JSON.parse(readFileSync(file, "utf8"))
    if (file.endsWith(".css")) return new Proxy({}, { get: (_, key) => key })
    const mod = { exports: {} }
    cache.set(file, mod)
    const js = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    new Function("require", "module", "exports", js)(id => {
      if (id === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }) }
      if (id.endsWith("microsite-actions")) return { saveMicrositeVersion: save }
      if (id.startsWith("@/") || id.startsWith(".")) {
        const base = id.startsWith("@/") ? resolve(repo, id.slice(2)) : resolve(dirname(file), id)
        const resolved = [base, `${base}.ts`, `${base}.tsx`].find(existsSync)
        assert.ok(resolved, `missing test module: ${id}`)
        return load(resolved)
      }
      return require(id)
    }, mod, mod.exports)
    return mod.exports
  }
  return {
    ...load(resolve(repo, "app/microsite-panel.tsx")),
    ...load(resolve(repo, "app/admin-language.tsx")),
    ...load(resolve(repo, "lib/microsites.ts")),
  }
}

test("header edits survive save, a later partner refresh and reopening the editor", async t => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://editor.example.test", pretendToBeVisual: true })
  const previous = new Map()
  for (const key of ["window", "document", "Node", "NodeFilter", "Element", "Text", "HTMLElement", "HTMLDetailsElement", "HTMLButtonElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "HTMLFormElement", "FormData", "File", "Event", "CustomEvent", "Image", "MutationObserver", "navigator"]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] })
  }
  previous.set("IS_REACT_ACT_ENVIRONMENT", Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT"))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  // jsdom has no layout engine; this fixture edits plain, single-line text.
  Object.defineProperty(dom.window.HTMLElement.prototype, "innerText", { configurable: true,
    get() { return this.textContent }, set(value) { this.textContent = value } })
  const root = require("react-dom/client").createRoot(document.getElementById("root"))
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  let savedConfig
  const { MicrositePanel, AdminLanguageProvider, createDefaultMicrositeConfig } = loadEditor(async (_state, form) => {
    savedConfig = JSON.parse(form.get("existing_config"))
    const overrides = JSON.parse(form.get("inline_text_overrides") || "{}")
    savedConfig.elementText = { ...savedConfig.elementText, ...overrides }
    return { ok: true, message: "Saved", config: savedConfig, savedVersion: { id: "saved-9", version_number: 9, status: "draft" } }
  })
  const partner = { id: "synthetic-partner", name: "Restaurant", type: "Food & Drink", deals: [], reward_milestones: [], menus: [], opening_hours: [], socials: [], holidays: [], cover_urls: [], media_rich_enabled: false }
  const base = createDefaultMicrositeConfig(partner)
  partner.microsite = { id: "site", status: "published", slug: "synthetic", publishedVersion: { id: "live-7", version_number: 7, config: base }, draftVersion: { id: "draft-8", version_number: 8, config: base } }
  const render = async (selectedPartner, key = "editor") => act(async () => root.render(React.createElement(AdminLanguageProvider, { initialLanguage: "de" }, React.createElement(MicrositePanel, { partner: selectedPartner, key }))))
  await render(partner)
  const header = () => document.querySelector('header [data-microsite-editable="branding.partnerName"]')
  const editHeader = async value => act(async () => {
    header().click()
    header().textContent = value
    header().dispatchEvent(new dom.window.InputEvent("input", { bubbles: true, inputType: "insertText", data: value }))
    header().dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }))
  })
  await act(async () => document.querySelector('[aria-label="Microsite-Bearbeitung einklappen"]').click())
  await editHeader("Gespeicherter Header")
  assert.ok(document.querySelector('[aria-label="Microsite-Bearbeitung einklappen"]'), "clicking a header opens the collapsed editor")
  assert.match(document.body.textContent, /Ungespeicherte Änderungen/)
  const saveButton = () => [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Speichern")
  await act(async () => saveButton().click())
  assert.equal(savedConfig.elementText["branding.partnerName"], "Gespeicherter Header")
  assert.match(document.body.textContent, /Version 9 · Entwurf gespeichert/)
  assert.match(document.body.textContent, /Version 7 · Live-Seite öffnen/)

  await editHeader("Weiterer ungespeicherter Header")
  await render({ ...partner })
  assert.equal(header().textContent, "Weiterer ungespeicherter Header", "refresh must not replay the earlier save over new edits")
  assert.match(document.body.textContent, /Ungespeicherte Änderungen/)

  await render({ ...partner, microsite: { ...partner.microsite, draftVersion: { id: "saved-9", version_number: 9, config: savedConfig } } }, "reopened")
  assert.equal(header().textContent, "Gespeicherter Header")
  assert.match(document.body.textContent, /Version 9 · Entwurf gespeichert/)
  assert.match(document.body.textContent, /Version 7 · Live-Seite öffnen/)

  await editHeader("Lokaler Entwurf während fremder Veröffentlichung")
  const publishedElsewhere = { ...partner, microsite: { ...partner.microsite, publishedVersion: { id: "live-11", version_number: 11, config: base } } }
  await render(publishedElsewhere, "reopened")
  assert.equal(header().textContent, "Lokaler Entwurf während fremder Veröffentlichung")
  assert.match(document.body.textContent, /Version 11 · Live-Seite öffnen/)
  await render({ ...publishedElsewhere, microsite: { ...publishedElsewhere.microsite, status: "archived" } }, "reopened")
  assert.equal(header().textContent, "Lokaler Entwurf während fremder Veröffentlichung")
  assert.doesNotMatch(document.body.textContent, /Version 11 · Live-Seite öffnen/)
  assert.match(document.body.textContent, /Noch nicht veröffentlicht/)
})
