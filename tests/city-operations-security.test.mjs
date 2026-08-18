import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrationPath =
  "../../../benefitsi-web/supabase/migrations/20260728150000_city_review_and_geo_operations.sql"
const genericPublishMigrationPath =
  "../../../benefitsi-web/supabase/migrations/20260729173000_city_content_generic_publish.sql"
const communityTrackingMigrationPath =
  "../../../benefitsi-web/supabase/migrations/20260729210000_city_community_tracking.sql"
const newsletterEditorialMigrationPath =
  "../../../benefitsi-web/supabase/migrations/20260729230000_city_newsletter_editions.sql"

test("migration provides geography, review, audit and atomic review functions", async () => {
  const sql = await readFile(new URL(migrationPath, import.meta.url), "utf8")

  for (const fragment of [
    "create table if not exists public.geo_areas",
    "create table if not exists public.city_geo_areas",
    "create table if not exists public.city_content_reviews",
    "create table if not exists public.city_content_review_audit",
    "create or replace function public.transition_city_content_review",
    "create or replace function public.publish_reviewed_city_event",
    "security definer",
    "to service_role",
    "v_review.source_checked_at < now() - interval '30 days'",
    "not v_review.end_time_verified",
    "v_event.source_url !~ '^https://'",
  ]) {
    assert.match(sql, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.doesNotMatch(sql, /interval\s+'2 hours'/i)
  assert.match(
    sql,
    /revoke all on function public\.publish_reviewed_city_event[\s\S]*from public, anon, authenticated/i,
  )
})

test("server actions authenticate before service-role access and publish only by RPC", async () => {
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
  assert.doesNotMatch(publish, /\.from\("city_events"\)\s*\.update/)
  assert.match(publish, /canStartHumanPublication\(detail\.record\)/)
  assert.match(publish, /canHumanPublishReview\(detail\.record/)
  assert.doesNotMatch(publish, /canPublishReview\(detail\.record\)/)
})

test("generic city publication maps only fixed tables and preserves the strict event gate", async () => {
  const sql = await readFile(
    new URL(genericPublishMigrationPath, import.meta.url),
    "utf8",
  )

  for (const mapping of [
    "when 'places' then 'city_places'",
    "when 'playgrounds' then 'city_playgrounds'",
    "when 'clubs' then 'city_clubs'",
    "when 'routes' then 'city_routes'",
    "when 'guides' then 'city_guides'",
    "when 'challenges' then 'city_challenges'",
    "when 'benefits' then 'city_partner_benefits'",
  ]) {
    assert.match(sql, new RegExp(mapping.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
  assert.match(sql, /return public\.publish_reviewed_city_event/)
  assert.match(sql, /format\([\s\S]*%I[\s\S]*v_table_name/)
  assert.match(sql, /v_source_url !~ '\^https:\/\/'/)
  assert.match(sql, /v_expires_at is not null and v_expires_at <= now\(\)/)
  assert.match(sql, /insert into public\.city_content_review_audit/)
  assert.match(
    sql,
    /revoke all on function public\.publish_reviewed_city_content[\s\S]*from public, anon, authenticated/,
  )
  assert.doesNotMatch(sql, /p_content_type|p_table/)
})

test("admin navigation exposes the global city review", async () => {
  const shell = await readFile(
    new URL("../app/admin-shell.tsx", import.meta.url),
    "utf8",
  )
  assert.match(shell, /function CityNavigationGroup/)
  assert.match(shell, /href(?:=|:)\s*["']\/city-operations/)
  assert.match(shell, /Review & Quellen/)
  assert.doesNotMatch(shell, /label="Städte-Review"/)
})

test("central city editor keeps edits behind review and validates relations", async () => {
  const source = await readFile(
    new URL(
      "../app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions.ts",
      import.meta.url,
    ),
    "utf8",
  )

  assert.match(source, /const \{ adminSession, supabase \} = await requireAdmin\(\)/)
  assert.match(source, /\.eq\("city_id", cityId\)/)
  assert.match(source, /\.eq\("partner_id", partnerId\)/)
  assert.match(source, /intent === "review" \? "needs_review" : "draft"/)
  assert.match(source, /source_verified: sourceNeedsRecheck\s*\?\s*false/)
  assert.match(source, /end_time_verified: sourceNeedsRecheck\s*\?\s*false/)
  assert.match(source, /menschliche Freigabe bleibt unabhängig möglich/)
  assert.match(source, /enqueue_automation_job/)
  assert.match(source, /if \(auditResult\.error\)/)
  assert.match(source, /if \(queueResult\.error\)/)
  assert.doesNotMatch(source, /status\s*=\s*"active"/)
})

test("central event editor persists schedules behind the event review gate", async () => {
  const [actions, definitions, page, validation] = await Promise.all([
    readFile(
      new URL(
        "../app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../lib/city-pages/content-editor.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/city-pages/[citySlug]/content/[contentType]/[contentId]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../lib/city-pages/content-validation.ts", import.meta.url),
      "utf8",
    ),
  ])

  assert.match(definitions, /recurrence_frequency/)
  assert.match(definitions, /kind: "weekdays"/)
  assert.match(definitions, /\.from\("city_event_schedules"\)/)
  assert.match(actions, /storage !== "schedule"/)
  assert.match(actions, /\.from\("city_event_schedules"\)/)
  assert.match(actions, /status,/)
  assert.match(validation, /recurrence_validation/)
  assert.doesNotMatch(actions, /city_event_schedules"[\s\S]{0,500}status: "active"/)
  assert.match(page, /fieldset/)
  assert.match(page, /schedule_sync/)
})

test("central event editor captures planning fields without bypassing review", async () => {
  const [actions, definitions, validation] = await Promise.all([
    readFile(
      new URL(
        "../app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../lib/city-pages/content-editor.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/city-pages/content-validation.ts", import.meta.url),
      "utf8",
    ),
  ])

  for (const field of [
    "organizer_name",
    "target_groups",
    "price_type",
    "ticket_url",
    "accessibility_features",
    "arrival_info",
    "parking_info",
    "bad_weather_info",
    "is_indoor",
  ]) {
    assert.match(definitions, new RegExp(`name: "${field}"`))
  }
  assert.match(validation, /event_price_validation/)
  assert.match(validation, /event_contact_validation/)
  assert.match(actions, /intent === "review" \? "needs_review" : "draft"/)
  assert.doesNotMatch(actions, /status\s*=\s*"active"/)
})

test("central place editor validates structured hours and visit facts behind review", async () => {
  const [actions, definitions, page, validation] = await Promise.all([
    readFile(
      new URL(
        "../app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../lib/city-pages/content-editor.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/city-pages/[citySlug]/content/[contentType]/[contentId]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../lib/city-pages/content-validation.ts", import.meta.url),
      "utf8",
    ),
  ])

  assert.match(definitions, /kind: "opening_hours"/)
  assert.match(definitions, /name: "admission_type"/)
  assert.match(definitions, /name: "recommended_duration_minutes"/)
  assert.match(definitions, /name: "accessibility_features"/)
  assert.match(actions, /opening_hours:\$\{field\.name\}/)
  assert.match(actions, /closes <= opens/)
  assert.match(validation, /place_admission_validation/)
  assert.match(validation, /place_contact_validation/)
  assert.match(page, /function OpeningHoursControl/)
  assert.match(page, /geschlossen/)
  assert.doesNotMatch(actions, /status\s*=\s*"active"/)
})

test("community moderation authenticates first, uses an atomic service-role RPC and never publishes content", async () => {
  const [migration, actions, page, data] = await Promise.all([
    readFile(new URL(communityTrackingMigrationPath, import.meta.url), "utf8"),
    readFile(
      new URL("../app/city-pages/[citySlug]/community/actions.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/city-pages/[citySlug]/community/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/city-pages/community.ts", import.meta.url), "utf8"),
  ])

  assert.match(migration, /create or replace function public\.moderate_city_community_submission/)
  assert.match(migration, /for update/)
  assert.match(migration, /insert into public\.city_community_submission_audit/)
  assert.match(
    migration,
    /revoke all on function public\.moderate_city_community_submission[\s\S]*from public, anon, authenticated/,
  )
  assert.ok(actions.indexOf("await requireAdmin()") < actions.indexOf("createAdminClient()"))
  assert.match(actions, /\.rpc\("moderate_city_community_submission"/)
  assert.doesNotMatch(actions, /\.from\("city_events"\)|\.from\("city_places"\)/)
  assert.match(page, /„Angenommen“ veröffentlicht nichts/)
  assert.match(data, /contact_name,contact_email/)
  assert.match(data, /city_community_submission_audit/)
})

test("newsletter editorial actions authenticate, use gated RPCs and expose no send action", async () => {
  const [migration, actions, page] = await Promise.all([
    readFile(new URL(newsletterEditorialMigrationPath, import.meta.url), "utf8"),
    readFile(
      new URL("../app/city-pages/[citySlug]/newsletter/actions.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/city-pages/[citySlug]/newsletter/page.tsx", import.meta.url),
      "utf8",
    ),
  ])

  assert.match(migration, /p_human_gate => 'newsletter_send'/)
  assert.match(migration, /'pii_allowed', false/)
  assert.match(migration, /v_edition\.status <> 'needs_review'/)
  assert.match(migration, /'delivery_started', false/)
  assert.match(migration, /for update/)
  assert.ok(actions.indexOf("await requireAdmin()") < actions.indexOf("createAdminClient()"))
  assert.match(actions, /\.rpc\("request_city_newsletter_draft"/)
  assert.match(actions, /\.rpc\("save_city_newsletter_edition"/)
  assert.match(actions, /\.rpc\("approve_city_newsletter_edition"/)
  assert.doesNotMatch(actions, /sendTransactionalEmail|resend\.com/)
  assert.match(page, /besitzt absichtlich keinen Versand-Button/)
  assert.doesNotMatch(page, /action=\{send/)
})
