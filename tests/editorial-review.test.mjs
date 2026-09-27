import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { createElement } from "react"
import * as jsx from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import { JSDOM } from "jsdom"

function runtime(path, dependencies) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", compiled)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, loaded, loaded.exports)
  return loaded.exports
}
const row = () => ({ topic_key: "private:topic", updated_at: "2026-09-27T08:00:00Z", research: {
  primary_keyword: "Annweiler besuchen", secondary_keywords: ["Altstadt", "Trifels"], intent: "local_visit",
  image_status: "needs_rights_review", image_evidence: "Nutzung noch klären",
  sources: [{ url: "https://example.org/visit", checked_at: "2026-09-26T10:00:00Z", evidence: "Offizielle Besuchsinformation." }],
}, initial_post: { title: "Original", excerpt: "Original introduction", content: [] }, latest_proposal: { content: [], excerpt: "Original introduction", title: "Original" } })
const post = { id: "post-1", scope: "partner", partner_id: "partner-1", slug: "city-visit", title: "Saved human title", excerpt: "Saved excerpt", status: "needs_review", published_at: null, updated_at: "2026-09-27T08:00:00Z" }
const workspace = { posts: [post], cities: [], partners: [{ id: "partner-1", name: "Partner", slug: "exact-partner" }], warnings: [] }
const anchor = ({ children, ...props }) => createElement("a", props, children)
function page(options = {}) {
  const calls = []
  const deps = {
    "react/jsx-runtime": jsx,
    "next/link": { default: anchor },
    "next/navigation": { notFound: () => { throw new Error("not-found") } },
    "@/app/admin-shell": { AdminShell: ({ children }) => createElement("main", null, children) },
    "@/app/editorial/actions": { updateEditorialPost() { throw new Error("unexpected update") } },
    "@/app/editorial/editorial-form": { EditorialForm: ({ initial }) => createElement("form", { id: "existing-editor" }, initial.title) },
    "@/lib/admin": { requireAdmin: async () => { calls.push("auth"); if(options.denied) throw new Error("login-boundary"); return { adminSession: { profile: null, user: {} } } } },
    "@/lib/editorial": {
      loadEditorialPost: async () => { calls.push("post"); return post },
      loadEditorialWorkspace: async () => { calls.push("workspace"); return workspace },
      loadEditorialIntake: async id => { calls.push(["intake", id]); return options.intake ?? { state: "ready", data: review.normalizeEditorialIntake(row()) } },
    },
    "@/app/editorial/editorial-research": { EditorialResearch: evidenceComponent() },
  }
  return { calls, run: () => runtime("app/editorial/[postId]/page.tsx", deps).default({ params: Promise.resolve({ postId: post.id }), searchParams: Promise.resolve({}) }) }
}
// Loading existing source via this boundary makes the initial RED a real page behavior failure.
const review = runtime("lib/editorial-review.ts", {})
function evidenceComponent() {
  return runtime("app/editorial/editorial-research.tsx", { "react/jsx-runtime": jsx }).EditorialResearch
}
function documentOf(element) { return new JSDOM(renderToStaticMarkup(element)).window.document }

