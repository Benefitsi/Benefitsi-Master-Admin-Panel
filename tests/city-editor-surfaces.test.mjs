import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")
const readCity = (path) => readFile(new URL(`../../../benefitsi-web/${path}`, import.meta.url), "utf8")

test("city page surface schema is additive, scoped and public-read/admin-write protected", async () => {
  const sql = await read("supabase/migrations/20260814150000_city_page_editor_surfaces.sql")
  for (const scope of ["HOMEPAGE", "HUB", "COLLECTION", "NAVIGATION"]) assert.match(sql, new RegExp(scope))
  assert.match(sql, /unique\s*\(city_id,\s*scope_type,\s*scope_key\)/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /city_page_configs_public_read/)
  assert.match(sql, /is_admin\(\)/)
})

test("surface editor exposes all structured City CMS surfaces without a free page builder", async () => {
  const [page, actions, config] = await Promise.all([
    read("app/city-pages/[citySlug]/site/[surface]/page.tsx"),
    read("app/city-pages/[citySlug]/site/[surface]/actions.ts"),
    read("lib/city-pages/surface-configs.ts"),
  ])
  for (const surface of ["homepage", "hubs", "collections", "navigation"]) assert.match(config, new RegExp(`"${surface}"`))
  assert.match(page, /sectionOptions/)
  assert.match(page, /Live-Vorschau öffnen/)
  assert.match(page, /Sichtbare Filter/)
  assert.match(actions, /normalizeTarget/)
  assert.match(actions, /normalizeNavigation/)
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/)
  assert.doesNotMatch(page, /<textarea[^>]+name="html"/i)
})

test("entity picker stores safe references and supports search plus deterministic ordering", async () => {
  const picker = await read("components/city-pages/surface-editor-controls.tsx")
  assert.match(picker, /name=\{name\}/)
  assert.match(picker, /Search|Suche/)
  assert.match(picker, /move|up|down|Nach oben|Nach unten/i)
  assert.match(picker, /entityType/)
  assert.match(picker, /imageUrl/)
  assert.doesNotMatch(picker, /<input[^>]+name="id"/i)
})

test("navigation uses one database source for desktop and mobile and validates targets server-side", async () => {
  const [desktop, mobile, action] = await Promise.all([
    readCity("src/components/city/CityMegaNavigation.tsx"),
    readCity("src/components/city/CityMobileNavigation.tsx"),
    read("app/city-pages/[citySlug]/site/[surface]/actions.ts"),
  ])
  assert.match(desktop, /navigation\?: CityNavigationConfig/)
  assert.match(mobile, /navigation\?: CityNavigationConfig/)
  assert.match(action, /allowedKeys/)
  assert.match(action, /invalid_navigation/)
  assert.match(action, /targetOptions/)
})

test("content editor restore writes a new generic audit entry and never restores schedule fields", async () => {
  const [action, page, loader] = await Promise.all([
    read("app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions.ts"),
    read("app/city-pages/[citySlug]/content/[contentType]/[contentId]/page.tsx"),
    read("lib/city-pages/content-editor.ts"),
  ])
  assert.match(action, /export async function restoreCityContentField/)
  assert.match(action, /action: "RESTORE"/)
  assert.match(action, /candidate\.storage !== "schedule"/)
  assert.match(page, /ContentAuditPanel/)
  assert.match(loader, /city_editor_audit/)
})

test("business and editorial pages link to existing editors and public previews", async () => {
  const [business, editorial] = await Promise.all([
    read("app/city-pages/[citySlug]/businesses/page.tsx"),
    read("app/city-pages/[citySlug]/editorial/page.tsx"),
  ])
  assert.match(business, /partner\/microsite-builder/)
  assert.match(business, /essen-trinken/)
  assert.match(editorial, /loadEditorialWorkspace/)
  assert.match(editorial, /editorial\//)
  assert.match(editorial, /\/blog\//)
})

test("media library exposes homepage, hub and collection configs as assignment targets", async () => {
  const [data, contracts] = await Promise.all([
    read("lib/city-media/data.ts"),
    read("lib/city-media/contracts.ts"),
  ])
  assert.match(data, /city_page_configs/)
  assert.match(data, /CITY_HOMEPAGE/)
  assert.match(data, /entityType = scopeType === "HOMEPAGE"/)
  assert.match(contracts, /"COLLECTION"/)
  assert.match(contracts, /"HUB"/)
})
