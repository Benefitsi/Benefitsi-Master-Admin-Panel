import assert from "node:assert/strict"
import test from "node:test"
import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { JSDOM } from "jsdom"
import { AdminLanguageProvider, AdminLanguageControl } from "../app/admin-language.tsx"

async function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://admin.example.test" })
  const names = ["window", "document", "Element", "Text", "Node", "NodeFilter", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true,
    value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] })
  const root = createRoot(document.getElementById("root"))
  const settle = () => new Promise(resolve => setTimeout(resolve, 15))
  const render = async element => { await act(async () => { root.render(element); await settle() }); await act(settle) }
  const click = async element => { await act(async () => { element.click(); await settle() }) }
  try { await run({ dom, render, click, settle }) } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const name of names) {
      if (previous[name]) Object.defineProperty(globalThis, name, previous[name])
      else delete globalThis[name]
    }
  }
}
const h = React.createElement
const shell = (content, props = {}) => h(AdminLanguageProvider, props, h(AdminLanguageControl), content)
const languageButton = (language, within = document) => [...within.querySelectorAll('button[aria-pressed]')].find(button => button.textContent === language)

test("changed field hints and accessible button names follow the selected language without a second toggle", async () => {
  await withDom(async ({ render }) => {
    const content = changed => shell(h("section", null,
      h("input", { placeholder: changed ? "Search partners" : "Partner management" }),
      h("button", { id: "action", title: changed ? "Delete Partner" : "Partner settings", "aria-label": changed ? "Delete Partner" : "Partner settings" })), { initialLanguage: "de" })
    await render(content(false))
    assert.equal(document.querySelector("input").placeholder, "Partnerverwaltung")
    await render(content(true))
    assert.equal(document.querySelector("input").placeholder, "Partner suchen")
    assert.equal(document.getElementById("action").title, "Partner löschen")
    assert.equal(document.getElementById("action").getAttribute("aria-label"), "Partner löschen")
  })
})

test("language changes preserve saved textarea, editable, technical and explicitly protected content", async () => {
  await withDom(async ({ render, click }) => {
    await render(shell(h("section", null,
      h("textarea", { defaultValue: "Partner management", placeholder: "Search partners" }),
      h("div", { contentEditable: true, suppressContentEditableWarning: true, "aria-label": "Partner management", id: "authored" }, "Partner management"),
      h("script", { type: "application/json", id: "data" }, "Partner management"),
      h("span", { translate: "no", id: "name" }, "Partner management"),
      h("span", { "data-admin-i18n-ignore": "true", id: "preserved" }, "Partner management"),
      h("p", { id: "label" }, "Partner management"))))
    await click(languageButton("DE"))
    assert.equal(document.getElementById("label").textContent, "Partnerverwaltung")
    assert.equal(document.querySelector("textarea").placeholder, "Partner suchen")
    assert.equal(document.querySelector("textarea").value, "Partner management")
    assert.equal(document.querySelector("textarea").defaultValue, "Partner management")
    assert.equal(document.getElementById("authored").getAttribute("aria-label"), "Partnerverwaltung")
    for (const id of ["authored", "data", "name", "preserved"]) assert.equal(document.getElementById(id).textContent, "Partner management", id)
    await click(languageButton("EN"))
    assert.equal(document.getElementById("label").textContent, "Partner management")
  })
})

test("separate sections sharing the admin preference synchronize and restore it after page remount", async () => {
  await withDom(async ({ render, click }) => {
    const content = () => h("main", null,
      h("section", { id: "first" }, shell(h("p", null, "Partner management"))),
      h("section", { id: "second" }, shell(h("p", null, "Search partners"))))
    await render(content())
    await click(languageButton("DE", document.getElementById("first")))
    assert.equal(document.querySelector("#second p").textContent, "Partner suchen")
    assert.equal(languageButton("DE", document.getElementById("second")).getAttribute("aria-pressed"), "true")
    assert.equal(document.documentElement.lang, "de")
    await render(null)
    await render(content())
    assert.equal(document.querySelector("#first p").textContent, "Partnerverwaltung")
  })
})

test("nested language scopes do not translate each other's text or overwrite the document language", async () => {
  await withDom(async ({ render }) => {
    await render(shell(h("section", null,
      h("p", { id: "outer" }, "Partner management"),
      h(AdminLanguageProvider, { initialLanguage: "de", storageKey: "preview-language" },
        h("p", { id: "inner" }, "Partner management")))))
    assert.equal(document.getElementById("outer").textContent, "Partner management")
    assert.equal(document.getElementById("inner").textContent, "Partnerverwaltung")
    assert.equal(document.documentElement.lang, "en")
  })
})

test("blocked browser storage still permits switching and keeps the selection during page navigation", async () => {
  await withDom(async ({ dom, render, click }) => {
    const errors = []
    dom.window.addEventListener("error", event => { errors.push(event.error); event.preventDefault() })
    for (const method of ["getItem", "setItem"]) dom.window.Storage.prototype[method] = () => { throw new dom.window.DOMException("Blocked", "SecurityError") }
    await render(shell(h("p", null, "Partner management")))
    await click(languageButton("DE"))
    assert.equal(document.querySelector("p").textContent, "Partnerverwaltung")
    await render(null)
    await render(shell(h("p", null, "Partner management")))
    assert.equal(document.querySelector("p").textContent, "Partnerverwaltung")
    assert.deepEqual(errors, [])
  })
})
