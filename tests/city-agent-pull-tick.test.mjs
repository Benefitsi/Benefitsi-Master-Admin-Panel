import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { bridgeStatusFailure, describeFetchFailure } from "../lib/city-agent/fetch-failure.ts"
import { createSourceResearchProvider } from "../lib/city-agent/sources.ts"
import { sourceUpdateAfterFetchFailure } from "../lib/city-agent/source-schedule.ts"
import { claimedBefore, staleJobDisposition } from "../lib/city-agent/stale-job.ts"
import { cityAgentTickMode } from "../lib/city-agent/tick-mode.ts"

test("tick mode defaults to pull and enables push only by explicit env", () => {
  assert.equal(cityAgentTickMode({}), "pull")
  assert.equal(cityAgentTickMode({ CITY_AGENT_TICK_MODE: "pull" }), "pull")
  assert.equal(cityAgentTickMode({ CITY_AGENT_TICK_MODE: " PUSH " }), "push")
  assert.equal(cityAgentTickMode({ CITY_AGENT_TICK_MODE: "legacy" }), "pull")
})

test("bridge TLS failures keep the certificate cause instead of a bare fetch failed", () => {
  const error = new TypeError("fetch failed")
  error.cause = Object.assign(new Error("unable to verify the first certificate"), {
    code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  })
  const failure = describeFetchFailure(error, "bridge")
  assert.equal(failure.category, "BRIDGE_TLS")
  assert.equal(failure.infrastructure, true)
  assert.equal(failure.abortRun, true)
  assert.match(failure.message, /UNABLE_TO_VERIFY_LEAF_SIGNATURE/)
  assert.match(failure.message, /unable to verify the first certificate/)
  assert.notEqual(failure.message, "fetch failed")
})

test("a fetch failed without a cause is still recorded as infrastructure transport", () => {
  const failure = describeFetchFailure(new TypeError("fetch failed"), "bridge")
  assert.equal(failure.infrastructure, true)
  assert.equal(failure.abortRun, true)
  assert.match(failure.message, /no cause code/)
  assert.match(failure.message, /Bridge unreachable/)
})

test("gateway statuses abort the run and ordinary HTTP statuses stay per source", () => {
  assert.equal(bridgeStatusFailure(503)?.category, "BRIDGE_HTTP")
  assert.equal(bridgeStatusFailure(503)?.abortRun, true)
  assert.equal(bridgeStatusFailure(400), null)
  const sourceFailure = describeFetchFailure(new Error("Hermes/M1-Bridge antwortet mit HTTP 400."), "source")
  assert.equal(sourceFailure.infrastructure, false)
  assert.equal(sourceFailure.abortRun, false)
})

test("infrastructure failures do not move source scheduling fields", () => {
  const now = new Date("2026-10-26T04:16:56.000Z")
  const failure = describeFetchFailure(new TypeError("fetch failed"), "source")
  const update = sourceUpdateAfterFetchFailure({ cadence: "daily" }, now, failure)
  assert.equal(update.advanceSchedule, false)
  assert.equal(Object.hasOwn(update.patch, "next_check_at"), false)
  assert.equal(Object.hasOwn(update.patch, "next_retry_at"), false)
  assert.equal(Object.hasOwn(update.patch, "last_checked_at"), false)
  assert.equal(update.patch.last_failure_category, failure.category)
  assert.equal(update.patch.last_status, "error")
})

test("content failures still schedule the next source check", () => {
  const now = new Date("2026-10-26T04:16:56.000Z")
  const failure = describeFetchFailure(new Error("Nicht unterstützter Content-Type: application/pdf"), "source")
  const update = sourceUpdateAfterFetchFailure({ cadence: "weekly" }, now, failure)
  assert.equal(update.advanceSchedule, true)
  assert.equal(update.patch.next_check_at, "2026-11-02T04:16:56.000Z")
})

