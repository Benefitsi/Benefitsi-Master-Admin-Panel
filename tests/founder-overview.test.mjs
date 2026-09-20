import assert from "node:assert/strict"
import test from "node:test"
import { normalizeFounderCount, founderActions, cityRunHealth } from "../lib/founder-overview.ts"

const count = (value) => ({ value, unavailable: value === null })
const snapshot = (changes = {}) => ({
  checkedAt: "2026-09-19T10:00:00Z", activePartners: count(0), failedJobs: count(0),
  pendingReviews: count(0), overdueSources: count(0), cityRun: null,
  cityRunUnavailable: false, ...changes,
})

test("failed, missing and malformed count responses never become a measured zero", () => {
  assert.deepEqual(normalizeFounderCount({count: 0, error: null}), count(0))
  assert.deepEqual(normalizeFounderCount({count: 3, error: {message: "denied"}}), count(null))
  assert.deepEqual(normalizeFounderCount({count: null, error: null}), count(null))
  assert.deepEqual(normalizeFounderCount({count: -1, error: null}), count(null))
})

test("today prioritizes source gaps and failures before growth, with at most three actions", () => {
  const actions = founderActions(snapshot({activePartners: count(null), failedJobs: count(2), pendingReviews: count(4), overdueSources: count(3)}))
  assert.deepEqual(actions.map(item => item.id), ["source-gap", "failed-jobs", "reviews"])
  assert.equal(new Set(actions.map(item => item.id)).size, actions.length)
  assert.ok(actions.every(item => item.href.startsWith("/") && !item.href.startsWith("/api/")))
})

test("an unmeasured or old city run is never healthy just because the dashboard loaded", () => {
  assert.equal(cityRunHealth(snapshot()), "unknown")
  assert.equal(cityRunHealth(snapshot({cityRun:{status:"succeeded",finishedAt:"2026-09-19T09:00:00Z"}})), "ok")
  assert.equal(cityRunHealth(snapshot({cityRun:{status:"succeeded",finishedAt:"2026-09-16T09:00:00Z"}})), "stale")
  assert.equal(cityRunHealth(snapshot({cityRun:{status:"succeeded",finishedAt:"2030-01-01T00:00:00Z"}})), "unknown")
  assert.equal(cityRunHealth(snapshot({cityRun:{status:"failed",finishedAt:"2026-09-19T09:00:00Z"}})), "failed")
  assert.equal(cityRunHealth(snapshot({cityRunUnavailable:true,cityRun:{status:"succeeded",finishedAt:"2026-09-19T09:00:00Z"}})), "unknown")
})

test("a quiet queue still offers a concrete next step without inventing revenue or usage", () => {
  const actions = founderActions(snapshot({cityRun:{status:"succeeded",finishedAt:"2026-09-19T09:00:00Z"}}))
  assert.ok(actions.some(item=>item.id==="partner-preparation"))
  assert.ok(actions.length <= 3)
})

test("a fresh pipeline heartbeat does not make old underlying research fresh", async () => {
  const { pipelineHealth } = await import("../lib/founder-overview.ts")
  assert.equal(pipelineHealth(snapshot()), "unknown")
  const pipeline = { technicalOk:true, lastRunAt:"2026-09-19T09:00:00Z", researchCheckedAt:"2026-09-19T08:00:00Z" }
  assert.equal(pipelineHealth(snapshot({pipeline})), "ok")
  assert.equal(pipelineHealth(snapshot({pipeline:{...pipeline,researchCheckedAt:"2026-09-10T08:00:00Z"}})), "stale")
  assert.equal(pipelineHealth(snapshot({pipeline:{...pipeline,technicalOk:false}})), "failed")
  assert.equal(pipelineHealth(snapshot({pipeline:{...pipeline,researchCheckedAt:null}})), "unknown")
})
