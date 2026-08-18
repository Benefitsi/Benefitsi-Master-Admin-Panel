import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  canHumanPublishReview,
  canStartHumanPublication,
  humanPublicationRequirements,
} from "../lib/city-operations/contracts.ts"

function review(overrides = {}) {
  return {
    contentType: "places",
    reviewId: "b6780648-0b2c-4826-a2c4-2e8e9eb810df",
    contentStatus: "needs_review",
    stage: "agent_draft",
    changedFields: ["name"],
    ...overrides,
  }
}

test("admin can approve an editorial draft without an agent verdict or source freshness", () => {
  assert.equal(canStartHumanPublication(review()), true)
  assert.equal(canHumanPublishReview(review()), true)
  assert.equal(
    humanPublicationRequirements(review()).requiresManualVerification,
    false,
  )
})

test("high-freshness changes require an explicit manual verification", () => {
  const highFreshness = review({ changedFields: ["opening_hours"] })
  assert.equal(canStartHumanPublication(highFreshness), true)
  assert.equal(canHumanPublishReview(highFreshness), false)
  assert.equal(
    canHumanPublishReview(highFreshness, {
      source: "https://www.annweiler.de/burg-trifels/",
      note: "Öffnungszeiten am 14.08.2026 manuell geprüft.",
      confirmed: true,
    }),
    true,
  )
  assert.equal(
    canHumanPublishReview(highFreshness, {
      source: "http://example.org",
      note: "Geprüft",
      confirmed: true,
    }),
    false,
  )
})

test("terminal reviews cannot be human-published again", () => {
  for (const stage of ["published", "rejected", "archived"]) {
    assert.equal(canStartHumanPublication(review({ stage })), false)
  }
})

test("manual and locked field modes protect values from automatic overwrite", async () => {
  const source = await readFile(
    new URL("../lib/city-pages/field-controls.ts", import.meta.url),
    "utf8",
  )
  assert.match(source, /changed AUTO field becomes MANUAL/)
  assert.match(source, /currentMode === "LOCKED"/)
  assert.match(source, /error: "locked_field"/)
})

test("human publication endpoint is server-authenticated and uses a dedicated RPC", async () => {
  const source = await readFile(
    new URL("../app/city-operations/actions.ts", import.meta.url),
    "utf8",
  )
  const publish = source.slice(source.indexOf("export async function publishCityContent"))

  assert.ok(publish.indexOf("await requireAdmin()") >= 0)
  assert.ok(
    publish.indexOf("await requireAdmin()") <
      publish.indexOf("createAdminClient()"),
  )
  assert.match(publish, /\.rpc\("human_publish_city_content"/)
  assert.match(publish, /manual_verification_source/)
  assert.match(publish, /manual_verification_note/)
  assert.doesNotMatch(publish, /\.from\("city_places"\)\s*\.update/)
})

test("migration records HUMAN_APPROVED without claiming AGENT_VERIFIED", async () => {
  const sql = await readFile(
    new URL(
      "../../../benefitsi-web/supabase/migrations/20260814170000_city_human_approval_workflow.sql",
      import.meta.url,
    ),
    "utf8",
  )
  assert.match(sql, /create or replace function public\.human_publish_city_content/)
  assert.match(sql, /'publication_method', 'HUMAN_APPROVED'/)
  assert.match(sql, /'agent_verified', false/)
  assert.match(sql, /stage = 'published'/)
  assert.match(sql, /status = ''active''/)
  assert.match(sql, /insert into public\.city_content_review_audit/)
  assert.match(sql, /changed_fields/)
  assert.match(sql, /field_changes/)
  assert.match(sql, /revoke all on function public\.human_publish_city_content[\s\S]*from public, anon, authenticated/)
})

test("draft preview is protected and explicitly noindex", async () => {
  const source = await readFile(
    new URL(
      "../app/city-operations/[contentType]/[contentId]/draft-preview/page.tsx",
      import.meta.url,
    ),
    "utf8",
  )
  assert.match(source, /await requireAdmin\(\)/)
  assert.match(source, /index: false/)
  assert.match(source, /noimageindex: true/)
  assert.match(source, /record\.title/)
})

test("restore creates a new revision and uses the central human promotion path", async () => {
  const source = await readFile(
    new URL(
      "../app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions.ts",
      import.meta.url,
    ),
    "utf8",
  )
  const restore = source.slice(source.indexOf("export async function restoreCityContentField"))
  assert.match(restore, /action: "RESTORE"/)
  assert.match(restore, /await requireAdmin\(\)/)
  assert.match(restore, /before_value/)
  assert.match(restore, /after_value/)
  assert.match(restore, /publishedSnapshot/)
  assert.match(restore, /status: "needs_review"/)
  assert.match(restore, /\.rpc\("human_publish_city_content"/)
  assert.match(restore, /p_note: `restore:\$\{auditId\}`/)
  assert.ok(
    restore.indexOf("published_snapshot: publishedSnapshot") <
      restore.indexOf('.update({ [field.name]: audit.before_value ?? null, status: "needs_review"'),
  )
  assert.doesNotMatch(restore, /status: "active"/)
  assert.doesNotMatch(restore, /\.update\(\{\s*stage: "published"/)
})

test("restore promotion keeps human approval separate from agent verification", async () => {
  const sql = await readFile(
    new URL(
      "../../../benefitsi-web/supabase/migrations/20260815130000_city_restore_human_promotion.sql",
      import.meta.url,
    ),
    "utf8",
  )
  assert.match(sql, /v_is_restore boolean/)
  assert.match(sql, /v_review\.published_snapshot is null/)
  assert.match(sql, /not v_is_restore/)
  assert.match(sql, /'restored_from_revision'/)
  assert.match(sql, /'publication_method', 'HUMAN_APPROVED'/)
  assert.match(sql, /'agent_verified', false/)
  assert.match(sql, /revoke all on function public\.human_publish_city_content/)
})
