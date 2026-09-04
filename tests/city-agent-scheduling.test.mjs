import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tick = new URL("../app/api/automation/tick/route.ts", import.meta.url);
const operations = new URL("../lib/city-agent/operations.ts", import.meta.url);
const vercel = new URL("../vercel.json", import.meta.url);

test("cron tick schedules, recovers stale runs and processes a bounded number of jobs", async () => {
  const source = await readFile(tick, "utf8");
  assert.match(source, /CRON_SECRET/);
  assert.match(source, /schedule_due_city_scans/);
  assert.match(source, /recoverStaleCityAgentRuns/);
  assert.match(source, /runNextCityAgentJob/);
  assert.match(source, /CITY_AGENT_TICK_MAX_JOBS/);
  assert.match(source, /Math\.min\([^\n]+, [23]\)/);
  assert.match(source, /dryRun:\s*false/);
  assert.doesNotMatch(source, /publish_reviewed_city_content|status:\s*["']published/);
});

test("stale-run recovery is conditional, audited and retried through the queue", async () => {
  const source = await readFile(operations, "utf8");
  assert.match(source, /\.eq\("status", "running"\)/);
  assert.match(source, /staleBefore/);
  assert.match(source, /error_code: "stale_run"/);
  assert.match(source, /city_agent_run_audit/);
  assert.match(source, /fail_automation_job/);
  assert.match(source, /protected_action_executed: false/);
});

test("Vercel cron invokes authenticated daily operations jobs", async () => {
  const config = JSON.parse(await readFile(vercel, "utf8"));
  assert.ok(config.crons.some((cron) => cron.path === "/api/automation/tick" && cron.schedule === "10 4 * * *"));
  assert.ok(config.crons.some((cron) => cron.path === "/api/automation/worker" && cron.schedule === "30 4 * * *"));
});
