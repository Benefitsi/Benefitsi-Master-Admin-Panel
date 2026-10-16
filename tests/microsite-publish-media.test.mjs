import assert from "node:assert/strict"
import test from "node:test"
import { createDefaultMicrositeConfig } from "../lib/microsites.ts"
import { createPublicMicrositeSnapshot } from "../lib/public-microsite-contract.ts"
import { unavailablePublishedImages } from "../lib/microsite-publish-media.ts"

const origin = "https://example.supabase.co"
function snapshot(url) {
  const config = createDefaultMicrositeConfig({ name: "Synthetic restaurant", slug: "synthetic" }, "restaurant-premium")
  config.hero.backgroundImageUrl = url
  return createPublicMicrositeSnapshot(config)
}

test("own Storage paths must be normalized and use an image bucket", async () => {
  const supabase = { storage: { from() { throw Error("No Storage request expected") } } }
  for (const path of [
    "partner-assets/%2e%2e/private.png",
    "partner-assets/cover%2fhidden.png",
    "partner-assets/cover%5chidden.png",
    "menu-videos/partner/menu/video.mp4",
  ]) {
    const errors = await unavailablePublishedImages(supabase, snapshot(`${origin}/storage/v1/object/public/${path}`), origin)
    assert.match(errors.join(" "), /hero\.backgroundImageUrl.*Storagepfad/)
  }
})

test("external image URLs are never fetched by the own-Storage checker", async () => {
  const supabase = { storage: { from() { throw Error("External fetch attempted") } } }
  assert.deepEqual(await unavailablePublishedImages(supabase, snapshot("https://images.example.org/photo.webp"), origin), [])
})

test("Storage inspection times out closed and rejects non-image bytes", async () => {
  const url = `${origin}/storage/v1/object/public/partner-assets/staged-covers/photo.png`
  const pending = { storage: { from() { return { info: () => new Promise(() => {}) } } } }
  const start = Date.now()
  const timedOut = await unavailablePublishedImages(pending, snapshot(url), origin, 15)
  assert.match(timedOut.join(" "), /hero\.backgroundImageUrl.*nicht lesbar/)
  assert.ok(Date.now() - start < 1000)
  const wrongType = { storage: { from() { return { info: async () => ({ data: { contentType: "text/html" }, error: null }) } } } }
  assert.match((await unavailablePublishedImages(wrongType, snapshot(url), origin)).join(" "), /hero\.backgroundImageUrl.*nicht lesbar/)
})
