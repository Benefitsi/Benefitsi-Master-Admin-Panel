import assert from "node:assert/strict"
import test from "node:test"
import React, { act } from "react"
import { JSDOM } from "jsdom"
import { loadTypescript } from "./helpers/load-typescript.mjs"
import * as language from "../app/admin-language.tsx"

const h = React.createElement
const checkedAt = "2026-10-13T10:00:00Z"
const catalog = { profileId: "ben", checkedAt, current: { provider: "Wissen", model: "Prüfung & Freigaben" }, revision: "rev-1", starter: { mode: "profile-default", appliesToNewJobs: true, limitations: [] }, providers: [{ id: "Wissen", label: "Wissen", authenticated: true, models: [{ id: "Prüfung & Freigaben", label: "Prüfung & Freigaben" }, { id: "new", label: "Aufgabe" }] }] }
async function mount(t, fetch, profileId = "ben") {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://admin.example/agents" })
  const names = ["window", "self", "document", "Element", "Text", "Node", "NodeFilter", "HTMLElement", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"]
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] })
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"))
  t.after(async () => { await act(async () => root.unmount()); dom.window.close(); for (const name of names) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else delete globalThis[name] } })
  const controls = loadTypescript("app/agents/agent-controls.tsx", { "@/app/admin-language": language }, { fetch, AbortController })
  const settle = () => new Promise(resolve => setTimeout(resolve, 15))
  await act(async () => { root.render(h(language.AdminLanguageProvider, null, h(language.AdminLanguageControl), h(controls.AgentProfileControls, { profileId, initialProvider: "Wissen", initialModel: "Prüfung & Freigaben" }))); await settle() })
  await act(settle)
  const button = label => [...document.querySelectorAll("button")].find(node => node.textContent === label)
  const click = async node => { assert.ok(node, "Button exists"); await act(async () => { node.click(); await settle() }) }
  const change = async (select, value) => act(async () => { select.value = value; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await settle() })
  return { dom, button, click, change, toggle: label => click(button(label)) }
}

test("actual profile reader translates its controls and receipt while preserving Markdown and file paths", async t => {
  const calls = [], raw = '# Wissen\n<script>window.bad = true</script>\nPrüfung & Freigaben · $&'
  const ui = await mount(t, async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => url.includes("fileId=") ? { profileId: "ben", fileId: "soul", path: "Wissen/SOUL.md", modifiedAt: checkedAt, readAt: checkedAt, content: raw } : { documents: [{ fileId: "soul", path: "Wissen/SOUL.md", exists: true }, { fileId: "memory", path: "Prüfung & Freigaben.md", exists: false }] } } })
  assert.equal(calls.length, 0)
  assert.equal(document.querySelector("section").getAttribute("aria-label"), "Markdown & model")
  await ui.click(ui.button("Show files"))
  assert.equal(calls.length, 1)
  assert.equal(ui.button("Prüfung & Freigaben.md").disabled, true)
  assert.equal(ui.button("Prüfung & Freigaben.md").title, "File missing on M1.")
  await ui.click(ui.button("Wissen/SOUL.md"))
  assert.equal(document.querySelector("pre").textContent, raw)
  assert.equal(document.querySelector("script"), null)
  assert.equal(ui.dom.window.bad, undefined)
  for (const option of ["DE", "EN", "DE", "EN"]) {
    await ui.toggle(option)
    assert.match(document.body.textContent, option === "DE" ? /Quelle: M1 · Live gelesen/ : /Source: M1 · Read live/)
    assert.equal(document.querySelector("pre").textContent, raw)
    assert.ok(ui.button("Wissen/SOUL.md"))
  }
  assert.deepEqual(calls.map(call => call.url), ["/api/agents/profiles/ben/documents", "/api/agents/profiles/ben/documents?fileId=soul"])
  assert.ok(calls.every(call => call.init.method === "GET"))
})

