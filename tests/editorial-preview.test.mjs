import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import React, { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { JSDOM } from "jsdom"
import ts from "typescript"

const require = createRequire(import.meta.url)
const anchor = ({ children, ...props }) => React.createElement("a", props, children)
function runtime(path, overrides = {}) {
  const file = new URL(`../${path}`, import.meta.url)
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", compiled)(name => {
    if (Object.hasOwn(overrides, name)) return overrides[name]
    if (name === "next/link") return { default: anchor }
    if (name.startsWith("@/")) {
      const p = name.slice(2)
      return runtime(`${p}.${existsSync(new URL(`../${p}.tsx`, import.meta.url)) ? "tsx" : "ts"}`, overrides)
    }
    if (name.startsWith(".")) {
      const p = new URL(name, file).href.slice(new URL("../", import.meta.url).href.length)
      return runtime(`${p}.${existsSync(new URL(`../${p}.tsx`, import.meta.url)) ? "tsx" : "ts"}`, overrides)
    }
    return require(name)
  }, loaded, loaded.exports)
  return loaded.exports
}
const post = {
  id: "32e95a70-c15a-4c08-9a91-5568ba87616f", scope: "city", city_id: "city-1", partner_id: null,
  slug: "synthetic-walk", title: "Eine kurze Runde im Ort", excerpt: "Eine kleine Runde für einen entspannten Nachmittag.",
  eyebrow: "Rund um die Stadt", category: "guide", audience: "benefitsi", status: "needs_review",
  content: [{ heading: "Der Rundweg", paragraphs: ["Start an der Kirche.", "Foto: [Autor](https://example.org/photo) · **Bildnachweis**."] }],
  sources: [{ label: "Offizielle Quelle", url: "https://example.org/visit" }],
  related_links: [{ label: "Weitere Orte", href: "/stadt/annweiler/sehenswuerdigkeiten" }],
  image_url: "https://benefitsi.de/images/cities/annweiler/eusserthal-klosterkirche-2019.jpg", image_alt: "Kirche im Dorf",
  published_at: null, last_verified_at: null, created_at: "2026-09-27T08:00:00Z", updated_at: "2026-09-27T08:00:00Z",
}
const documentOf = element => new JSDOM(renderToStaticMarkup(element)).window.document
function preview(data = post) {
  const Component = runtime("app/editorial/editorial-preview.tsx").EditorialPreview
  return documentOf(React.createElement(Component, { post: data }))
}

test("reading view renders the draft as an article with photo, paragraphs, credit links and website destinations", () => {
  const document = preview()
  assert.equal(document.querySelector("article h1").textContent, post.title)
  assert.equal(document.querySelector("article img").getAttribute("alt"), "Kirche im Dorf")
  assert.equal(document.querySelector("article h2").textContent, "Der Rundweg")
  assert.equal(document.querySelector('a[href="https://example.org/photo"]').textContent, "Autor")
  assert.equal(document.querySelector("strong").textContent, "Bildnachweis")
  assert.ok(document.querySelector('a[href="https://benefitsi.de/stadt/annweiler/sehenswuerdigkeiten"]'))
  assert.equal(document.querySelectorAll("pre,textarea,form").length, 0)
  assert.equal(document.body.textContent.includes('"paragraphs"'), false)
})

test("all preview scopes keep sources and image credits together after the reading links", () => {
  for (const scope of ["city", "partner", "global"]) {
    const document = preview({ ...post, scope, content: [
      { heading: " Bildnachweis: ", paragraphs: ["Foto: Erika · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)"] },
      { heading: "Quellen des Queichtals", paragraphs: ["Dieser Abschnitt gehört zum Beitrag."] },
    ] })
    const footer = document.querySelector('article footer[aria-label="Quellen und Bildnachweise"]')
    assert.ok(footer, `${scope}: attribution belongs in the article footer`)
    assert.equal(footer.querySelector('a[href="https://example.org/visit"]').textContent, "Offizielle Quelle")
    assert.equal(footer.querySelector('a[href="https://creativecommons.org/licenses/by-sa/4.0/"]').textContent, "CC BY-SA 4.0")
    assert.match(footer.textContent, /Foto: Erika/)
    assert.equal(footer.textContent.includes("Quellen des Queichtals"), false)
    assert.match(document.querySelector("article").textContent, /Dieser Abschnitt gehört zum Beitrag/)
    assert.ok(document.querySelector('nav[aria-label="Weiterlesen"]').compareDocumentPosition(footer) & 4)
    assert.equal(document.querySelector("article aside"), null)
  }
  const creditOnly = preview({ ...post, sources: [], content: [{ heading: "Bildnachweis", paragraphs: ["Foto: Erika"] }] })
  assert.match(creditOnly.querySelector("article footer").textContent, /Foto: Erika/)
  assert.equal(preview({ ...post, sources: [] }).querySelector("article footer"), null)
})

