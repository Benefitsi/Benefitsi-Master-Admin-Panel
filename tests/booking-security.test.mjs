import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { webRoot } from "./test-paths.mjs"

const migrationUrl = new URL(
  "supabase/migrations/20260728170000_booking_marketplace_core.sql",
  webRoot,
)

test("booking migration locks inventory and makes webhook replay atomic", async () => {
  const sql = await readFile(migrationUrl, "utf8")
  for (const required of [
    "create table if not exists public.booking_providers",
    "create table if not exists public.booking_offers",
    "create table if not exists public.booking_slots",
    "create table if not exists public.bookings",
    "create table if not exists public.booking_audit",
    "create table if not exists public.stripe_webhook_events",
    "create or replace function public.create_booking_hold",
    "create or replace function public.apply_stripe_booking_event",
    "create or replace function public.apply_stripe_provider_event",
    "create or replace function public.request_booking_cancellation",
    "for update",
    "on conflict (event_id) do nothing",
    "live_stripe_event_rejected",
    "application_fee_amount",
    "too_many_active_holds",
    "to service_role",
  ]) {
    assert.ok(sql.includes(required), `missing SQL contract: ${required}`)
  }
  assert.match(
    sql,
    /select coalesce\(sum\(quantity\)[\s\S]*state = 'confirmed'[\s\S]*hold_expires_at > now\(\)/,
  )
  assert.match(
    sql,
    /if v_reserved \+ p_quantity > v_slot\.capacity then raise exception 'slot_sold_out'/,
  )
  assert.match(
    sql,
    /unique check \(char_length\(idempotency_key\) between 16 and 200\)/,
  )
  assert.ok(
    (sql.match(/where idempotency_key = p_idempotency_key/g) || []).length >= 2,
    "idempotency must be rechecked after taking the slot lock",
  )
  assert.doesNotMatch(sql, /grant\s+(select|insert|update).*to\s+(anon|authenticated)/i)
})

test("checkout uses destination charges, immutable database amounts and Stripe idempotency", async () => {
  const source = await readFile(
    new URL("../app/api/stripe/checkout/route.ts", import.meta.url),
    "utf8",
  )
  assert.match(source, /\.rpc\("create_booking_hold"/)
  assert.match(source, /application_fee_amount: hold\.applicationFeeAmount/)
  assert.match(source, /destination: hold\.stripeAccountId/)
  assert.match(source, /idempotencyKey: `benefitsi-booking-\$\{idempotencyKey\}`/)
  assert.doesNotMatch(source, /body\?\.price|body\?\.unitAmount|body\?\.fee/)
})

test("webhook verifies the raw signed payload and rejects live events", async () => {
  const source = await readFile(
    new URL("../app/api/stripe/webhook/route.ts", import.meta.url),
    "utf8",
  )
  assert.ok(source.indexOf("await request.text()") < source.indexOf("constructEvent("))
  assert.match(source, /request\.headers\.get\("stripe-signature"\)/)
  assert.match(source, /if \(event\.livemode\)/)
  assert.match(source, /\.rpc\("apply_stripe_booking_event"/)
  assert.match(source, /\.rpc\("apply_stripe_provider_event"/)
})

test("Stripe client refuses any non-test secret and Connect onboarding rechecks admin", async () => {
  const config = await readFile(
    new URL("../lib/stripe/config.ts", import.meta.url),
    "utf8",
  )
  const connect = await readFile(
    new URL("../app/api/stripe/connect/onboarding/route.ts", import.meta.url),
    "utf8",
  )
  const connectCore = await readFile(
    new URL("../lib/stripe/connect.ts", import.meta.url),
    "utf8",
  )
  const connectStatus = await readFile(
    new URL("../app/api/stripe/connect/status/route.ts", import.meta.url),
    "utf8",
  )
  const bookingPage = await readFile(
    new URL("../app/bookings/page.tsx", import.meta.url),
    "utf8",
  )
  const onboardingButton = await readFile(
    new URL(
      "../components/bookings/connect-onboarding-button.tsx",
      import.meta.url,
    ),
    "utf8",
  )
  assert.match(config, /!secret\.startsWith\("sk_test_"\)/)
  assert.match(
    config,
    /BENEFITSI_STRIPE_CONNECT_PLATFORM_READY\?\.trim\(\)\.toLowerCase\(\) ===\s*"true"/,
  )
  assert.ok(connect.indexOf("await requireAdmin()") < connect.indexOf("createAdminClient()"))
  assert.ok(
    connect.indexOf("isStripeConnectPlatformReady()") <
      connect.indexOf("createAdminClient()"),
  )
  assert.match(
    connect,
    /Stripe Connect bleibt bis zur Verifizierung der Benefitsi UG gesperrt/,
  )
  assert.match(connect, /createTestRecipientAccount/)
  assert.doesNotMatch(connect, /stripe\.accounts\.create/)
  assert.match(connectCore, /stripe\.v2\.core\.accounts\.create/)
  assert.match(connectCore, /dashboard: "express"/)
  assert.match(connectCore, /recipient:/)
  assert.match(connectCore, /stripe_transfers: \{ requested: true \}/)
  assert.match(connectCore, /fees_collector: "application"/)
  assert.match(connectCore, /losses_collector: "application"/)
  assert.match(connectCore, /configurations: \["recipient"\]/)
  assert.match(connectCore, /if \(account\.livemode\)/)
  assert.match(connectCore, /if \(link\.livemode\)/)
  assert.ok(
    connectStatus.indexOf("await requireAdmin()") <
      connectStatus.indexOf("createAdminClient()"),
  )
  assert.match(connectStatus, /mode === "refresh"/)
  assert.ok(
    connectStatus.indexOf("isStripeConnectPlatformReady()") <
      connectStatus.indexOf("createAdminClient()"),
  )
  assert.match(connectStatus, /connect_platform_not_ready/)
  assert.match(connectStatus, /\.eq\("test_mode", true\)/)
  assert.match(connectStatus, /charges_enabled: status\.transfersEnabled/)
  assert.match(connectStatus, /details_submitted: status\.transfersEnabled/)
  assert.match(bookingPage, /Connect wartet auf UG/)
  assert.match(bookingPage, /Werbeagentur oder vorläufige Ersatzdaten/)
  assert.match(onboardingButton, /if \(!enabled\)/)
  assert.match(onboardingButton, /Connect-Onboarding gesperrt/)
})

test("community moderation no longer invents a two-hour event end", async () => {
  const source = await readFile(
    new URL(
      "src/app/api/admin/city-pages/[citySlug]/community/[submissionId]/route.ts",
      webRoot,
    ),
    "utf8",
  )
  assert.doesNotMatch(source, /2 \* 60 \* 60 \* 1000/)
  assert.doesNotMatch(source, /status:\s*"active"/)
  assert.match(source, /Beginn und Ende durch eine Quelle bestätigt/)
})

test("review backfill cannot overwrite a later human decision", async () => {
  const sql = await readFile(
    new URL(
      "supabase/migrations/20260728150000_city_review_and_geo_operations.sql",
      webRoot,
    ),
    "utf8",
  )
  const guardedSeeds = sql.match(
    /and stage = 'agent_draft'\s+and verdict = 'unreviewed'/g,
  )
  assert.equal(guardedSeeds?.length, 3)
})

test("operations migration makes cancellation and refund attachment idempotent and service-only", async () => {
  const sql = await readFile(
    new URL(
      "supabase/migrations/20260728190000_booking_operations.sql",
      webRoot,
    ),
    "utf8",
  )
  assert.match(sql, /v_booking\.state in \('confirmed', 'cancel_requested'\)/)
  assert.match(sql, /v_booking\.state <> 'cancel_requested'/)
  assert.match(sql, /create or replace function public\.mark_booking_refund_pending/)
  assert.match(sql, /different_refund_already_attached/)
  assert.match(
    sql,
    /revoke all on function public\.mark_booking_refund_pending[\s\S]*from public, anon, authenticated/,
  )
  assert.match(
    sql,
    /grant execute on function public\.mark_booking_refund_pending[\s\S]*to service_role/,
  )
})

test("provider service-role reads occur only after portal identity and partner scope checks", async () => {
  const source = await readFile(
    new URL("../lib/bookings/provider-data.ts", import.meta.url),
    "utf8",
  )
  const context = source.slice(
    source.indexOf("export async function requireProviderBookingContext"),
  )
  assert.ok(
    context.indexOf("getPartnerPortalSession") <
      context.indexOf("createAdminClient()"),
  )
  assert.match(context, /providerQuery\.in\("partner_id", session\.partnerIds\)/)
  assert.match(context, /\.in\("provider_id", providerIds\)/)
})

test("admin refund requires explicit confirmation and test Stripe before mutation", async () => {
  const source = await readFile(
    new URL("../app/bookings/actions.ts", import.meta.url),
    "utf8",
  )
  const refund = source.slice(source.indexOf("export async function cancelOrRefundBooking"))
  assert.ok(refund.indexOf("await requireAdmin()") >= 0)
  assert.ok(refund.indexOf('formData.get("confirm") === "yes"') >= 0)
  assert.ok(
    refund.indexOf("!isStripeTestConfigured()") <
      refund.indexOf('.rpc("request_booking_cancellation"'),
  )
  assert.match(refund, /idempotencyKey: `benefitsi-refund-\$\{bookingId\}`/)
})

test("CSV export is admin-only, PII-free and neutralizes spreadsheet formulas", async () => {
  const source = await readFile(
    new URL("../app/api/bookings/export/route.ts", import.meta.url),
    "utf8",
  )
  assert.match(source, /await requireAdmin\(\)/)
  assert.match(source, /\^\[=\+\\-@\]/)
  assert.doesNotMatch(source, /customerEmail|customer_email/)
  assert.match(source, /cache-control": "private, no-store"/)
})

test("public checkout reaches Stripe only through the server-to-server shared-secret proxy", async () => {
  const master = await readFile(
    new URL("../app/api/stripe/checkout/route.ts", import.meta.url),
    "utf8",
  )
  const proxy = await readFile(
    new URL(
      "src/app/api/city/[citySlug]/bookings/checkout/route.ts",
      webRoot,
    ),
    "utf8",
  )
  assert.match(master, /timingSafeEqual/)
  assert.match(master, /x-benefitsi-booking-secret/)
  assert.ok(
    master.indexOf("requireBookingProxySecret()") <
      master.indexOf("createAdminClient()"),
  )
  assert.match(proxy, /getPublicBookingOffer\(citySlug, offerSlug\)/)
  assert.match(proxy, /quantity > slot\.remaining/)
  assert.match(proxy, /x-benefitsi-booking-secret/)
  assert.match(proxy, /cache: "no-store"/)
  assert.doesNotMatch(proxy, /STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/)
})

test("public offer loader exposes only active offers from enabled test providers", async () => {
  const source = await readFile(
    new URL(
      "src/lib/bookings/public-bookings.ts",
      webRoot,
    ),
    "utf8",
  )
  assert.match(source, /\.eq\("status", "active"\)/)
  assert.match(source, /\.eq\("test_mode", false\)/)
  assert.match(source, /\.eq\("charges_enabled", true\)/)
  assert.match(source, /\.eq\("onboarding_status", "enabled"\)/)
  assert.match(source, /holdExpiry <= now/)
  assert.doesNotMatch(source, /customer_email/)
})

test("Annweiler booking pages keep one canonical offer path and SEO entry", async () => {
  const detail = await readFile(
    new URL(
      "src/app/stadt/[citySlug]/buchen/[offerSlug]/page.tsx",
      webRoot,
    ),
    "utf8",
  )
  const sitemap = await readFile(
    new URL("src/app/sitemap.ts", webRoot),
    "utf8",
  )
  assert.match(detail, /alternates: \{ canonical \}/)
  assert.match(detail, /offer\.canonicalPath/)
  assert.match(sitemap, /content\?\.bookingOffers/)
  assert.match(sitemap, /offer\.canonicalPath/)
})
