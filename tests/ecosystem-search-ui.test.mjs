import assert from "node:assert/strict"
import test from "node:test"
import React, { act } from "react"
import { JSDOM } from "jsdom"
import { loadTypescript } from "./helpers/load-typescript.mjs"
import * as search from "../lib/ecosystem/search.ts"

async function mount(t) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://admin.example/" })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(dom.window.document.getElementById("root"))
  const components = loadTypescript("components/ecosystem/ecosystem-search.tsx", {
    "next/link": ({ children, ...props }) => {
      const linkProps = { ...props }
      delete linkProps.prefetch
      return React.createElement("a", linkProps, children)
    },
    "@/lib/ecosystem/search": search,
    "@/app/admin-language": { useAdminLanguage: () => ({ language: "de" }) },
    "./ecosystem-search.module.css": { __esModule: true, default: new Proxy({}, { get: (_, name) => name }) },
  })
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  let entries = null
  async function render(next = entries) {
    entries = next
    await act(async () => root.render(React.createElement(components.EcosystemSearchProvider, null,
      React.createElement(components.EcosystemSearch),
      entries ? React.createElement(components.EcosystemSearchRegistration, { source: "pages", entries, state: "ready" }) : null,
    )))
  }
  await render()
  const input = () => dom.window.document.querySelector('input[type="search"]')
  async function type(value) {
    await act(async () => {
      input().focus()
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input(), value)
      input().dispatchEvent(new dom.window.Event("input", { bubbles: true }))
    })
  }
  return { document: dom.window.document, window: dom.window, input, type, render }
}

test("header search works before slow sources, then retains the query while streamed page results arrive", async t => {
  const ui = await mount(t)
  await ui.type("Stempel")
  assert.match(ui.document.querySelector('nav[aria-label="Suchergebnisse"]').textContent, /Stempel/)
  await ui.type("Knobi")
  assert.match(ui.document.body.textContent, /Keine Treffer/)
  await ui.render([{ id: "knobi", title: "Knobi", description: "Microsite · Entwurf", href: "/partners?partner=k", kind: "page" }])
  assert.equal(ui.input().value, "Knobi")
  assert.equal(ui.document.querySelector('nav a').getAttribute("href"), "/partners?partner=k")
  assert.match(ui.document.querySelector('nav').textContent, /Entwurf/)
})

test("search keyboard access enters results and Escape returns focus without leaking a stale panel", async t => {
  const ui = await mount(t)
  await ui.type("Analytics")
  await act(async () => ui.input().dispatchEvent(new ui.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })))
  assert.equal(ui.document.activeElement.tagName, "A")
  await act(async () => ui.document.activeElement.dispatchEvent(new ui.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
  assert.equal(ui.document.activeElement, ui.input())
  assert.equal(ui.document.querySelector('nav[aria-label="Suchergebnisse"]'), null)
})
