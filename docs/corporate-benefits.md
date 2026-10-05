# Corporate benefits: inquiries, company setup and payment confirmation

Prepared on feature branches through 2026-10-05. No migration, deployment or hosted mutation is
performed by this branch. The inquiry milestone stores contact progress. The company milestone adds fixed
annual seat agreements, personal invitation links and role assignments. The new Premium action records an Admin’s explicit confirmation of externally paid annual access. These flows create no real invoice, send no mail, charge no money and renew no agreement. No production writes were performed during implementation.

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

Status and note are the only editable inquiry fields. Status values are `new`, `contacted`,
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
   When editing an inquiry, confirm no email, invitation, payment or premium grant was produced.

## Local verification

Reuse installed Node/Next 16.3.6; no dependency install/upgrade or full build.

```sh
node --import tsx --test --test-concurrency=1 tests/corporate-requests.test.mjs tests/corporate-workspace.test.mjs tests/corporate-companies.test.mjs tests/corporate-company-ui.test.mjs tests/corporate-premium.test.mjs tests/admin-navigation.test.mjs tests/admin-navigation-ui.test.mjs
node node_modules/eslint/bin/eslint.js app/companies components/corporate lib/corporate tests/corporate-*.test.mjs tests/helpers/load-typescript.mjs
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


## Company setup and management

`/companies` now also loads the current SQL catalog and a company page of 50.
`companyOffset` is an integer from 0 to 1000000; the original inquiry `status`
filter remains separate. Every page read and all five new Server Actions call
`requireAdmin()` before using its session-scoped RPC client. A corporate owner
role never grants access to these internal Admin routes.

A request card previews the current annual net quote for agreed seats and a
start date from today through today + 365 days. Creating the company freezes
seats, one calendar year and the SQL catalog snapshot. The database transitions
the original request to `proposal`, advances its timestamp and audits creation;
the action refreshes `/companies` and the new detail route. The list displays
the updated source status/time. An unsaved inquiry editor retains its draft and
blocks further writes until reload when its source timestamp changes. Dirty or
failed inquiry/setup cards remain in the same client list even when automatic
refresh removes their source from the selected status filter. A retained card
explains that absence, keeps its original raw lock and blocks stale inquiry
writes. Confirmed provisioning identifies the `proposal` transition at creation without
asserting an unseen current status; an unconfirmed response shows the prior
known source state and preserves the
identical setup retry. Unedited cards follow the refreshed filter normally.
Drafts exist only in the mounted workspace; deliberate full reload or a changed
authenticated Admin identity discards them. No persistent browser storage is used. Transport failure retains the submitted payload
and locks those fields for an identical replay. No catalog means no new setup
or substitute price. Conflict/catalog change asks for deliberate reload.

`/companies/[id]` shows frozen quote, inclusive displayed end day, current
employee/reservation/free counts and the current five-state Premium status. The Admin
can set `preparing`, `enrolling` or `paused`, and record an optional external
invoice reference of at most 160 characters. This generates no invoice or
payment assertion. Edits retain drafts and the complete microsecond token on
failure; successful edits use the new token. Conflict disables blind save.

The Admin may invite both owners and employees. A client event generates a
WebCrypto UUID and 32 random bytes encoded as 64 lowercase hexadecimal digits.
The pending identity and secret live only in a component ref. A transport error
retains both for identical retry. Only confirmed `issued` with matching ID
reveals `https://benefitsi.de/firmen/einladung#token=<secret>`, held in component
memory and offered for copy; it is never a query/path parameter, persisted,
logged, emailed or returned by the database. SQL stores only its hash. A new
invitation action clears the previous link and identity. After reload, revoke
an open invitation and create another if its link was lost.

The roster displays active roles and valid open invitations, 50 per page.
An explicit second confirmation is required for revoke/remove, including
removal of an owner. Each mutation passes the original row's microsecond token
and, for membership removal, its exact role. A stale operation shows reload
guidance. Reloading refreshes counts and hides expired reservations, freeing
capacity; released seats do not alter the fixed annual quote or dates. The
previous-page link remains usable when a removal makes a page empty.

