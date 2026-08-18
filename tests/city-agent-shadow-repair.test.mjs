import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("semantic source hashing ignores retrieval metadata but keeps content changes", async () => {
  const { extractSourceFacts, diffSourceFacts } = await import("../lib/city-agent/sources.ts");
  const metadata = {
    retrievedAt: "2026-08-18T08:00:00.000Z",
    finalUrl: "https://annweiler.de/aktuell",
    httpStatus: 200,
    contentType: "text/html",
    truncated: false,
  };
  const first = extractSourceFacts(
    "<html><title>Aktuell</title><main><h1>Annweiler</h1><p>Zuletzt aktualisiert am 18.08.2026 08:00</p><p>Wochenmarkt am Freitag.</p></main></html>",
    metadata,
  );
  const second = extractSourceFacts(
    "<html><title>Aktuell</title><main><h1>Annweiler</h1><p>Zuletzt aktualisiert am 18.08.2026 11:00</p><p>Wochenmarkt am Freitag.</p></main></html>",
    { ...metadata, retrievedAt: "2026-08-18T11:00:00.000Z" },
  );
  assert.equal(first.contentHash, second.contentHash);
  assert.deepEqual(diffSourceFacts({ ...first, contentHash: "legacy-hash" }, second), {});
  const changed = extractSourceFacts(
    "<html><title>Aktuell</title><main><h1>Annweiler</h1><p>Wochenmarkt am Samstag.</p></main></html>",
    metadata,
  );
  assert.ok(Object.keys(diffSourceFacts(first, changed)).includes("textPreview"));
});

test("shadow repair migration persists the full scheduler linkage and finalization gate", async () => {
  const sql = await readFile(new URL("../../../benefitsi-web/supabase/migrations/20260818100000_city_agent_shadow_repair.sql", import.meta.url), "utf8");
  assert.match(sql, /city_agent_scheduler_job_links/);
  assert.match(sql, /scheduler_job_id/);
  assert.match(sql, /worker_job_id/);
  assert.match(sql, /agent_run_id/);
  assert.match(sql, /reconcile_city_agent_scheduler_job_links/);
  assert.match(sql, /finalize_city_agent_shadow_window/);
  assert.match(sql, /operating_mode = 'SHADOW'/);
  assert.match(sql, /auto_publish_enabled = false/);
});

test("health simulation emits a deterministic duplicate-signal fingerprint", async () => {
  const { simulateCityAgentHealth } = await import("../lib/city-agent/health.ts");
  const now = new Date("2026-08-18T00:00:00.000Z");
  const first = simulateCityAgentHealth(now);
  const second = simulateCityAgentHealth(now);
  assert.deepEqual(
    first.map(({ scenario, evaluationVersion, inputFingerprint }) => ({ scenario, evaluationVersion, inputFingerprint })),
    second.map(({ scenario, evaluationVersion, inputFingerprint }) => ({ scenario, evaluationVersion, inputFingerprint })),
  );
});
