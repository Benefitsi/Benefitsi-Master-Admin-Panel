import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createSourceFetchMetrics } from "../lib/city-agent/source-metrics.ts";

const runnerUrl = new URL("../lib/city-agent/runner.ts", import.meta.url);
const tickUrl = new URL("../app/api/automation/tick/route.ts", import.meta.url);
const workerUrl = new URL("../app/api/automation/worker/route.ts", import.meta.url);

test("source-fetch metrics serialize the full successful natural run", () => {
  assert.deepEqual(createSourceFetchMetrics(36, 36, 0), {
    attempted: 36,
    succeeded: 36,
    failed: 0,
    successRate: 1,
  });
});

test("source-fetch metrics serialize partial failures", () => {
  assert.deepEqual(createSourceFetchMetrics(10, 8, 2), {
    attempted: 10,
    succeeded: 8,
    failed: 2,
    successRate: 0.8,
  });
});

test("a run without source fetches has a safe null rate", () => {
  assert.deepEqual(createSourceFetchMetrics(0, 0, 0), {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    successRate: null,
  });
});

test("runner persists the same metrics object through every existing result path", async () => {
  const runner = await readFile(runnerUrl, "utf8");

  assert.match(runner, /sourceFetchAttempts/);
  assert.match(runner, /sourceFetchSuccesses/);
  assert.match(runner, /sourceFetchFailures/);
  assert.match(runner, /sourceFetchMetrics/);
  assert.match(runner, /metadata:[\s\S]*sourceFetchMetrics/);
  assert.match(runner, /addAudit\([\s\S]*sourceFetchMetrics/);
  assert.match(runner, /completeJob\([\s\S]*sourceFetchMetrics/);
});

test("natural scheduler jobs are distinguished from explicit manual runs", async () => {
  const runner = await readFile(runnerUrl, "utf8");
  const tick = await readFile(tickUrl, "utf8");
  const worker = await readFile(workerUrl, "utf8");

  assert.match(runner, /jobInput\.scheduled\s*===\s*true/);
  assert.match(runner, /jobInput\.schedulerJobId/);
  assert.match(runner, /jobInput\.schedulerRunId/);
  assert.match(runner, /trigger:\s*runTrigger/);
  assert.match(tick, /dryRun:\s*false/);
  assert.match(worker, /const dryRun\s*=\s*body\.dryRun/);
});
