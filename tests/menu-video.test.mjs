import assert from "node:assert/strict"
import test from "node:test"
import { validateMenuVideoFile, menuVideoStoragePath } from "../lib/menu-video.ts"

const origin = "https://example.supabase.co"
const partner = "11111111-1111-4111-8111-111111111111"
const menu = "22222222-2222-4222-8222-222222222222"
const file = "33333333-3333-4333-8333-333333333333"
const path = `${partner}/${menu}/${file}.mp4`
const url = `${origin}/storage/v1/object/public/menu-videos/${path}`

test("only playable-sized MP4 uploads pass validation", () => {
  assert.equal(validateMenuVideoFile({ name: "pizza.mp4", type: "video/mp4", size: 1024 }), null)
  assert.equal(validateMenuVideoFile({ name: "pizza.MP4", type: "video/mp4", size: 50 * 1024 * 1024 }), null)
  for (const input of [
    { name: "pizza.mp4", type: "video/mp4", size: 0 },
    { name: "pizza.mp4", type: "video/mp4", size: 50 * 1024 * 1024 + 1 },
    { name: "pizza.mp4", type: "video/mp4", size: NaN },
    { name: "pizza.mov", type: "video/quicktime", size: 1024 },
    { name: "pizza.mp4", type: "image/png", size: 1024 },
  ]) assert.equal(typeof validateMenuVideoFile(input), "string")
})

test("a saved video must belong to this storage origin, partner and menu", () => {
  assert.equal(menuVideoStoragePath(url, origin, partner, menu), path)
  for (const value of [
    url.replace(origin, "https://attacker.example"),
    url.replace(partner, file),
    url.replace(menu, file),
    url.replace("menu-videos", "partner-assets"),
    url.replace("https:", "http:"),
    url.replace(".mp4", ".html"),
    `${url}?token=anything`,
    `${origin}/storage/v1/object/public/menu-videos/${partner}/${menu}/..%2F${file}.mp4`,
  ]) assert.equal(menuVideoStoragePath(value, origin, partner, menu), null)
})
