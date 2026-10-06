import assert from "node:assert/strict"
import test from "node:test"
import { createClient } from "@supabase/supabase-js"
import { loadTypescript } from "./helpers/load-typescript.mjs"

const origin = "https://example.supabase.co"
const partner = "11111111-1111-4111-8111-111111111111"
const menu = "22222222-2222-4222-8222-222222222222"
const item = "33333333-3333-4333-8333-333333333333"
const foreign = "44444444-4444-4444-8444-444444444444"
const video = `${origin}/storage/v1/object/public/menu-videos/${partner}/${menu}/55555555-5555-4555-8555-555555555555.mp4`
const oldVideo = video.replace("55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666")
const actualCanManage = loadTypescript("lib/partner-portal.ts", { "./admin": {}, "./supabase/server": {} }).canManagePartner

function fixture({ session = { user: { id: "owner" }, isAdmin: false, managedPartnerIds: [partner] }, existingVideo = null, invalidObject = false, saveError = false, sharedVideo = false } = {}) {
  const requests = [], writes = [], cleanup = [], rows = [{ id: item, menu_id: menu, video_url: existingVideo, sort_order: 0 }]
  if (sharedVideo) rows.push({ id: "duplicate", menu_id: menu, video_url: oldVideo, sort_order: 1 })
  const supabase = createClient(origin, "test-publishable-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)), method = init.method ?? "GET"
    requests.push([method, url.pathname, url.search])
    if (url.pathname.startsWith("/storage/v1/object/upload/sign/")) {
      assert.equal(method, "POST")
      const path = url.pathname.split("/menu-videos/")[1]
      assert.match(path, new RegExp(`^${partner}/${menu}/[0-9a-f-]{36}\\.mp4$`))
      return Response.json({ url: `/object/upload/sign/menu-videos/${path}?token=synthetic-token` })
    }
    if (url.pathname.startsWith("/storage/v1/object/info/")) return Response.json({ size: 1000, content_type: invalidObject ? "text/html" : "video/mp4" })
    if (url.pathname === "/storage/v1/object/menu-videos") {
      assert.equal(method, "DELETE")
      cleanup.push(...JSON.parse(init.body).prefixes)
      return Response.json([])
    }
    let result
    if (url.pathname === "/rest/v1/menus") {
      const selected = url.searchParams.get("id")
      result = selected === `eq.${menu}` ? [{ id: menu, partner_id: partner }] : selected === `eq.${foreign}` ? [{ id: foreign, partner_id: foreign }] : []
    } else {
      assert.equal(url.pathname, "/rest/v1/menu_items")
      result = rows.filter(row => [...url.searchParams].every(([key, value]) => {
        if (["select", "order", "limit", "category_id"].includes(key)) return true
        if (value.startsWith("eq.")) return row[key] === value.slice(3)
        if (value.startsWith("neq.")) return row[key] !== value.slice(4)
        throw new Error(`Unexpected filter ${key}=${value}`)
      }))
      if (method === "PATCH" || method === "POST") {
        const payload = JSON.parse(init.body)
        writes.push(payload)
        if (saveError) return Response.json({ code: "23514", message: "Item rejected" }, { status: 400 })
        if (method === "POST") { const created = { id: "created", ...payload }; rows.push(created); result = [created] }
        else result.forEach(row => Object.assign(row, payload))
      }
      if (method === "DELETE") {
        for (const row of result) rows.splice(rows.indexOf(row), 1)
        result = []
      }
    }
    const accept = new Headers(init.headers).get("accept") ?? ""
    return Response.json(accept.includes("object+json") ? result[0] ?? null : result)
  } } })
  const deferred = []
  const actions = loadTypescript("app/partner-actions.ts", {
    "next/cache": { revalidatePath() {} }, "next/server": { after: callback => deferred.push(callback) },
    "@/lib/partner-portal": { getPartnerPortalSession: async () => session, canManagePartner: actualCanManage },
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/supabase/config": { getSupabaseConfig: () => ({ isConfigured: true, url: origin }) },
    "@/lib/admin": {}, "@/lib/partners/workspace-data": {},
    "@/lib/deal-copy": {}, "@/lib/content-agent": {}, "@/lib/deal-form": {},
    "@/lib/menu-import.js": {}, "@/lib/menu-zip-import.js": {}, "@/lib/menu-ai-import": {},
    "@/lib/partners/entitlements": {}, "@/lib/partners/menu-quota": {},
  }, { FormData, File })
  return { actions, requests, writes, cleanup, rows, flush: async () => { for (const callback of deferred) await callback() } }
}
function form(values = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ id: item, menu_id: menu, name: "Coffee", price: "3", sort_order: "0", ...values })) data.set(key, value)
  return data
}

