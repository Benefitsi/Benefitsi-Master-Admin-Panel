import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import React, { act } from "react"
import * as jsx from "react/jsx-runtime"
import { JSDOM } from "jsdom"
import ts from "typescript"

const require = createRequire(import.meta.url)

function draft(price = 8.5) {
  return {
    name: "Erkannte Karte", currency: "EUR", complete: true,
    warnings: ["Die Größenangabe bitte am Original prüfen."],
    categories: [{ name: "Pizza", items: [{
      name: "Margherita", description: "Tomaten, Mozzarella", price,
      allergens: ["A", "G"], tags: ["Vegetarisch"], note: "Größe auf Seite 1 prüfen.",
    }] }],
  }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function compile(path, dependencies) {
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", js)((id) => {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected runtime dependency: ${id}`)
    return dependencies[id]
  }, loaded, loaded.exports)
  return loaded.exports
}

async function mount(t, { value = draft(), preview, confirm, props = {} } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://admin.example/partner" })
  const previous = new Map()
  const revoked = [], previews = [], saves = [], toasts = [], browserErrors = []
  let refreshed = 0, objectUrl = 0
  // Browser-only APIs are simulated at their boundary. Form validity, DOM
  // events, React state, transitions and the complete production JSX stay real.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
  dom.window.URL.createObjectURL = () => `blob:https://admin.example/source-${++objectUrl}`
  dom.window.URL.revokeObjectURL = (url) => revoked.push(url)
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement, HTMLDialogElement: dom.window.HTMLDialogElement,
    CustomEvent: dom.window.CustomEvent, URL: dom.window.URL,
    File: dom.window.File, FormData: dom.window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  // Import after installing the first DOM so React enables native input events.
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(dom.window.document.getElementById("root"))
  const runtime = { react: React, "react/jsx-runtime": jsx }
  const spinner = compile("../components/loading-ui.tsx", runtime)
  const { MenuAiImportDialog } = compile("../components/menu-ai-import-dialog.tsx", {
    ...runtime,
    "next/image": { default: (props) => {
      const imageProps = { ...props }
      delete imageProps.unoptimized
      return React.createElement("img", imageProps)
    } },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshed++ } }) },
    "lucide-react": require("lucide-react"),
    "@/app/admin-language": { useAdminLanguage: () => ({ language: "de" }) },
    "@/app/partner-actions": {
      previewAIMenuImport: async (form) => {
        previews.push(form)
        return preview ? preview(form, previews.length) : { ok: true, draft: structuredClone(value) }
      },
      confirmAIMenuImport: async (form) => {
        saves.push(form)
        return confirm ? confirm(form, saves.length) : { ok: true, message: "1 Artikel veröffentlicht.", importedCategories: 1, importedItems: 1, created: false }
      },
    },
    "@/components/loading-ui": spinner,
  })
  dom.window.addEventListener("benefitsi:action-toast", (event) => toasts.push(event.detail))
  dom.window.addEventListener("error", (event) => browserErrors.push(event.error))
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
    assert.deepEqual(browserErrors, [], "the real dialog must not emit unhandled browser errors")
  })
  await act(async () => root.render(React.createElement(MenuAiImportDialog, {
    partnerId: "partner-owned", menuId: "menu-owned", menuName: "Abendkarte", hasExistingContent: true, ...props,
  })))
  const document = dom.window.document
  const findButton = (name) => {
    const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent.trim() === name || entry.getAttribute("aria-label") === name)
    assert.ok(button, `Button not found: ${name}`)
    return button
  }
  const click = async (name) => { await act(async () => findButton(name).click()) }
  const field = (name) => {
    const label = [...document.querySelectorAll("label")].find((entry) => [...entry.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join("").replace(/\s+/g, " ").trim() === name)
    const input = label?.querySelector("input,textarea")
    assert.ok(input, `Field not found: ${name}`)
    return input
  }
  const edit = async (name, value) => {
    const input = field(name)
    const prototype = input instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value)
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }))
    })
    assert.equal(field(name).value, value)
  }
  const chooseFile = async (name = "speisekarte.pdf") => {
    const file = new File(["%PDF-1.7 synthetic menu"], name, { type: "application/pdf" })
    const upload = document.querySelector('input[type="file"][multiple]')
    assert.ok(upload)
    // jsdom has no OS file picker; only its selected-file boundary is replaced.
    Object.defineProperty(upload, "files", { configurable: true, value: [file] })
    await act(async () => upload.dispatchEvent(new dom.window.Event("change", { bubbles: true })))
    return file
  }
  const openPreview = async () => {
    await click("Karte aus Foto / PDF")
    const file = await chooseFile()
    await click("Vorschau erstellen")
    return file
  }
  const checkReview = async () => {
    const checkbox = document.querySelector('input[type="checkbox"]')
    assert.ok(checkbox)
    await act(async () => checkbox.click())
    assert.equal(checkbox.checked, true)
  }
  const submit = async () => {
    const form = document.querySelector("dialog form")
    assert.ok(form)
    await act(async () => form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })))
  }
  return { dom, document, previews, saves, revoked, toasts, click, field, edit, findButton, chooseFile, openPreview, checkReview, submit, refreshed: () => refreshed }
}

