# City-Agent: Autonomous Operations with Exception-Only Review

## Goal

Make the existing City-Agent operate continuously through the existing scheduler, queue, source registry, findings, proposals, and editorial tables. Routine low-risk work should be prepared automatically; only policy-protected exceptions should reach Patrick. The current production guardrails remain unchanged until the existing shadow/re-observation gates are independently satisfied.

## Non-goals and invariants

- Do not start a manual agent, source, business, or event run.
- Do not start or reset a shadow observation.
- Do not change source cadence, source registry semantics, freshness rules, conflict/duplicate rules, or City-Agent data.
- Do not enable `GUARDED_AUTO`, public indexing, or public publication in Production.
- Do not add a parallel blog or business data model; reuse `editorial_posts`, `partners`, `partner_locations`, and `partner_opening_hours`.
- Do not add a new city or introduce Annweiler-specific branching.

## Delivery 1: reliable scheduled execution

Files:

- `app/api/automation/worker/route.ts`
- `app/api/automation/tick/route.ts`
- `lib/city-agent/runner.ts`
- `vercel.json`
- `tests/city-agent-scheduling.test.mjs`
- `tests/city-agent-source-metrics.test.mjs`
- `tests/city-agent-linkage.test.mjs`

Work:

1. Treat authenticated scheduler-worker requests as real scheduled runs by default; keep dry-run available only when explicitly requested.
2. Drain a bounded number of queued jobs per worker invocation, isolating a single failed job from the remaining queue.
3. Keep the existing daily scheduling tick and add a bounded worker cadence so due jobs are processed without changing per-module cadences.
4. Resolve scheduler links by scheduler id when present and by worker job id as a durable fallback. Preserve the database trigger as the primary correlation mechanism.
5. Add tests for scheduled GET behavior, bounded draining, failed-job isolation, and complete scheduler → worker job → agent run → result linkage.

## Delivery 2: exception-only automation policy

Files:

- `lib/city-agent/autonomy-policy.ts`
- `lib/city-agent/orchestrator.ts`
- `lib/city-agent/runner.ts`
- `tests/city-agent-autonomy-policy.test.mjs`

Work:

1. Add a pure, auditable policy classifier for routine, review-required, and blocked actions.
2. Allow only existing-entity, source-backed, low-risk field updates through the future guarded-auto path; always protect new entities, events, prices, opening hours, partner/deal changes, media rights, canonical/slug changes, deletions, and legal/safety facts.
3. Make `SHADOW`, `PRELAUNCH`, and `auto_publish_enabled=false` hard stops. A positive policy decision must never bypass the city control row or the central publishing gate.
4. Keep all decisions and reasons in the existing run audit/proposal evidence; never silently discard a rejected or escalated action.

## Delivery 3: automatic editorial drafts on existing content infrastructure

Files:

- `lib/city-agent/editorial-automation.ts`
- `lib/city-agent/runner.ts`
- `tests/city-agent-editorial-automation.test.mjs`

Work:

1. Convert verified source facts and high-confidence SEO opportunities into deterministic city editorial drafts in `editorial_posts`.
2. Bind every generated draft to its city, source URL, retrieval timestamp, and related canonical/internal links.
3. Deduplicate by a stable city/source/content hash key and never overwrite a human-authored or published post.
4. Keep generated editorial content in `draft`/`needs_review` while current production is SHADOW/PRELAUNCH. The eventual publish path remains the existing human/guarded gate.
5. Reject insufficient evidence, unsupported claims, unverified media, and event facts with unknown/ambiguous dates instead of generating copy.

## Delivery 4: exception visibility and operating documentation

Files:

- `lib/automation/data.ts`
- `app/automation/page.tsx`
- `tests/city-agent-admin.test.mjs`
- `docs/CITY_AGENT_AUTONOMOUS_OPERATIONS.md`

Work:

1. Make the existing operations screen show the exception queue, blocked reasons, source failures, stale items, editorial drafts, and the last complete scheduler chain.
2. Present a compact operating contract: Patrick only reviews flagged exceptions, while routine checks, retries, deduplication, and draft generation run automatically.
3. Document exactly which actions remain human-protected and which readiness gates must be met before a future guarded-auto pilot.

## Verification and rollout

1. Write failing tests before implementation for the worker default, link fallback, policy classifier, and editorial dedupe/evidence rules.
2. Run the focused City-Agent tests, then the full Admin test suite, lint, and production build.
3. Inspect the diff and ensure no production data, observation, or guardrail was changed.
4. Do not deploy or flip Production controls in this implementation pass. Production activation is a separate, explicit rollout after the automated chain has produced a clean natural-run proof.

