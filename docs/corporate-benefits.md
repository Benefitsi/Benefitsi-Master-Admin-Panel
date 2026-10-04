# Corporate benefits inquiry workspace

Prepared locally on 2026-10-04. No migration, deployment or hosted mutation is
performed by this branch. The first milestone stores an inquiry and lets a real
Benefitsi admin document contact progress. It creates no employee accounts,
invitations, subscriptions, premium grants, messages, payments or billing.

## Admin route and boundaries

`/companies` uses the existing admin shell, session cookies and `requireAdmin()`
on both the page and `updateCorporateRequest` Server Action. Only the authenticated
client returned by that guard calls the RPCs. No service-role client is used and
no actor ID is read from the form. The database independently authorizes its RPCs.
The existing `NEXT_PUBLIC_SUPABASE_URL` and publishable key configuration suffices
for admin; the public web server's submission secret must remain server-only.

The status filter requests the latest 50 records (maximum supported RPC limit
100); this is a bounded queue, not a count of all records or a paginated export.
Unknown/repeated filters show a validation error without querying a misleading
empty list. Database failure, zero requests and a null quote have separate UI
states. Database details and contact data are never written to logs by this flow.

Status and note are the only editable fields. Status values are `new`, `contacted`,
`proposal`, `closed`; none implies a paid or active membership. Notes are non-null,
up to 2000 Unicode characters, and may be empty. Names, quotes and employee counts
remain the submitted snapshot. Empty/null RPC responses and malformed responses
are failures, never successful saves.

The hidden `expectedUpdatedAt` token preserves the **complete original RPC string**,
including all microseconds and timezone offset. JS Dates are used only to display
timestamps. A successful save advances that token to the returned `updated_at`;
a network/database error preserves the draft and token. A stale edit displays a
conflict and disables another save until a deliberate page reload. This protects
another admin's changes and leaves the current note visible for comparison.

## Portable database contract

Required migration: `20261004101807_corporate_benefits_interest.sql` from the
Benefitsi database repository. Private requests and status audit have RLS and no
direct client table privileges. Security-definer functions use a fixed empty
search_path and explicit execution grants.

`admin_list_corporate_benefits_requests(p_status text default null,
p_limit integer default 50)` is executable only by `authenticated`, with real
non-anonymous `auth.uid()` and `public.is_admin()`. Null status lists all; valid
statuses filter literally. Limit 1–100. The result is `{requests:[...]}` ordered
by newest creation with deterministic request-ID tie break. Each record contains:

```text
request_id, company_name, contact_name, email, city, seats, interests,
catalog_version, unit_amount_cents, total_amount_cents, status, note,
created_at, updated_at
```

`admin_update_corporate_benefits_request(p_request_id uuid,
p_expected_updated_at timestamptz,p_status text,p_note text)` has the same role
check and accepts the exact timestamp token, a strict status and non-null note
up to 2000 characters. Results are `{status:"updated",updated_at:string}`,
`{status:"conflict"}`, `{status:"not_found"}` or `{status:"invalid"}`. A no-op
returns the unchanged timestamp without audit. Every real edit strictly advances
the timestamp and atomically audits the authenticated actor with before/after
status, note and time. A service-role client cannot bypass these admin checks.

The public `get_corporate_benefits_catalog()` RPC returns catalog version
`2026-10-04.2`, EUR annual `net_reference` values, planning status, max 10000
seats and tiers 1–24:2490, 25–10000:1990 cents per seat per year.
It is available to anon/authenticated/service_role; SQL null means unavailable.
Consumers do not copy a fallback price list. Stored quote values can all be null
when no catalog version was presented. The admin displays stored cents and
version, with nonbinding net wording; gifts, meals and events cost extra.

The web server alone calls
`submit_corporate_benefits_interest(p_request_id uuid,p_company_name text,
p_contact_name text,p_email text,p_city text,p_seats integer,p_interests text[],
p_contact_consent boolean,p_catalog_version text default null)` using its secret
service-role client. This RPC does not accept actor IDs or quote fields. Inputs:
trim company/contact/city (2–160/2–120/2–120), trim+lowercase plausible email up
to 254, integral seats 1–10000, consent true, at most four entries from
`membership`, `occasions`, `team_challenges`, `business_events`. Interests are
deduplicated/sorted; contact consent version is `corporate-contact-2026-10-04.1`.
Null catalog version stores no quote; otherwise the current version must match.
Identical normalized ID/payload replays; changed payload conflicts. Max three new
requests per rolling hour and five per 24h/email; replays consume no quota.
Submission results: submitted (with replayed and request_id), conflict,
rate_limited, invalid or catalog_changed. The public API confirms actual DB
success and handles catalog unavailability without producing a fake estimate.

## Review and rollout: database → web/admin

1. Review all three branches and apply **only** the required migration through
   the existing migration process. Do not apply an unreviewed bulk `db push`.
2. Verify all four RPC signatures and execution grants in the target environment.
   Confirm requests/audit have no direct client privileges. Anon, ordinary users,
   anonymous users and service role must not list/edit inquiries; real admins can.
3. Deploy the web and admin consumers after the database. Keep the public
   submission secret out of browser bundles and the admin path.
4. With synthetic data, submit a quoted and unquoted request on the web. Confirm
   `/companies` shows the company/contact/location/seats/interests, stored price
   version and net annual amount (100 × 1990 = 199000 cents = €1990), or an
   explicit missing-quote label. Exercise status filters and the empty state.
5. Open two admin tabs. Save a status/note change in one; save from the stale
   second tab. Expect a visible refresh instruction and no overwrite. Check one
   audit entry with the authenticated actor and unchanged contact/quote data.
6. Verify keyboard/mobile layout, pending submit and preserved drafts on failure.
   Confirm no email, invitation, payment or premium grant was produced.

## Local verification

Reuse installed Node/Next 16.3.6; no dependency install/upgrade or full build.

```sh
node --import tsx --test --test-reporter=spec tests/corporate-requests.test.mjs tests/corporate-workspace.test.mjs
node node_modules/eslint/bin/eslint.js app/companies/page.tsx app/companies/actions.ts app/admin-shell.tsx lib/corporate/requests.ts components/corporate/request-editor.tsx components/corporate/request-workspace.tsx tests/corporate-requests.test.mjs tests/corporate-workspace.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

Tests exercise real form validation, Server Action/page boundaries and the actual
Supabase RPC HTTP serialization with a synthetic fetch transport. React/JSDOM
tests cover conflict/draft retention, exact token advancement and duplicate-submit
blocking. Hosted authorization/audit guarantees belong to the database suite and
the reviewed rollout checks; these frontend tests do not impersonate production
users or apply a migration. Browser review is coordinated separately; no local
server is left running by this task.

## Pricing revision approved 2026-10-04

Catalog `2026-10-04.2` uses annual net reference prices: 2490 cents per seat for
1–24 seats and 1990 cents per seat for 25–10000 seats, plus VAT. There is no
additional tier at 100 seats. The unmerged initial migration is updated before
first release; no previously stored quote is rewritten. The consent version
remains `corporate-contact-2026-10-04.1`.
