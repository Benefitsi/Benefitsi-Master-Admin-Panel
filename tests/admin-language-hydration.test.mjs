import assert from "node:assert/strict"
import test from "node:test"
import React, { act } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { JSDOM } from "jsdom"
import { AdminLanguageProvider, useAdminLanguage } from "../app/admin-language.tsx"
import { AdminTranslationBoundary } from "../components/admin-translation-boundary.tsx"

test("streamed admin text stays intact until its own hydration commits, then follows language changes", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost" })
  const names = ["window", "document", "Element", "Text", "Node", "NodeFilter", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] })
  }
  const root = createRoot(document.getElementById("root"))
  let streamedRoot
  let setLanguage
  const errors = []
  function LanguageSwitch() {
    setLanguage = useAdminLanguage().setLanguage
    return null
  }
  const settle = () => new Promise(resolve => setTimeout(resolve, 15))
  try {
    await act(async () => {
      root.render(React.createElement(AdminLanguageProvider, null,
        React.createElement(LanguageSwitch), React.createElement("div", { id: "stream" })))
      await settle()
    })
    // Let the surrounding shell load its saved preference before late HTML arrives.
    await act(settle)
    const content = React.createElement(AdminTranslationBoundary, null,
      React.createElement("h2", null, "Partner"),
      React.createElement("input", { placeholder: "Partners" }))
    const mount = document.getElementById("stream")
    await act(async () => {
      mount.innerHTML = renderToString(content)
      await settle()
    })
    assert.equal(mount.querySelector("h2").textContent, "Partner", "The translator must not change unhydrated server HTML")
    await act(async () => { setLanguage("de"); await settle() })
    await act(async () => { setLanguage("en"); await settle() })
    assert.equal(mount.querySelector("h2").textContent, "Partner")
    await act(async () => {
      streamedRoot = hydrateRoot(mount, content, { onRecoverableError: error => errors.push(error.message) })
      await settle()
    })
    await act(settle)
    assert.deepEqual(errors, [], "The delayed section must hydrate without recovering from a mismatch")
    assert.equal(mount.querySelector("h2").textContent, "Partners")
    assert.equal(mount.querySelector("input").placeholder, "Partners")
    await act(async () => { setLanguage("de"); await settle() })
    assert.equal(mount.querySelector("h2").textContent, "Partner")
    assert.equal(mount.querySelector("input").placeholder, "Partner")
  } finally {
    await act(async () => { streamedRoot?.unmount(); root.unmount() })
    for (const name of names) {
      if (previous[name]) Object.defineProperty(globalThis, name, previous[name])
      else delete globalThis[name]
    }
    dom.window.close()
  }
})
