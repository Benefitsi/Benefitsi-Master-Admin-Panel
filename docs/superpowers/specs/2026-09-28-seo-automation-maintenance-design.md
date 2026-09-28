# SEO automation and maintenance

Approved by Patrick on 2026-09-28: implement the four proposed free/open-source SEO building blocks and an agent that monitors and maintains them. This extends the existing blue admin shell and evidence-based partner comparison.

## Architecture
Deterministic collectors in the existing Next.js application collect technical website audits, Lighthouse/PageSpeed laboratory data, Search Console performance, Business Profile performance and weekly top-10 organic SERPs. No LLM is needed per measurement. A durable, leased database queue and atomic request ledger enforce deduplication, retries and the shared free SERP allowance. Private admin pages show configuration, observations, failures, quota and maintenance status. Supabase Cron invokes the protected worker every 15 minutes; a Codex heartbeat independently diagnoses and maintains the integration daily.

Google uses explicit OAuth connections and delegated property/location access; tokens are encrypted and server-only. Missing credentials are a visible unconfigured state. Website checks can run independently. SERPs require an explicitly confirmed free-only account allowance and stop at the configured hard cap (default 0; maximum 4500 per UTC calendar month, leaving 500 of the advertised free tier as headroom). There is no purchase, automatic plan upgrade, paid fallback or unlimited free promise.

## Data and precision
A target gets its own explicit collection settings; its existing status, provider configuration, baseline and unknown historical package dates are preserved. Organic rank context is the existing immutable keyword/location/locale/device context. Maps remains a separately labelled unsupported automatic collector until a tested provider can preserve fixed coordinates and place identity; no approximate map-pack rank is substituted. GSC averages, Google Business actions and technical audits are separate observations, never exact keyword ranks. GSC and GBP collect two adjacent finalized 28-day windows. Known sample limits remain labelled. SERP top-10 absence is >10 only after a complete valid page. Partial/failed results never become fabricated zeroes or false absences. Raw normalized SERP evidence and measurement timestamps remain reproducible. Baselines are frozen through the existing explicit admin workflow.

## Safety and scope
Admin authorization and existing RLS apply. Worker calls use a server bearer secret. All new tables deny anonymous/non-admin reads; credentials deny all browser access. Collection writes observations only and never changes public content, indexing/noindex, Google listings or customer data. Website crawling uses HTTPS, DNS/IP validation with pinned connections, bounded same-host redirects, response sizes, timeouts and page limits. Existing automation and booking routes are untouched.

## Acceptance
Real technical collection for Benefitsi and Knobi, visible in production; configured providers have tests plus live readback before being called operational. Google/API prerequisites are displayed honestly if account-owner action is required. Queue leasing, quota concurrency, cache reuse, failed and empty provider outputs, auth boundaries and data-context matching have behavioral tests. Production deployment and the recurring maintenance heartbeat are verified.
