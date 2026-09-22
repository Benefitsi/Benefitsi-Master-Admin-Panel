import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import * as selection from "../lib/city-agent/source-selection.ts"

const now = new Date("2026-09-17T12:00:00.000Z")

function source(id, nextCheckAt, parserConfig = {}, cadence = "daily") {
  return {
    id,
    city_id: "b9e684e4-54b3-41ff-8f97-4426423893c2",
    slug: id,
    url: `https://example.org/${id}`,
    source_type: "official",
    trust_level: "primary",
    cadence,
    next_check_at: nextCheckAt,
    parser_config: parserConfig,
    content_scope: {},
    active: true,
    enabled: true,
  }
}

test("automatic selection leaves M1-owned sources to the monthly preflight", () => {
  assert.equal(typeof selection.selectDueAutomaticSources, "function")

  const selected = selection.selectDueAutomaticSources(
    [
      source("ordinary-null", null),
      source("m1-null", null, { cadence_owner: "m1_daily_preflight" }, "manual"),
      source("ordinary-due", "2026-09-17T11:00:00.000Z"),
      source(
        "m1-due",
        "2026-09-17T11:00:00.000Z",
        { cadence_owner: "m1_daily_preflight" },
        "manual",
      ),
      source("ordinary-future", "2026-09-18T11:00:00.000Z"),
    ],
    now,
    20,
  )

  assert.deepEqual(
    selected.map((item) => item.id),
    ["ordinary-null", "ordinary-due"],
  )
})

test("automatic selection does not fetch disabled or manual sources when due", () => {
  const due = "2026-09-16T11:00:00.000Z"
  const selected = selection.selectDueAutomaticSources([
    { ...source("knobi-disabled", due, {}, "manual"), enabled: false },
    { ...source("disabled-daily", due), enabled: false },
    { ...source("inactive-daily", due), active: false },
    source("manual-due", due, {}, "manual"),
    { ...source("activation-unknown", due), enabled: undefined },
    source("allowed", due),
  ], now, 20)
  assert.deepEqual(selected.map((row) => row.id), ["allowed"])
})

test("automatic selection leaves every explicitly owned source to its owner", () => {
  const selected = selection.selectDueAutomaticSources([
    source("freshness", null, { cadence_owner: "m1_city_freshness" }),
    source("future-owner", null, { cadence_owner: "another_city_worker" }),
    source("allowed", null),
  ], now, 20)
  assert.deepEqual(selected.map((row) => row.id), ["allowed"])
})

test("the automatic runner excludes M1 ownership before applying its query limit", async () => {
  const runner = await readFile(
    new URL("../lib/city-agent/runner.ts", import.meta.url),
    "utf8",
  )

  assert.equal(
    selection.AUTOMATIC_SOURCE_OWNER_FILTER,
    "parser_config->>cadence_owner.is.null",
  )
  const ownerFilter = runner.indexOf(
    ".or(AUTOMATIC_SOURCE_OWNER_FILTER)",
  )
  const queryLimit = runner.indexOf(
    ".limit(boundedSources(options.maxSources) * 2)",
  )
  assert.notEqual(ownerFilter, -1)
  assert.notEqual(queryLimit, -1)
  assert.ok(ownerFilter < queryLimit)
  assert.match(runner, /selectDueAutomaticSources\(/)
})
