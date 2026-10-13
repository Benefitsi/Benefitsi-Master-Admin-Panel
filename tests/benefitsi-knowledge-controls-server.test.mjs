import assert from "node:assert/strict"
import test from "node:test"
import { createHash } from "node:crypto"
import { loadTypescript } from "./helpers/load-typescript.mjs"
import * as contract from "../lib/benefitsi-knowledge-controls.ts"
const input = { schemaVersion: 1, action: "note-create", kind: "task", title: "Wissen", content: "Eigene Notiz", requestId: "ea4db5c0-dfd4-4106-94b4-b22c5ad608ff" }
const base = { schemaVersion: 1, sourceId: "benefitsi-obsidian", ownership: "BENEFITSI_EXTERNAL", checkedAt: "2026-10-13T10:00:00Z" }
const receipt = { ...base, path: "96 Aufgaben/note.md", title: input.title, kind: input.kind, sha256: "a".repeat(64), readbackVerified: true, created: true, mirrorState: "pending" }
const configured = new WeakSet()
function server(t, fetch, session = async () => ({ isAdmin: true }), financeRead = false) {
  if (!configured.has(t)) {
    configured.add(t)
    const old = { url: process.env.M1_BRIDGE_URL, secret: process.env.M1_BRIDGE_SECRET }
    process.env.M1_BRIDGE_URL = "https://bridge.example/arbitrary-prefix"
    process.env.M1_BRIDGE_SECRET = "test-only-secret"
    t.after(() => { for (const [key, value] of [["M1_BRIDGE_URL", old.url], ["M1_BRIDGE_SECRET", old.secret]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
  }
  return loadTypescript("lib/benefitsi-knowledge-controls-server.ts", { "./admin": { getAdminSession: session }, "./benefitsi-knowledge-controls": contract, "./supabase/server": { createClient: async () => ({}) }, "./finance-agent": { getFinanceAccess: async () => ({ isAdmin: true, financeRead }) } }, { fetch, AbortSignal, TextDecoder })
}
test("knowledge transport checks each admin session and uses only its fixed endpoint and bounded projected response", async t => {
  const calls = []; let admin = false, sessionCalls = 0
  const api = server(t, async (url, init) => { calls.push({ url, init }); return Response.json({ ...receipt, privateDetail: "DROP" }) }, async () => { sessionCalls++; return admin ? { isAdmin: true } : null })
  await assert.rejects(api.requestKnowledge("note-create", input), error => error.code === "permission_denied")
  assert.equal(calls.length, 0)
  admin = true
  assert.deepEqual(await api.requestKnowledge("note-create", input), receipt)
  assert.equal(sessionCalls, 2)
  assert.equal(calls[0].url.href, "https://bridge.example/benefitsi/knowledge")
  assert.equal(calls[0].init.method, "POST")
  assert.equal(calls[0].init.cache, "no-store")
  assert.equal(calls[0].init.redirect, "error")
  assert.ok(calls[0].init.signal instanceof AbortSignal)
  assert.deepEqual(JSON.parse(calls[0].init.body), input)
  assert.equal(calls[0].init.headers.authorization, "Bearer test-only-secret")
})
test("knowledge transport cancels oversized streams and preserves conflict without consuming an error body", async t => {
  let canceled = false, mode = "oversized"
  const api = server(t, async () => {
    const body = new ReadableStream({ start(controller) { if (mode === "oversized") controller.enqueue(new Uint8Array(65537)) }, cancel() { canceled = true } })
    return new Response(body, { status: mode === "conflict" ? 409 : 200, headers: { "content-type": "application/json" } })
  })
  await assert.rejects(api.requestKnowledge("note-create", input), error => error.code === "limit_exceeded")
  assert.equal(canceled, true)
  canceled = false; mode = "conflict"
  await assert.rejects(api.requestKnowledge("note-create", input), error => error.code === "conflict")
  assert.equal(canceled, true)
})
test("knowledge transport rejects malformed UTF-8 instead of silently replacing remote bytes", async t => {
  const raw = Buffer.concat([Buffer.from(JSON.stringify(receipt).slice(0, -1) + ',"extra":"'), Buffer.from([255]), Buffer.from('"}')])
  const api = server(t, async () => new Response(raw, { headers: { "content-type": "application/json" } }))
  await assert.rejects(api.requestKnowledge("note-create", input), error => error.code === "invalid_response")
})
test("task-list uses the distinct read action, projects task metadata and sanitizes failed transport", async t => {
  let fail = false
  const api = server(t, async (_url, init) => { assert.deepEqual(JSON.parse(init.body), { schemaVersion: 1, action: "task-list" }); if (fail) throw new Error("PRIVATE RAW ERROR"); return Response.json({ ...base, items: [], truncated: false, secret: "DROP" }) })
  assert.deepEqual(JSON.parse(JSON.stringify(await api.requestKnowledgeTasks())), { ...base, items: [], truncated: false })
  fail = true
  await assert.rejects(api.requestKnowledgeTasks(), error => error.code === "unavailable" && !error.message.includes("PRIVATE"))
})

test("managed note read verifies raw UTF-8 bytes and SHA-256 and gates finance content", async t => {
  const content = '# Überprüfung\n<script>window.BAD=true</script>\n€ 12,50\r\n'
  const bytes = Buffer.from(content, 'utf8')
  const note = { ...base, id: input.requestId, kind: 'task', title: input.title, path: '96 Aufgaben/note.md', profileId: 'ben', createdAt: base.checkedAt, modifiedAt: base.checkedAt, hashVersion: 'sha256-bytes-v1', byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), content }
  let changes = {}, calls = 0
  const api = server(t, async (_url, init) => { calls++; assert.deepEqual(JSON.parse(init.body), { schemaVersion: 1, action: 'note-read', id: input.requestId }); return Response.json({ ...note, ...changes }) })
  assert.equal(typeof api.requestKnowledgeNote, 'function')
  assert.deepEqual(await api.requestKnowledgeNote(input.requestId), note)
  for (const changed of [{sha256:'a'.repeat(64)}, {byteLength:bytes.length-1}, {content:content.replace('\r\n','\n')}]) { changes = changed; await assert.rejects(api.requestKnowledgeNote(input.requestId), error => error.code === 'invalid_response') }
  changes={profileId:'benefitsi-finance'}
  await assert.rejects(api.requestKnowledgeNote(input.requestId), error => error.code === 'permission_denied')
  const permitted = server(t, async () => Response.json({...note,profileId:'benefitsi-finance'}), undefined, true)
  assert.equal((await permitted.requestKnowledgeNote(input.requestId)).profileId,'benefitsi-finance')
  const before=calls
  await assert.rejects(api.requestKnowledgeNote('../secret'),error=>error.code==='invalid_request');assert.equal(calls,before)
})

test('task metadata hides finance titles and IDs without financeRead and marks the result incomplete',async t=>{
 const item={id:input.requestId,title:'PRIVATE FINANCE TITLE',dueDate:null,profileId:'benefitsi-finance',path:'96 Aufgaben/finance.md',createdAt:base.checkedAt,state:'open'}
 const reply={...base,items:[item],truncated:false}
 const restricted=server(t,async()=>Response.json(reply))
 const filtered=await restricted.requestKnowledgeTasks()
 assert.equal(filtered.items.length,0);assert.equal(filtered.truncated,true)
 assert.doesNotMatch(JSON.stringify(filtered),/PRIVATE FINANCE TITLE|ea4db5c0/)
 const permitted=server(t,async()=>Response.json(reply),undefined,true)
 assert.equal((await permitted.requestKnowledgeTasks()).items.length,1)
})
