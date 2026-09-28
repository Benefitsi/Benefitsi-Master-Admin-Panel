# Commerce integration review and rollout

Prepared 28 September 2026 on `codex/booking-integration-20260922`. The user authorized pushing these changes for review. This is not a production rollout: no live database migration, merchant activation, app-store release, or real payment is part of the push.

## Coordinated repositories

- [Database](https://github.com/Benefitsi/benefitsi-database/tree/codex/booking-integration-20260922): additive booking, food configuration, offering settings and partner ordering gate migrations.
- [Admin](https://github.com/Benefitsi/Benefitsi-Master-Admin-Panel/tree/codex/booking-integration-20260922): scoped management, admin-only partner switch, protected APIs, direct merchant Stripe TEST checkout/refunds, separate software subscription and notification outbox.
- [Web](https://github.com/Benefitsi/benefitsi-web/tree/codex/booking-integration-20260922): menu/options/cart, pickup/delivery, reservations, guest recovery and the original Builder microsite integration.
- [Existing app](https://github.com/Benefitsi/Benefitsi-App/tree/codex/booking-integration-20260922): a single Bestellen button on the real partner detail screen, controlled by the matching partner's public catalog.

## Activation contract

Apply migrations in order in a deliberately selected test environment:

1. `20260922071813_commerce_booking_core.sql`
2. `20260927064038_commerce_food_ordering.sql`
3. `20260927091821_commerce_offering_settings.sql`
4. `20260928104706_commerce_partner_ordering_gate.sql`

Prepare matching server-only proxy configuration in Admin/Web. Global `BENEFITSI_COMMERCE_ENABLED` remains false in the examples. Stripe integration enforces test keys, direct merchant charges and explicit platform readiness. Customer funds are not collected into a Benefitsi pooled account; software billing is separate.

Every provider defaults to `food_ordering_enabled=false`. Only Benefitsi admins can grant this entitlement in **Online-Bestellungen** (`/commerce`); partners manage their own menu, images, lead times and availability. App and microsite food actions require explicit opt-in plus a usable offering. Disabling rejects new food orders while preserving existing-order status, cancellation and valid idempotent recovery. Tables and appointments remain independent.

The existing app defaults its global entry flag to true but fails closed on absent/disabled catalog flags. Its optional partner allowlist still applies. It refreshes on partner changes and app resume. This app version must first be released; subsequent partner toggles then need no app rebuild.

Benefits such as 2-for-1 still require the existing Benefitsi account/login and app redemption flow. Guest checkout does not grant account benefits. No web SSO or automatic benefit discount in the online cart is included.

## Fresh validation before push

- Web: 105 focused tests; TypeScript successful.
- Admin: 83 focused tests plus 6 server-boundary tests; TypeScript successful.
- Existing app: 24 tests; focused Flutter analysis clean.
- Database: 51 tests against a disposable local PostgreSQL cluster.

Local original Knobi microsite/menu interaction was checked in the preceding implementation pass. Full staging migration, signed native device/payment/login acceptance and notification delivery remain rollout checks. Local private snapshots, credentials, generated app-preview build and booking journals are excluded from Git. Test fixtures do not activate the real Knobi or Da Michele partner.

Earlier handoff checkpoints describe earlier local states. This document and the partner-ordering code are authoritative for the current activation contract.
