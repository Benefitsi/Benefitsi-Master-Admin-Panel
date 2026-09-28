# Task 3 UI report — SEO automation and maintenance

Implemented the admin-gated `/seo/automatisierung` page inside the existing AdminShell and blue visual system. It loads the collection overview after `requireAdmin`, shows scheduler/heartbeat, queue, monthly UTC quota, provider readiness, fixed operational issues, a target selector, per-target source settings, Google connections, free-tier runtime controls, and the latest 20 runs. It links to the selected partner comparison for explicit baseline handling and adds navigation from the SEO dashboard and comparison page.

Server actions in `app/seo/automatisierung/actions.ts` gate with `requireAdmin` before creating an admin client or changing data. Settings are validated by `normalizeCollectionSettings` after reading the non-archived target; the free budget uses `normalizeFreeBudget`. Actions can configure the fixed 15-minute scheduler from server-only `CRON_SECRET`, queue due work and dispatch the protected worker, retry an eligible failed/blocked run through the RPC, and remove only the selected Google connection. They never claim a queued measurement is complete. URL notices are mapped to fixed German copy; no unknown URL text or credentials are rendered.

The history renderer uses the stored source, method, original observation time, state, and attempt count. It renders bounded website findings, separate Search Console 28-day periods and top-query samples, Google Business daily-metric coverage and partial sums, mobile Lighthouse lab values, and per-keyword organic rank states. Unknown values are shown as unknown; GSC average position is labelled separately from rank. External measured URLs link only when HTTP(S) and without embedded credentials.

Verification: `npx tsc --noEmit` passed; ESLint passed for all five edited TS/TSX files; `node --import tsx --test tests/seo-collection-config.test.mjs` passed 5/5; `git diff --check` passed. No live database, OAuth, or browser session was exercised in this UI task. Google OAuth/client and Bright Data readiness depend on server configuration; the page reports those prerequisites without presenting them as ready.

Files owned: `app/seo/automatisierung/page.tsx`, `actions.ts`, `observations.tsx`, navigation additions in `app/seo/seo-dashboard.tsx` and `app/seo/partnervergleich/page.tsx`. No database, worker, or OAuth route was edited. No new action test was added because the existing validation tests cover the shared normalizers, while an isolated action test would mirror implementation without exercising the database RPCs.

## Review round 1 correction

Stored crawl observations now distinguish absent or malformed `pages` and `findings` from valid empty arrays. The former render “Noch keine Daten”; the latter may display zero pages and no findings. GBP coverage similarly requires a valid observed-day count before displaying `0/28`; missing coverage is explicitly unknown. The Google `business.manage` permission and read-only collector explanation remains visible when OAuth is configured and the Connect buttons are available. Two unused callback parameters were removed from collector tests without changing their behavior.

Rendered-output regression tests exercised the real observation renderer and server page with only server actions, session, data fetch, and shell boundaries mocked. Before the fixes, the crawl/GBP cases failed 2/4 and the configured Google case failed 1/5 for the reported behavior. After the fixes, the command output was:

```text
$ node --experimental-test-module-mocks --import tsx --test tests/seo-collection-render.test.mjs
1..5
# tests 5
# pass 5
# fail 0

$ node --import tsx --test tests/seo-collection-config.test.mjs
1..5
# tests 5
# pass 5
# fail 0

$ node --import tsx --test tests/seo-collectors.test.mjs
1..25
# tests 25
# pass 25
# fail 0

$ npx tsc --noEmit
(exit 0; no output)

$ npx eslint app/seo/automatisierung/page.tsx app/seo/automatisierung/observations.tsx tests/seo-collection-render.test.mjs tests/seo-collectors.test.mjs
(exit 0; no output)

$ git diff --check
(exit 0; no output)
```

Node emits an experimental module-mocking warning for the focused render test. No live OAuth or production database action was run in this UI correction.
