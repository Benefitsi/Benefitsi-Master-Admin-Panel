import assert from "node:assert/strict"
import test from "node:test"
import { createClient } from "@supabase/supabase-js"
import { verifyMenuVideoUpload, removeUnusedMenuVideos } from "../lib/menu-video-storage.ts"

const origin = "https://example.supabase.co"
const partner = "11111111-1111-4111-8111-111111111111"
const menu = "22222222-2222-4222-8222-222222222222"
const path = `${partner}/${menu}/33333333-3333-4333-8333-333333333333.mp4`
const url = `${origin}/storage/v1/object/public/menu-videos/${path}`

function client(fetch) {
  return createClient(origin, "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  })
}

test("saving verifies the real Storage object's size and content type", async () => {
  const requests = []
  const supabase = client(async (input) => {
    const requestUrl = String(input)
    requests.push(requestUrl)
    assert.equal(requestUrl, `${origin}/storage/v1/object/info/menu-videos/${path}`)
    return Response.json({ id: "object-id", name: path, size: 1000, content_type: "video/mp4" })
  })
  assert.equal(await verifyMenuVideoUpload(supabase, url, origin, partner, menu), null)
  assert.equal(requests.length, 1)
})

test("wrong-scope URLs are rejected before any remote request", async () => {
  const supabase = client(async () => { throw new Error("Unexpected request") })
  assert.equal(typeof await verifyMenuVideoUpload(supabase, url.replace(partner, menu), origin, partner, menu), "string")
})

test("missing, oversized and non-video Storage objects cannot be saved", async () => {
  for (const response of [
    Response.json({ message: "Not found" }, { status: 404 }),
    Response.json({ size: 50 * 1024 * 1024 + 1, content_type: "video/mp4" }),
    Response.json({ size: 1000, content_type: "text/html" }),
    Response.json({ content_type: "video/mp4" }),
  ]) {
    const supabase = client(async () => response)
    assert.equal(typeof await verifyMenuVideoUpload(supabase, url, origin, partner, menu), "string")
  }
})

test("removal preserves a video referenced by a duplicated menu item", async () => {
  const supabase = client(async (input, init) => {
    const requestUrl = new URL(String(input))
    assert.equal(init.method, "GET")
    assert.equal(requestUrl.pathname, "/rest/v1/menu_items")
    assert.equal(requestUrl.searchParams.get("video_url"), `eq.${url}`)
    return Response.json([{ id: "another-item" }])
  })
  await removeUnusedMenuVideos(supabase, [url], origin, partner, menu)
})

test("removal only deletes an unreferenced object from the authorized menu", async () => {
  const methods = []
  const supabase = client(async (input, init) => {
    methods.push(init.method)
    const requestUrl = new URL(String(input))
    if (init.method === "GET") {
      assert.equal(requestUrl.pathname, "/rest/v1/menu_items")
      return Response.json([])
    }
    assert.equal(requestUrl.pathname, "/storage/v1/object/menu-videos")
    assert.deepEqual(JSON.parse(init.body), { prefixes: [path] })
    return Response.json([])
  })
  await removeUnusedMenuVideos(supabase, [url, url.replace(partner, menu)], origin, partner, menu)
  assert.deepEqual(methods, ["GET", "DELETE"])
})

test("a failed reference lookup preserves the object", async () => {
  const supabase = client(async (_input, init) => {
    assert.equal(init.method, "GET")
    return Response.json({ message: "offline", code: "offline" }, { status: 503 })
  })
  await removeUnusedMenuVideos(supabase, [url], origin, partner, menu)
})
