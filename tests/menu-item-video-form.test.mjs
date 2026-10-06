import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import React, { act } from "react"
import * as jsx from "react/jsx-runtime"
import { JSDOM } from "jsdom"
import ts from "typescript"

const require = createRequire(import.meta.url)
const target = { ok: true, bucket: "menu-videos", path: "partner/menu/video.mp4", token: "signed-token", publicUrl: "https://storage.example.test/video.mp4" }
function loadForm(actions, upload) {
  const boundaries = {
    react: React, "react/jsx-runtime": jsx, "react-dom": require("react-dom"),
    "next/navigation": { useRouter: () => ({ refresh() {}, replace() {}, push() {} }) },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/image": { default: () => null }, "lucide-react": require("lucide-react"),
    "./partner-actions": actions, "@/app/partner-actions": actions,
    "./partner-enrichment-actions": {}, "./microsite-panel": {},
    "./use-partner-capabilities": require("../app/use-partner-capabilities.ts"),
    "./streak-rule-fields": require("../app/streak-rule-fields.tsx"),
    "./admin-language": { useAdminLanguage: () => ({ language: "de" }) },
    "@/app/admin-language": { useAdminLanguage: () => ({ language: "de" }) },
    "@/lib/supabase/client": { createClient: () => ({ storage: { from: bucket => {
      assert.equal(bucket, target.bucket)
      return { uploadToSignedUrl: upload }
    } } }) },
    "@/components/menu-item-video-field": require("../components/menu-item-video-field.tsx"),
    "@/components/loading-ui": { LoadingSpinner: () => null },
    "@/components/partner/partner-feedback-settings-loader": {},
    "@/components/microsite-read-only-notice": {}, "@/components/menu-ai-import-dialog": {},
    "@/components/partner/partner-plan-panel": {},
  }
  const source = readFileSync(new URL("../app/partner-admin.tsx", import.meta.url), "utf8") + "\nexport { MenuItemForm };"
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", js)(id => {
    if (Object.hasOwn(boundaries, id)) return boundaries[id]
    if (id.startsWith("@/lib/")) return require(`../lib/${id.slice(6)}`)
    throw new Error(`Unmocked boundary ${id}`)
  }, loaded, loaded.exports)
  return loaded.exports.MenuItemForm
}
async function withForm(options, run) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://admin.example.test" })
  const names = ["window", "document", "HTMLElement", "HTMLFormElement", "FormData", "File", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]))
  Object.assign(globalThis, Object.fromEntries(names.map(name => [name, name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name]])))
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL
  URL.createObjectURL = () => "blob:video-preview"
  URL.revokeObjectURL = () => {}
  const root = require("react-dom/client").createRoot(document.getElementById("root"))
  const events = [], saved = []
  const actions = {
    createMenuItemVideoUpload: async (...args) => { events.push(["sign", ...args]); return options.sign ? options.sign(...args) : target },
    discardMenuItemVideoUpload: async (...args) => { events.push(["discard", ...args]); return { ok: true, message: "" } },
    saveMenuItem: async (_state, data) => { events.push(["save", new Map(data)]); return options.save ? options.save(data) : { ok: true, message: "Saved" } },
  }
  const Form = loadForm(actions, async (...args) => { events.push(["upload", ...args]); return options.upload ? options.upload(...args) : { error: null } })
  try {
    await act(async () => root.render(React.createElement(Form, { menuId: "menu", item: { id: "item", name: "Coffee", price: 3, image_url: "https://image.example.test/coffee.jpg", ...options.item }, categoryOptions: [], onSaved: state => saved.push(state) })))
    const form = document.querySelector("form")
    const selectVideo = async () => {
      const input = form.querySelector('input[accept="video/mp4,.mp4"]')
      const file = new File(["synthetic video bytes"], "coffee.mp4", { type: "video/mp4" })
      Object.defineProperty(input, "files", { value: [file], configurable: true })
      await act(async () => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })))
      return file
    }
    await run({ root, window: dom.window, form, selectVideo, events, saved })
  } finally {
    await act(async () => root.unmount())
    URL.createObjectURL = create; URL.revokeObjectURL = revoke
    Object.assign(globalThis, previous); dom.window.close()
  }
}

