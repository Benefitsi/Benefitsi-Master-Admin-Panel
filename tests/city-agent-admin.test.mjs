import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const data = new URL("../lib/automation/data.ts", import.meta.url);
const contracts = new URL("../lib/automation/contracts.ts", import.meta.url);
const page = new URL("../app/automation/page.tsx", import.meta.url);
const actions = new URL("../app/automation/actions.ts", import.meta.url);

test("automation data loads city-agent runs, sources, proposals and audit server-side", async () => {
  const source = await readFile(data, "utf8");
  for (const table of [
    "city_agent_sources",
    "city_agent_runs",
    "city_agent_proposals",
    "city_agent_run_audit",
  ]) {
    assert.match(source, new RegExp(`from\\("${table}"\\)`));
  }
  assert.match(source, /redactAutomationPayload\(object\(row\.field_diff\)\)/);
  assert.match(source, /redactAutomationPayload\(object\(row\.proposed_payload\)\)/);
  assert.match(source, /cityAgentProposals/);
});

test("admin page shows the evidence chain and filters city-agent data", async () => {
  const source = await readFile(page, "utf8");
  for (const token of [
    "City-Agent Operations",
    "Quellenregister",
    "Letzte Stadtläufe",
    "Belegbasierte Empfehlungen",
    "fieldDiff",
    "reviewCityAgentProposal",
  ]) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")));
  }
  assert.match(source, /data\.cityAgentSources\.filter/);
  assert.match(source, /data\.cityAgentProposals\.filter/);
});

test("proposal review action updates only needs_human and writes an audit", async () => {
  const source = await readFile(actions, "utf8");
  assert.match(source, /from\("city_agent_proposals"\)/);
  assert.match(source, /\.eq\("status", "needs_human"\)/);
  assert.match(source, /from\("city_agent_run_audit"\)/);
  assert.match(source, /protected_action_executed: false/);
  assert.doesNotMatch(source, /publish_reviewed_city_content/);
});

test("automation contracts include city-agent dashboard shapes", async () => {
  const source = await readFile(contracts, "utf8");
  for (const token of ["CityAgentSourceSummary", "CityAgentRunSummary", "CityAgentProposalSummary", "CityAgentAuditEntry"]) {
    assert.match(source, new RegExp(`type ${token}`));
  }
  assert.match(source, /cityAgentProposals: CityAgentProposalSummary\[\]/);
});