test("stale recovery fails only the claim that started the run", () => {
  const started = "2026-10-25T04:16:56.628Z"
  const base = {
    runStartedAt: started,
    orchestratorProfile: "ben",
  }
  assert.equal(staleJobDisposition({ ...base, job: null }), "leave_missing")
  assert.equal(staleJobDisposition({
    ...base,
    job: { status: "agent_completed", agent_profile: "ben", claimed_at: "2026-10-25T04:35:36.881Z" },
  }), "leave_terminal")
  assert.equal(staleJobDisposition({
    ...base,
    job: { status: "claimed", agent_profile: "ben", claimed_at: "2026-10-25T04:35:36.881Z" },
  }), "leave_reclaimed")
  assert.equal(staleJobDisposition({
    ...base,
    job: { status: "claimed", agent_profile: "other", claimed_at: started },
  }), "leave_other_agent")
  assert.equal(staleJobDisposition({
    ...base,
    job: { status: "claimed", agent_profile: "ben", claimed_at: started },
  }), "fail_held_claim")
  assert.equal(claimedBefore(started), "2026-10-25T04:18:56.628Z")
})

test("required Hermes mode reports one bridge outage instead of a bare fetch failed", async () => {
  const previous = {
    url: process.env.M1_BRIDGE_URL,
    secret: process.env.M1_BRIDGE_SECRET,
    required: process.env.CITY_AGENT_HERMES_REQUIRED,
  }
  process.env.M1_BRIDGE_URL = "https://bridge.example"
  process.env.M1_BRIDGE_SECRET = "test-bridge-secret"
  process.env.CITY_AGENT_HERMES_REQUIRED = "true"
  try {
    let calls = 0
    const provider = createSourceResearchProvider({
      fetchImpl: async () => {
        calls += 1
        const error = new TypeError("fetch failed")
        error.cause = Object.assign(new Error("unable to verify the first certificate"), {
          code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        })
        throw error
      },
    })
    const source = {
      id: "source-1",
      city_id: "city-1",
      slug: "annweiler-events",
      url: "https://annweiler.de/veranstaltungen",
      source_type: "official",
      trust_level: "primary",
      cadence: "daily",
      next_check_at: null,
      parser_config: {},
      content_scope: {},
      active: true,
      enabled: true,
    }
    await assert.rejects(() => provider.fetchSource(source), (error) => {
      assert.equal(error.name, "BridgeUnreachableError")
      assert.match(error.message, /UNABLE_TO_VERIFY_LEAF_SIGNATURE/)
      assert.equal(error.failure.abortRun, true)
      return true
    })
    assert.equal(calls, 1)
    assert.equal(provider.name, "hermes_required")
  } finally {
    if (previous.url === undefined) delete process.env.M1_BRIDGE_URL
    else process.env.M1_BRIDGE_URL = previous.url
    if (previous.secret === undefined) delete process.env.M1_BRIDGE_SECRET
    else process.env.M1_BRIDGE_SECRET = previous.secret
    if (previous.required === undefined) delete process.env.CITY_AGENT_HERMES_REQUIRED
    else process.env.CITY_AGENT_HERMES_REQUIRED = previous.required
  }
})

test("migration makes job failure idempotent and times runs out without touching sources", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261026143000_city_agent_run_timeout_and_job_fail.sql", import.meta.url),
    "utf8",
  )
  assert.match(sql, /p_claimed_before timestamp with time zone default null/)
  assert.match(sql, /claimed_at <= p_claimed_before/)
  assert.match(sql, /agent_profile is distinct from v_profile/)
  assert.match(sql, /return v_job;/)
  assert.match(sql, /recover_stale_city_agent_runs/)
  assert.match(sql, /city-agent-run-timeout/)
  assert.match(sql, /interval '30 minutes'/)
  assert.match(sql, /'\*\/15 \* \* \* \*'/)
  assert.match(sql, /error_code = 'stale_run'/)
  assert.match(sql, /grant execute on function public.fail_automation_job/)
  assert.match(sql, /grant execute on function public.recover_stale_city_agent_runs/)
  assert.doesNotMatch(sql, /update public\.city_agent_sources/)
  assert.doesNotMatch(sql, /CITY_AGENT_AUTO_PUBLISH/)
})
