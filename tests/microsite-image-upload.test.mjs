import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import React, { act } from "react"
import ts from "typescript"

const require = createRequire(import.meta.url)
const jsdomPackage = process.env.BENEFITSI_TEST_JSDOM_PATH || "jsdom"
const { JSDOM } = require(jsdomPackage)
const { implForWrapper } = require(`${jsdomPackage}/lib/generated/idl/utils.js`)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// Run the complete editor and renderers. Only the server action, navigation and
// CSS transport boundaries are replaced; selection, forms and effects stay real.
function loadEditor(save, uploads) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    if (file.endsWith(".json")) return JSON.parse(readFileSync(file, "utf8"))
    if (file.endsWith(".css")) return new Proxy({}, { get: (_, key) => key })
    const mod = { exports: {} }
    cache.set(file, mod)
    const js = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    new Function("require", "module", "exports", js)(id => {
      if (id === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }) }
      if (id.endsWith("microsite-upload-actions")) return uploads.actions
      if (id === "@/lib/supabase/client") return { createClient: () => uploads.client }
      if (id.endsWith("microsite-actions")) return { saveMicrositeVersion: save }
      if (id.startsWith("@/") || id.startsWith(".")) {
        const base = id.startsWith("@/") ? resolve(repo, id.slice(2)) : resolve(dirname(file), id)
        const resolved = [base, `${base}.ts`, `${base}.tsx`].find(existsSync)
        assert.ok(resolved, `missing test module: ${id}`)
        return load(resolved)
      }
      return require(id)
    }, mod, mod.exports)
    return mod.exports
  }
  return {
    ...load(resolve(repo, "app/microsite-panel.tsx")),
    ...load(resolve(repo, "app/admin-language.tsx")),
    ...load(resolve(repo, "lib/microsites.ts")),
  }
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

