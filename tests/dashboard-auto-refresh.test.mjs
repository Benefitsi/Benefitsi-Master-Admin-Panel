import assert from "node:assert/strict"
import test from "node:test"
import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { JSDOM } from "jsdom"
import { loadTypescript } from "./helpers/load-typescript.mjs"

async function fixture(run) {
  const dom = new JSDOM('<div id="root"></div><form id="draft"><input name="title"></form>', { url: "http://localhost", pretendToBeVisual: true })
  const originals = Object.fromEntries(["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, globalThis[key]]))
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  let changed, refreshes = 0, removed = 0, nextTimer = 0
  const timers = new Map(), transition = { pending: false }
  dom.window.setTimeout = callback => { const id = ++nextTimer; timers.set(id, callback); return id }
  dom.window.clearTimeout = id => timers.delete(id)
  dom.window.setInterval = () => 999
  dom.window.clearInterval = () => {}
  const router = { refresh: () => refreshes++ }
  const startTransition = callback => { transition.pending = true; callback() }
  const channel = { on(_event, _filter, callback) { changed = callback; return channel }, subscribe: () => channel }
  const { PanelDataAutoRefresh } = loadTypescript("app/dashboard-auto-refresh.tsx", {
    react: { ...React, useTransition: () => [transition.pending, startTransition] },
    "next/navigation": { useRouter: () => router },
    "@/lib/supabase/client": { createClient: () => ({ channel: () => channel, removeChannel: () => removed++ }) },
  }, { window: dom.window, document: dom.window.document })
  const root = createRoot(document.getElementById("root"))
  const render = () => act(async () => root.render(React.createElement(PanelDataAutoRefresh)))
  const flushTimers = () => act(async () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()) })
  try {
    await render()
    await run({ dom, changed: table => changed({ table }), flushTimers, render, transition, count: () => refreshes })
  } finally {
    await act(async () => root.unmount())
    assert.equal(removed, 1)
    assert.equal(timers.size, 0)
    Object.assign(globalThis, originals)
    dom.window.close()
  }
}

test("realtime refreshes coalesce and do not overlap a pending refresh", async () => {
  await fixture(async ({ changed, flushTimers, render, transition, count }) => {
    changed("deals"); changed("partners"); changed("deals")
    await flushTimers()
    assert.equal(count(), 1)
    await render()
    changed("deals")
    await flushTimers()
    assert.equal(count(), 1)
    transition.pending = false
    await render()
    await flushTimers()
    assert.equal(count(), 2)
  })
})
test("refresh defers edited forms and running saves, and ignores unrelated event streams", async () => {
  await fixture(async ({ dom, changed, flushTimers, count }) => {
    changed("city_agent_source_checks")
    await flushTimers()
    assert.equal(count(), 0)
    const form = document.getElementById("draft")
    form.setAttribute("aria-busy", "true")
    changed("deals")
    await flushTimers()
    assert.equal(count(), 0)
    form.removeAttribute("aria-busy")
    form.querySelector("input").dispatchEvent(new dom.window.Event("input", { bubbles: true }))
    changed("deals")
    await flushTimers()
    assert.equal(count(), 0)
    form.remove()
    changed("deals")
    await flushTimers()
    assert.equal(count(), 1)
  })
})