test("preview rejects executable URLs and token images while escaping markup", () => {
  const document = preview({ ...post, title: "<script>alert(1)</script>", image_url: "https://example.org/photo?token=private",
    sources: [{ label: "Bad", url: "javascript:alert(1)" }, { label: "Bad2", url: "//evil.test" }],
    related_links: [{ label: "Bad3", href: "https://user:secret@example.org/" }],
    content: [{ heading: "Literal", paragraphs: ['<img src=x onerror="alert(1)"> [unsafe](javascript:alert(1))'] }],
  })
  assert.equal(document.querySelectorAll("script,img").length, 0)
  assert.equal(document.querySelector('a[href^="javascript:"]'), null)
  assert.equal(document.querySelector('a[href*="secret"]'), null)
  assert.match(document.querySelector("h1").textContent, /<script>/)
})

test("missing image or alt leaves no empty media frame; invalid timestamps do not render Invalid Date", () => {
  for (const change of [{ image_url: null }, { image_alt: null }]) {
    const document = preview({ ...post, ...change, updated_at: "invalid" })
    assert.equal(document.querySelectorAll("img,figure").length, 0)
    assert.equal(document.body.textContent.includes("Invalid Date"), false)
  }
})

test("draft preview authorizes before all reads and never loads private research or writes", async () => {
  for (const denied of [true, false]) {
    const calls = []
    const Page = runtime("app/editorial/[postId]/preview/page.tsx", {
      "@/lib/admin": { requireAdmin: async () => { calls.push("auth"); if(denied) throw new Error("login-required"); return {} } },
      "@/lib/editorial": { loadEditorialPost: async id => { calls.push(["read", id]); return post } },
      "@/app/editorial/actions": { publishEditorialPost: async () => { calls.push("publish") } },
      "next/navigation": { notFound: () => { throw new Error("not-found") } },
    })
    if (denied) { await assert.rejects(Page.default({ params: Promise.resolve({ postId: post.id }) }), /login-required/); assert.deepEqual(calls, ["auth"]); continue }
    const document = documentOf(await Page.default({ params: Promise.resolve({ postId: post.id }) }))
    assert.deepEqual(calls, ["auth", ["read", post.id]])
    assert.equal(document.querySelectorAll("h1").length, 1)
    assert.match(document.body.textContent, /Vorschau/)
    const publish = document.querySelector('button[value="publish_now"]')
    assert.ok(publish, "the saved reader has a publish action below the article")
    assert.equal(document.querySelector('form input[name="postId"]').value, post.id)
    assert.equal(document.querySelector('form input[name="expectedUpdatedAt"]').value, post.updated_at)
    assert.equal(Page.metadata.robots.index, false)
  }
})

test("publication requires a usable source while a draft can retain an empty source list", async () => {
  for (const [status, sources, expectedWrites] of [["active", [], 0], ["active", [{label:"Unsafe",url:"//evil.test"}], 0], ["needs_review", [], 1], ["active", post.sources, 1]]) {
    const writes = [], calls = []
    const actions = runtime("app/editorial/actions.ts", {
      "next/cache": { revalidatePath() {} },
      "next/navigation": { redirect: path => { throw new Error(`redirect:${path}`) } },
      "@/lib/admin": { requireAdmin: async () => { calls.push("auth") } },
      "@/lib/supabase/admin": { createAdminClient: () => ({from: () => ({update: payload => { writes.push(payload); return {eq:async()=>({error:null})} }})}) },
    })
    const data = new FormData()
    for (const [key,value] of Object.entries({postId:post.id,scope:"city",cityId:"11111111-1111-4111-8111-111111111111",title:post.title,slug:post.slug,excerpt:post.excerpt,status,contentJson:JSON.stringify(post.content),sourcesJson:JSON.stringify(sources),relatedLinksJson:"[]"})) data.set(key,value)
    await assert.rejects(actions.updateEditorialPost(data), expectedWrites ? /success=saved/ : /error=sources_required/)
    assert.deepEqual(calls,["auth"])
    assert.equal(writes.length,expectedWrites)
    if(status === "needs_review") { assert.equal(writes[0].published_at,null); assert.equal(writes[0].last_verified_at,null) }
  }
})

