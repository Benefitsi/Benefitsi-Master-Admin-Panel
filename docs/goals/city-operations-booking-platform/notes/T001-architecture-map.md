# T001 — Architecture and Evidence Map

## Current ownership map

### Benefitsi Master Admin

- Runtime: Next.js 16.2.6, React 19.2.4, Tailwind 4, Supabase SSR.
- Authentication: Supabase user session plus `users.is_admin` via `lib/admin.ts`.
- Current operational surfaces: partner management, menu approvals, microsites, analytics and system health.
- There is no city-content review route and no booking domain in this app.
- `lib/admin-data.ts` loads broad partner/admin data directly through the authenticated Supabase client. New payment and city-review work should use a dedicated server-only DAL returning minimal DTOs instead of extending this broad loader.
- `.env.local` already contains Supabase server credentials, but Stripe variables are not configured. No secret values were inspected.

### Benefitsi city web

- Public city pages and a separate basic-auth city admin already exist under `benefitsi-web`.
- `/admin/city-pages` summarizes city completeness; `/admin/city-pages/[citySlug]` lists published/derived records and community submissions.
- It is not the requested global all-city draft queue and is not integrated into Master Admin.
- Community approval currently writes directly to `city_events` with `status=active`.
- Critical contradiction: when an end time is missing, the current community route invents `start + 2 hours`. This reproduces the exact failure Ben found for the Burgentagung and must not be reused.
- City data is split across `city_events`, `city_places`, `city_playgrounds`, `city_clubs`, `city_routes`, `city_guides`, `city_challenges`, partner placements/benefits, community submissions and newsletter subscriptions.
- Public RLS exposes only active/current content. Service-role access is required to assemble a global draft/review queue unless a dedicated admin RPC/view and authenticated admin RLS are added.

### Hermes/Benefitsi MCP

- The MCP creates validated city drafts, limits a city profile to one configured city, prevents event duplicates and exposes a read-by-ID tool for Ben.
- Agent audit receipts currently live in an append-only file on the M1. Their QA verdicts and issue details are not yet persisted into Supabase, so a web dashboard cannot display the full Ben review without a new database review/audit model.

### Existing Stripe capability

- The Flutter app has Stripe client packages.
- `Benefitsi-App-publish` has a signature-verified Stripe webhook Edge Function and an idempotent analytics ingest RPC.
- That webhook normalizes billing/finance events for the Business Control Center. It does not own marketplace providers, bookable offers, inventory, reservations, orders, application fees, cancellations or booking refunds.
- Reuse its security patterns (raw body verification, event allowlist, payload digest, duplicate handling), not its analytics schema as the booking source of truth.

## Dirty-worktree collision map

The Master Admin branch `codex/admin-german-translations` already has substantial user changes.

High-collision files:

- `app/admin-shell.tsx`
- `app/admin-language.tsx`
- `app/system/page.tsx`
- `app/analytics/page.tsx`
- `lib/analytics/*`
- `lib/microsites.ts`
- several microsite components and tests

Low-collision/new-file space for the first vertical slice:

- `app/city-operations/**`
- `components/city-operations/**`
- `lib/city-operations/**`
- new goal-owned tests
- a new idempotent Supabase migration

One narrow additive navigation change in `app/admin-shell.tsx` is likely required for a usable route. It must be patched surgically after re-reading the live diff and must preserve the translation work.

## Next.js constraints confirmed from installed docs

- Route Handlers are not cached by default and are suitable for authenticated mutations/webhooks.
- Server Actions are externally reachable POST entry points and must repeat authentication, authorization and input validation inside every action.
- Next.js 16 recommends a server-only Data Access Layer that performs authorization and returns minimal DTOs.
- Secrets must remain behind server-only modules and must never be passed to Client Components.
- Request data, form data, route params and search params are untrusted inputs.

## Stripe architecture options

Official references:

