import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = new URL("../lib/city-agent/sources.ts", import.meta.url);
const runner = new URL("../lib/city-agent/runner.ts", import.meta.url);
const route = new URL("../app/api/automation/worker/route.ts", import.meta.url);
const contracts = new URL("../lib/city-agent/contracts.ts", import.meta.url);

test("source adapter is bounded, allowlisted and redirect-validated", async () => {
  const code = await readFile(source, "utf8");
  assert.match(code, /url\.protocol !== "https:"/);
  assert.match(code, /CITY_AGENT_APPROVED_SOURCE_HOSTS/);
  assert.match(code, /response\.url \|\| url\.toString\(\)/);
  assert.match(code, /MAX_SOURCE_BYTES = 600_000/);
  assert.match(code, /reader\.cancel\(\)/);
  assert.match(code, /M1_BRIDGE_URL/);
  assert.match(code, /action: "city-source"/);
  assert.match(code, /cityProfile/);
  assert.match(code, /orchestratorProfile/);
  assert.match(code, /reviewCityAgentProposalsThroughHermes/);
  assert.match(code, /CITY_AGENT_HERMES_REQUIRED/);
  assert.match(code, /createSourceResearchProvider/);
  assert.match(code, /Hermes-Fakten enthalten nicht exakt/);
  assert.doesNotMatch(code, /raw_html|raw_body|response_body/i);
});

test("runner claims, snapshots, proposes and completes only through the existing gates", async () => {
  const code = await readFile(runner, "utf8");
  assert.match(code, /claim_automation_job/);
  assert.match(code, /city_agent_runs/);
  assert.match(code, /city_agent_source_snapshots/);
  assert.match(code, /city_agent_proposals/);
  assert.match(code, /status: "needs_human"/);
  assert.match(code, /complete_automation_job/);
  assert.match(code, /fail_automation_job/);
  assert.match(code, /if \(status === "failed"\)/);
  assert.match(code, /provider\.fetchSource\(source\)/);
  assert.match(code, /protected_action_executed: false/);
  assert.doesNotMatch(code, /status:\s*"published"/);
  assert.doesNotMatch(code, /from\("users"\)/);
});

test("worker endpoint is cron-secret protected and exposes no service credentials", async () => {
  const code = await readFile(route, "utf8");
  assert.match(code, /CRON_SECRET/);
  assert.match(code, /secret\.length < 32/);
  assert.match(code, /timingSafeEqual/);
  assert.doesNotMatch(code, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("contracts keep confidence and risk mapping explicit", async () => {
  const code = await readFile(contracts, "utf8");
  assert.match(code, /confidenceForTrustLevel/);
  assert.match(code, /riskForTrustLevel/);
  assert.match(code, /level === "primary" \? 0\.95/);
  assert.match(code, /level === "primary" \? "medium"[\s\S]*"critical"/);
});
