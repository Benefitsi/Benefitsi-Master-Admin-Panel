import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = new URL(
  "../supabase/migrations/20260814130000_city_editor_field_controls.sql",
  import.meta.url,
)
const controls = new URL("../lib/city-pages/field-controls.ts", import.meta.url)
const contentAction = new URL(
  "../app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions.ts",
  import.meta.url,
)
const profileAction = new URL("../app/city-pages/[citySlug]/actions.ts", import.meta.url)
const editorPage = new URL(
  "../app/city-pages/[citySlug]/content/[contentType]/[contentId]/page.tsx",
  import.meta.url,
)
const modeSelect = new URL(
  "../components/city-pages/field-mode-select.tsx",
  import.meta.url,
)

test("city editor schema keeps values in entity tables and protects field controls", async () => {
  const sql = await readFile(migration, "utf8")
  assert.match(sql, /create table if not exists public\.city_content_field_controls/)
  assert.match(sql, /unique \(city_id, entity_type, entity_id, field_path\)/)
  assert.match(sql, /'AUTO', 'MANUAL', 'LOCKED'/)
  assert.match(sql, /revoke all on public\.city_content_field_controls from anon, authenticated/)
  assert.match(sql, /public\.is_admin\(\)/)
  assert.match(sql, /add column if not exists seo_title/)
  assert.match(sql, /add column if not exists related_guide_ids uuid\[\]/)
  assert.match(sql, /'manual_edit'/)
  assert.match(sql, /create table if not exists public\.city_editor_audit/)
})

test("field control resolver enforces automatic, manual and locked transitions", async () => {
  const source = await readFile(controls, "utf8")
  assert.match(source, /fieldControlModes = \["AUTO", "MANUAL", "LOCKED"\]/)
  assert.match(source, /currentMode === "LOCKED"/)
  assert.match(source, /locked_requires_manual/)
  assert.match(source, /locked_field/)
  assert.match(source, /auto_unlock_confirmation/)
  assert.match(source, /manual_value_edit/)
  assert.match(source, /confirmedAutoUpdate/)
})

test("content and profile editor share auth, relation validation, review gate and audit", async () => {
  const [content, profile, page, mode] = await Promise.all([
    readFile(contentAction, "utf8"),
    readFile(profileAction, "utf8"),
    readFile(editorPage, "utf8"),
    readFile(modeSelect, "utf8"),
  ])
  assert.ok(content.indexOf("await requireAdmin()") < content.indexOf("createAdminClient()"))
  assert.match(content, /loadFieldControls/)
  assert.match(content, /invalid_relation/)
  assert.match(content, /city_content_field_controls/)
  assert.match(content, /action: "manual_edit"/)
  assert.match(content, /intent === "review" \? "needs_review" : "draft"/)
  assert.doesNotMatch(content, /status\s*=\s*["']active["']/)
  assert.match(profile, /entity_type: "CITY_HOMEPAGE"/)
  assert.match(profile, /city_editor_audit/)
  assert.match(profile, /resolveFieldControl/)
  for (const label of ["CONTENT", "MEDIA", "SEO", "RELATIONS", "SOURCES", "settings"]) {
    assert.match(page, new RegExp(label))
  }
  assert.match(page, /Media Library/)
  assert.match(page, /data-city-editor-form/)
  assert.match(mode, /data-mode-control/)
})
