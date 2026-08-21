import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../../Benefitsi-Database/supabase/migrations/20260821151000_city_agent_scheduler_run_linkage_fix.sql",
  import.meta.url,
);

test("city-agent run lifecycle synchronizes the scheduler link by worker job", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /create or replace function public\.sync_city_agent_run_scheduler_link\(\)/);
  assert.match(sql, /update public\.city_agent_scheduler_job_links l/);
  assert.match(sql, /l\.worker_job_id = new\.job_id/);
  assert.match(sql, /agent_run_id = new\.id/);
  assert.match(sql, /v_result := case/);
  assert.match(sql, /create trigger city_agent_run_scheduler_link/);
});

test("linkage repair does not fabricate a city-agent run or touch observation windows", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.doesNotMatch(sql, /insert into public\.city_agent_runs/);
  assert.doesNotMatch(sql, /insert into public\.city_agent_shadow_windows/);
  assert.doesNotMatch(sql, /delete from public\.city_agent_shadow_windows/);
  assert.doesNotMatch(sql, /truncate/i);
});
