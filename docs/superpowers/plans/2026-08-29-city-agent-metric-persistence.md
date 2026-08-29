# City-Agent Natural Source Metrics Persistence

## Goal

Persist real source-fetch metrics on the existing productive City-Agent run,
audit, baseline, and automation-job result records, while keeping the current
SHADOW/PRELAUNCH controls, scheduler cadence, source registry, observation
data, and publication policy unchanged.

## Scope and constraints

- Change only the existing `lib/city-agent/runner.ts` persistence path and its
  focused regression coverage.
- Use the existing JSON metadata/result fields; add no table, migration,
  scheduler, source, or agent-runtime architecture.
- Count a source attempt once, and derive `successRate` from the actual source
  fetch outcome with a null rate when no source was fetched.
- Preserve manual-vs-natural run identity from the scheduler correlation data
  already attached to queued jobs.
- Never backfill historical rows or trigger a manual City-Agent run.

## Tasks

1. Add failing regression tests for 36/36, partial fetch failure, zero-fetch,
   natural scheduler dispatch, and manual-run exclusion.
2. Add the minimal metrics serialization helper and wire one computed metrics
   object through the existing run metadata, audit, baseline summary, and
   `complete_automation_job` result writes.
3. Ensure scheduled jobs are recorded as `scheduled` when their existing input
   carries scheduler correlation, while explicit non-scheduled runs remain
   `manual`/`dry_run`.
4. Run the focused and full relevant test suites, TypeScript/build checks, and
   inspect the diff to confirm unrelated Memory Stamp changes are untouched.
5. Deploy only the approved admin runner fix, inspect deployment status, and
   wait for the next natural source-fetching scheduler cycle. Do not start a
   manual run or a new observation before the natural proof is available.

## Verification evidence required

- Natural trigger is not `manual`.
- `attempted`, `succeeded`, `failed`, and `successRate` are present in the
  natural run persistence path and match real fetches.
- Scheduler → worker → agent run → result linkage remains complete.
- Historical observation rows and guardrails are unchanged.