- Connect overview: https://docs.stripe.com/connect/how-connect-works
- Onboarding choices: https://docs.stripe.com/connect/onboarding
- Embedded onboarding: https://docs.stripe.com/connect/embedded-onboarding
- Charge models: https://docs.stripe.com/connect/charges
- Destination charges: https://docs.stripe.com/connect/destination-charges
- Webhook rules: https://docs.stripe.com/webhooks

### Connected-account onboarding

Use Stripe-hosted onboarding for the earliest fallback and embedded onboarding for the Benefitsi-branded provider experience. Both automatically track changing KYC requirements. Do not build API-only KYC forms.

Prefer current controller properties over hard-coding legacy account types. Keep the exact controller choice behind a platform configuration until Stripe platform onboarding and the liability decision are complete.

### Charge model

1. Destination charges:
   - Strongest fit for a centralized Benefitsi marketplace and branded Checkout.
   - Benefitsi collects an `application_fee_amount` and transfers the remainder.
   - Benefitsi’s platform balance bears Stripe fees, refunds and chargebacks.
2. Direct charges:
   - Provider/connected account is more clearly the payment-side seller.
   - Provider generally bears Stripe fees, refunds and chargebacks.
   - Data and webhook operations are more account-scoped and operationally more complex.
3. Separate charges and transfers:
   - Useful later for one order split across multiple providers or delayed allocation.
   - Unnecessary complexity for the first one-provider-per-booking model.

Recommendation for test-mode implementation:

- Model one provider per booking.
- Build a charge-strategy boundary and test destination charges first because it matches the requested Benefitsi-owned experience.
- Do not activate live payments until the owner accepts the platform fee/refund/chargeback responsibility and the contractual merchant-of-record presentation is reviewed.
- If providers must be the payment-side merchant, switch the strategy to direct charges without changing the booking/inventory domain.

### Webhook requirements

- Verify the exact raw request body and Stripe signature.
- Persist event IDs and make processing idempotent.
- Also guard semantic duplicates by object ID plus event type where applicable.
- Do not depend on event ordering.
- Queue expensive processing and listen only to required event types.
- Inventory reservation must be committed before Checkout creation and released by an expiry worker if payment does not complete.

## First safe vertical slice

Implement the global city review plus geography foundation before Stripe:

1. Add an idempotent migration for:
   - flexible geo areas and typed relationships;
   - city-to-geo memberships;
   - normalized content review records and immutable review audit events;
   - a safe all-city review queue view/RPC;
   - review actions that never invent missing data.
2. Add a server-only Master Admin DAL with explicit minimal DTOs.
3. Add `/city-operations` with global metrics, filters and queue.
4. Add a record detail view showing draft fields, source status, issues, agent profile and audit timeline.
5. Add guarded actions for request-correction, reject/archive and publish.
6. Require an explicit, sourced end time or an explicit “end unknown” representation before an event can publish. Never synthesize an end time.
7. Seed/bridge the three existing Annweiler drafts into the queue without changing their current publication status.
8. Add tests for authorization, status transitions, city isolation, source/issue DTO minimization and the unknown-end rule.

## Verification baseline

Master Admin before goal implementation:

- `npm test`: pass, 49/49.
- `npm run lint`: pass.
- `npm run build`: pass on Next.js 16.2.6.
- Build routes contain no city operations or booking routes.
- Running baseline commands did not add new tracked product changes.

## Ambiguities for Judge

- Select the canonical repository for shared Supabase migrations. Current city schema lives in `benefitsi-web`, while the requested operational UI lives in Master Admin.
- Decide whether the first review action uses a service-role DAL after `requireAdmin`, or a dedicated security-definer RPC with explicit admin checks. The latter gives a narrower database boundary but requires proving the existing `is_admin()` contract.
- Decide the event schema representation for unknown end time. The current column is `NOT NULL`; options are nullable `end_date` plus display rules, or an explicit `time_precision/end_time_confirmed` model.
- Destination versus direct charges is a legal/financial responsibility decision for live mode. Test-mode implementation can remain strategy-based until that decision is approved.