test("actual model selection keeps canonical data through EN/DE changes and sends only the explicit new choice", async t => {
  const calls = []
  const ui = await mount(t, async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => init.method === "POST" ? { ...catalog, current: { provider: "Wissen", model: "new" }, revision: "rev-2", confirmed: true, readbackVerified: true, effectiveFor: "new-jobs" } : catalog } })
  assert.equal(calls.length, 0)
  await ui.click(ui.button("Check connections"))
  const [provider, model] = document.querySelectorAll("select")
  assert.equal(provider.value, "Wissen"); assert.equal(model.value, "Prüfung & Freigaben")
  assert.equal(model.options[1].textContent, "Prüfung & Freigaben")
  assert.equal(model.options[2].textContent, "Aufgabe")
  assert.equal(ui.button("Apply").disabled, true)
  await ui.change(model, "new")
  await ui.toggle("DE")
  assert.equal(provider.value, "Wissen"); assert.equal(model.value, "new")
  assert.equal(model.options[2].textContent, "Aufgabe")
  assert.equal(calls.length, 1)
  await ui.click(ui.button("Anwenden"))
  assert.deepEqual(JSON.parse(calls[1].init.body), { provider: "Wissen", model: "new", expectedProvider: "Wissen", expectedModel: "Prüfung & Freigaben", expectedRevision: "rev-1", confirmed: true })
  assert.match(document.querySelector('[role="status"]').textContent, /Auf M1 gespeichert und zurückgelesen/)
  await ui.toggle("EN")
  assert.equal(document.querySelector('[role="status"]').textContent, "Saved on M1 and verified by reading it back.")
  assert.equal(model.value, "new")
  assert.equal(ui.button("Apply").disabled, true)
  assert.match(document.body.textContent, /The selection applies to new jobs/)
})

test("actual profile reader and model errors remain translated without exposing remote error text", async t => {
  let code = "context_changed"
  const ui = await mount(t, async () => ({ ok: false, json: async () => ({ error: code, detail: "PRIVATE RAW ERROR" }) }))
  await ui.click(ui.button("Show files"))
  assert.equal(document.querySelector('[role="alert"]').textContent, "The file changed while it was being read. Please read it again.")
  await ui.toggle("DE")
  assert.match(document.querySelector('[role="alert"]').textContent, /Die Datei wurde während des Lesens geändert/)
  await ui.toggle("EN")
  code = "configuration_changed"
  await ui.click(ui.button("Check connections"))
  assert.match(document.body.textContent, /The setting has changed in the meantime/)
  await ui.toggle("DE")
  assert.match(document.body.textContent, /Die Einstellung wurde inzwischen geändert/)
  assert.doesNotMatch(document.body.textContent, /PRIVATE RAW ERROR/)
})

test("actual menu model controls render source limitations in English and restore their German text",async t=>{
  const limitations=["Die Live-Konfiguration für bezahlte Menüimporte ist noch nicht vollständig eingerichtet. Solange Journal und Datenbankfreigabe fehlen, startet kein Menü-Modellaufruf.","Menüimporte verwenden diese Auswahl. Für zusätzliche Anbieter und Modelle müssen geprüfte Kosten- und Aufrufgrenzen vorliegen; andernfalls startet kein Modellaufruf. Der native ChatGPT/Codex-Endpunkt kann das erforderliche Ausgabelimit nicht garantieren und ist für Menüimporte gesperrt."]
  const calls=[]
  const ui=await mount(t,async(url,init)=>{calls.push({url,init});return{ok:true,json:async()=>({...catalog,profileId:"benefitsi-menu",starter:{mode:"profile-default",appliesToNewJobs:true,limitations}})}},"benefitsi-menu")
  await ui.click(ui.button("Check connections"))
  assert.equal(calls.length,1)
  assert.equal(calls[0].url,"/api/agents/profiles/benefitsi-menu/models")
  assert.match(document.body.textContent,/A change during text recognition may stop the import before the model call/)
  const notes=()=>[...document.querySelectorAll("section ul li")].map(node=>node.textContent)
  assert.match(notes()[0],/Live configuration for paid menu imports is not fully set up yet/)
  assert.match(notes()[1],/The native ChatGPT\/Codex endpoint cannot guarantee the required output limit/)
  await ui.toggle("DE");assert.deepEqual(notes(),limitations)
  await ui.toggle("EN");assert.doesNotMatch(notes().join(" "),/Solange Journal|Menüimporte verwenden/)
  assert.equal(calls.length,1)
})

test("actual finance controls show deterministic limitations and offer no model mutation",async t=>{
 const calls=[],limitation="Die bestehende Finanzprüfung arbeitet ohne KI-Modell. Für diesen deterministischen Prüfworkflow ist kein Modellwechsel verfügbar."
 const ui=await mount(t,async(url,init)=>{calls.push({url,init});return{ok:true,json:async()=>({...catalog,profileId:"benefitsi-finance",starter:{mode:"deterministic",appliesToNewJobs:false,limitations:[limitation]}})}},"benefitsi-finance")
 await ui.click(ui.button("Check connections"))
 assert.equal(document.querySelectorAll("section select").length,0)
 assert.equal(ui.button("Apply"),undefined)
 assert.match(document.body.textContent,/Model changes are unavailable for this deterministic review workflow/)
 await ui.toggle("DE");assert.match(document.body.textContent,/Für diesen deterministischen Prüfworkflow ist kein Modellwechsel verfügbar/)
 assert.equal(ui.button("Anwenden"),undefined)
 assert.equal(calls.length,1);assert.equal(calls[0].init.method,"GET")
})