test("signed video uploads use the menu's authoritative partner and never authorize foreign or missing menus", async () => {
  const allowed = fixture()
  const result = await allowed.actions.createMenuItemVideoUpload(menu, "coffee.mp4", "video/mp4", 1000)
  assert.equal(result.ok, true, result.message)
  assert.equal(result.bucket, "menu-videos")
  assert.equal(result.token, "synthetic-token")
  assert.match(result.publicUrl, new RegExp(`^${origin}/storage/v1/object/public/menu-videos/${partner}/${menu}/`))
  for (const deniedMenu of [foreign, "missing"]) {
    const denied = fixture()
    assert.equal((await denied.actions.createMenuItemVideoUpload(deniedMenu, "coffee.mp4", "video/mp4", 1000)).ok, false)
    assert.equal(denied.requests.some(request => request[1].startsWith("/storage/")), false)
  }
  const expired = fixture({ session: null })
  assert.equal((await expired.actions.createMenuItemVideoUpload(menu, "coffee.mp4", "video/mp4", 1000)).ok, false)
  assert.equal(expired.requests.length, 0)
})

test("invalid upload metadata fails before signing, and forged or wrong-type videos fail before item writes", async () => {
  const invalid = fixture()
  assert.equal((await invalid.actions.createMenuItemVideoUpload(menu, "coffee.mp4", "video/mp4", 50 * 1024 * 1024 + 1)).ok, false)
  assert.equal(invalid.requests.some(request => request[1].startsWith("/storage/")), false)
  for (const candidate of ["https://evil.example/coffee.mp4", video.replace(partner, foreign)]) {
    const state = fixture()
    assert.equal((await state.actions.saveMenuItem({}, form({ video_url: candidate }))).ok, false)
    assert.equal(state.writes.length, 0)
    assert.equal(state.requests.some(request => request[1].includes("/info/")), false)
  }
  const wrongType = fixture({ invalidObject: true })
  assert.equal((await wrongType.actions.saveMenuItem({}, form({ video_url: video }))).ok, false)
  assert.equal(wrongType.writes.length, 0)
})

test("saving returns the video URL with item data, and older forms preserve an existing video", async () => {
  const added = fixture()
  const result = await added.actions.saveMenuItem({}, form({ video_url: video, menu_id: foreign }))
  assert.equal(result.ok, true, result.message)
  assert.equal(result.menuItem.video_url, video)
  assert.equal(added.rows[0].video_url, video)
  assert.equal(added.rows[0].menu_id, menu)
  const legacy = fixture({ existingVideo: video })
  assert.equal((await legacy.actions.saveMenuItem({}, form())).ok, true)
  assert.equal(Object.hasOwn(legacy.writes[0], "video_url"), false)
  assert.equal(legacy.rows[0].video_url, video)
  assert.equal(legacy.requests.some(request => request[1].includes("/info/")), false)
})

test("replace/remove cleanup happens after success and preserves duplicated references", async () => {
  for (const sharedVideo of [false, true]) {
    const state = fixture({ existingVideo: oldVideo, sharedVideo })
    assert.equal((await state.actions.saveMenuItem({}, form({ video_url: "" }))).ok, true)
    assert.equal(state.rows[0].video_url, null)
    assert.equal(state.cleanup.length, 0)
    await state.flush()
    assert.equal(state.cleanup.length, sharedVideo ? 0 : 1)
  }
  const rejected = fixture({ existingVideo: oldVideo, saveError: true })
  assert.equal((await rejected.actions.saveMenuItem({}, form({ video_url: video }))).ok, false)
  await rejected.flush()
  assert.equal(rejected.rows[0].video_url, oldVideo)
  assert.equal(rejected.cleanup.length, 0)
})

test("deleting an item only removes the video after its final duplicate reference is gone", async () => {
  for (const sharedVideo of [false, true]) {
    const state = fixture({ existingVideo: oldVideo, sharedVideo })
    assert.equal((await state.actions.deleteMenuItem({}, form())).ok, true)
    assert.equal(state.rows.some(row => row.id === item), false)
    await state.flush()
    assert.equal(state.cleanup.length, sharedVideo ? 0 : 1)
  }
})
