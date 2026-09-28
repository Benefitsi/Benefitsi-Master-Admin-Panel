# SEO collection and maintenance

Admin: https://admin.benefitsi.de/seo/automatisierung
Partner comparison: https://admin.benefitsi.de/seo/partnervergleich

The collection pipeline writes measurements only. It does not publish content, remove noindex, modify Google profiles or invent historical rankings. Existing comparison baselines and partnership/package dates remain under the explicit admin workflow.

## Components and cadence

| Component | Cadence | Prerequisite | Meaning |
|---|---|---|---|
| Website audit | Weekly | Public HTTPS URL | At most 5 pages and 15 same-host links; missing titles, noindex and link errors |
| Search Console | Daily | Google connection + delegated verified property | Two adjacent finalized 28-day periods; totals and top-100 query sample; average positions are not rank snapshots |
| Business Profile | Daily | Google connection, approved API project and delegated location | Two 28-day periods; impressions, website/call-button clicks and directions; sparse periods show coverage |
| PageSpeed/Lighthouse | Weekly | Explicit API key | Mobile laboratory metrics, not real-user measurements |
| Organic SERP | Weekly | Confirmed free-only Bright Data account + existing fixed comparison | Google organic top 10 under the saved keyword/location/locale/device conditions |
| Collection worker | Every 15 minutes | Supabase Cron + existing server CRON_SECRET | Leased, bounded queue processing and transient retries |
| Maintenance agent | Daily at 09:00 Europe/Berlin | Codex heartbeat on this task | Independent operational checks and bounded maintenance; not continuous 24/7 supervision |

Maps/grid automation is unavailable until a provider preserves the fixed coordinates and Google place identity with verified results. Manual evidenced imports remain available. A missing API response is unknown; >10 is recorded only when a complete valid top ten was inspected. GSC averages and GBP performance never enter rank snapshots.

## Cost controls

No purchase, paid fallback or automatic upgrade is implemented. The SERP allowance defaults to **0** and has an application/database maximum of **4500 requests per UTC calendar month**. An admin must confirm an eligible free-only provider allowance before setting a positive cap. This does not override provider billing: keep the external account on its free plan and count any usage from other applications against its allowance. Pricing/free-tier terms must be checked when configuring the account.

Every attempted SERP request atomically reserves one unit before network access, including retries and provider failures. No refunds mask attempted requests. Identical normalized search contexts share successful cached evidence within one UTC day. Target identity is not part of a query cache key. Cached observations keep the original measurement time. In-flight requests are deduplicated; at most three attempts per context/day and three attempts per job. No LLM is invoked per page or keyword.

Hosting and the daily Codex task use existing account resources; no new subscription is created by this implementation. Worker backlog and provider quotas are visible so cadence/capacity can be assessed before adding many partners.

## Google setup

1. Use a Benefitsi-owned Google Cloud project. Enable Search Console API, PageSpeed Insights API if used, and Business Profile Performance API after obtaining the required Business Profile API access.
2. Configure Google OAuth consent and a web application client with this exact redirect URI: `https://admin.benefitsi.de/api/seo/google/callback`. Complete Google's production verification requirements for the selected scopes and audience as applicable. Testing-mode tokens are unsuitable for unattended long-term operation.
3. Configure server-only `SEO_GOOGLE_CLIENT_ID`, `SEO_GOOGLE_CLIENT_SECRET` and a persistent 32-byte base64 `SEO_TOKEN_ENCRYPTION_KEY` in production hosting. Never use NEXT_PUBLIC prefixes or put values in screenshots, PRs or chat.
4. Connect Search Console and/or Business Profile from the admin page. GSC requests only `webmasters.readonly`. Google requires `business.manage` for the GBP API; our collector only reads performance. Each connection is explicit, encrypted with AES-GCM and private to server-role storage. The OAuth state expires in ten minutes, is bound to the signed-in admin and cookie, and is consumed atomically once.
5. Grant the connected Google identity access to each partner property/location. Enter its matching GSC property or `locations/<id>` in that target's settings. External partner websites need their owner's delegation. Domain-wide GSC queries are used only for an unscoped domain target; partner/city targets filter the exact canonical page.
6. Enable the relevant collector and verify an actual successful observation. A saved connection or enabled checkbox alone is not proof of a working provider.

References: [Google authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing), [Business Profile prerequisites](https://developers.google.com/my-business/content/prereqs), [GBP dated values](https://developers.google.com/my-business/reference/performance/rest/v1/TimeSeries), [Bright Data SERP formats](https://docs.brightdata.com/products/serp-api/features).

## Operations

Supabase project: `slscoqdhbxftcournvut`; staging: `klfaqrrbigjtcgrslkkl`.
Database migrations and behavioral rollback test live in `Benefitsi-Database-worktrees/seo-readiness-20260927`, branch `codex/seo-collector-storage-20260928`.

`read_seo_collection_health()` returns no secrets and is executable only by the service role. The authenticated admin page invokes it server-side. It reports the real last completed worker tick, its error, queue age, monthly attempts, scheduler configuration and last successful observation per enabled target/kind. Stale worker threshold is 45 minutes; data thresholds are 36 hours for daily sources and eight days for weekly ones. No successful observation is shown explicitly as missing.

`configure_seo_collection_scheduler(p_secret)` is service-only, puts the existing CRON_SECRET in Vault and idempotently configures the fixed `benefitsi-seo-collection` cron job. The job calls `dispatch_seo_collection_tick()`, which can only POST to `https://admin.benefitsi.de/api/seo/collect`. No URL parameter or user-controlled destination exists. Cron records no secret in its command. The route validates the bearer secret; the partner origin denies it. Existing editorial/city/commerce automation is separate and unchanged.

Runtime settings are in `seo_collection_runtime`; target settings in `seo_collection_settings`; leased results in `seo_collection_runs`; request accounting/cache in `seo_serp_requests`. A job completion requires the current unexpired lease and unchanged target/settings/search context. Errors that need credentials or authorization are blocked until corrected; transient errors retry with bounded backoff. The admin retry action never resets the attempt counter. Pausing a target or global runtime stops new processing; do not delete history to restart work.

For maintenance: inspect health first, investigate only changed/actionable issues, and use bounded existing retry/dispatch operations. Do not reset quota, enable paid providers, increase allowances, overwrite baselines, infer pre-partnership dates, change indexing or send partner messages. Prepare tested code fixes and a reviewable PR for failures needing code changes. Preserve a dated local maintenance log and report only meaningful changes, completion, failure or an action required from Patrick; remain quiet when state is unchanged.
