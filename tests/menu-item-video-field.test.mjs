import assert from "node:assert/strict"
import test from "node:test"
import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { JSDOM } from "jsdom"
import { MenuItemVideoField } from "../components/menu-item-video-field.tsx"

async function renderField(run) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://admin.example.test" })
  const names = ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]))
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL
  const revoked = []
  URL.createObjectURL = () => "blob:menu-video-preview"
  URL.revokeObjectURL = value => revoked.push(value)
  const root = createRoot(document.getElementById("root"))
  try { await run(root, dom.window, revoked) } finally {
    await act(async () => root.unmount())
    URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke
    Object.assign(globalThis, previous); dom.window.close()
  }
}

test("existing videos have a controlled preview and can be removed from the saved form", async () => {
  await renderField(async (root) => {
    const changes = []
    await act(async () => root.render(React.createElement(MenuItemVideoField, {
      currentUrl: "https://example.com/coffee.mp4", language: "de", onChange: file => changes.push(file),
    })))
    const video = document.querySelector("video")
    assert.equal(video.controls, true)
    assert.equal(video.autoplay, false)
    assert.equal(video.preload, "none")
    assert.equal(document.querySelector('[name="video_url"]').value, "https://example.com/coffee.mp4")
    await act(async () => document.querySelector('button').click())
    assert.equal(document.querySelector("video"), null)
    assert.equal(document.querySelector('[name="video_url"]').value, "")
    assert.deepEqual(changes, [null])
  })
})

test("an invalid upload shows a field error without replacing the existing video", async () => {
  await renderField(async (root, window) => {
    const changes = []
    await act(async () => root.render(React.createElement(MenuItemVideoField, {
      currentUrl: "https://example.com/coffee.mp4", language: "de", onChange: file => changes.push(file),
    })))
    const input = document.querySelector('input[type="file"]')
    Object.defineProperty(input, "files", { value: [new File(["wrong"], "coffee.png", { type: "image/png" })] })
    await act(async () => input.dispatchEvent(new window.Event("change", { bubbles: true })))
    assert.ok(document.querySelector('[role="alert"]').textContent.includes("MP4"))
    assert.equal(document.querySelector('[name="video_url"]').value, "https://example.com/coffee.mp4")
    assert.deepEqual(changes, [])
  })
})

test("a selected video previews locally and releases the preview on removal", async () => {
  await renderField(async (root, window, revoked) => {
    const changes = []
    await act(async () => root.render(React.createElement(MenuItemVideoField, {
      language: "de", onChange: file => changes.push(file),
    })))
    const file = new File(["video"], "coffee.mp4", { type: "video/mp4" })
    const input = document.querySelector('input[type="file"]')
    Object.defineProperty(input, "files", { value: [file] })
    await act(async () => input.dispatchEvent(new window.Event("change", { bubbles: true })))
    assert.equal(document.querySelector("video").getAttribute("src"), "blob:menu-video-preview")
    assert.equal(changes[0], file)
    await act(async () => document.querySelector('button').click())
    assert.deepEqual(revoked, ["blob:menu-video-preview"])
    assert.equal(document.querySelector("video"), null)
  })
})