test("photo/PDF preview requires fixing missing prices and renewed review before forwarding exactly edited values", async (t) => {
  const f = await mount(t, { value: draft(null) })
  const file = await f.openPreview()
  assert.equal(f.previews.length, 1)
  assert.equal(f.previews[0].get("partner_id"), "partner-owned")
  assert.equal(f.previews[0].get("menu_id"), "menu-owned")
  assert.equal(f.previews[0].get("menu_source"), file)
  assert.equal(f.saves.length, 0)
  assert.match(f.document.body.textContent, /1 Preise fehlen/)
  assert.match(f.document.body.textContent, /Die Größenangabe bitte am Original prüfen/)
  assert.match(f.document.body.textContent, /Größe auf Seite 1 prüfen/)
  assert.match(f.document.body.textContent, /an die veröffentlichte Karte angehängt/)
  assert.match(f.document.body.textContent, /Vorhandene Inhalte bleiben erhalten/)
  assert.equal(f.findButton("Zur veröffentlichten Karte hinzufügen").disabled, true)
  await f.submit()
  assert.equal(f.saves.length, 0, "unreviewed drafts must not save")
  await f.checkReview()
  await f.submit()
  assert.equal(f.saves.length, 0, "a checked box cannot override an absent required price")
  await f.edit("Preis EUR", "9.75")
  assert.equal(f.document.querySelector('input[type="checkbox"]').checked, false, "editing invalidates the previous review")
  await f.edit("Kategorie", "Neue Gerichte")
  await f.edit("Name", "Margherita groß")
  await f.edit("Beschreibung", "  Tomaten und Mozzarella  ")
  await f.edit("Allergene", "A; G")
  await f.edit("Kennzeichnungen", "Vegetarisch, Hausgemacht")
  await f.submit()
  assert.equal(f.saves.length, 0)
  await f.checkReview()
  await f.submit()
  assert.equal(f.saves.length, 1)
  assert.equal(f.saves[0].get("confirm_review"), "true")
  assert.equal(f.saves[0].get("partner_id"), "partner-owned")
  assert.equal(f.saves[0].get("menu_id"), "menu-owned")
  assert.deepEqual(JSON.parse(f.saves[0].get("menu_draft")), {
    name: "Abendkarte", currency: "EUR", complete: true,
    warnings: ["Die Größenangabe bitte am Original prüfen."],
    categories: [{ name: "Neue Gerichte", items: [{ name: "Margherita groß", description: "Tomaten und Mozzarella", price: 9.75, allergens: ["A", "G"], tags: ["Vegetarisch", "Hausgemacht"], note: "Größe auf Seite 1 prüfen." }] }],
  })
  assert.equal(f.document.querySelector("dialog").open, false)
  assert.equal(f.refreshed(), 1)
  assert.deepEqual(f.toasts, [{ ok: true, message: "1 Artikel veröffentlicht." }])
})

test("closing a pending preview invalidates its late result without disturbing a newly opened preview", async (t) => {
  const first = deferred(), second = deferred()
  const f = await mount(t, { preview: (_, count) => count === 1 ? first.promise : second.promise })
  await f.openPreview()
  assert.match(f.document.body.textContent, /Wird erkannt/)
  await f.click("Import schließen")
  assert.equal(f.document.querySelector("dialog").open, false)
  assert.deepEqual(f.revoked, ["blob:https://admin.example/source-1"])
  await f.click("Karte aus Foto / PDF")
  assert.equal(f.findButton("Vorschau erstellen").disabled, true)
  await f.chooseFile("neu.pdf")
  await f.click("Vorschau erstellen")
  await act(async () => first.resolve({ ok: true, draft: draft() }))
  assert.equal(f.document.querySelector("dialog form"), null)
  assert.match(f.document.body.textContent, /Wird erkannt/)
  const latest = draft()
  latest.categories[0].items[0].name = "Neu erkannte Pizza"
  await act(async () => second.resolve({ ok: true, draft: latest }))
  assert.equal(f.field("Name").value, "Neu erkannte Pizza")
  assert.equal(f.previews.length, 2)
  assert.equal(f.saves.length, 0)
})