test("detail authorizes first and displays private evidence before the unchanged form", async () => {
  const check = page()
  const document = documentOf(await check.run())
  assert.deepEqual(check.calls, ["auth", "post", "workspace", ["intake", "post-1"]])
  assert.match(document.body.textContent, /Annweiler besuchen/)
  assert.match(document.body.textContent, /Suchnachfrage.*nicht gemessen/)
  assert.ok(document.querySelector("#editorial-research").compareDocumentPosition(document.querySelector("#existing-editor")) & 4)
  assert.equal(document.querySelector("#existing-editor").textContent, "Saved human title")
  assert.equal(document.body.textContent.includes("private:topic"), false)
})
test("failed authorization performs no privileged reads", async () => {
  const check = page({ denied: true }); await assert.rejects(check.run(), /login-boundary/); assert.deepEqual(check.calls, ["auth"])
})
test("missing intake hides evidence while query failure warns and leaves editing available", async () => {
  for (const state of ["missing", "unavailable"]) {
    const document = documentOf(await page({ intake: { state } }).run())
    assert.ok(document.querySelector("#existing-editor"))
    assert.equal(Boolean(document.querySelector("#editorial-research")), false)
    assert.equal(Boolean(document.querySelector('[role="status"]')), state === "unavailable")
    if(state === "unavailable") assert.match(document.body.textContent, /Recherche.*nicht geladen/)
  }
})
test("evidence renders safe links and escaped text, not credentials, raw objects or HTML", () => {
  const input = row()
  input.research.sources.push(...["javascript:alert(1)", "//evil.test", "https://user:secret@example.org", "https://example.org?%61pi_key=secret", "https://example.org#access_token=secret", "https://example.org\\evil", "https://example.org/\ncontrol"].map(url => ({ url, evidence: "must not render", checked_at: "bad" })))
  input.research.sources[0].evidence = '<img src=x onerror="alert(1)">'
  const document = documentOf(createElement(evidenceComponent(), { result: { state: "ready", data: review.normalizeEditorialIntake(input) } }))
  assert.equal(document.querySelectorAll("a").length, 1)
  assert.equal(document.querySelector("a").href, "https://example.org/visit")
  assert.equal(document.querySelectorAll("img,script").length, 0)
  assert.match(document.body.textContent, /<img src=x/)
  assert.match(document.body.textContent, /26\.09\.2026/)
  assert.match(document.body.textContent, /Besuch vor Ort/)
  assert.match(document.body.textContent, /Bildrechte.*prüfen/)
  assert.equal(document.body.textContent.includes("secret"), false)
})
test("proposal changes are expandable and read-only; reordered JSON is unchanged", () => {
  const input = row(); assert.equal(review.normalizeEditorialIntake(input).proposal, null)
  input.latest_proposal = { title: "Suggested title", excerpt: "Suggested excerpt", content: [{ heading: "Suggestion", paragraphs: ["New evidence-based copy"] }], sources: [{ label: "Official", url: "https://example.org/source" }] }
  const document = documentOf(createElement(evidenceComponent(), { result: { state: "ready", data: review.normalizeEditorialIntake(input) } }))
  assert.match(document.querySelector("details").textContent, /Suggested title.*Suggested excerpt.*New evidence-based copy.*Official/)
  assert.match(document.body.textContent, /gespeicherte Artikel bleibt unverändert/)
  assert.equal(document.querySelectorAll("button,input,form").length, 0)
})
test("malformed research remains defensive and invalid dates are never claimed as checked", () => {
  const input = row(); input.research = { primary_keyword: {}, secondary_keywords: [null,1,"valid"], intent: "unknown", sources: [{ url: "http://example.org/visit", checked_at: "nonsense", evidence: "Evidence" }] }
  const document = documentOf(createElement(evidenceComponent(), { result: { state: "ready", data: review.normalizeEditorialIntake(input) } }))
  assert.match(document.body.textContent, /Prüfdatum fehlt/)
  assert.equal(document.body.textContent.includes("Invalid Date"), false)
  assert.equal(document.body.textContent.includes("[object Object]"), false)
})
test("public paths use exact global/city/partner destinations and suppress unavailable posts", () => {
  const now = Date.parse("2026-09-27T12:00:00Z")
  const active = { ...post, status: "active", published_at: "2026-09-27T11:00:00Z" }
  assert.equal(review.editorialPublicPath(active, undefined, {slug:"exact-partner"}, now), "/partner/exact-partner/blog/city-visit")
  assert.equal(review.editorialPublicPath({...active,scope:"city"},{slug:"annweiler"},undefined,now), "/stadt/annweiler/blog/city-visit")
  assert.equal(review.editorialPublicPath({...active,scope:"global"},undefined,undefined,now), "/blog/city-visit")
  for(const change of [{status:"draft"},{status:"needs_review"},{status:"archived"},{published_at:null},{published_at:"invalid"},{published_at:"2026-02-30T00:00:00Z"},{published_at:"0"},{published_at:"2026-09-27T12:01:00Z"}]) assert.equal(review.editorialPublicPath({...active,...change},undefined,{slug:"exact-partner"},now),null)
  assert.equal(review.editorialPublicPath(active,undefined,undefined,now),null)
})