async function mount(t, { transfer = async () => ({ error: null }) } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://editor.example.test", pretendToBeVisual: true })
  const previous = new Map()
  const globals = ["window", "document", "Node", "NodeFilter", "Element", "Text", "HTMLElement", "HTMLDetailsElement", "HTMLButtonElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "HTMLFormElement", "FormData", "File", "Event", "CustomEvent", "Image", "MutationObserver", "navigator", "URL"]
  for (const key of globals) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] })
  }
  previous.set("IS_REACT_ACT_ENVIRONMENT", Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT"))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  Object.defineProperty(dom.window.HTMLElement.prototype, "innerText", { configurable: true,
    get() { return this.textContent }, set(value) { this.textContent = value } })
  const livePreviews = new Set()
  let nextPreview = 0
  URL.createObjectURL = () => { const url = `blob:https://editor.example.test/${++nextPreview}`; livePreviews.add(url); return url }
  URL.revokeObjectURL = url => livePreviews.delete(url)
  const root = require("react-dom/client").createRoot(document.getElementById("root"))
  t.after(async () => {
    await act(async () => root.unmount())
    assert.equal(livePreviews.size, 0, "editor unmount releases its preview URLs")
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  const staged = new Map()
  let nextUpload = 0
  const uploads = {
    actions: {
      async prepareMicrositeImageUpload(partnerId, file) {
        assert.equal(partnerId, "synthetic-partner")
        const path = `staging/${++nextUpload}-${file.name}`
        return { ok: true, bucket: "microsite-assets", path, token: `signed:${path}` }
      },
      async completeMicrositeImageUpload(partnerId, path) {
        assert.equal(partnerId, "synthetic-partner")
        assert.ok(staged.has(path), "completion requires the original file to reach storage")
        return { ok: true, url: `https://cdn.example.test/${staged.get(path).name}.webp` }
      },
      async discardMicrositeImageUpload(_partnerId, path) { staged.delete(path); return { ok: true } },
    },
    client: { storage: { from(bucket) {
      assert.equal(bucket, "microsite-assets")
      return { async uploadToSignedUrl(path, token, file, options) {
        assert.equal(token, `signed:${path}`)
        assert.equal(options.contentType, file.type)
        const result = await transfer(file)
        if (!result.error) staged.set(path, file)
        return result
      } }
    } } },
  }
  const saves = []
  const { MicrositePanel, AdminLanguageProvider, createDefaultMicrositeConfig } = loadEditor(async (_state, form) => {
    const config = JSON.parse(form.get("existing_config"))
    saves.push({ config, entries: [...form] })
    return { ok: true, message: "Saved", config, savedVersion: { id: "saved-9", version_number: 9, status: "draft" } }
  }, uploads)
  const partner = { id: "synthetic-partner", name: "Restaurant", type: "Food & Drink", deals: [], reward_milestones: [], menus: [], opening_hours: [], socials: [], holidays: [], cover_urls: [], media_rich_enabled: false }
  const base = createDefaultMicrositeConfig(partner)
  base.template = "restaurant-premium"
  base.elementText["content.aboutIngredientImageUrl"] = "https://cdn.example.test/original-a.webp"
  base.elementText["content.aboutLocationImageUrl"] = "https://cdn.example.test/original-b.webp"
  partner.microsite = { id: "site", status: "draft", slug: "synthetic", draftVersion: { id: "draft-8", version_number: 8, config: base } }
  const render = async (config = base, key = "editor", publishedConfig) => act(async () => root.render(React.createElement(AdminLanguageProvider, { initialLanguage: "de" }, React.createElement(MicrositePanel, { partner: { ...partner, microsite: { ...partner.microsite, status: publishedConfig ? "published" : "draft", publishedVersion: publishedConfig ? { id: "live-8", version_number: 8, config: publishedConfig } : null, draftVersion: { id: "draft-9", version_number: 9, config } } }, key }))))
  await render()
  const image = slot => document.querySelector(`[data-microsite-editable="${slot}"]`)
  const select = async slot => act(async () => { assert.ok(image(slot), `image slot ${slot} exists`); image(slot).click() })
  const choose = async (name, fileName, size = 12, type = "image/png") => act(async () => {
    const input = document.querySelector(`input[data-microsite-upload="${name}"], input[name="${name}"]`)
    assert.ok(input, `upload field ${name} exists`)
    const file = new File(["image"], fileName, { type })
    Object.defineProperty(file, "size", { value: size })
    implForWrapper(input.files).push(implForWrapper(file))
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
  const saveButton = () => [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Speichern")
  const save = async () => act(async () => saveButton().form.requestSubmit(saveButton()))
  const currentConfig = () => JSON.parse(document.querySelector('[name="existing_config"]').value)
  return { dom, render, select, choose, save, saveButton, saves, currentConfig, image, livePreviews }
}

const left = "content.aboutIngredientImageUrl"
const right = "content.aboutLocationImageUrl"

test("image files survive switching inspector targets and both durable images survive saving and reopening", async t => {
  const first = deferred(), second = deferred()
  const ui = await mount(t, { transfer: file => file.name === "left.png" ? first.promise : second.promise })
  await ui.select(left)
  await ui.choose("about_ingredient_file", "left.png")
  await ui.select(right)
  await ui.choose("about_location_file", "right.png")
  assert.equal(ui.livePreviews.size, 2, "switching inspector must not revoke the first pending image")
  await ui.save()
  assert.equal(ui.saves.length, 0, "pending image bytes cannot be saved as blob URLs")
  assert.equal(ui.saveButton().disabled, true)
  assert.ok([...document.querySelectorAll('button[name="intent"][value="draft"]')].every(button => button.disabled), "all draft buttons are disabled during uploads")
  await act(async () => { second.resolve({ error: null }); first.resolve({ error: null }) })
  assert.equal(ui.saveButton().disabled, false)
  await ui.save()
  assert.equal(ui.saves.length, 1)
  const saved = ui.saves[0]
  assert.equal(saved.config.elementText[left], "https://cdn.example.test/left.png.webp")
  assert.equal(saved.config.elementText[right], "https://cdn.example.test/right.png.webp")
  assert.doesNotMatch(JSON.stringify(saved.config), /blob:/)
  assert.ok(saved.entries.every(([, value]) => !(value instanceof File)), "completed uploads are not resubmitted with the save request")
  await ui.render(saved.config, "reopened")
  assert.equal(ui.currentConfig().elementText[left], "https://cdn.example.test/left.png.webp")
  assert.equal(ui.currentConfig().elementText[right], "https://cdn.example.test/right.png.webp")
})

test("failed image upload remains retryable after switching away and blocks saving until retried", async t => {
  let failed = true
  const ui = await mount(t, { transfer: async () => failed ? { error: { message: "Network error" } } : { error: null } })
  await ui.select(left)
  await ui.choose("about_ingredient_file", "retry.png")
  await ui.select(right)
  await ui.save()
  assert.equal(ui.saves.length, 0, "failed upload cannot become a saved blob URL")
  assert.equal(ui.saveButton().disabled, true)
  const retry = [...document.querySelectorAll("button")].find(button => /erneut versuchen/i.test(button.textContent))
  assert.ok(retry, "failed upload can be retried even when its inspector is no longer mounted")
  failed = false
  await act(async () => retry.click())
  await ui.save()
  assert.equal(ui.saves[0].config.elementText[left], "https://cdn.example.test/retry.png.webp")
})

test("a superseded upload cannot replace the newer image when it completes later", async t => {
  const older = deferred(), newer = deferred()
  const ui = await mount(t, { transfer: file => file.name === "old.png" ? older.promise : newer.promise })
  await ui.select(left)
  await ui.choose("about_ingredient_file", "old.png")
  await ui.choose("about_ingredient_file", "new.png")
  await act(async () => newer.resolve({ error: null }))
  assert.equal(ui.currentConfig().elementText[left], "https://cdn.example.test/new.png.webp")
  await act(async () => older.resolve({ error: null }))
  await ui.save()
  assert.equal(ui.saves[0].config.elementText[left], "https://cdn.example.test/new.png.webp")
  assert.doesNotMatch(JSON.stringify(ui.saves[0].config), /blob:/)
})


test("saved legacy preview URLs offer explicit restoration without losing another newly saved image", async t => {
  const ui = await mount(t)
  const published = ui.currentConfig()
  const legacy = structuredClone(published)
  legacy.elementText[left] = "blob:https://old-editor.example.test/lost-upload"
  legacy.elementText[right] = "https://cdn.example.test/recent-location.webp"
  await ui.render(legacy, "legacy", published)
  assert.equal(ui.currentConfig().elementText[left], legacy.elementText[left], "opening a legacy draft must not silently change it")
  await ui.save()
  assert.equal(ui.saves.length, 0)
  const restore = [...document.querySelectorAll("button")].find(button => button.textContent === "Vorheriges Bild wiederherstellen")
  assert.ok(restore, "lost preview images need an explicit recoverable action")
  assert.match(document.body.textContent, /Über uns linkes Kartenbild/)
  await act(async () => restore.click())
  await ui.save()
  assert.equal(ui.saves[0].config.elementText[left], "https://cdn.example.test/original-a.webp")
  assert.equal(ui.saves[0].config.elementText[right], "https://cdn.example.test/recent-location.webp")
  assert.doesNotMatch(JSON.stringify(ui.saves[0].config), /blob:/)
})


test("invalid image selections retain the previous image and can be discarded", async t => {
  const ui = await mount(t)
  await ui.select(left)
  await ui.choose("about_ingredient_file", "too-large.png", 10 * 1024 * 1024 + 1)
  assert.match(document.body.textContent, /10 MB/)
  assert.equal(ui.currentConfig().elementText[left], "https://cdn.example.test/original-a.webp")
  await ui.save()
  assert.equal(ui.saves.length, 0)
  await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Auswahl verwerfen").click())
  await ui.choose("about_ingredient_file", "unsupported.gif", 12, "image/gif")
  assert.match(document.body.textContent, /Dieser Bildtyp wird nicht unterstützt/)
  await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Auswahl verwerfen").click())
  await ui.save()
  assert.equal(ui.saves[0].config.elementText[left], "https://cdn.example.test/original-a.webp")
})

test("at most 20 MB of selected images are retained while uploads are pending", async t => {
  const pending = deferred()
  const ui = await mount(t, { transfer: () => pending.promise })
  await ui.select(left)
  await ui.choose("about_ingredient_file", "left.png", 10 * 1024 * 1024)
  await ui.select(right)
  await ui.choose("about_location_file", "right.png", 10 * 1024 * 1024)
  await ui.select("content.aboutPrepImageUrl")
  await ui.choose("about_prep_file", "extra.png", 1)
  assert.equal(ui.livePreviews.size, 2, "a third selection above 20 MB is rejected before retaining its preview")
  assert.match(document.body.textContent, /maximal 20 MB/)
  await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Auswahl verwerfen").click())
  await act(async () => pending.resolve({ error: null }))
  await ui.save()
  assert.equal(ui.saves.length, 1)
  assert.equal(ui.saves[0].config.elementText[left], "https://cdn.example.test/left.png.webp")
  assert.equal(ui.saves[0].config.elementText[right], "https://cdn.example.test/right.png.webp")
})

test("completed uploads release the publish gate and active previews are never written to local storage", async t => {
  const pending = deferred()
  const ui = await mount(t, { transfer: () => pending.promise })
  const publishButtons = () => [...document.querySelectorAll('button[name="intent"][value="publish"]')]
  assert.ok(publishButtons().every(button => !button.disabled))
  await ui.select(left)
  await ui.choose("about_ingredient_file", "publish.png")
  assert.ok(publishButtons().every(button => button.disabled))
  await act(async () => document.querySelector('a[href*="source=builder"]').click())
  assert.equal(ui.dom.window.localStorage.getItem("benefitsi:microsite-preview:synthetic-partner"), null)
  await act(async () => pending.resolve({ error: null }))
  assert.ok(publishButtons().every(button => !button.disabled), "durable image URLs allow a valid draft to be published")
  await act(async () => publishButtons()[0].click())
  assert.equal(ui.saves[0].config.elementText[left], "https://cdn.example.test/publish.png.webp")
  assert.ok(ui.saves[0].entries.some(([name, value]) => name === "intent" && value === "publish"))
})

test("an upload finishing after an explicit reset cannot reapply the discarded image", async t => {
  const pending = deferred()
  const ui = await mount(t, { transfer: () => pending.promise })
  await ui.select(left)
  await ui.choose("about_ingredient_file", "discarded.png")
  ui.dom.window.confirm = () => true
  await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent.includes("Auf Standard zurücksetzen")).click())
  assert.equal(ui.livePreviews.size, 0)
  await act(async () => pending.resolve({ error: null }))
  await ui.save()
  assert.doesNotMatch(JSON.stringify(ui.saves[0].config), /discarded|blob:/)
})

test("legacy restoration uses the same image slot in the library or removes its missing override", async t => {
  const ui = await mount(t)
  const legacy = ui.currentConfig()
  legacy.elementText[left] = "blob:https://old-editor.example.test/a"
  legacy.elementText[right] = "blob:https://old-editor.example.test/b"
  legacy.assets.library = [{ id: "image-a", label: "Previous ingredient", source: "upload", slot: left, url: "https://cdn.example.test/library-ingredient.webp", createdAt: "2026-10-08T08:00:00Z" }]
  await ui.render(legacy, "legacy-library")
  const restore = () => [...document.querySelectorAll("button")].find(button => button.textContent === "Vorheriges Bild wiederherstellen")
  await act(async () => restore().click())
  await act(async () => restore().click())
  await ui.save()
  assert.equal(ui.saves[0].config.elementText[left], "https://cdn.example.test/library-ingredient.webp")
  assert.equal(ui.saves[0].config.elementText[right], undefined)
})


test("a newer direct selection supersedes an upload to the same slot from the asset library", async t => {
  const library = deferred(), direct = deferred()
  const ui = await mount(t, { transfer: file => file.name === "library.png" ? library.promise : direct.promise })
  const target = [...document.querySelectorAll("label")].find(label => label.textContent.trim().startsWith("Bildposition")).querySelector("select")
  await act(async () => { target.value = left; target.dispatchEvent(new Event("change", { bubbles: true })) })
  await ui.choose("asset_library_file", "library.png")
  await ui.select(left)
  await ui.choose("about_ingredient_file", "direct.png")
  await act(async () => direct.resolve({ error: null }))
  assert.equal(ui.saveButton().disabled, false, "the superseded library request must not keep the current image blocked")
  await ui.save()
  assert.equal(ui.saves[0].config.elementText[left], "https://cdn.example.test/direct.png.webp")
  await act(async () => library.resolve({ error: null }))
  assert.equal(ui.currentConfig().elementText[left], "https://cdn.example.test/direct.png.webp")
})

test("a later manual image URL is preserved when the older file upload finishes", async t => {
  const pending = deferred()
  const ui = await mount(t, { transfer: () => pending.promise })
  await ui.select(left)
  await ui.choose("about_ingredient_file", "old.png")
  const input = document.querySelector(`[name="visual_${left}"]`)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "https://cdn.example.test/manual.webp")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  assert.equal(ui.currentConfig().elementText[left], "https://cdn.example.test/manual.webp")
  await act(async () => pending.resolve({ error: null }))
  await ui.save()
  assert.equal(ui.saves[0].config.elementText[left], "https://cdn.example.test/manual.webp")
})


test("discarding a failed selection restores the visible inherited image and removes its temporary override", async t => {
  const ui = await mount(t, { transfer: async () => ({ error: { message: "Offline" } }) })
  const inherited = ui.currentConfig()
  delete inherited.elementText[left]
  await ui.render(inherited, "inherited")
  const source = () => ui.image(left).querySelector("img")?.getAttribute("src")
  const previousSource = source()
  assert.ok(previousSource, "the Builder supplies an inherited image")
  await ui.select(left)
  await ui.choose("about_ingredient_file", "failed.png")
  await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Auswahl verwerfen").click())
  assert.equal(ui.currentConfig().elementText[left], undefined, "discard restores inheritance rather than an empty override")
  assert.equal(source(), previousSource, "the previous image is immediately visible without saving or reloading")
})

test("discarding a newer upload restores the manual image chosen while an older upload was pending", async t => {
  const older = deferred()
  const ui = await mount(t, { transfer: file => file.name === "older.png" ? older.promise : Promise.resolve({ error: { message: "Offline" } }) })
  await ui.select(left)
  await ui.choose("about_ingredient_file", "older.png")
  const input = document.querySelector(`[name="visual_${left}"]`)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "https://cdn.example.test/manual-between-uploads.webp")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await ui.choose("about_ingredient_file", "newer-failed.png")
  await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Auswahl verwerfen").click())
  assert.equal(ui.currentConfig().elementText[left], "https://cdn.example.test/manual-between-uploads.webp", "discard must restore the most recent deliberate image choice")
  assert.equal(ui.image(left).querySelector("img").getAttribute("src"), "https://cdn.example.test/manual-between-uploads.webp")
  await act(async () => older.resolve({ error: null }))
  await ui.save()
  assert.equal(ui.saves[0].config.elementText[left], "https://cdn.example.test/manual-between-uploads.webp")
})
