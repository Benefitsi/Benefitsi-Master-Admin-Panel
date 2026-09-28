# Partner and admin isolation verification — 2026-09-28

## Release status

PR #45 was merged and deployed as commit `bbc0d87` to production deployment
`dpl_58EVVJvxtdZypHyRZt82t2FVgUho`. `partner.benefitsi.de` is attached to the
existing Vercel project; both canonical domains resolve and serve valid HTTPS.
Supabase preserves its four existing redirect entries and Site URL, plus the two
exact portal recovery callbacks. Generated links and the live recovery callbacks
were verified successfully.

Live browser testing found that the partner form still submitted through the
admin action. This follow-up binds the form to `partnerLogin` and includes a
regression test that failed before the fix. The corrected full browser login was
verified against the local production build; repeat it after the follow-up release.

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

- Full suite: **731 passed, 0 failed**. Includes identity collisions, role types,
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

## Live verification

The real temporary non-admin partner passed the same HTTP and database isolation
checks on both canonical production HTTPS hosts. Its own dashboard returned 200;
all tested admin pages and exports returned 403. Anonymous protected pages
redirected to their correct login, APIs returned 401/403, and service endpoints
rejected requests without their secrets. Cross-host redirects discarded queries.

Both live recovery callbacks accepted a generated one-use token, redirected to
the correct reset page and issued portal-specific Secure, host-only cookies.
Token reuse was rejected and recovery did not grant the partner admin access.
The initial deployment's error log scan returned no error entries.

After deploying the login-form follow-up, repeat the real browser login and
HTTP isolation checks and delete the new temporary test identity and business.

## Scope and residual risk

These checks cover the portal separation and observed escalation paths, not an
exhaustive penetration test or a guarantee against every future vulnerability.
Supabase advisory warnings about callable security-definer functions, anonymous
sign-ins and leaked-password protection predate this change and have not all been
remediated. Column grants currently protect the privileged user fields; the
existing server-owned-field trigger's `current_user` bypass should not be treated
as an independent security boundary without further review.

## Rollback

Previous production deployment: `dpl_B3iMfVem2sUhF51KuGbZ2ohPNpYj`
(commit `e509499`). If the new
release fails, detach the new partner alias and restore that recorded deployment;
this also restores the previous protection level and requires a follow-up fix.
Leave existing Supabase URL entries intact. The two additional exact callbacks
can remain while investigating. No database schema migration is part of this PR.