async function mount(t, initial = post) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://admin.example/editorial/test" })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(dom.window.document.getElementById("root"))
  const Component = runtime("app/editorial/editorial-form.tsx").EditorialForm
  const writes = []
  await act(async () => root.render(React.createElement(Component, { initial, action: data => writes.push([...data.entries()]), cities: [{id:"city-1",name:"Annweiler",slug:"annweiler"}], partners: [] })))
  t.after(async () => { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of previous) { if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key] } })
  return { document: dom.window.document, window: dom.window, writes }
}
async function change(window, input, value) {
  const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto,"value").set.call(input,value)
  await act(async () => input.dispatchEvent(new window.Event("input", {bubbles:true})))
}

test("plain fields round-trip paragraphs and show unsaved edits without publishing or losing input", async t => {
  const { document, window, writes } = await mount(t)
  assert.equal(document.querySelector('textarea[name="contentJson"]'), null)
  const body = document.querySelector('textarea[aria-label="Text für Abschnitt 1"]')
  assert.ok(body, "the content editor uses a readable paragraph field")
  await change(window, body, "Geänderter erster Absatz.\n\nZweiter Absatz bleibt separat.")
  await change(window, document.querySelector('[name="title"]'), "Ungespeicherter Titel")
  await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Vorschau").click())
  const article = document.querySelector("article")
  assert.match(article.textContent, /Ungespeicherter Titel/)
  assert.match(article.textContent, /Geänderter erster Absatz/)
  assert.equal(writes.length, 0)
  await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Bearbeiten").click())
  assert.equal(body.value, "Geänderter erster Absatz.\n\nZweiter Absatz bleibt separat.")
  const data = new window.FormData(document.querySelector("form"))
  assert.deepEqual(JSON.parse(data.get("contentJson")), [{heading:"Der Rundweg",paragraphs:["Geänderter erster Absatz.","Zweiter Absatz bleibt separat."]}])
  assert.equal(data.get("status"), "needs_review")
  assert.equal(data.get("publishedAt"), "")
  assert.deepEqual(JSON.parse(data.get("sourcesJson")), post.sources)
  assert.equal(writes.length, 0)
})

function editorialFormData(overrides = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({postId:post.id,scope:"city",cityId:"11111111-1111-4111-8111-111111111111",title:post.title,slug:post.slug,excerpt:post.excerpt,status:"needs_review",contentJson:JSON.stringify(post.content),sourcesJson:JSON.stringify(post.sources),relatedLinksJson:"[]", ...overrides})) data.set(key,value)
  return data
}

test("publish-now saves current content and overrides draft status and a future publication date on create and update", async () => {
  for (const method of ["createEditorialPost", "updateEditorialPost"]) {
    const writes = []
    const actions = runtime("app/editorial/actions.ts", {
      "next/cache": { revalidatePath() {} },
      "next/navigation": { redirect: path => { throw new Error(`redirect:${path}`) } },
      "@/lib/admin": { requireAdmin: async () => {} },
      "@/lib/supabase/admin": { createAdminClient: () => ({from: () => ({insert:async payload=>{writes.push(payload);return {error:null}},update:payload=>{writes.push(payload);return {eq:async()=>({error:null})}}})}) },
    })
    const before = Date.now()
    await assert.rejects(actions[method](editorialFormData({intent:"publish_now",publishedAt:"2099-01-01T12:00",title:"Mein bearbeiteter Beitrag"})), /success=published/)
    assert.equal(writes[0].status, "active")
    assert.equal(writes[0].title, "Mein bearbeiteter Beitrag")
    assert.ok(Date.parse(writes[0].published_at) >= before && Date.parse(writes[0].published_at) <= Date.now())
    assert.ok(writes[0].last_verified_at)
  }
})

