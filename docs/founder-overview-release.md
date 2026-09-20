# Founder overview and portal boundary — release evidence

Prepared 19 September 2026 against main `161075eca8a9356c6a53add834141cca6fc3e109`.

## Behavior

The admin homepage shows at most three next operational actions, exact partner/profile and job/source counts, plus separate Admin City-run and M1 Annweiler freshness. An unreadable source is unknown, never a measured zero. Profile activation does not establish a partner contract; revenue, customer retention and personal/legal tasks are not inferred from database counts.

`loadFounderOverview` validates the current admin session itself before constructing a service client. Partners remain read through the authenticated RLS client. Production's operational tables do not grant authenticated SELECT, so their counts/status and the service-only M1 heartbeat are read on the server after this guard. Only minimal values leave the loader. No worker, RPC, queue tick, publication or payment is executed by the overview. M1 health uses `summary.health.technical_ok`; underlying `research_checked_at` remains separate from `last_run_at` and both must be within 48 hours for an up-to-date label.

Unauthenticated partner routes return to `/partner/login`, with exact route boundaries and refreshed cookies preserved. Linked partners can preview their microsite; editing/upload/publication remains admin-only to match current deployed microsite write policies. This prevents misleading editors and orphaned uploads, and does not grant new database privileges. Owner self-service publishing is not implemented by this change.

## Coupled recovery release

Production recovery currently traverses `benefitsi.de` before `admin.benefitsi.de`. The companion web change must be deployed before this admin change begins generating `https://benefitsi.de/?portal=partner`. Web must preserve only the exact single `portal=partner` selector for query and fragment recovery, retain a fixed admin destination and suppress analytics on credential-bearing URLs.

**Additional release gate:** verify the production Supabase Auth Redirect URL allowlist accepts the exact partner callback including its query string. This configuration has not been read back in this task. A helper unit test does not prove the hosted allowlist. Do not declare partner recovery end-to-end verified or deploy that callback ahead of the matching bridge/configuration. No password email was sent for these tests.

## Verification

- Final full suite after the loader correction: **323/323 passed**.
- Additional real-loader isolation and projection tests: 2/2 passed. After the service-only-table review correction, the loader and pure overview tests passed together (7/7).
- Earlier assertions in `menu-approval-regression` and `city-operations-security` referred to menu-status UI removed in main and an obsolete claim that accepting a meetup never publishes. HEAD source and newer meetup tests confirmed the current rules. Assertions now preserve the current always-published menu and meetup/editorial distinction; behavior was not changed to satisfy stale text tests.
- Selected changed TypeScript/TSX ESLint: exit 0; `tsc --noEmit`: exit 0. Production build `npm run build -- --webpack`: exit 0, all 13 static pages generated. Turbopack could not open its compiler port in this environment, so the supported Webpack build was verified. The real overview component was server-rendered with synthetic values and inspected in the browser at measured 390px and 1440px CSS widths: no horizontal overflow, three actions and correct unknown/freshness labels. This isolated component preview does not verify a hosted admin session or real metric reads.
- Next version from unchanged lockfile installation: 16.3.3. Relevant installed Next server/client and Proxy guides read.

## Rollback

A deployment rollback restores the previous admin application; no schema or data migration is part of this change. Keep the compatible web recovery bridge in place because old admin callbacks still default to the admin portal. The existing role boundary remains database-enforced. Never revert database access restrictions merely to make a hidden editor work.
