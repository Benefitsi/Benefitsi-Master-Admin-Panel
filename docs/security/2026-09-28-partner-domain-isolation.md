# Partner and admin isolation verification — 2026-09-28

## Release status

Implementation verified locally against the production database, but **not deployed**.
Base: production commit `175d20ea324f6f75371c04dbc0214892caaad423`.
Target origins: `admin.benefitsi.de` and `partner.benefitsi.de`, same Vercel project.
The partner domain has not been attached yet. Supabase redirect configuration is
pending access to the production project; GitHub OAuth authorization requires
explicit user approval. Do not promote before completing the steps below.

## Implemented boundaries

- Admin access requires a verified Auth user, exact profile ID match, and boolean
  `is_admin === true`. Email and legacy UID cannot substitute for the Auth UID.
- The proxy defaults protected pages and APIs to admin-only. Service callbacks
  have exact route exceptions and retain their own secret/signature checks.
- Partner host rejects admin paths and disables admin authorization inside shared
  Server Actions. Partner operations still require ownership or active membership.
- Partner identity lookup uses only the Auth UID. Staff membership requires
  explicit `active === true`.
- Separate host-only `__Host-` session cookie names, Secure and Path=/; separate
  login/logout flows. Current sessions require one fresh sign-in after migration.
- Cross-origin redirects discard query strings. Partner commerce return URLs and
  merchant notification links use the partner origin.

## Evidence

- Full suite: **728 passed, 0 failed**. Includes identity collisions, role types,
  revoked sessions, encoded routes, direct API requests, RSC/Server Action headers,
  opposite-host login replay, cookies, recovery URLs and billing return URLs.
- Production build passed, including TypeScript checking.
- ESLint: 0 errors; one pre-existing unused `NewDealCard` warning in
  `app/partner-admin.tsx`.
- Independent read-only code review identified identity and commerce callback
  issues; these were corrected with regression coverage.
- A temporary real Auth account linked to one inactive test business was used
  with the local production server and real Supabase RLS. Admin dashboard,
  analytics, knowledge, system, exports, Stripe status, city pages and microsites
  returned 403 using the partner's authenticated session. Admin/service routes
  on the partner host returned 403. Its own partner dashboard returned 200 and
  excluded other businesses/admin navigation; admin `/partner` redirected.
- Direct PostgREST attempts to change the test user's `is_admin`, `id`, and
  `email` returned permission error 42501. A privileged analytics permission RPC
  was denied, and other admin profiles were invisible to the partner.
- Database inspection confirmed the current admin function checks Auth UID and
  authenticated users lack column grants to update/insert those protected fields.
  All 3 admin profiles and 303 existing owners matched canonical Auth IDs.
- The temporary business, Auth account and generated profile were deleted after
  validation; a follow-up query confirmed all three absent. No test email sent.

## Remaining activation steps

1. In the existing production Supabase project, preserve all current redirect
   entries and Site URL; add the two exact callbacks documented in README.
2. Verify generated recovery links actually retain those redirects. At audit
   time they fell back to the public Site URL, so this is a release dependency.
3. Deploy the reviewed commit, then attach `partner.benefitsi.de` to the existing
   Vercel project. Existing Vercel nameservers/wildcard record were observed;
   verify domain ownership, TLS and resolution rather than replacing DNS blindly.
4. Repeat anonymous and authenticated partner HTTP checks against both public
   HTTPS hosts, verify login/recovery and a real administrator's access, then
   remove all temporary test data. Confirm service callbacks retain their checks.

## Scope and residual risk

These checks cover the portal separation and observed escalation paths, not an
exhaustive penetration test or a guarantee against every future vulnerability.
Supabase advisory warnings about callable security-definer functions, anonymous
sign-ins and leaked-password protection predate this change and have not all been
remediated. Column grants currently protect the privileged user fields; the
existing server-owned-field trigger's `current_user` bypass should not be treated
as an independent security boundary without further review.

## Rollback

Before activation record the current Vercel production deployment. If the new
release fails, detach the new partner alias and restore that recorded deployment;
this also restores the previous protection level and requires a follow-up fix.
Leave existing Supabase URL entries intact. The two additional exact callbacks
can remain while investigating. No database schema migration is part of this PR.
