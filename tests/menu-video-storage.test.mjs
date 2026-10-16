import assert from "node:assert/strict"
import test from "node:test"
import { createClient } from "@supabase/supabase-js"
import { verifyMenuVideoUpload } from "../lib/menu-video-storage.ts"

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
