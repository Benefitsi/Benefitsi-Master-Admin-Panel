# Benefitsi Commerce Implementation Plan

> For agentic workers: use subagent-driven-development and verify all four worktrees before local handoff.

**Goal:** Prepare local food pickup, table reservations and service appointments with direct merchant payments and separate software billing.

**Architecture:** Responsive web flow is used by Flutter and public partner pages. Privileged admin routes own server-side validation; additive PostgreSQL RPCs enforce price snapshots, inventory locks, state changes and tenant boundaries. Stripe test-only Direct Charges replace destination charges. Feature flags default off.

**Tech Stack:** Next.js 16, React 19, Flutter, Supabase/PostgreSQL, Stripe Connect.

**Spec:** ../specs/2026-09-22-commerce-integration.md

## Global constraints

No push, deploy, remote database changes or live payments. Preserve original working directories. No copied credentials. No Benefitsi application fees or custodial wallet. Prices in integer EUR cents; all displayed times Europe/Berlin. Existing event records remain readable. Changes live in isolated codex/booking-integration-20260922 branches.

## Work packages and verification

- Database: canonical additive migration and tests/commerce/commerce_test.py in database worktree. Real disposable PostgreSQL 17 tests cover concurrency, tenant isolation, guest capabilities, immutable snapshots, Stripe event handling, billing event replay and outbox leases.
- Payments: lib/stripe direct-contracts/direct-payments/commerce-connect/software-billing; existing checkout/webhook/refund boundaries; test with node --import tsx --test tests/stripe-direct.test.mjs tests/software-billing.test.mjs. Provider accounts must be merchant/full-dashboard and fees/losses=stripe.
- Admin service: lib/commerce input validation, checkout recovery, time conversion, tenant authorization, HTTP limits, notification dispatcher; app/api/commerce and app/partner/commerce. Test requests, checkout error/replay behavior, German DST and delivery acknowledgements. Typecheck and build.
- Web: /buchen/[partnerId], /buchung/[reference], server-only proxy and capability-gated partner link; development-only synthetic demo. Test disabled defaults, unsafe URLs, stale capacity, table party sizing, authoritative demo pricing and guest cancellation. Build.
- App: opt-in booking link helper/action on partner detail; HTTPS configured origin, matching partner capability, launch failure feedback. Flutter tests and focused analysis.
- Integration: reconcile exact RPC payloads; independent cross-review of payment/database/UI boundaries; HTTP smoke for all three booking types; record browser/runtime limitations without claiming unverified visual or Stripe acceptance.

## Interface rulings

Food slots count orders. A table is exclusive, with capacity as maximum party size; remaining is availability (0/1). An appointment exclusively reserves its staff resource for duration plus buffer. Offers carry cancellation/payment notices and snapshot them onto bookings. Public status is capability-gated. Root creates guest URLs only with public_reference + random64-hex token. Notification delivery is at least once; receiver must deduplicate by outbox ID. Legacy SQL source tests use the original July fixture path; deployment uses canonical database migration after baseline, never replays July migrations.
