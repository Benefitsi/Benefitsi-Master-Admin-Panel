import assert from "node:assert/strict"
import test from "node:test"
import { publicMediaPreviewHref, trustedMediaThumbnail } from "../lib/city-media/inventory.ts"

const city = { id: "city-a", slug: "annweiler", name: "Annweiler" }
const place = { id: "place-1", cityId: city.id, canonicalSlug: "trifels", name: "Trifels" }
const asset = { id: "asset-1", cityId: city.id, status: "PUBLISHED" }
const assignment = { assetId: asset.id, cityId: city.id, entityType: "PLACE", entityId: place.id, entityKey: "trifels", role: "CARD" }
const fixture = { city, place, asset, assignment }

test("CARD targets the actual public ID anchor; HERO uses the verified canonical detail slug", () => {
  assert.equal(publicMediaPreviewHref(fixture), "https://benefitsi.de/stadt/annweiler/sehenswuerdigkeiten#place-place-1")
  assert.equal(publicMediaPreviewHref({ ...fixture, assignment: { ...assignment, role: "HERO" } }), "https://benefitsi.de/stadt/annweiler/entdecken/ort/trifels")
  assert.equal(publicMediaPreviewHref({ ...fixture, place: { ...place, canonicalSlug: null }, assignment: { ...assignment, entityKey: null, role: "HERO" } }), "https://benefitsi.de/stadt/annweiler/entdecken/ort/place-1")
})

test("unpublished, wrong-city, dangling and contradictory references never produce a preview link", () => {
  for (const patch of [
    { asset: { ...asset, status: "REVIEW" } },
    { asset: { ...asset, cityId: "city-b" } },
    { city: null }, { place: null },
    { city: { ...city, slug: "../../login" } },
    { place: { ...place, cityId: "city-b" } },
    { assignment: { ...assignment, cityId: "city-b" } },
    { assignment: { ...assignment, assetId: "other-asset" } },
    { assignment: { ...assignment, entityId: "missing" } },
    { assignment: { ...assignment, entityKey: "other" } },
    { assignment: { ...assignment, entityType: "EVENT" } },
    { assignment: { ...assignment, role: "MEMORY_STAMP_ARTWORK" } },
  ]) assert.equal(publicMediaPreviewHref({ ...fixture, ...patch }), null)
})

test("global assets and city-scoped key-only references can resolve without accepting arbitrary references", () => {
  assert.ok(publicMediaPreviewHref({ ...fixture, asset: { ...asset, cityId: null } }))
  assert.ok(publicMediaPreviewHref({ ...fixture, assignment: { ...assignment, entityId: null } }))
  assert.equal(publicMediaPreviewHref({ ...fixture, assignment: { ...assignment, entityId: null, entityKey: null } }), null)
  assert.equal(publicMediaPreviewHref({ ...fixture, place: { ...place, canonicalSlug: "https://evil.example" } }), null)
})

test("thumbnails only use the configured Supabase public city-media image path", () => {
  const origin = "https://abcdefghijklmnopqrst.supabase.co"
  const url = `${origin}/storage/v1/object/public/city-media/annweiler/test.webp`
  assert.equal(trustedMediaThumbnail(url, origin), url)
  for (const bad of ["https://evil.example/test.webp", `${origin}/storage/v1/object/sign/city-media/a.webp`, `${url}?token=private`, `${url}#fragment`, `${origin}/storage/v1/object/public/city-media/a.svg`, `${origin}/storage/v1/object/public/city-media/%2e%2e/private/a.webp`, `https://user:pass@abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/city-media/a.webp`]) {
    assert.equal(trustedMediaThumbnail(bad, origin), null)
  }
  assert.equal(trustedMediaThumbnail(url, "https://evil.example"), null)
})
