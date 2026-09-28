# City source freshness stage

Status: locally implemented and tested on 22 September 2026. The shipped configuration is disabled. No production migration, M1 installation, source enrollment or live run was performed for this change.

This stage uses the existing hourly `ai.benefitsi.hermes-ben-worker` dispatcher. It adds no launchd label and no Codex automation. A deterministic child process uses the respective existing `city-<slug>` profile, reads its city scope and credentials in memory, and calls only `city_freshness_inventory` and `record_city_freshness_review`. It makes no model calls.

## What it establishes

A check establishes that a registered source was fetched completely at a particular time, whether normalized readable text or approved link targets changed, and whether the **stored** source-bound field proof is expired or missing. It never asserts that source text semantically confirms business details. HTTP 200 and an unchanged hash do not renew public verification timestamps.

The database inventory returns source identifiers, exact registered URLs, city/profile bindings and limited proof metadata. It does not return users, contacts, private partner fields, source prose or credentials. Supported scopes are:

- `BUSINESS`: existing opening-hours proof rows bound to that exact `source_id` and partner. Other business facts are outside this first stage.
- `PLACE`: expiration and supported `data_freshness` metadata bound to the source's exact URL, including opening hours, pricing, access, transport and weather metadata.
- `BENEFIT`: stored expiration and verification metadata for an existing city benefit; a mismatched `source_url` is unresolved. Commercial terms, discounts and deal rules are never changed.
- `LINK`: reachability of the registered URL. Approved outgoing link target changes affect the hash, but the runner does not recursively crawl or claim that every outgoing link works. Each independently monitored link must be explicitly registered.

Source hash differences, missing proofs, expired proofs and source errors create an existing `automation_jobs` row with `status=needs_human`. The visible recommendation contains source URL and affected fields; the result contains receipt/check IDs and before/after hashes. The existing `/automation?city=<UUID>&status=needs_human` queue supports the human decision. `/city-operations?city=<slug>` provides the editorial context. The new founder measurement panel links to these existing queues. No new notification recipient or outbound message is introduced.

These are actual source observations, not claimed/completed scheduled city jobs. The code does not write `city_agent_runs`, claim another job, publish content, activate partners or reset human decisions. `public_data_changed`, `field_facts_verified` and `city_current` remain false. An identical review condition reuses its prior job, including an approved/rejected one.

## Enrollment contract

Both dispatcher configuration and database configuration must permit a source. Nothing is enrolled by the migration.

1. An existing `city_agent_city_controls` row has `city_profile=city-<slug>` and `operating_mode` other than `DISABLED`.
2. That profile already exists on M1 and its `BENEFITSI_MCP_CITY_ID` equals the inventory city ID.
3. The source has `active=true`, `enabled=true`, and `cadence` other than `manual`.
4. `parser_config` has exact JSON values `{"cadence_owner":"m1_city_freshness","interval_seconds":259200,"auto_publish":false}`. Preserve any other existing metadata.
5. `content_scope` binds the reviewed entity type and entity UUID. `LINK` can omit entity ID.
6. The URL's host is already approved by the installed MCP fetcher. That existing fetcher enforces HTTPS, public DNS, redirects, content type and size. Redirecting away from the exact registered URL is an unresolved review in this stage.
7. The global config and the individual profile entry are explicitly enabled after deployment review.

An entry owned by an existing visitor/event/club process must not be reassigned casually. This stage owns only the specifically reviewed registrations. The generic Admin source runner now excludes every explicit `cadence_owner`, as well as disabled/manual/inactive sources, before its database query limit.

Knobi and BABA remain disabled/manual under the v11 record. This change does not enable them or extend their 28 September proof expiry. Their source and entity identity, existing parser ownership and applicable host allowlist require review before any enrollment. Social feeds remain outside this release.

## Schedule and counts

The inventory computes UTC epoch-aligned 72-hour windows. An actual observation is unique per source, source revision, window and field-proof signature. The hourly dispatcher checks what is due; an ordinary run may therefore occur up to roughly one hour after the window begins. On restart it checks the current window, not a fabricated backlog of past executions. Source/proof revisions and proof expiry can make a source due again within the window.

Only an actual persisted observation marks that source/window as covered. A failed fetch is stored as `unverified`, retains the last successful fingerprint and generates review. It is attempted again in the next 72-hour window unless the source/proof revision changes; there is no separate rapid retry loop in this first stage.

Each profile has an OS lock, a maximum inventory of 200 sources and a maximum batch of 20 due sources. Remaining due sources wait for the next hourly trigger. URL fetch results, including errors, are shared within a batch when several entities use the same URL. All profiles together have a 900-second dispatcher deadline, with one child process per profile to isolate environment configuration. Profiles not started before the deadline are explicitly deferred, never counted as run.

`due`, `checked`, `failed`, `not_due`, `deferred`, `excluded`, `baseline`, `changed`, `unchanged`, `stale`, `needs_review`, `recorded` and `record_failed` are separate counts. `stale` counts sources with known expired stored proofs, not distinct businesses or individual fields. Empty coverage is `not_configured`; it is never a completed city verification. The receipt is reread by check ID after recording.

