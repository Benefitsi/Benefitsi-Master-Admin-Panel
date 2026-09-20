import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"
import { createElement } from "react"
import * as jsxRuntime from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"
import partnerPortal from "../lib/partner-portal.ts"
import microsites from "../lib/microsites.ts"

const partnerId = "11111111-1111-4111-8111-111111111111"
const staffSession = {
  user: { id: "staff-user", email: "staff@example.invalid" },
  profile: null,
  isAdmin: false,
  isPartner: true,
  partnerIds: [partnerId],
  ownedPartnerIds: [],
}
const savedDraft = { hero: { headline: "Saved private draft" } }
const savedPublished = { hero: { headline: "Saved public page" } }

function partner(overrides = {}) {
  return {
    id: partnerId, name: "Synthetic shop", slug: "synthetic-shop", deals: [],
    microsite: {
      id: "microsite-id", slug: "synthetic-shop", status: "published",
      published_version_id: "published-id", draftVersion: null, publishedVersion: null,
    },
    ...overrides,
  }
}

// Execute the actual server route with external session/data and client-component
// boundaries isolated. Access predicates and config resolution stay real.
function loadRoute(path, session, selectedPartner) {
  const calls = { resolvedConfigs: [], shellProps: [], workspaceProps: [] }
  const PreviewShell = props => {
    calls.shellProps.push(props)
    return createElement("article", null, props.initialConfig.hero.headline)
  }
  const imports = {
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: ({ children, ...props }) => createElement("a", props, children) },
    "next/navigation": {
      redirect: path => { throw Object.assign(new Error("redirect"), { path }) },
      notFound: () => { throw Object.assign(new Error("not found"), { status: 404 }) },
    },
    "@/lib/partner-portal": { ...partnerPortal, getPartnerPortalSession: async () => session },
    "@/lib/admin-data": { getDashboardData: async () => ({ partners: [selectedPartner], cities: [], errors: [] }) },
    "@/lib/supabase/config": { getSupabaseConfig: () => ({ isConfigured: true }) },
    "@/lib/supabase/server": { createClient: async () => ({}) },
    "@/lib/microsites": { resolveMicrositeConfig: (...args) => {
      calls.resolvedConfigs.push(args[0])
      return microsites.resolveMicrositeConfig(...args)
    } },
    "@/app/microsite-preview/[partner]/preview-shell": { MicrositePreviewShell: PreviewShell },
    "./actions": { signOutPartner: async () => {} },
    "@/app/partner-admin": { PartnerWorkspace: props => {
      calls.workspaceProps.push(props)
      return null
    } },
    "@/components/brand-logo": { BrandLogo: () => null },
    "@/components/pending-submit-button": { PendingSubmitButton: ({ children }) => createElement("button", null, children) },
    "@/app/admin-language": {
      AdminLanguageProvider: ({ children }) => children,
      AdminLanguageControl: () => null,
    },
    "@/app/dashboard-auto-refresh": { PanelDataAutoRefresh: () => null },
  }
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  const compiled = ts.transpileModule(source, {
    fileName: "page.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loadedModule = { exports: {} }
  vm.runInNewContext(compiled, {
    module: loadedModule, exports: loadedModule.exports,
    require: name => { assert.ok(imports[name], `unexpected boundary ${name}`); return imports[name] },
  })
  return { page: loadedModule.exports.default, calls }
}

const previewPath = "../app/partner/microsite-preview/[partner]/page.tsx"
const previewProps = query => ({
  params: Promise.resolve({ partner: "synthetic-shop" }),
  searchParams: Promise.resolve(query),
})

for (const [name, query, version] of [
  ["raw rows hidden after cutover", {}, null],
  ["builder/local-storage request after cutover", { source: "builder", viewport: "mobile" }, null],
  ["previously readable draft before cutover", { source: "builder" }, { id: "draft-id", config: savedDraft }],
]) {
  test(`linked non-owner receives an unavailable notice instead of an internal preview: ${name}`, async () => {
    const selectedPartner = partner()
    selectedPartner.microsite.draftVersion = version
    const { page, calls } = loadRoute(previewPath, staffSession, selectedPartner)
    const html = renderToStaticMarkup(await page(previewProps(query)))
    assert.match(html, /Interne Vorschau nicht verfügbar/)
    assert.match(html, /href="\/partner"/)
    assert.equal(calls.resolvedConfigs.length, 0, "must not fabricate a default config or resolve a private draft")
    assert.equal(calls.shellProps.length, 0, "must not mount the shell that reads a builder draft from local storage")
  })
}

for (const [name, session, draft, published, expectedHeadline, expectedBuilder] of [
  ["owner", { ...staffSession, ownedPartnerIds: [partnerId] }, savedDraft, savedPublished, "Saved private draft", true],
  ["admin", { ...staffSession, isAdmin: true, partnerIds: [] }, null, savedPublished, "Saved public page", false],
]) {
  test(`${name} retains the saved internal preview and existing viewport/source behavior`, async () => {
    const selectedPartner = partner()
    selectedPartner.microsite.draftVersion = draft && { id: "draft-id", config: draft }
    selectedPartner.microsite.publishedVersion = { id: "published-id", config: published }
    const { page, calls } = loadRoute(previewPath, session, selectedPartner)
    const html = renderToStaticMarkup(await page(previewProps({ source: expectedBuilder ? "builder" : "saved", viewport: "mobile" })))
    assert.match(html, new RegExp(expectedHeadline))
    assert.equal(calls.shellProps.length, 1)
    assert.equal(calls.shellProps[0].initialConfig.hero.headline, expectedHeadline)
    assert.equal(calls.shellProps[0].useBuilderDraft, expectedBuilder)
    assert.equal(calls.shellProps[0].isMobile, true)
    assert.equal(calls.shellProps[0].previewStorageKey, `benefitsi:microsite-preview:${partnerId}`)
    assert.equal(calls.shellProps[0].previewBasePath, "/partner/microsite-preview")
  })
}

test("unrelated account still receives not-found and anonymous access returns to partner login", async () => {
  const unrelated = loadRoute(previewPath, { ...staffSession, partnerIds: ["other-partner"] }, partner())
  await assert.rejects(unrelated.page(previewProps({})), error => error.status === 404)
  assert.equal(unrelated.calls.resolvedConfigs.length, 0)
  const anonymous = loadRoute(previewPath, null, partner())
  await assert.rejects(anonymous.page(previewProps({})), error => error.path === "/partner/login")
})

test("staff dashboard explains the unavailable internal preview without offering a direct or builder detour", async () => {
  const { page, calls } = loadRoute("../app/partner/page.tsx", staffSession, partner())
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }))
  assert.match(html, /Synthetic shop/)
  assert.match(html, /Interne Vorschau nicht verfügbar/)
  assert.doesNotMatch(html, /href="\/partner\/microsite-(?:preview|builder)\//)
  assert.equal(calls.workspaceProps.length, 0)
})

test("owner dashboard keeps its partner workspace", async () => {
  const { page, calls } = loadRoute("../app/partner/page.tsx", { ...staffSession, ownedPartnerIds: [partnerId] }, partner())
  renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }))
  assert.equal(calls.workspaceProps.length, 1)
  assert.equal(calls.workspaceProps[0].partners[0].id, partnerId)
  assert.equal(calls.workspaceProps[0].micrositeEditingEnabled, false)
})
