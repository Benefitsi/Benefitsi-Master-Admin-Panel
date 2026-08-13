import { timingSafeEqual } from "node:crypto"
import { runNextCityAgentJob } from "@/lib/city-agent/runner"
import { recoverStaleCityAgentRuns } from "@/lib/city-agent/operations"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? ""
  const provided = request.headers.get("authorization") ?? ""
  const expected = `Bearer ${secret}`
  if (secret.length < 32 || provided.length !== expected.length) return false
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

  const result = await createAdminClient().rpc("schedule_due_city_scans", {
    p_actor_profile: "vercel-cron",
  })
  if (result.error) {
    console.error("Automation tick failed:", result.error.message)
    return Response.json(
      { ok: false, error: "schedule_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }

  const stale = await recoverStaleCityAgentRuns({ maxRuns: 20 })
  const maxJobs = Math.max(1, Math.min(Number(process.env.CITY_AGENT_TICK_MAX_JOBS ?? 1), 2))
  const jobs = []
  for (let index = 0; index < maxJobs; index += 1) {
    const summary = await runNextCityAgentJob({ maxSources: 10, dryRun: false })
    if (!summary.claimed) break
    jobs.push(summary)
  }

  return Response.json(
    {
      ok: true,
      citiesConsidered: Number(result.data ?? 0),
      deduplicatedByDay: true,
      staleRunsRecovered: stale.recoveredCount,
      staleRunErrors: stale.errors,
      jobsProcessed: jobs.length,
      jobs,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
