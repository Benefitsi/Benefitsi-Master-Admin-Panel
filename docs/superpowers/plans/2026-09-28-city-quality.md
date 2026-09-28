# City quality and freshness implementation plan

> For agentic workers: Use subagent-driven-development for the Admin task, then independent review. The user has approved implementation and publication; no repeated approval needed.

**Goal:** Make incomplete directory records and M1 freshness evidence actionable in the existing Admin city review.

**Architecture:** Read-only quality projection over city_places, city_agent_sources, city_source_freshness_checks and existing automation review jobs. Keep public content publication and source checks separate. Reuse editorial editors and automation decisions.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, node:test.

**Spec:** User-approved first three priorities in outputs/benefitsi-redesign-2026-09-20/city-next-steps-20260928/PRIORITAETEN-UND-PRUEFUNG.md in the parent workspace; latest user: "ok mach das jetzt".

## Global constraints

- Keep PRELAUNCH/noindex and all benefit approval gates.
- No accommodation outreach or booking changes.
- No invented contact information, hours or source confirmation.
- requireAdmin before privileged reads; no credentials or private data in output.
- Read local Next docs. Reuse existing worktree/branch. Do not deploy or merge until independent review.

## Task 1: Admin quality projection and interface

Files: create lib/city-operations/quality.ts, quality-data.ts, components/city-operations/quality-panel.tsx, tests/city-operations-quality.test.mjs; modify app/city-operations/page.tsx.

Interface: buildDirectoryQuality(places, sources, checks, now) returns bounded tasks and counts for missing address, phone, source, opening/appointment information and never/stale verification. Source rows identify owner, last check, next 72-hour fixed window, changed/failed source and stale/missing evidence. Checks must match source ID, current revision and URL. Each task links to existing content editor; source tasks link to existing automation review. Safe http(s) URLs only. Filter by city; distinguish disabled checks and load errors from healthy/empty data. HTTP success never marks facts verified. Prefer a compact collapsible section to avoid overwhelming the review queue.

- [x] Write failing tests for missing data, overdue/future dates, cross-city or outdated receipt rejection, source failure, unchanged-but-unverified, safe links, and deterministic counts.
- [x] Run `node --import tsx --test tests/city-operations-quality.test.mjs` and observe failures.
- [x] Implement pure projection, server-only bounded loader, and responsive accessible panel in the authenticated page.
- [x] Run the new tests, existing city operation/agent tests and `npx tsc --noEmit`; check build.
- [x] Prepare Task 1 commit with implementation and tests.
- [ ] Independent review and resolve findings before publication.

Task 1 verification: 19 new behavioral tests and existing city operation/agent tests pass (57/57); TypeScript and targeted ESLint pass. `npx next build --webpack` passes. Default Turbopack build cannot create its local CSS-worker port in this execution environment (`EPERM`); no configuration was changed. No browser, migration, external data write or deployment was performed by the implementer. The panel explicitly scopes itself to city/region; the queue's search/type/stage filters remain separate. Database paging and display limits expose omitted/partial rows. Editorial follow-up uses the existing 30-day review horizon; source scheduling follows fixed epoch-aligned 72-hour windows.

## Task 2: Public data corrections and complete inventory audit

Web files: src/config/annweiler-reviewed-food-facts.ts and tests/city-food-directory.test.mjs or a dedicated behavioral test. Preserve verified OSM identity aliases; Chelini at Hauptstraße 18 and 59 are distinct and require separate phones. Official Pfalz tourism lists 06346 8529 and 06346 2615 respectively. Verify current primary source first, correct only that identity, test both and a non-Annweiler case. Audit all 72 rendered entries and store missing/conflicting fields with sources in the evidence directory. Expand source checks only within the existing M1 review-only contract; do not take over sources with visitor_adapter/discovery_role owners.

## Task 3: Existing user journeys

Run account, community, newsletter and download tests; 112 baseline tests currently pass. Test actual website sessions via CUA (login requested asynchronously). Save/remove only a newly saved item, restore profile changes; never publish a test meetup as a real event. Registration/password credentials remain user entry. Record unavailable end-to-end evidence separately from passing unit/contract tests. Verify public download, anonymous protected API denial, community submission gates and responsive layout.

## Completion

Review, PRs, attach artifacts, merge/deploy latest main, live readback. Save exact verified findings and remaining dependencies to the existing Benefitsi Obsidian vault using create-only transfer.
