import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../../../benefitsi-web/supabase/migrations/20260815150000_city_agent_operating_system.sql",
  import.meta.url,
);
const modules = new URL("../lib/city-agent/modules.ts", import.meta.url);
const orchestrator = new URL("../lib/city-agent/orchestrator.ts", import.meta.url);
const baselineRoute = new URL("../app/api/automation/shadow-baseline/route.ts", import.meta.url);

test("Phase-1 migration creates a generic city control plane with server-only access", async () => {
  const sql = await readFile(migration, "utf8");
  for (const table of [
    "city_agent_city_controls",
    "city_agent_control_audit",
    "city_agent_schedules",
    "city_agent_findings",
    "city_agent_baselines",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  }
  assert.match(sql, /operating_mode in \('DISABLED', 'SHADOW', 'GUARDED_AUTO'\)/);
  assert.match(sql, /where slug = 'annweiler'/);
  assert.match(sql, /auto_publish_enabled = false/);
  assert.match(sql, /schedule_due_city_scans/);
  assert.doesNotMatch(sql, /grant .* to anon/);
});

test("module registry is shared and all modules remain non-publishable in Phase 1", async () => {
  const code = await readFile(modules, "utf8");
  for (const key of ["event", "news", "discovery", "business", "freshness", "route", "seo_opportunity", "editorial", "media", "qa"]) {
    assert.match(code, new RegExp(`key: \"${key}\"`));
  }
  assert.match(code, /publishableInGuardedAuto: false/);
  assert.match(code, /source\.parser_config\.agentModule/);
});

test("orchestrator has a generic guarded-auto gate and blocks shadow publication", async () => {
  const code = await readFile(orchestrator, "utf8");
  assert.match(code, /operatingMode === "GUARDED_AUTO"/);
  assert.match(code, /operatingMode === "SHADOW"/);
  assert.match(code, /confidence < 0\.98/);
  assert.match(code, /publishableInGuardedAuto/);
});

test("shadow baseline endpoint is authenticated and hard-gated to SHADOW", async () => {
  const code = await readFile(baselineRoute, "utf8");
  assert.match(code, /CRON_SECRET/);
  assert.match(code, /timingSafeEqual/);
  assert.match(code, /operating_mode !== "SHADOW"/);
  assert.match(code, /baseline: true/);
  assert.match(code, /dryRun: true/);
  assert.match(code, /maxSources: 50/);
});
