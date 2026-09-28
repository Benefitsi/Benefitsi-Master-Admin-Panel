import assert from "node:assert/strict"
import test from "node:test"

const freshness = await import("../lib/city-agent/source-freshness.ts")
const now = new Date("2026-09-22T12:00:00Z")

test("source freshness counts an overdue failed check without declaring its facts false", () => {
  assert.equal(freshness.sourceSnapshotFreshness("daily", "2026-09-20T12:00:00Z", now), "stale")
  assert.equal(freshness.sourceSnapshotFreshness("daily", "2026-09-22T11:00:00Z", now), "current")
  assert.equal(freshness.sourceSnapshotFreshness("weekly", "2026-09-20T12:00:00Z", now), "current")
})

test("missing, future and malformed source evidence remains unknown", () => {
  for (const value of [null, "invalid", "2026-09-23T12:00:00Z"]) {
    assert.equal(freshness.sourceSnapshotFreshness("daily", value, now), "unknown")
  }
  assert.equal(freshness.sourceSnapshotFreshness("manual", "2026-09-20T12:00:00Z", now), "unknown")
})

test("an unchanged source receipt remains fresh after a later failed fetch", () => {
  assert.equal(freshness.sourceSnapshotFreshness("daily", "2026-09-01T12:00:00Z", now, "2026-09-22T11:00:00Z"), "current")
  assert.equal(freshness.sourceSnapshotFreshness("daily", "2026-09-01T12:00:00Z", now, "2026-09-20T11:00:00Z"), "stale")
})
