# SEO Automation and Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operate free-first SEO collection and independent daily maintenance inside Benefitsi's existing admin.
**Architecture:** Stateless bounded providers feed a leased persistent queue. Atomic budget reservations and shared SERP cache prevent overspending. An authenticated blue admin view configures targets, connects Google and displays real observations and actionable health.
**Tech Stack:** Next.js 16, TypeScript, Supabase Postgres/RLS/pg_cron/pg_net, Google OAuth/APIs, Bright Data optional free tier, Codex heartbeat.
**Spec:** docs/superpowers/specs/2026-09-28-seo-automation-maintenance-design.md

## Global Constraints
- No paid subscriptions, purchases, automatic paid fallback or automatic quota increases.
- SERP allowance default 0, maximum 4500 requests per UTC calendar month; each attempted external request reserves one unit atomically before network access.
- Fixed organic top-10 context; Maps automation explicitly unsupported until independently verified.
- GSC averages and Business Profile actions are never keyword-rank snapshots.
- Preserve blue AdminShell, public content/noindex, existing baselines and all unknown historical dates.
- Credentials server-only; errors and observations never contain access/refresh tokens.
- One implementation subagent at a time; controller owns integration and database changes. Independent task review and full final review are required.

### Task 1: Bounded data collectors
**Files:** Create lib/seo/collectors/{types,http,google,brightdata,crawl}.ts and tests/seo-collectors.test.mjs; no other implementation files.
**Interfaces:** Types defined in types.ts: CollectorState = ok|partial|no_data|unconfigured|auth_error|forbidden|rate_limited|timeout|invalid_response|provider_error|blocked|unsupported. Observation {state,source,method,observedAt,data:Record<string,unknown>|null,errorCode?:string}. CollectorTarget {id,canonical_url,target_type,partner_id:string|null,city_id:string|null}. GoogleCredentials {clientId,clientSecret,refreshToken}. All functions accept injectable fetcher/clock and return bounded observations without throwing provider errors.
Exports: collectGsc(target,property,credentials,options?), collectGbp(location,credentials,options?), collectPageSpeed(target,apiKey,options?), collectWebsite(target,options?), brightSearchUrl(context,keyword), fetchBrightSerp(context,keyword,credentials:{apiKey,zone},options?), rankFromSerp(config,keyword,observation). Context = Pick<ComparisonConfig,'channel'|'locale'|'location'|'device'|'latitude'|'longitude'>. rankFromSerp returns existing RankResult. Missing Google credentials => unconfigured; no network. Website only public HTTPS same host including www equivalence, up to 5 HTML pages and 15 internal-link status checks, DNS-pinned safe HTTPS fetching, bounded 2MB/page and 10s timeout. Keep prelaunch noindex as observation without changing it.
- [ ] Write behavior tests first: 403/429/malformed/empty Google responses, external-property mismatch, two distinct 28-day windows and totals vs query sample, GBP missing metrics unknown, no secrets in errors, malformed/duplicate SERP positions, 10 complete results => outside vs 7 results => unknown, matching query and mobile/localization params, URL/path matching, crawl private DNS and redirect rejection, broken links and missing titles on local response fixtures.
- [ ] Run `node --import tsx --test tests/seo-collectors.test.mjs` and record expected failures.
- [ ] Implement providers using current official docs; GSC totals and top 100 queries in each of two adjacent finalized 28-day periods, tagged averagePosition. GBP two periods from time series and clicks on call button rather than completed calls. PSI requires explicit key and retains laboratory label. Bright Data full JSON first page only, organic rank versus global mixed-SERP rank distinguished, reject query mismatch or malformed coverage. Do not fetch without credentials, do not implement quota here: controller reserves before calling fetchBrightSerp. Shared normalized SERP data can be cached across targets; no credentials in it.
- [ ] Run the provider tests; self-review and write report. Do not commit unrelated controller files, deploy, buy, change schemas or spawn agents.

### Task 2: Persistent queue, budget and worker
**Files:** Database repository new migration and tests; admin lib/seo/collection-{config,store,runner,health}.ts; app/api/seo/collect/route.ts.
**Interfaces:** collection settings keyed target_id, observations keyed run_id, leased jobs with immutable run ID and unique target/kind/period dedupe. Worker claims via RPC, finishes only with matching lease token, refuses stale completions. Request reservations keyed normalized context and seven-day period; status pending/complete/failed and normalized cache. Reserve RPC atomically locks budget row and returns cached/claimed/blocked; hard cap shared across all targets and retries.
- [ ] Test default-zero budget, concurrent last-unit reservations, no extra request on cache hit, stale worker completion, at-most-once snapshot write, paused setting, retry limits and target deletion.
- [ ] Implement service-only security-invoker RPCs, admin read policies, target settings with admin writes, credentials service-only. Generate migration filename via Supabase CLI. Apply and test in staging before production.
- [ ] Implement bounded worker (4 jobs or 220 seconds), Google token loading, safe observations, typed rank snapshots with benefitsi_rank_context_v1 and complete keyword batches. Retry transient errors at most twice with exponential delay; configuration/auth errors require intervention. Missing providers do not consume budget.
- [ ] Add guarded HTTP route and health calculation. Health must surface absent recent worker heartbeat, data freshness, quota, configuration errors and failed jobs; never infer operational from enabled flag alone.

### Task 3: Integrated admin setup and Google connection
**Files:** app/seo/automatisierung/{page,actions}.tsx or .ts as appropriate; lib/seo/google-connection.ts; app/api/seo/google/{connect,callback}/route.ts; links in existing SEO dashboard and partner comparison.
- [ ] Behavioral tests cover admin authorization, bounded settings, origin/property matching, AES-GCM token encryption, OAuth state expiry and user binding, callback replay resistance via deleted HTTP-only state cookie.
- [ ] Show current provider readiness, free-only limit/usage, last successful and failed observations, pending jobs and per-target schedule controls in existing blue AdminShell. Display GSC/GBP comparisons and audit findings with original dates and source; unknown remains unknown. Explain Google Cloud prerequisites and link Google authorization only when configured.
- [ ] Use read-only GSC scope; GBP uses Google's required business.manage scope with UI explanation and collector read-only behavior. Token encryption key server-only, fresh random state, PKCE, exact callback origin, session binding, ten-minute validity. Persist no token in public props or logs.
- [ ] Test through browser and save screenshot evidence.

### Task 4: Release and maintenance agent
**Files:** docs/seo-automation.md and release evidence under workspace docs/seo-automation-20260928; scheduler deployment configuration.
- [ ] Run scoped tests, full existing tests, lint/types/build; independent review and fix findings.
- [ ] Push reviewed admin/database PRs, attach them, merge only passing checks within user's already authorized live implementation, verify deployments.
- [ ] Enable technical checks for Benefitsi domain and Knobi existing website after live readback. Leave unavailable providers explicitly unconfigured and SERP budget 0 until free allowance verified. Configure protected Supabase cron without exposing secrets in commands/logs.
- [ ] Create daily 09:00 Europe/Berlin heartbeat in this thread. Inspect production health, stale jobs, quota and provider changes, perform bounded safe recovery, prepare tested code fixes when needed. Notify only meaningful change/failure/action, remain quiet on unchanged state. Do not send partner messages, buy, change public content/indexing or overwrite baseline.
- [ ] Verify scheduler exists, worker authenticates, unauthorized requests fail, real observations displayed and maintenance automation active. Record remaining account-owner prerequisites precisely.
