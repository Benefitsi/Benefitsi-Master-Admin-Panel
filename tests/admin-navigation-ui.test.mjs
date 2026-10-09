import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import React, { act } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { JSDOM } from "jsdom"
import ts from "typescript"

const require = createRequire(import.meta.url)
const source = readFileSync(new URL("../app/admin-shell.tsx", import.meta.url), "utf8")
const storageKey = "benefitsi-admin-navigation-collapsed"

function loadShell(code = source) {
  let pathname = "/partners"
  const boundaries = {
    "next/navigation": { usePathname: () => pathname },
    "./actions": { signOut: async () => {} },
    "./admin-language": require("../app/admin-language.tsx"),
    "@/components/pending-submit-button": require("../components/pending-submit-button.tsx"),
    "@/components/brand-logo": require("../components/brand-logo.tsx"),
    "@/lib/admin-navigation": require("../lib/admin-navigation.ts"),
  }
  const js = ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", js)(id => Object.hasOwn(boundaries, id)
    ? boundaries[id] : require(id), loaded, loaded.exports)
  return { Shell: loaded.exports.AdminShell, setPath: path => { pathname = path } }
}

async function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost" })
  dom.window.localStorage.setItem("benefitsi-admin-language", "de")
  const names = ["window", "self", "document", "Element", "Text", "Node", "NodeFilter", "HTMLElement", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) Object.defineProperty(globalThis, name, {
    configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name],
  })
  let root
  const mount = document.getElementById("root")
  const environment = {
    mount, window: dom.window,
    render: async content => { root ??= createRoot(mount); await act(async () => root.render(content)) },
    hydrate: async content => {
      const errors = []
      mount.innerHTML = renderToString(content)
      await act(async () => {
        root = hydrateRoot(mount, content, { onRecoverableError: error => errors.push(error.message) })
      })
      return errors
    },
  }
  try { await run(environment) } finally {
    if (root) await act(async () => root.unmount())
    dom.window.close()
    for (const name of names) {
      if (previous[name]) Object.defineProperty(globalThis, name, previous[name])
      else delete globalThis[name]
    }
  }
}

const toggle = () => document.querySelector("aside button[aria-expanded]")
const expanded = () => toggle().getAttribute("aria-expanded") === "true"
const click = async element => act(async () => element.click())

test("navigation labels and changing accessible hints follow both language selections", async () => {
  const { Shell } = loadShell()
  await withDom(async ({ render }) => {
    await render(React.createElement(Shell, { adminName: "Partner management" }, "Page"))
    const choose = async language => click([...document.querySelectorAll("button[aria-pressed]")].find(button => button.textContent === language))
    await choose("EN")
    assert.equal(document.querySelector('nav a[href="/city-operations"]').textContent, "Review & approvals")
    assert.equal(document.querySelector('nav a[href="/wissen"]').textContent, "Knowledge")
    assert.equal(toggle().getAttribute("aria-label"), "Expand navigation")
    await click(toggle())
    assert.equal(toggle().getAttribute("aria-label"), "Collapse navigation")
    await choose("DE")
    assert.equal(document.querySelector('nav a[href="/city-operations"]').textContent, "Prüfung & Freigaben")
    assert.equal(toggle().getAttribute("aria-label"), "Navigation einklappen")
    assert.ok(document.querySelector("header").textContent.includes("Partner management"), "The account display name remains unchanged")
  })
})

test("both manual sidebar positions survive shell remounts and can be toggled again", async () => {
  const { Shell, setPath } = loadShell()
  await withDom(async ({ render, window }) => {
    const shell = () => React.createElement(Shell, { adminName: "Test" }, "Page")
    await render(shell())
    assert.equal(expanded(), false)
    await click(toggle())
    assert.equal(expanded(), true)
    assert.equal(window.localStorage.getItem(storageKey), "false")
    for (const path of ["/city-pages", "/media", "/partners"]) {
      await render(null); setPath(path); await render(shell())
      assert.equal(expanded(), true, path)
    }
    await click(toggle())
    assert.equal(expanded(), false)
    assert.equal(window.localStorage.getItem(storageKey), "true")
    for (const path of ["/media", "/city-pages", "/partners"]) {
      await render(null); setPath(path); await render(shell())
      assert.equal(expanded(), false, path)
    }
    await click(toggle())
    assert.equal(expanded(), true)
  })
})

test("fresh documents restore either saved position without hydration mismatches", async () => {
  for (const [saved, wantExpanded] of [["false", true], ["true", false], [null, false]]) {
    const { Shell } = loadShell()
    await withDom(async ({ hydrate, window }) => {
      if (saved !== null) window.localStorage.setItem(storageKey, saved)
      assert.deepEqual(await hydrate(React.createElement(Shell, { adminName: "Test" }, "Page")), [])
      assert.equal(expanded(), wantExpanded)
    })
  }
})

test("unavailable browser storage preserves manual toggling and client page remounts", async () => {
  const { Shell, setPath } = loadShell()
  await withDom(async ({ render, window }) => {
    for (const name of ["getItem", "setItem"]) {
      const original = window.Storage.prototype[name]
      window.Storage.prototype[name] = function (key, ...args) {
        if (key === storageKey) throw new window.DOMException("Storage blocked", "SecurityError")
        return original.call(this, key, ...args)
      }
    }
    await render(React.createElement(Shell, { adminName: "Test" }, "Page"))
    await click(toggle())
    await render(null); setPath("/media"); await render(React.createElement(Shell, { adminName: "Test" }, "Page"))
    assert.equal(expanded(), true)
    await click(toggle())
    assert.equal(expanded(), false)
  })
})

test("the active nested page stays visible and opens its group even in the compact rail", async () => {
  const { Shell, setPath } = loadShell()
  await withDom(async ({ render }) => {
    const shell = () => React.createElement(Shell, { adminName: "Test" }, "Page")
    await render(shell())
    assert.equal(document.querySelectorAll("nav > ul > li").length, 8)
    for (const [path, label] of [["/city-operations/events/123", "Prüfung & Freigaben"], ["/wissen/123", "Wissen"]]) {
      setPath(path); await render(shell())
      const link = document.querySelector('nav a[aria-current="page"]')
      assert.equal(link.textContent, label)
      assert.equal(link.closest("ul").hidden, false)
      const group = document.querySelector(`[aria-controls="${link.closest("ul").id}"]`)
      assert.equal(group.getAttribute("aria-expanded"), "true")
      await click(group)
      assert.equal(link.closest("ul").hidden, true)
      await click(group)
      assert.equal(link.closest("ul").hidden, false)
    }
    assert.equal(expanded(), false)
  })
})
