import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import React, { act, useId, useRef } from "react"
import { createRoot } from "react-dom/client"
import { JSDOM } from "jsdom"
import ts from "typescript"

const require = createRequire(import.meta.url)
const { implForWrapper } = require("jsdom/lib/generated/idl/utils.js")

// Keep the production form hierarchy, ownership attributes, handlers and action
// buttons. Only unrelated editor layout/fields are replaced by hostile inputs.
let formFixture
function loadFormFixture() {
  if (formFixture) return formFixture
  const source = readFileSync(new URL("../app/microsite-panel.tsx", import.meta.url), "utf8")
  const file = ts.createSourceFile("microsite-panel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const panel = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "MicrositePanel")
  assert.ok(panel)
  const render = panel.body.statements.find(ts.isReturnStatement)
  const handler = panel.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "handleSaveSubmit")
  const id = panel.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(file) === "publicActionFormId")
  const tag = node => ts.isJsxElement(node) ? node.openingElement.tagName.getText(file) : ts.isJsxSelfClosingElement(node) ? node.tagName.getText(file) : null
  const attribute = (node, name) => (node.openingElement ?? node).attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.text === name)
  function project(node) {
    if (ts.isJsxExpression(node) && node.expression && ts.isConditionalExpression(node.expression)) {
      const condition = node.expression.condition.getText(file)
      if (/publishedVersion|publicRefreshPending|isPublished/.test(condition)) {
        const content = project(node.expression.whenTrue)
        if (content) return `{${condition} ? (<>${content}</>) : null}`
      }
    }
    if (tag(node) === "button") {
      const value = attribute(node, "value")?.initializer
      return value && ts.isStringLiteral(value) && ["withdraw", "revalidate"].includes(value.text) ? node.getText(file) : ""
    }
    if (tag(node) === "input") return attribute(node, "name")?.initializer?.text === "partner_id" ? node.getText(file) : ""
    if (tag(node) === "form") {
      const attributes = node.openingElement.attributes.properties
        .filter(attr => !ts.isJsxAttribute(attr) || !["className", "style"].includes(attr.name.text))
        .map(attr => attr.getText(file)).join(" ")
      const editor = attribute(node, "onSubmit")?.initializer?.expression?.getText(file) === "handleSaveSubmit"
      return `<form ${attributes}>${editor ? '<input name="editor_required" required defaultValue="" /><input name="editor_upload" type="file" /><button type="submit" name="intent" value="draft">Save draft</button>' : ""}${node.children.map(project).join("")}</form>`
    }
    const children = []
    ts.forEachChild(node, child => { children.push(project(child)) })
    return children.join("")
  }
  const code = `function Fixture({capture, publicationStatus}) {
    const partner = {id: "synthetic-partner", microsite: {status: publicationStatus, publishedVersion: {id: "saved-public-version"}}};
    const isPublished = partner.microsite.status === "published" && Boolean(partner.microsite.publishedVersion);
    const formRef = useRef(null), previewRef = useRef(null);
    const publicActionFormId = ${id ? id.initializer.getText(file) : "undefined"};
    const formAction = "/synthetic-action", pending = false, builderLocale = "en";
    const state = {publicRefreshPending: true};
    const tr = value => value;
    const setPendingIntent = value => {capture.intent = value};
    const setClientSaveError = value => {capture.errors.push(value)};
    const ALLOWED_MICROSITE_ASSET_TYPES = new Set(["image/png"]);
    const MAX_MICROSITE_ASSET_BYTES = 10*1024*1024, MAX_MICROSITE_UPLOAD_BYTES = 20*1024*1024;
    ${handler.getText(file)}
    const realHandleSaveSubmit = handleSaveSubmit;
    handleSaveSubmit = event => {capture.editorSubmits++; realHandleSaveSubmit(event)};
    return <>${project(render.expression)}</>;
  }`
  const compiled = ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText
  formFixture = new Function("React", "useId", "useRef", `${compiled}; return Fixture`)(React, useId, useRef)
  return formFixture
}