Logs are written to the existing Ben run directory and to `profiles/<profile>/logs/city-freshness/latest.json`. Source-fetch failures with recorded review are valid operational findings. RPC/write/readback failures return exit 20. The minimal shell hook logs an error and leaves the existing Ben queue workflow intact, so Ben's overall exit code alone is not a freshness-stage health signal. Missing or old profile reports require operational investigation; this release does not create a separate alert sender.

## Database and access

The accompanying database migration is `20260922083737_city_source_freshness_reviews.sql` in the Benefitsi Database repository. It creates:

- `city_source_freshness_checks`: RLS-enabled source observation table; no anon/authenticated grants.
- `city_freshness_source_state(uuid)`: internal safe proof-state helper.
- `city_freshness_inventory(text)`: safe enrollment/due inventory.
- `record_city_freshness_review(text,jsonb)`: bounded, idempotent observation and review insert.

All functions are SECURITY INVOKER with a fixed search path, require the actual `service_role`, and revoke PUBLIC/anon/authenticated execute. Inputs reject unknown keys, wrong city/profile/source revision, changed/disabled source ownership, stale receipt times and malformed evidence. The source row is locked before persistence; city controls are share-locked. The proof signature is timezone-stable. Database-derived stale/unknown fields cannot be supplied by the runner.

The SQL fixture tests the migration in a **synthetic, isolated local database**, not the full deployed schema. The production schema compatibility was checked against the current baseline and later migrations. Follow Supabase's [function privilege guidance](https://supabase.com/docs/guides/database/functions) and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) when reviewing/applying this release. After the root agent's migration review/application, run the current security advisors and read back function grants before activating M1.

## Installation review and drift handling

`install-manifest.json` is the exact proposed file list with SHA-256 values. It is not an installer. Only the new runner and disabled config are new installed runtime files. `prepare_worker_hook.py` is an offline candidate generator, not a runtime dependency.

The read-only M1 audit found the current worker hash `a455707a974fa0b021b470fe84338e57ed33c46d8b61ef406aadf84371286d7a`. The installed MCP server and event publication runner differ from the older web checkout. This release **does not copy either file**, alter the menu/content bridge, or rewrite the worker prompt. A second read-only AST inspection confirmed the existing fetch/profile/configuration function signatures without importing the modules or executing a job.

The reviewed deployment sequence is:

1. Review the SQL and changed Admin source selection/counters; apply/deploy them separately through their existing paths. Read back function/table privileges and empty/disabled inventory before enrollment.
2. Read the current installed worker and relevant runtime hashes again. Preserve a timestamped backup of those exact bytes. If the worker changed, inspect the difference and update the reviewed baseline deliberately.
3. Run the candidate generator on the **current installed worker copy**, with its reviewed SHA and a different output path. It refuses drift, altered hooks, duplicate anchors and overwriting the input. The generator is idempotent for its unchanged hook.
4. Review a byte diff: only the bounded freshness invocation before the preflight/queue-empty exit may be added. Run `bash -n` on the candidate. Recheck the live worker hash immediately before any approved replacement.
5. Copy only the manifest's two new runtime files plus the approved worker candidate. Keep the config disabled. Preserve owner/mode and verify installed hashes. Do not restart or kick launchd merely to test this.
6. After reviewed source enrollment and root approval, enable the chosen existing profile. Run a bounded source observation/readback and then observe a real hourly dispatch. Check review cards, coverage counts and that public records and human decisions did not change. This production acceptance step has not been performed here.

Rollback first sets the global config `enabled=false`; the next hourly hook exits without loading profiles or contacting Supabase. Restore the worker only from the reviewed backup if its rest has not changed since deployment. Retain observation/review history; do not drop it or reverse public content because this stage never edited such content.

## Local verification

From the Admin repository:

```sh
python3 -m unittest discover -s tools/hermes-city-freshness -p 'test_*.py' -v
python3 tools/hermes-city-freshness/city_freshness_runner.py --config tools/hermes-city-freshness/city-freshness-config.json --record
node --import tsx --test tests/city-agent-source-selection.test.mjs tests/city-agent-source-freshness.test.mjs
```

The disabled-config command must return `{"status":"disabled","profiles_run":0}` and perform no profile, credential or network access. Python tests inject fetch and record dependencies, covering source guards, city scope, changed/unchanged/failure, no secret/body leakage, batch limits, deadline accounting, receipt validation and hook drift. TypeScript behavior tests cover disabled/manual ownership and current/stale/unknown source checks, including a successful unchanged-hash check followed by failure.

For SQL, create a temporary PostgreSQL cluster with **no TCP listen address** and a database named `benefitsi_freshness_v13`. Then run from the Database repository:

```sh
psql -X -h /path/to/isolated/socket -p 55783 -d benefitsi_freshness_v13 -f supabase/tests/city_source_freshness_reviews.sql
```

The fixture refuses another database name and resets only its synthetic public schema. It verifies disabled/manual/city controls, idempotency, timezone-stable proof signatures, source-bound PLACE/BENEFIT metadata, visible actionable review, 404 handling, immutable public proofs, no fabricated queue execution, human-decision preservation and anonymous/authenticated denial. Stop the temporary cluster after the tests.
