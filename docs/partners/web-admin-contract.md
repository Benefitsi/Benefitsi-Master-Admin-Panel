# Task3 Partner Web / Admin contract (version 1)

Apply canonical `20260930090000_partner_web_admin.sql` after Task1 entitlement/owner guards. It has no dependency on the Task2 raw-SELECT access cutover. Ship this additive DB migration and the Task2 additive analytics/DST APIs before the compatible Web/App clients, then defer `20260930081101_partner_dashboard_access_cutover.sql` until those clients are deployed and verified (coordinated Task8 rollout). Do not blindly apply every timestamped migration before clients. This is a **canonical DB migration**, not an Admin-repository copy. No hosted migration, provider activation, real billing or microsite publication occurred.

## Public-safe pricing — Task5 / Task7 shared interface

`get_partner_price_catalog() -> {schema_version:1, offers:PriceOffer[]}` is granted to `anon` and `authenticated`. The DB chooses its private runtime environment. It exposes only currently valid published offers, excluding archived offers and offers referencing archived plans. Multiple published versions may be returned; callers must choose the intended version explicitly. Amounts are integer minor EUR units, monthly and VAT exclusive. Exact fields: `offer_code,version,plan_code,plan_version,addon_code,unit_amount,setup_amount,currency,billing_interval,tax_behavior,valid_from,valid_until,status:'published'`. No provider IDs, checkout credentials, customer identities, unpublished drafts or audit are returned. Publication does **not** activate Checkout or module readiness. Task5 must independently validate eligible unarchived offer/plan versions, state, environment, consent and effective rights before payment.

Authenticated `get_partner_billing_summary(p_partner_id uuid)` invokes the central membership resolver and returns `{schema_version:1,entitlements,subscription,usage,feature_exceptions,catalog}`. Scanner/revoked/foreign roles are denied. `subscription.offer` is the exact pinned offer, even when subsequently archived; it is never substituted with the latest marketing price. Subscription projection: `state,source(admin_freegrant|subscription),period_start,period_end,paid_through,cancel_at_period_end,trial_end,first_payment_at,payment_status,offer`. First payment is null until a reliable billing source exists; no term date is invented. Manual grants produce no invoice. Usage lists current reservation windows with used/reserved counts, without actor IDs or request keys. `feature_exceptions` contains active feature_key/effect/source/valid_until only, with no internal reason. Resolver `valid_until` is the earliest underlying expiry, not a guaranteed tariff end.

ADMIN TypeScript interfaces: `lib/partners/entitlements.ts` (`PriceOffer`, `BillingSummary`, `Entitlements`, `PlanPanel`). Reuse `PriceOffer` / `get_partner_price_catalog` for Task7 marketing. Do not copy amount constants. Server RPC adapters always use the ordinary session client; the only service-key call is trusted menu reservation finalization.

## Admin control plane

All mutations require current authenticated `public.is_admin()` and nonblank reason. `admin_get_partner_plan_panel(uuid)` returns billing plus scoped overrides, a limited audit summary (date/source/reason/object type; no provider payload), published plan definitions, drafts and archives. It does not grant raw SELECT on authoritative tables.

- `admin_clear_partner_entitlement_override(uuid,text,text)`: deletes only the selected current-environment `source=admin` override; appends `override_clear` audit with previous value; other sources untouched.
- `admin_save_partner_catalog_draft(p_kind text,p_payload jsonb,p_reason text) -> uuid`: creates private draft. Kind `plan` has `plan_code,version,features,limits`; kind `offer` uses the Task1 publish-offer payload.
- `admin_publish_partner_catalog_draft(uuid,text)`: locks draft, calls audited append-only Task1 publisher; existing version collision fails; draft marked published only transactionally on success.
- `admin_archive_partner_catalog_version(kind,code,version,reason)`: adds retirement registry entry and audit. Existing pinned subscriptions resolve normally; new assignments/price offers cannot refer to archived versions. Existing commercial renewals retain their pins. Free fallback cannot be archived.
- Existing `admin_grant_partner_plan` remains freegrant only. Existing commercial contracts cannot be overwritten.

## Manual management boundary

`can_manage_partner_profile(uuid)` allows Benefitsi admin, active persisted owner, or active Pro business-admin. It is intentionally independent of `team.manage`, `analytics.basic` and `menu.ai_import`. Scanner/missing/suspended/foreign membership fails closed. Menu policies are decoupled from the old feature flag. BEFORE guards on partners/deals/menus/categories/items/opening hours/socials/holidays/reward milestones cover old permissive policies and both reassignment scopes. Owner transfer remains admin controlled; item/category menu consistency is enforced (moving a category containing items fails). Consumer/public reads and admin maintenance remain. Team caps and team-only permissions continue to come from Task1. No microsite draft or publish policies changed.

## UI and AI integration

Web presets/custom inclusive date controls are converted to exact half-open Berlin instants. Today/7/30, closed previous month, DST boundaries and error statuses are covered. Monthly report and CSV use `export_partner_dashboard`, not basic read. Stats show server numbers only; feedback completed-week scope, mature cohort coverage and peak granularity remain explicit. CSV includes explicit stock/cohort/feedback scope.

AI action re-resolves entitlement before preview/confirmation, generates a trusted fresh request UUID per user operation, reserves atomically before invoking the provider, consumes success and releases technical provider failure through service-role finish RPC. The browser cannot supply/reuse a reservation key or call finalization. Success followed by failed finalization leaves its reservation for trusted reconciliation; it is not refunded. Task6 must supply stale/in-flight reconciliation, readiness/cost safeguards, and failed-attempt budgets. No provider purchase or hosted AI call was made.

## Verification

`PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH python3 tests/partner_entitlements/web_admin_test.py WebAdmin` runs actual baseline RLS/grants and all canonical entitlement migrations in an isolated socket-only PG17 cluster, then the Task3 migration. `PARTNER_WEB_BASELINE_ONLY=1` reproduces pre-change failures. Never supply a hosted DSN. Mac SysV resource cleanup must target only verified stale test segments; never remove unrelated allocations.

## Existing-account team add (Task3 UX completion)

`add_partner_team_member_by_email(p_partner_id uuid,p_email text,p_role text) returns void` is authenticated only. The RPC locks the same partner quota key, resolves fresh central rights, requires `team.manage`, and compares trimmed/lowercase email by exact equality against `auth.users` joined by immutable ID to `public.users`. It never searches `users.email`, exposes a directory/profile payload, creates an account, or sends an invitation/message. Invalid/nonexistent/wildcard email and an owner target receive generic unavailable errors. Only admin/scanner roles (the existing partner_staff role constraint) are accepted; owner reassignment is rejected. Existing team cap/sync guards run inside the same transaction. Existing member edits continue using scoped stored IDs. The addition closes the inherited raw-account-ID UI fallback without adding account onboarding or outbound communications.

`get_partner_team_members(p_partner_id uuid)` is an authenticated, `team.manage`-checked **existing-team-only** read, never a user directory. It returns only staff row ID, partner/user IDs needed for scoped edits, role, effective active flag and teammate display name/registered email. Foreign/scanner/revoked actors receive no rows/payload. This avoids showing raw user IDs as the only team identity without opening global profile reads.