async function mount(t, { confirm = true, instances = 1, publicationStatus = "published" } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://editor.example" })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const capture = { editorSubmits: 0, submissions: [], errors: [], confirmations: 0 }
  dom.window.confirm = () => { capture.confirmations++; return confirm }
  const root = createRoot(dom.window.document.getElementById("root"))
  const Fixture = loadFormFixture()
  await act(async () => root.render(React.createElement(React.Fragment, null,
    ...Array.from({ length: instances }, (_, key) => React.createElement(Fixture, { key, capture, publicationStatus })))))
  // Observe after React's delegated submit handler, then prevent navigation.
  dom.window.document.addEventListener("submit", event => {
    if (!event.defaultPrevented) capture.submissions.push([...new dom.window.FormData(event.target, event.submitter).entries()])
    event.preventDefault()
  })
  const upload = dom.window.document.querySelector('[name="editor_upload"]')
  const file = new dom.window.File([new Uint8Array(11 * 1024 * 1024)], "unsaved.png", { type: "image/png" })
  // jsdom has no OS file picker/DataTransfer. Populate its real FileList at that
  // boundary; FormData, validation, ownership and submit behavior stay real.
  implForWrapper(upload.files).push(implForWrapper(file))
  assert.equal(new dom.window.FormData(upload.form).get("editor_upload").size, 11 * 1024 * 1024)
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  return { document: dom.window.document, capture, upload, file }
}

for (const intent of ["withdraw", "revalidate"]) {
  test(`${intent} submits only partner and intent despite invalid unsaved editor fields`, async t => {
    const { document, capture, upload, file } = await mount(t)
    const button = document.querySelector(`button[value="${intent}"]`)
    assert.equal(upload.form.checkValidity(), false, "the unsaved editor is intentionally invalid")
    assert.notEqual(button.form, upload.form, "public operation must not belong to the editor form")
    await act(async () => button.form.requestSubmit(button))
    assert.deepEqual(capture.submissions, [[["partner_id", "synthetic-partner"], ["intent", intent]]])
    assert.equal(capture.editorSubmits, 0)
    assert.equal(upload.files[0], file, "public operation must not clear the draft's pending upload")
    assert.equal(document.querySelector('[name="editor_required"]').value, "")
  })
}

test("ordinary draft submit still rejects its oversized upload", async t => {
  const { document, capture, upload, file } = await mount(t)
  document.querySelector('[name="editor_required"]').value = "valid draft field"
  await act(async () => upload.form.requestSubmit(document.querySelector('button[value="draft"]')))
  assert.equal(capture.editorSubmits, 1)
  assert.deepEqual(capture.submissions, [])
  assert.ok(capture.errors.some(error => error.includes("10 MB")))
  assert.equal(upload.files[0], file)
})

test("withdraw click retains confirmation and cancellation leaves the draft intact", async t => {
  const { document, capture, upload, file } = await mount(t, { confirm: false })
  await act(async () => document.querySelector('button[value="withdraw"]').click())
  assert.equal(capture.confirmations, 1)
  assert.deepEqual(capture.submissions, [])
  assert.equal(capture.editorSubmits, 0)
  assert.equal(upload.files[0], file)
})

test("two editors keep their public operations attached to their own forms", async t => {
  const { document } = await mount(t, { instances: 2 })
  const buttons = [...document.querySelectorAll('button[value="revalidate"]')]
  assert.equal(buttons.length, 2)
  assert.notEqual(buttons[0].form, buttons[1].form)
  assert.ok(buttons.every(button => button.form?.querySelector('[name="partner_id"]')))
})


test("withdrawn parent retains cache retry but no redundant withdrawal button", async t => {
  const { document } = await mount(t, { publicationStatus: "archived" })
  assert.equal(document.querySelector('button[value="withdraw"]'), null)
  assert.ok(document.querySelector('button[value="revalidate"]'))
})