Required company migration: `20261004182530_corporate_company_onboarding.sql`
from the database draft PR, in addition to the inquiry migration. Verify the reviewed migration and grants before rollout. New contracts used here are `admin_create_corporate_company`,
`admin_list_corporate_companies`, `admin_update_corporate_company`,
`get_corporate_company`, `issue_corporate_invitation`,
`revoke_corporate_invitation`, `remove_corporate_member` and the existing catalog.
Expected domain statuses receive German guidance; malformed/unexpected results
remain generic failures. Database authorization and lifecycle tests are the
native SQL suite in the database repository.

## Externally paid Corporate Premium

The detail route shows the invoice reference, last retained payment reference and
`not_enabled`, `scheduled`, `active`, `suspended` or `expired` using the same labels
as the company index. `premium_enabled` records the Admin's release; the database
computes effective access from that flag, current status and the Berlin period.
A company owner role alone never gives personal Premium or Admin permission.
An issued invitation confirms a link only; it does not itself prove paid access.

`setCorporatePremium` independently calls the current `requireAdmin()` guard,
then uses only that authenticated client for
`admin_set_corporate_premium(p_company_id, p_expected_updated_at, p_enabled,
p_payment_reference)`. The full raw microsecond timestamp is preserved.
The server never accepts an actor, quote, seat count or period from this form.
Activation requires one explicit `paymentConfirmed=true` field and a nonempty,
trimmed payment reference (at most 160 Unicode characters). Suspension requires
its own `suspensionConfirmed=true` and sends the empty reference. SQL preserves
the last payment evidence and independently verifies status, expiry, invoice,
actor and current lock. Only a valid `updated` result refreshes list/detail and
the current server view. Malformed replies fail closed.

The form displays the stored fixed annual amount, seats, period and invoice
beside the confirmation. It describes manual external review, never a software
bank check. Pending requests suppress duplicate submissions. Errors preserve
reference/confirmation and the original token. Conflicts block blind retry and
offer a deliberate reload. After success the confirmation clears and writes wait
for the refreshed company token. Admin or company identity changes remount the
form, clearing the prior in-memory draft and preventing stale completions from
changing the new form. No payment draft is persisted in browser storage. Existing
private subscriptions remain untouched and this is explained beside suspension.

The exact executed fixtures are copied without changes from GitHub Actions run
`37274954460` of database head
`d72d88f3a3a6adf67206b49c8166a509d31eaa1d` (118 native SQL tests passed), executed
merge `3ba657b00d133c9d86de16f2e9bc5b467c9daa1e` against main
`9294004efd54d76522b73e2507678419990ede02`:

- `tests/fixtures/corporate-premium-contract.json`: SHA256
  `28e0614bb1d4af87656ae65600d73f900d8e30ba7b2096f714b9927d939b0642`.
- Expanded `tests/fixtures/corporate/company-contract.json`: SHA256
  `527fd51363199114cc5349839f3a301a784a1b7d5d10fd4b43413b28d11d2dd6`.

They contain synthetic example.test records, five real SQL states, company index
and roster pages. Parser tests accept historical synthetic dates; effective
lifecycle decisions belong to SQL. The accepted fixture period ends on
2027-10-05 exclusively, so its displayed final day is 04.10.2027.

Required reviewed Premium migrations, in addition to the inquiry/company ones:
`20261005061145_corporate_premium_access.sql`,
`20261005061413_corporate_premium_gates.sql`, and
`20261005064059_corporate_premium_booking_history.sql`.
No migration is applied or payment confirmed in a real environment by this branch.

The feature preserves main's grouped navigation (all original thirteen links
plus Unternehmen as a separate fourteenth destination) and the current map/image
quality changes. CI retains every navigation, streaming and map regression group
and adds the Premium behavior suite to the Corporate group. Local validation uses
the existing shared Next 16.3.6 / React 19.2.4 dependency overlay without installs,
copying caches or starting a server. Full production builds run only in PR CI and
Vercel while SSD reserve remains below the requested 40–50 GiB target.
