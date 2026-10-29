import { timingSafeEqual } from "node:crypto"
import { recoverStaleCityAgentRuns } from "@/lib/city-agent/operations"
import { runNextCityAgentJob } from "@/lib/city-agent/runner"
import { cityAgentTickMode } from "@/lib/city-agent/tick-mode"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? ""
  const provided = request.headers.get("authorization") ?? ""
  const expected = `Bearer ${secret}`
  if (secret.length < 32 || Buffer.byteLength(provided) !== Buffer.byteLength(expected)) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      {
        status: process.env.CRON_SECRET ? 401 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    )
  }

  const admin = createAdminClient()
  const startedAt = new Date()
  const result = await admin.rpc("schedule_due_city_scans", {
    p_actor_profile: "vercel-cron",
  })
  if (result.error) {
    console.error("Automation tick failed:", result.error.message)
    return Response.json(
      { ok: false, error: "schedule_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }

  const recorded = await admin
    .from("city_agent_scheduler_runs")
    .select("id,status,jobs_queued,schedules_considered,schedules_due,started_at,finished_at")
    .eq("trigger_source", "vercel-cron")
    .gte("started_at", new Date(startedAt.getTime() - 60_000).toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const stale = await recoverStaleCityAgentRuns({ maxRuns: 20 })
  // Pull is the default: the M1 worker already claims these city_scan jobs.
  // Set CITY_AGENT_TICK_MODE=push to restore synchronous bridge fetches.
  const mode = cityAgentTickMode()
  const jobs = []
  if (mode === "push") {
    const maxJobs = Math.max(1, Math.min(Number(process.env.CITY_AGENT_TICK_MAX_JOBS ?? 1), 2))
    for (let index = 0; index < maxJobs; index += 1) {
      const summary = await runNextCityAgentJob({ maxSources: 10, dryRun: false })
      if (!summary.claimed) break
      jobs.push(summary)
    }
  }

  return Response.json(
    {
      ok: true,
      mode,
      citiesConsidered: Number(result.data ?? 0),
      deduplicatedByDay: true,
      schedulerRun: recorded.data ?? null,
      staleRunsRecovered: stale.recoveredCount,
      staleRunErrors: stale.errors,
      jobsProcessed: jobs.length,
      jobs,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