test("the real item form uploads directly once, then saves only its URL and the image draft", async () => {
  let resolveSign
  const signing = new Promise(resolve => { resolveSign = resolve })
  await withForm({ sign: () => signing }, async ({ form, selectVideo, events, saved, window }) => {
    const file = await selectVideo()
    try {
      await act(async () => {
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
      })
      assert.equal(events.length, 1, "repeat submission must not create a second upload")
      assert.equal(form.querySelector('button[type="submit"]').disabled, true)
    } finally { await act(async () => resolveSign(target)) }
    assert.deepEqual(events.map(event => event[0]), ["sign", "upload", "save"])
    assert.deepEqual(events[0].slice(1), ["menu", "coffee.mp4", "video/mp4", file.size])
    assert.equal(events[1][3], file)
    assert.equal(events[1][4].upsert, false)
    const values = events[2][1]
    assert.equal(values.get("video_url"), target.publicUrl)
    assert.equal(values.get("existing_image_url"), "https://image.example.test/coffee.jpg")
    assert.equal([...values.values()].some(value => value instanceof File && value.size > 0), false)
    assert.equal(saved.length, 1)
  })
})

test("a failed direct upload never saves the item and retains the selected preview", async () => {
  await withForm({ upload: async () => ({ error: { message: "Upload unavailable" } }) }, async ({ form, selectVideo, events, saved }) => {
    await selectVideo()
    await act(async () => form.requestSubmit())
    assert.deepEqual(events.map(event => event[0]), ["sign", "upload", "discard"])
    assert.equal(saved.length, 0)
    assert.equal(form.querySelector("video").getAttribute("src"), "blob:video-preview")
    assert.match(form.textContent, /Upload unavailable/)
    assert.equal(form.querySelector('button[type="submit"]').disabled, false)
  })
})

test("a rejected item save cleans up the upload and keeps the text and video for retry", async () => {
  let attempts = 0
  await withForm({ save: async () => ++attempts === 1 ? { ok: false, message: "Save unavailable" } : { ok: true, message: "Saved" } }, async ({ form, selectVideo, events, saved }) => {
    await selectVideo()
    form.elements.name.value = "Coffee draft"
    await act(async () => form.requestSubmit())
    assert.deepEqual(events.map(event => event[0]), ["sign", "upload", "save", "discard"])
    assert.equal(form.elements.name.value, "Coffee draft")
    assert.equal(saved.length, 0)
    await act(async () => form.requestSubmit())
    assert.equal(saved.length, 1)
    assert.equal(events.filter(event => event[0] === "save")[1][1].get("name"), "Coffee draft")
  })
})

test("removing a saved video clears only its URL and does not upload another file", async () => {
  await withForm({ item: { video_url: target.publicUrl } }, async ({ form, events }) => {
    const remove = [...form.querySelectorAll("button")].find(button => button.textContent === "Video entfernen")
    await act(async () => remove.click())
    await act(async () => form.requestSubmit())
    assert.deepEqual(events.map(event => event[0]), ["save"])
    assert.equal(events[0][1].get("video_url"), "")
    assert.equal(events[0][1].get("existing_image_url"), "https://image.example.test/coffee.jpg")
  })
})

test("leaving the editor during upload cleans up its video without saving the item", async () => {
  let completeUpload
  const uploading = new Promise(resolve => { completeUpload = resolve })
  await withForm({ upload: () => uploading }, async ({ root, form, selectVideo, events, saved }) => {
    await selectVideo()
    await act(async () => form.requestSubmit())
    assert.deepEqual(events.map(event => event[0]), ["sign", "upload"])
    await act(async () => root.unmount())
    await act(async () => completeUpload({ error: null }))
    assert.deepEqual(events.map(event => event[0]), ["sign", "upload", "discard"])
    assert.equal(saved.length, 0)
  })
})