test("saved preview publishes only the reviewed revision and never overwrites article content", async () => {
  for (const scenario of ["ready", "denied", "changed", "missing_source", "noncanonical_slug", "race"]) {
    const writes = [], calls = [], filters = []
    const row = {...post, city_id:"11111111-1111-4111-8111-111111111111", sources:scenario === "missing_source" ? [] : post.sources, slug:scenario === "noncanonical_slug" ? "Uppercase-Slug" : post.slug}
    const actions = runtime("app/editorial/actions.ts", {
      "next/cache": { revalidatePath() {} },
      "next/navigation": { redirect: path => { throw new Error(`redirect:${path}`) } },
      "@/lib/admin": { requireAdmin: async () => { calls.push("auth"); if(scenario === "denied") throw new Error("login-required") } },
      "@/lib/supabase/admin": { createAdminClient: () => { calls.push("database"); return {from: () => ({
        select: () => ({eq: () => ({maybeSingle:async()=>({data:row,error:null})})}),
        update: payload => { writes.push(payload); const query={eq:(key,value)=>{filters.push([key,value]);return query},select:()=>query,maybeSingle:async()=>({data:scenario === "race"?null:{id:post.id},error:null})}; return query },
      })} } },
    })
    const data = new FormData()
    data.set("postId",post.id); data.set("expectedUpdatedAt",scenario === "changed"?"2026-01-01T00:00:00Z":post.updated_at)
    const error = {ready:/success=published/,denied:/login-required/,changed:/error=changed/,missing_source:/error=sources_required/,noncanonical_slug:/error=validation/,race:/error=changed/}[scenario]
    await assert.rejects(actions.publishEditorialPost(data),error)
    assert.equal(calls[0],"auth")
    if(scenario === "denied") assert.deepEqual(calls,["auth"])
    assert.equal(writes.length,["ready","race"].includes(scenario)?1:0)
    if(writes.length) {
      assert.equal(writes[0].status,"active")
      assert.deepEqual(Object.keys(writes[0]).sort(),["last_verified_at","published_at","status","updated_at"])
      assert.ok(filters.some(([key,value])=>key === "updated_at" && value === post.updated_at))
    }
  }
})

test("editor footer publishes the unsaved preview with one click and keeps a separate draft save", async t => {
  const {document,window,writes}=await mount(t)
  await change(window,document.querySelector('[name="title"]'),"Titel aus der Vorschau")
  await act(async()=>[...document.querySelectorAll("button")].find(button=>button.textContent === "Vorschau").click())
  const publish=document.querySelector('button[name="intent"][value="publish_now"]')
  assert.ok(publish,"publish is available after reading the preview")
  assert.equal(publish.closest("[hidden]"),null)
  assert.ok(document.querySelector('button[value="save_draft"]'))
  await act(async()=>publish.click())
  assert.equal(writes.length,1)
  assert.equal(new Map(writes[0]).get("intent"),"publish_now")
  assert.equal(new Map(writes[0]).get("title"),"Titel aus der Vorschau")
})

test("publish from preview blocks missing sources without losing edits and allows saving a draft", async t => {
  const {document,window,writes}=await mount(t,{...post,sources:[]})
  await change(window,document.querySelector('[name="title"]'),"Titel bleibt erhalten")
  await act(async()=>[...document.querySelectorAll("button")].find(button=>button.textContent === "Vorschau").click())
  const publish=document.querySelector('button[value="publish_now"]')
  assert.ok(publish)
  await act(async()=>publish.click())
  assert.equal(writes.length,0)
  assert.match(document.querySelector('[role="alert"]').textContent,/Quelle/)
  assert.equal(document.querySelector('[name="title"]').value,"Titel bleibt erhalten")
  await act(async()=>document.querySelector('button[value="save_draft"]').click())
  assert.equal(writes.length,1,"the same content can still be saved privately")
})

test("native validation returns from preview to the invalid field without submitting", async t => {
  const {document,window,writes}=await mount(t)
  const title=document.querySelector('[name="title"]')
  await change(window,title,"")
  await act(async()=>[...document.querySelectorAll("button")].find(button=>button.textContent === "Vorschau").click())
  assert.ok(title.closest("[hidden]"))
  await act(async()=>document.querySelector('button[value="publish_now"]').click())
  assert.equal(writes.length,0)
  assert.equal(title.closest("[hidden]"),null)
})

test("explicit draft save cannot publish even if a previous active status and date are submitted", async () => {
  const writes=[]
  const actions=runtime("app/editorial/actions.ts",{
    "next/cache":{revalidatePath(){}},
    "next/navigation":{redirect:path=>{throw new Error(`redirect:${path}`)}},
    "@/lib/admin":{requireAdmin:async()=>{}},
    "@/lib/supabase/admin":{createAdminClient:()=>({from:()=>({update:payload=>{writes.push(payload);return {eq:async()=>({error:null})}}})})},
  })
  await assert.rejects(actions.updateEditorialPost(editorialFormData({intent:"save_draft",status:"active",publishedAt:"2020-01-01T12:00",sourcesJson:"[]"})),/success=saved/)
  assert.equal(writes[0].status,"draft")
  assert.equal(writes[0].published_at,null)
  assert.equal(writes[0].last_verified_at,null)
})

test("optional status save preserves a review status instead of forcing a draft", async t => {
  const {document,writes}=await mount(t)
  const button=[...document.querySelectorAll("button")].find(item=>item.textContent === "Status und Termin speichern")
  assert.ok(button)
  await act(async()=>button.click())
  assert.equal(writes.length,1)
  assert.equal(new Map(writes[0]).get("status"),"needs_review")
  assert.equal(new Map(writes[0]).has("intent"),false)
})