test("unknown inherited object names in research labels cannot crash rendering", () => {
  const input = row(); input.research.intent = "__proto__"; input.research.image_status = "constructor"
  const document = documentOf(createElement(evidenceComponent(), { result: { state: "ready", data: review.normalizeEditorialIntake(input) } }))
  assert.match(document.body.textContent, /Nicht dokumentiert/)
  assert.match(document.body.textContent, /Bildrechte nicht dokumentiert/)
})

function intakeReader(result) {
  const calls = []
  const query = {
    select(columns) { calls.push(["select", columns]); return query },
    eq(field,value) { calls.push(["eq",field,value]); return query },
    async maybeSingle() { calls.push(["read"]); if(result instanceof Error) throw result; return result },
  }
  const reader = runtime("lib/editorial.ts", { "server-only": {}, "@/lib/editorial-review": review, "@/lib/supabase/admin": { createAdminClient: () => ({ from(table) { calls.push(["from",table]); return query } }) } })
  return { calls, run: () => reader.loadEditorialIntake("exact-post-id") }
}
test("server reader fetches only the exact post intake and strips internal identifiers", async () => {
  const check = intakeReader({ data: row(), error: null })
  const result = await check.run()
  assert.equal(result.state,"ready")
  assert.equal(result.data.primaryKeyword,"Annweiler besuchen")
  assert.deepEqual(check.calls, [["from","editorial_draft_intakes"],["select","topic_key,research,initial_post,latest_proposal,updated_at"],["eq","editorial_post_id","exact-post-id"],["read"]])
  assert.equal(JSON.stringify(result).includes("private:topic"),false)
})
test("server reader distinguishes missing rows from database/transport failure without leaking errors", async () => {
  for(const [response,state] of [[{data:null,error:null},"missing"],[{data:row(),error:{message:"private details"}},"unavailable"],[new Error("private transport details"),"unavailable"]]) {
    assert.deepEqual(await intakeReader(response).run(),{state})
  }
})

test("overview renders the exact partner link only for a published active article and keeps edit actions", async () => {
  for(const published of [false,true]) {
    const deps = {
      "react/jsx-runtime":jsx,"next/link":{default:anchor},
      "@/app/admin-shell":{AdminShell:({children})=>createElement("main",null,children)},
      "@/app/editorial/actions":{archiveEditorialPost:()=>{}},
      "@/components/pending-submit-button":{PendingSubmitButton:()=>createElement("button",null,"Archivieren")},
      "@/lib/admin":{requireAdmin:async()=>({adminSession:{profile:null,user:{}}})},
      "@/lib/editorial-review":review,
      "@/lib/editorial":{loadEditorialWorkspace:async()=>({...workspace,posts:[{...post,status:published?"active":"needs_review",published_at:published?"2020-01-01T00:00:00Z":null}]})},
    }
    const element=await runtime("app/editorial/page.tsx",deps).default({searchParams:Promise.resolve({})})
    const document=documentOf(element)
    assert.ok(document.querySelector('a[href="/editorial/post-1"]'))
    const links=[...document.querySelectorAll('a[target="_blank"]')]
    assert.equal(links.length,published?1:0)
    if(published) assert.equal(new URL(links[0].href).pathname,"/partner/exact-partner/blog/city-visit")
  }
})
