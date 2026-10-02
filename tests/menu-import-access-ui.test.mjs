import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import React, { act } from "react"
import * as jsx from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import { JSDOM } from "jsdom"
import ts from "typescript"

const require = createRequire(import.meta.url)
const noop = async () => ({ ok: false, message: "Test boundary" })
function compile(path, boundaries) {
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: path,
  }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", js)(id => {
    if (Object.hasOwn(boundaries, id)) return boundaries[id]
    if (id.startsWith("@/lib/")) return require(`../lib/${id.slice(6)}`)
    throw new Error(`Unmocked boundary ${id}`)
  }, loaded, loaded.exports)
  return loaded.exports
}
function runtime(action = noop, refresh = () => {}) {
  const actions = new Proxy({}, { get: () => action })
  return {
    react: React, "react/jsx-runtime": jsx, "react-dom": require("react-dom"),
    "next/navigation": { useRouter: () => ({ refresh, replace() {}, push() {} }) },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/image": { default: () => null },
    "lucide-react": require("lucide-react"),
    "@/app/partner-actions": actions, "./partner-actions": actions,
    "./partner-enrichment-actions": { researchPartner: noop },
    "./microsite-panel": { MicrositePanel: () => null },
    "@/components/microsite-read-only-notice": { MicrositeReadOnlyNotice: () => null },
    "./admin-language": { useAdminLanguage: () => ({ language: "de" }) },
    "@/app/admin-language": { useAdminLanguage: () => ({ language: "de" }) },
    "@/lib/supabase/client": { createClient: () => { throw new Error("Unexpected browser DB access") } },
    "@/components/loading-ui": { LoadingSpinner: () => null },
    "@/components/partner/partner-feedback-settings-loader": { PartnerFeedbackSettingsLoader: () => null },
  }
}

test("the real shared workspace gates both import entry points for partner owners", () => {
  const boundaries = runtime()
  boundaries["@/components/menu-ai-import-dialog"] = compile("../components/menu-ai-import-dialog.tsx", boundaries)
  boundaries["@/components/partner-menu-import-access"] = compile("../components/partner-menu-import-access.tsx", boundaries)
  const { PartnerWorkspace } = compile("../app/partner-admin.tsx", boundaries)
  for (const hasMenu of [false, true]) {
    for (const [adminAccess, enabled, expected] of [[true, false, true], [false, false, false], [false, null, false], [false, true, true]]) {
      const partner = {
        id: "partner-a", name: "Test Restaurant", type: "Food & Drink", category: [],
        deals: [], holidays: [], socials: [], reward_milestones: [], staff: [], opening_hours: [],
        stamp_progress: [], visits: [], fraud_events: [], microsite: null,
        menu_ai_import_enabled: enabled,
        menus: hasMenu ? [{ id: "menu-a", partner_id: "partner-a", name: "Karte", categories: [], items: [] }] : [],
      }
      const html = renderToStaticMarkup(React.createElement(PartnerWorkspace, {
        partners: [partner], cities: [], owners: [], initialPartnerId: partner.id,
        initialSettingsTab: "menu", portalMode: !adminAccess, adminAccess,
      }))
      assert.equal(html.includes("Karte aus Foto / PDF"), expected, JSON.stringify({ adminAccess, enabled, hasMenu }))
      assert.equal(html.includes('role="switch"'), adminAccess)
    }
  }
})

async function mount(t, enabled, action) {
  const dom = new JSDOM('<div id="root"></div>')
  const previous = new Map()
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  let refreshes = 0
  const { PartnerMenuImportAccess } = compile("../components/partner-menu-import-access.tsx", runtime(action, () => refreshes++))
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(document.getElementById("root"))
  await act(async () => root.render(React.createElement(PartnerMenuImportAccess, { partnerId: "partner-a", enabled })))
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  })
  return { button: document.querySelector('[role="switch"]'), document, refreshes: () => refreshes }
}

test("the access switch displays only confirmed changes and blocks duplicate submissions", async t => {
  const requests = []
  let resolve
  const f = await mount(t, false, form => { requests.push(form); return new Promise(done => { resolve = done }) })
  await act(async () => { f.button.click(); f.button.click() })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].get("partner_id"), "partner-a")
  assert.equal(requests[0].get("enabled"), "true")
  assert.equal(f.button.disabled, true)
  assert.equal(f.button.getAttribute("aria-checked"), "false")
  await act(async () => resolve({ ok: true, enabled: true, message: "Freigeschaltet" }))
  assert.equal(f.button.getAttribute("aria-checked"), "true")
  assert.equal(f.refreshes(), 1)
  await act(async () => f.button.click())
  assert.equal(requests[1].get("enabled"), "false")
  await act(async () => resolve({ ok: false, message: "Nicht gespeichert" }))
  assert.equal(f.button.getAttribute("aria-checked"), "true")
  assert.equal(f.document.querySelector('[role="alert"]').textContent, "Nicht gespeichert")
})

test("an unavailable flag cannot be changed from an unknown state", async t => {
  const f = await mount(t, null, () => { throw new Error("must not submit") })
  assert.equal(f.button.disabled, true)
  assert.match(f.document.querySelector('[role="alert"]').textContent, /nicht geladen/)
})
