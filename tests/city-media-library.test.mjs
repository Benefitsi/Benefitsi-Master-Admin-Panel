import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const contracts = new URL("../lib/city-media/contracts.ts", import.meta.url)
const server = new URL("../lib/city-media/server.ts", import.meta.url)
const migration = new URL("../supabase/migrations/20260813120000_city_media_library.sql", import.meta.url)
const publicReadMigration = new URL("../supabase/migrations/20260814100000_city_media_public_read_rls.sql", import.meta.url)
const deleteMigration = new URL("../supabase/migrations/20260814110000_city_media_permanent_delete.sql", import.meta.url)
const catalogMigration = new URL("../supabase/migrations/20260813123000_catalog_existing_knobi_media.sql", import.meta.url)
const uploadRoute = new URL("../app/api/media/route.ts", import.meta.url)
const assignmentRoute = new URL("../app/api/media/[assetId]/assignments/route.ts", import.meta.url)
const assignmentUpdateRoute = new URL("../app/api/media/assignments/[assignmentId]/route.ts", import.meta.url)
const deleteRoute = new URL("../app/api/media/[assetId]/route.ts", import.meta.url)
const libraryUi = new URL("../components/city-media/media-library.tsx", import.meta.url)
const publicResolver = new URL("../../../benefitsi-web/src/lib/cities/city-media.ts", import.meta.url)

test("city media contract contains generic entities, roles and priority", async () => {
  const [code, resolver] = await Promise.all([
    readFile(contracts, "utf8"),
    readFile(publicResolver, "utf8"),
  ])
  for (const value of ["PLACE", "BUSINESS", "PARTNER_LOCATION", "EVENT", "ROUTE", "GUIDE", "COLLECTION", "HUB", "CITY_HOMEPAGE", "HERO", "CARD", "GALLERY", "THUMBNAIL", "OG"]) {
    assert.match(code, new RegExp(`"${value}"`))
  }
  assert.match(code, /manual_lock|manualLock/)
  assert.match(code, /MANUAL_UPLOAD: 600/)
  assert.match(code, /AGENT_DISCOVERED: 250/)
  assert.match(resolver, /manual_lock/)
  assert.match(resolver, /sourcePriority/)
})

test("uploads are admin-authenticated, allowlisted and bounded", async () => {
  const [route, helper, ui] = await Promise.all([readFile(uploadRoute, "utf8"), readFile(server, "utf8"), readFile(libraryUi, "utf8")])
  assert.ok(route.indexOf("await requireAdmin()") < route.indexOf("request.formData()"))
  assert.match(helper, /10 \* 1024 \* 1024/)
  assert.match(helper, /image\/jpeg/)
  assert.match(helper, /image\/png/)
  assert.match(helper, /image\/webp/)
  assert.match(route, /storage\.upload\(storagePath/)
  assert.match(route, /content_hash: contentHash/)
  assert.match(helper, /hasValidImageSignature/)
  assert.match(route, /invalid_image/)
  assert.match(ui, /formElement\.reset\(\)/)
})

test("RLS and Storage keep public reads separate from admin writes", async () => {
  const sql = await readFile(migration, "utf8")
  assert.match(sql, /enable row level security/)
  assert.match(sql, /status = 'PUBLISHED'/)
  assert.match(sql, /public\.is_admin\(\)/)
  assert.match(sql, /city_media_admin_storage/)
  assert.match(sql, /bucket_id = 'city-media'/)
  assert.match(sql, /10485760/)
  assert.match(sql, /role <> 'GALLERY'/)
})

test("public media reads do not invoke the admin-only helper for anon", async () => {
  const sql = await readFile(publicReadMigration, "utf8")
  assert.match(sql, /to anon, authenticated\s+using \(status = 'PUBLISHED'\)/)
  assert.match(sql, /city_media_assets_admin_read[\s\S]*to authenticated[\s\S]*public\.is_admin\(\)/)
  assert.match(sql, /city_media_assignments_public_read[\s\S]*asset\.status = 'PUBLISHED'/)
  assert.match(sql, /city_media_assignments_admin_read[\s\S]*to authenticated[\s\S]*public\.is_admin\(\)/)
})

test("assignment routes support role-scoped lock, focal point and audit", async () => {
  const [create, update] = await Promise.all([readFile(assignmentRoute, "utf8"), readFile(assignmentUpdateRoute, "utf8")])
  assert.match(create, /manual_lock: body\?\.manualLock !== false/)
  assert.match(create, /focal_x: normalizedPoint/)
  assert.match(create, /action: existingResult\.data \? "REPLACE" : "ASSIGN"/)
  assert.match(update, /manualLock/) 
  assert.match(update, /LOCK|UNLOCK/)
  assert.match(update, /sort_order/)
  assert.match(update, /ROLE_CHANGE/)
  assert.match(update, /FOCAL_POINT/)
  assert.match(create, /role === "GALLERY"/)
  assert.match(create, /nextGalleryOrder/)
})

test("unsafe delete is blocked while usage exists and existing Knobi media is not relabeled", async () => {
  const [route, seed, ui, deleteSql] = await Promise.all([
    readFile(deleteRoute, "utf8"),
    readFile(catalogMigration, "utf8"),
    readFile(libraryUi, "utf8"),
    readFile(deleteMigration, "utf8"),
  ])
  assert.match(route, /asset_in_use/)
  assert.match(route, /DELETE_BLOCKED/)
  assert.match(route, /\.from\("city_media_assets"\)\n\s*\.delete\(\)/)
  assert.match(route, /action: "DELETE"/)
  assert.match(deleteSql, /'ARCHIVE', 'DELETE', 'DELETE_BLOCKED'/)
  assert.match(ui, /Asset endgültig löschen\?/) 
  assert.match(ui, /Löschen nach Zuweisung/)
  assert.match(seed, /EXISTING_ASSET/)
  assert.match(seed, /Fotograf, Copyright-Inhaber und Lizenz sind UNKNOWN/)
  assert.match(seed, /manual_lock/)
  assert.doesNotMatch(seed, /photographer\s*,|copyright_holder\s*,|license\s*,/)
})
