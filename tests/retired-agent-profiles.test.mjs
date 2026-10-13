import assert from "node:assert/strict"
import test from "node:test"
import { buildAgentSummaries } from "../lib/ecosystem/agent-summaries.ts"
import { normalizeRuntimeSnapshot } from "../lib/agent-control.ts"

const checkedAt = "2026-10-13T09:00:00Z"
const profile = (id, scope = "benefitsi") => ({
  id, scope, purpose: "Recorded profile", provider: "minimax", model: "MiniMax-M3.0",
  citySlug: null, automation: "manual", contextFiles: [],
  contextHealth: "unknown", runtimeHealth: "unknown", schedules: [],
})
const old = {
  checkedAt,
  runtime: { state: "stale", snapshot: {
    schemaVersion: 1, hostId: "m1-benefitsi", observedAt: "2026-10-04T20:36:00Z",
    collectorVersion: "1", profiles: [profile("ben"), profile("stamp-curator"), profile("studio"), profile("nova", "general")],
  } },
  cities: { state: "unavailable", items: [] },
  citySchedules: { state: "unavailable", items: [] },
  pipeline: { state: "unavailable", item: null },
}

test("deleted profiles do not return through configured fallback or older observations", () => {
  for (const data of [old, { ...old, runtime: { state: "unavailable", snapshot: null } }]) {
    const ids = buildAgentSummaries(data).map(item => item.id)
    assert.equal(ids.includes("stamp-curator"), false)
    assert.equal(ids.includes("studio"), false)
    assert.equal(ids.includes("ben"), true)
    assert.equal(ids.includes("benefitsi-content"), true)
  }
  assert.equal(buildAgentSummaries(old).some(item => item.id === "nova"), true)
})

test("runtime projection excludes deleted profiles without discarding remaining observations", () => {
  const normalized = normalizeRuntimeSnapshot(old.runtime.snapshot, new Date(checkedAt))
  assert.equal(normalized.state, "stale")
  assert.deepEqual(normalized.snapshot.profiles.map(item => item.id), ["ben", "nova"])
})
