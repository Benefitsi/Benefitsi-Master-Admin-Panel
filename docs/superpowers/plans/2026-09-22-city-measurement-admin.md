# City Measurement Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The user authorized inline implementation; do not spawn additional agents.

**Goal:** Add source-backed city conversion and web operations panels to the existing `/analytics` admin page.

**Architecture:** Server-only loaders check both Admin and analytics rights before creating a privileged client. Pure scope/normalization helpers project the two RPC responses into bounded DTOs; independent source states keep a missing technical migration from hiding existing conversion data. The existing analytics page renders the new server component without client-side credentials or additional transport routes.

**Tech Stack:** Installed Next.js 16.3.3, React 19, TypeScript, Supabase SSR and existing service client; Node tests with tsx. No dependency changes.

**Spec:** `docs/superpowers/specs/2026-09-22-city-measurement-admin.md`

## Global Constraints

- Existing `/analytics`; German labels, `Europe/Berlin`, EUR context.
- Admin AND `business_analytics:read`; no financial permission required.
- Two fixed service-only RPC names, scoped to verified city, environment and maximum 90 Berlin calendar days.
- Unknown is never zero; technical no-observations is never healthy.
- No DB, production, browser, deployment or City-Agent changes in this subsystem.

### Task 1: Scope and trusted projection

**Files:** `lib/analytics/city-measurement-contracts.ts`, `city-measurement-filters.ts`, `city-measurement-normalize.ts`, `tests/city-measurement-contracts.test.mjs`.

**Interfaces:** `cityMeasurementWindow(filters)` returns `{from,until}` or a fixed scope reason; `normalizeCityConversion(input, scope)` and `normalizeCityWebOperations(input, scope)` validate and project aggregates. `cityVitalAssessment(metric)` computes `unknown|provisional|good|attention|measured`.

- [x] Write behavior tests with explicit spring/autumn DST endpoints, scope mismatch, malformed/non-finite counts, PII removal, valid 0, missing metrics, final p75 and sample threshold.
- [x] Run `node --import tsx --test tests/city-measurement-contracts.test.mjs`; confirm missing implementation fails.
- [x] Implement the typed functions. A 2026-10-25 one-day window must be `2026-10-24T22:00:00.000Z` to `2026-10-25T23:00:00.000Z`.
- [x] Rerun targeted tests and retain explicit nullable values.

### Task 2: Protected independent source reads

**Files:** `lib/analytics/city-measurement-loader.ts`, `tests/city-measurement-loader.test.mjs`.

**Interface:** `loadCityMeasurement(supabase, filters): Promise<CityMeasurementResult>` performs existing `getAdminSession`, permissions RPC, minimal cities query, then parallel fixed readouts. No service client is constructed for forbidden, invalid or unselected scope.

- [x] Write loader behavior tests with a deferred authorization result and inert external transport. Assert no privileged access while auth is pending; assert exact RPC arguments only after both permissions pass.
- [x] Confirm failure; implement `server-only` loader with bounded RPC aborts and independent `setup_required|unavailable|ready|empty` source results.
- [x] Run loader and contract tests, including a missing technical RPC with successful conversion source and a response for the wrong city.

### Task 3: Render and integrate

**Files:** `components/analytics/city-measurement-dashboard.tsx`, `app/analytics/page.tsx`, `tests/city-measurement-render.test.mjs`, `docs/city-measurement.md`.

**Interface:** `<CityMeasurementDashboard result={result} filters={filters} />` renders a minimal server-only view; `AnalyticsPage` starts both business and city loaders after `requireAdmin()` and renders the new section independently.

- [x] Add render tests for zero/unknown, city/date/environment controls, unavailable technical source, valid p75 vs low samples, alerts, existing queue links and Google-not-imported disclosure.
- [x] Confirm failure; implement the component using existing visual styles and semantic headings/tables. Use `/automation?city=<uuid>&status=needs_human` and `/city-operations?city=<slug>`.
- [x] Run targeted tests; then `npm run lint`, `npx tsc --noEmit`, `npm run build` with synthetic or absent environment and without copying secrets.
- [x] Update checkboxes and document source contracts and observed verification. Leave changes uncommitted for the combined root integration commit, as explicitly requested by the integration owner. Send worktree, files, tests and preserved logs; do not merge or deploy.

## Observed verification and integration handoff

27 new tests and the full 466-test suite pass. Full lint has no errors and one pre-existing partner-admin warning. TypeScript passes. The production webpack build passes with Next.js 16.3.3; default Turbopack was blocked by local child-process port binding, including the approved retry. No build configuration was changed.

The actual root-owned database migration was checked read-only for the agreed DTO, fixed route/error vocabularies, complete group bounds, retention and service-role grants. Browser and live-data validation remain with the integration owner. No DB, production or City-Agent files were edited by this subsystem.
