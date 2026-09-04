import { timingSafeEqual } from "node:crypto"
import { runNextCityAgentJob } from "@/lib/city-agent/runner"
import { recoverStaleCityAgentRuns } from "@/lib/city-agent/operations"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? ""
  const provided = request.headers.get("authorization") ?? ""
  const expected = `Bearer ${secret}`
  if (secret.length < 32 || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

async function run(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: process.env.CRON_SECRET ? 401 : 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {}
  const url = new URL(request.url)
  const cityId = typeof body.cityId === "string" ? body.cityId : url.searchParams.get("cityId") ?? undefined
  const agentProfile = typeof body.agentProfile === "string" ? body.agentProfile : url.searchParams.get("agentProfile") ?? undefined
  const maxSourcesValue = Number(body.maxSources ?? url.searchParams.get("maxSources") ?? 10)
  const dryRunQuery = url.searchParams.get("dryRun")
  const dryRun = typeof body.dryRun === "boolean"
    ? body.dryRun
    : dryRunQuery === null
      ? false
      : dryRunQuery !== "false"
  const requestedMaxJobs = Number(body.maxJobs ?? url.searchParams.get("maxJobs") ?? process.env.CITY_AGENT_WORKER_MAX_JOBS ?? 2)
  const maxJobs = Number.isFinite(requestedMaxJobs)
    ? Math.max(1, Math.min(Math.trunc(requestedMaxJobs), 4))
    : 2

  try {
    const stale = await recoverStaleCityAgentRuns({ maxRuns: 20 })
    const jobs: Awaited<ReturnType<typeof runNextCityAgentJob>>[] = []
    const errors: string[] = []

    for (let index = 0; index < maxJobs; index += 1) {
      try {
        const summary = await runNextCityAgentJob({ cityId, agentProfile, maxSources: maxSourcesValue, dryRun })
        if (!summary.claimed) break
        jobs.push(summary)
      } catch (error) {
        // Keep draining independent queue items. A failed invocation remains
        // lease-protected and is recovered by the next tick if necessary.
        errors.push(error instanceof Error ? error.message.slice(0, 500) : "worker_failed")
      }
    }

    return Response.json(
      {
        ok: errors.length === 0,
        status: errors.length ? "partial" : "succeeded",
        staleRunsRecovered: stale.recoveredCount,
        staleRunErrors: stale.errors,
        jobsProcessed: jobs.length,
        jobs,
        errors,
        dryRun,
        maxJobs,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("City-Agent worker failed:", error)
    return Response.json({ ok: false, error: "worker_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } })
  }
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
