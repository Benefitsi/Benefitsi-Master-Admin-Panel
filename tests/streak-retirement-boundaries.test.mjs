import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { JSDOM } from "jsdom"
import ts from "typescript"

const root = path.resolve(import.meta.dirname, "..")
const nativeRequire = createRequire(import.meta.url)
function applicationLoader(boundaries = {}) {
  const modules = new Map()
  function load(filename) {
    const file = ["", ".ts", ".tsx"].map(ext => filename + ext).find(existsSync)
    assert.ok(file, filename)
    if (modules.has(file)) return modules.get(file).exports
    const loadedModule = { exports: {} }
    modules.set(file, loadedModule)
    const source = readFileSync(file, "utf8") + (file.endsWith("restaurant-premium-microsite.tsx") ? "\nexport { AppScreenShowcase };" : "")
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    new Function("require", "module", "exports", js)(id => {
      if (Object.hasOwn(boundaries, id)) return boundaries[id]
      if (id === "server-only") return {}
      if (id.startsWith("@/")) return load(path.join(root, id.slice(2)))
      if (id.startsWith(".")) return load(path.resolve(path.dirname(file), id))
      return nativeRequire(id)
    }, loadedModule, loadedModule.exports)
    return loadedModule.exports
  }
  return relative => load(path.join(root, relative))
}
const retired = [
  { type: "streak" }, { type: "reward", trigger_key: "streak_bonus" },
  { type: "happy_hour", campaign_type: "Streak Bonus" },
  { type: "reward", metadata: { streak_mode: "calendar_frequency" } },
  { type: "reward", metadata: { streak_mode: " Calendar-Frequency " } },
]

test("phone showcase skips raw retired rows before choosing its displayed benefit", () => {
  const load = applicationLoader()
  const { AppScreenShowcase } = load("components/microsite/restaurant-premium-microsite.tsx")
  const partner = { name: "Synthetic partner", deals: [], menus: [], reward_milestones: [], opening_hours: [], cover_urls: [], category: [] }
  const config = load("lib/microsites.ts").resolveMicrositeConfig({}, partner)
  for (const deal of retired) {
    partner.deals = [
      { ...deal, id: "retired", active: true, public_title: "Retired title SENTINEL", customer_description: "Retired description SENTINEL" },
      { id: "ordinary", active: true, type: "happy_hour", public_title: "Ordinary benefit SENTINEL", customer_description: "Ordinary conditions SENTINEL" },
    ]
    const html = renderToStaticMarkup(React.createElement(AppScreenShowcase, { partner, config, screenshotUrl: "" }))
    assert.doesNotMatch(html, /Retired (?:title|description) SENTINEL/)
    assert.match(html, /Ordinary benefit SENTINEL/)
    assert.match(html, /Ordinary conditions SENTINEL/)
  }
})

test("city editor renders ordinary options but excludes active and archived raw retired rows", async () => {
  const rawDeals = [...retired.flatMap((deal, i) => [true, false].map(active => ({ ...deal, id: `retired-${i}-${active}`, active, title: "Retired option SENTINEL", partner_id: "partner" }))),
    { id: "ordinary", type: "stamp_card", title: "Ordinary option SENTINEL", partner_id: "partner" }]
  const db = { from(table) {
    const q = { columns: "*" }
    q.select = columns => { q.columns = columns; return q }
    for (const method of ["eq", "in", "order"]) q[method] = () => q
    q.then = (resolve, reject) => {
      const rows = table === "deals" ? rawDeals : [{ id: "partner", name: "Partner", slug: "partner" }]
      return Promise.resolve({ data: rows.map(row => Object.fromEntries(q.columns.split(",").map(key => [key, row[key]]))), error: null }).then(resolve, reject)
    }
    return q
  } }
  const definition = applicationLoader({ "@/lib/supabase/admin": {} })("lib/city-pages/content-editor.ts").cityContentEditorDefinitions.benefits
  const historical = { title: "Existing content", deal_id: "retired-0-false", updated_at: "2026-10-08" }
  const load = applicationLoader({
    "@/lib/admin": { requireAdmin: async () => ({ adminSession: { user: {} }, supabase: db }) },
    "@/lib/city-pages/content-editor": { loadCityContentEditor: async () => ({ city: { id: "city", slug: "annweiler", name: "Annweiler" }, definition, record: historical }) },
    "@/app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions": { saveCityContent: async () => {} },
    "@/app/admin-shell": { AdminShell: ({ children }) => children },
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/navigation": { notFound: () => { throw new Error("unexpected notFound") } },
    "@/components/pending-submit-button": { PendingSubmitButton: ({ children }) => React.createElement("button", null, children) },
    "@/components/city-pages/place-story-control": {}, "@/components/city-pages/guide-content-fields": {},
  })
  const page = await load("app/city-pages/[citySlug]/content/[contentType]/[contentId]/page.tsx").default({ params: Promise.resolve({ citySlug: "annweiler", contentType: "benefits", contentId: "b1000000-0000-4000-8000-000000000001" }), searchParams: Promise.resolve({}) })
  const dom = new JSDOM(renderToStaticMarkup(page))
  try {
    const options = Array.from(dom.window.document.querySelectorAll('select[name="deal_id"] option'), option => option.value)
    assert.deepEqual(options, ["", "ordinary"])
    assert.equal(historical.deal_id, "retired-0-false", "reading the editor does not rewrite history")
  } finally { dom.window.close() }
})
