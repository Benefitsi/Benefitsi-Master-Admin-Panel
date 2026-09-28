# Partner SEO comparison

The admin-only `/seo/partnervergleich` page is linked from SEO & Sichtbarkeit and uses the shared blue AdminShell. It compares an existing partner website, a Benefitsi partner page, or a Google Maps profile over time. These are separate targets. This release does not enable or purchase a rank provider.

## Measurement rules

- One fixed context per target URL: Google organic or Maps, 1–50 keywords, location, locale and device. Maps additionally requires one fixed latitude/longitude search point; this is not a city-wide grid result.
- A website root without a query matches its host (with or without `www`). A specific path or query-addressed page requires the same normalized path and sorted query parameters. Maps results use the saved profile URL.
- Partner and SEO-package start dates are optional actual dates. They can be supplied once when known. Setup never substitutes today's date for an unknown historical start.
- An admin freezes the earliest available nonempty evidenced measurement as an immutable baseline. Later historical imports cannot overwrite it. If the baseline is not demonstrably before the partnership/package, the report says “Ab Messbeginn”. All-unknown observations cannot become the baseline.
- The comparison selects the newest later-day measurement up to the requested cutoff, with the same provider and method and, when known, after package start. A newer unknown/partial observation remains visible instead of reviving an older successful result.
- Numeric positions can be compared between an import and automatic tracker result using the same provider/method. Entry into or exit from the measured range requires identical known search depth. `>100` is a censored result, never position 101. Missing data is not zero.
- Keyword gains and losses are observations, not causal proof that Benefitsi caused them. Search Console averages, general web searches, and legacy ambiguous rank snapshots are excluded.

## Admin workflow

1. Choose an existing partner, enter their public target URL and fixed measurement context. Newly created targets are paused; existing target settings and provider secrets are preserved.
2. Import a genuine historical/current rank report with measurement date, provider, method, depth and original report reference. Confirm matching context. Input has no header and exactly one line per configured keyword: `Keyword;Position;Treffer-URL`. Unknown: `Keyword;?;`. Outside depth 100: `Keyword;>100;`.
3. Freeze the earliest valid baseline. Add actual partnership/package dates and completed SEO measures to the timeline.
4. Import subsequent reports or connect a provider that writes the snapshot contract below. Use the cutoff selector and CSV export to review change over time.

Before activation, the provider integration must be implemented/configured and verified against real output. No provider credentials, background schedule, or Google/Apple approval is introduced by this feature. An active target alone does not prove ranking collection is running. Existing provider readiness checks remain in force.

## Storage and authorization

Uses existing admin-RLS tables, without a schema migration:

- `seo_targets.provider_config.comparison` holds version 1 context and the frozen baseline. Updates use `updated_at` compare-and-swap. Other provider configuration is preserved. Only bounded public comparison fields reach the report.
- `seo_keyword_sets` contains a `Partnervergleich` set. The lower-name expression uniqueness index requires explicit lookup and insert/update. If that write fails after target creation, submitting the same setup repairs it.
- `seo_audit_runs` stores append-only manual evidence (`benefitsi-partner-rank-import-v1`) and dated action notes (`benefitsi-partner-seo-event-v1`). These methods are excluded from technical SEO scoring. Deterministic import IDs make exact duplicate submission idempotent. Manual evidence is labelled as an import, with confidence 0 rather than falsely asserted automated confidence.
- Every page, action and CSV route requires admin authorization. CSV is private/no-store and protects spreadsheet formula cells. No service-role key is used.
- Histories are read in target-scoped pages of 500, with a 50,000-row safety ceiling that fails explicitly rather than returning a misleading partial history.

## Automatic snapshot contract

Future collectors write `seo_rank_snapshots` with the matching target, Google engine, keyword, locale, device, exact saved location and coordinates. Organic coordinates must be null. `provider` and nonempty `provider_version` identify the source and comparable method. Each row must contain exactly one object of this type in `serp_features`:

```json
{
  "type": "benefitsi_rank_context_v1",
  "channel": "organic",
  "batch_id": "provider-run-20260928-01",
  "measured_at": "2026-09-28T09:00:00Z",
  "depth": 100
}
```

- `channel` is `organic` or `maps`. Never infer organic vs. local pack from coordinates.
- `batch_id` uses 1–80 ASCII letters, digits, `_` or `-`. All keywords in one run share the same ID, `measured_at`, method and depth. Row insertion/observation timestamps may differ. The comparison identity also includes provider, method, timestamp and depth.
- `measured_at` is an ISO timestamp with timezone (maximum 40 characters). The reporting day is Europe/Berlin. Depth is an integer 10–1000 or explicit null if unavailable.
- A ranked result requires a positive integer within known depth, matching result URL, positive confidence and coverage. Store the rank within the selected channel, not an interleaved SERP absolute position.
- A verified absence uses null rank plus `"state": "outside"` on the marker, known depth and positive confidence/coverage. Unknown or failed queries have null rank with no outside state and must still write the context marker. Write every configured keyword, including failed queries.
- Duplicate results for one keyword/run are ambiguous and stay unknown. The adapter never chooses the best duplicate.
- A failed entire run must emit context-valid unknown rows, so the last successful observation is not falsely shown as current. Unmarked legacy rows are intentionally ignored.

Tests in `tests/seo-comparison.test.mjs` cover context validation, import provenance, target isolation, partial/failed runs, provider continuity, censored comparisons, baseline immutability, pagination and CSV protection.