test("two submit events in the same turn issue one save and keep the dialog locked while it is pending", async (t) => {
  const pending = deferred()
  const f = await mount(t, { confirm: () => pending.promise })
  await f.openPreview()
  await f.checkReview()
  const form = f.document.querySelector("dialog form")
  await act(async () => {
    form.dispatchEvent(new f.dom.window.Event("submit", { bubbles: true, cancelable: true }))
    form.dispatchEvent(new f.dom.window.Event("submit", { bubbles: true, cancelable: true }))
  })
  assert.equal(f.saves.length, 1)
  assert.equal(f.findButton("Import schließen").disabled, true)
  assert.equal(f.document.querySelector("fieldset").disabled, true)
  await act(async () => f.document.querySelector("dialog").dispatchEvent(new f.dom.window.Event("cancel", { cancelable: true })))
  assert.equal(f.document.querySelector("dialog").open, true)
  await act(async () => pending.resolve({ ok: true, message: "Veröffentlicht." }))
  assert.equal(f.document.querySelector("dialog").open, false)
  assert.equal(f.saves.length, 1)
})

test("a definite server rejection leaves corrections editable and permits a reviewed retry", async (t) => {
  const f = await mount(t, { confirm: (_, count) => count === 1 ? { ok: false, message: "Preis wurde nicht gespeichert. Bitte korrigieren." } : { ok: true, message: "Korrigiert veröffentlicht." } })
  await f.openPreview()
  await f.checkReview()
  await f.submit()
  assert.match(f.document.querySelector('[role="alert"]').textContent, /Preis wurde nicht gespeichert/)
  assert.equal(f.document.querySelector("fieldset").disabled, false)
  assert.equal(f.document.querySelector("dialog").open, true)
  await f.edit("Preis EUR", "10.25")
  assert.equal(f.document.querySelector('input[type="checkbox"]').checked, false)
  await f.checkReview()
  await f.submit()
  assert.equal(f.saves.length, 2)
  assert.equal(JSON.parse(f.saves[1].get("menu_draft")).categories[0].items[0].price, 10.25)
  assert.equal(f.document.querySelector("dialog").open, false)
})

test("an uncertain save failure prevents another import, including after close and reopen", async (t) => {
  const f = await mount(t, { confirm: async () => { throw new TypeError("Synthetic connection failure") } })
  await f.openPreview()
  await f.checkReview()
  await f.submit()
  assert.equal(f.saves.length, 1)
  assert.match(f.document.querySelector('[role="alert"]').textContent, /Speicherstatus konnte nicht bestätigt/)
  assert.equal(f.document.querySelector("fieldset").disabled, true)
  assert.ok(f.findButton("Seite neu laden und prüfen"))
  await f.submit()
  assert.equal(f.saves.length, 1)
  await f.click("Import schließen")
  await f.click("Karte aus Foto / PDF")
  assert.match(f.document.querySelector('[role="alert"]').textContent, /letzten Import/)
  assert.equal(f.document.querySelector('input[type="file"][multiple]').disabled, true)
  assert.equal(f.findButton("Vorschau erstellen").disabled, true)
  assert.equal(f.previews.length, 1)
  assert.equal(f.saves.length, 1)
})

test("creating a new menu requires an explicit currency and discloses publication before submission", async (t) => {
  const value = draft()
  value.currency = ""
  const f = await mount(t, { value, props: { menuId: undefined, menuName: undefined, hasExistingContent: false } })
  await f.openPreview()
  assert.equal(f.field("Währung").value, "")
  assert.match(f.document.body.textContent, /neue, veröffentlichte Speisekarte erstellt/)
  await f.checkReview()
  await f.submit()
  assert.equal(f.saves.length, 0)
  await f.edit("Währung", "EUR")
  await f.checkReview()
  await f.submit()
  assert.equal(f.saves[0].get("menu_id"), null)
  assert.equal(JSON.parse(f.saves[0].get("menu_draft")).currency, "EUR")
})
