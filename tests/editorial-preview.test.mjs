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
      "next/navigation": { notFound: () => { throw new Error("not-found") } },
    })
    if (denied) { await assert.rejects(Page.default({ params: Promise.resolve({ postId: post.id }) }), /login-required/); assert.deepEqual(calls, ["auth"]); continue }
    const document = documentOf(await Page.default({ params: Promise.resolve({ postId: post.id }) }))
    assert.deepEqual(calls, ["auth", ["read", post.id]])
    assert.equal(document.querySelectorAll("h1").length, 1)
    assert.match(document.body.textContent, /Vorschau/)
    assert.equal(document.querySelectorAll("form").length, 0)
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

async function mount(t) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://admin.example/editorial/test" })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(dom.window.document.getElementById("root"))
  const Component = runtime("app/editorial/editorial-form.tsx", {
    "@/components/pending-submit-button": { PendingSubmitButton: ({children}) => React.createElement("button", {type:"submit"}, children) },
  }).EditorialForm
  const writes = []
  await act(async () => root.render(React.createElement(Component, { initial: post, action: data => writes.push([...data.entries()]), cities: [{id:"city-1",name:"Annweiler",slug:"annweiler"}], partners: [] })))
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
