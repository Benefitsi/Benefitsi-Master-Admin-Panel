import assert from "node:assert/strict";
import test from "node:test";

test("all Phase 1.1 health simulations pass their expected severity", async () => {
  const { simulateCityAgentHealth } = await import("../lib/city-agent/health.ts");
  const results = simulateCityAgentHealth(new Date("2026-08-15T00:00:00.000Z"));
  assert.equal(results.length, 6);
  assert.ok(results.every((result) => result.passed));
  assert.deepEqual(
    Object.fromEntries(results.map((result) => [result.scenario, result.status])),
    {
      source_unavailable: "CRITICAL",
      scheduler_missed: "DEGRADED",
      worker_failure: "DEGRADED",
      publish_failure: "CRITICAL",
      duplicate_spike: "DEGRADED",
      review_backlog_threshold: "CRITICAL",
    },
  );
});
