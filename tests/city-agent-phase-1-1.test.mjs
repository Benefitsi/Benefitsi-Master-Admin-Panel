import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = (name) => new URL(`../${name}`, import.meta.url);

test("Phase 1.1 migration installs the real shadow scheduler and worker path", async () => {
  const sql = await readFile(new URL("../../../benefitsi-web/supabase/migrations/20260815170000_city_agent_phase_1_1_shadow_validation.sql", import.meta.url), "utf8");
  for (const table of [
    "city_agent_scheduler_config",
    "city_agent_scheduler_tokens",
    "city_agent_scheduler_runs",
    "city_agent_health_checks",
    "city_agent_shadow_windows",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /benefitsi-city-agent-scheduler/);
  assert.match(sql, /benefitsi-city-agent-worker/);
  assert.match(sql, /\*\/15 \* \* \* \*/);
  assert.match(sql, /5,20,35,50 \* \* \* \*/);
  assert.match(sql, /auto_publish_enabled = false/);
  assert.match(sql, /interval '48 hours'/);
  assert.match(sql, /city_agent_scheduler_runs/);
  assert.match(sql, /dispatch_city_agent_worker/);
});

test("Phase 1.1 keeps source trust and extraction safety explicit", async () => {
  const trustMigration = await readFile(new URL("../../../benefitsi-web/supabase/migrations/20260815173000_city_agent_source_trust_correction.sql", import.meta.url), "utf8");
  const sources = await readFile(root("lib/city-agent/sources.ts"), "utf8");
  assert.match(trustMigration, /outdooractive/);
  assert.match(trustMigration, /mapcarta/);
  assert.match(trustMigration, /wikipedia/);
  assert.match(trustMigration, /wikimedia/);
  assert.match(sources, /retryAttempts/);
  assert.match(sources, /2 \*\* attempt/);
  assert.match(sources, /429/);
  assert.match(sources, /extractionMethod: "pdf-text"/);
  assert.match(sources, /without OCR/);
});

test("proposal audit preserves actionable changes and supersedes only no-action classes", async () => {
  const code = await readFile(root("lib/city-agent/proposal-audit.ts"), "utf8");
  const contracts = await readFile(root("lib/city-agent/contracts.ts"), "utf8");
  for (const decision of [
    "VALID_ACTIONABLE",
    "VALID_LOW_VALUE",
    "DUPLICATE",
    "INITIAL_BASELINE_NOISE",
    "OUTDATED",
    "CONFLICTING",
    "FALSE_POSITIVE",
    "ALREADY_IN_SYSTEM",
  ]) {
    assert.match(contracts, new RegExp(decision));
  }
  assert.match(code, /qualityDecision/);
  assert.match(code, /status: nextStatus/);
  assert.match(code, /review_linked/);
  assert.match(code, /snapshot\?\.change_type/);
  assert.match(code, /sourceUrlDuplicate/);
  assert.match(code, /filter\(\(item\) => item\.decision !== "REJECT"\)/);
});

test("worker authentication and health simulations are present", async () => {
  const worker = await readFile(root("app/api/automation/supabase-worker/route.ts"), "utf8");
  const health = await readFile(root("lib/city-agent/health.ts"), "utf8");
  assert.match(worker, /x-city-agent-token/);
  assert.match(worker, /createHash\("sha256"\)/);
  assert.match(worker, /city_agent_scheduler_runs/);
  assert.match(worker, /CITY_AGENT_WORKER_MAX_JOBS/);
  assert.match(worker, /maxSources: 50/);
  for (const scenario of [
    "source_unavailable",
    "scheduler_missed",
    "worker_failure",
    "publish_failure",
    "duplicate_spike",
    "review_backlog_threshold",
  ]) {
    assert.match(health, new RegExp(scenario));
  }
  assert.match(health, /CRITICAL/);
  assert.match(health, /DEGRADED/);
});

test("freshness audit uses the actual per-entity table columns", async () => {
  const code = await readFile(root("lib/city-agent/freshness-audit.ts"), "utf8");
  assert.match(code, /city_places.*id,name,last_verified_at,data_freshness/);
  assert.match(code, /city_events.*id,title,last_verified_at,freshness_ttl_days/);
  assert.match(code, /city_routes.*id,title,last_verified_at,freshness_ttl_days/);
  assert.match(code, /auditCityBusinesses/);
  assert.match(code, /instead of making one broad select fail/);
});

test("Phase 1.2 keeps source retirement auditable and business scope generic", async () => {
  const sql = await readFile(new URL("../../../benefitsi-web/supabase/migrations/20260815220000_city_agent_phase_1_2_shadow_stabilization.sql", import.meta.url), "utf8");
  const business = await readFile(root("lib/city-agent/business-audit.ts"), "utf8");
  const runner = await readFile(root("lib/city-agent/runner.ts"), "utf8");
  assert.match(sql, /city_agent_source_registry_audit/);
  assert.match(sql, /DEPRECATED/);
  assert.match(sql, /PERMANENTLY_GONE/);
  assert.match(sql, /ACCESS_BLOCKED/);
  assert.match(sql, /operating_mode = 'SHADOW'/);
  assert.match(business, /partners/);
  assert.match(business, /partner_locations/);
  assert.match(business, /partner_opening_hours/);
  assert.match(business, /IN_CITY/);
  assert.match(business, /NEARBY/);
  assert.match(business, /REGIONAL/);
  assert.match(runner, /business_audit_completed/);
  assert.match(runner, /sourceOfTruth/);
});

test("operations UI exposes attention queue and real scheduler telemetry", async () => {
  const page = await readFile(root("app/automation/page.tsx"), "utf8");
  assert.match(page, /Braucht deine Aufmerksamkeit/);
  assert.match(page, /No-Action/);
  assert.match(page, /actualTrigger/);
  assert.match(page, /Nächster Lauf/);
  assert.match(page, /run\.cityId === schedule\.cityId/);
  assert.match(page, /auditCityAgentProposalQuality/);
  assert.match(page, /simulateCityAgentHealthChecks/);
});
