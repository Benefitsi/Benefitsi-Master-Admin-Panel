import { createHash } from "node:crypto"
import { runNextCityAgentJob } from "@/lib/city-agent/runner"
import { recoverStaleCityAgentRuns } from "@/lib/city-agent/operations"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const maxDuration = 300

async function authorize(request: Request, admin: ReturnType<typeof createAdminClient>) {
  const provided = request.headers.get("x-city-agent-token")?.trim() ?? ""
  if (provided.length < 32) return false

  const tokenHash = createHash("sha256").update(provided, "utf8").digest("hex")
  const result = await admin
    .from("city_agent_scheduler_tokens")
    .select("id")
    .eq("token_hash", tokenHash)
    .eq("active", true)
    .maybeSingle()

  if (result.error || !result.data) return false
  await admin
    .from("city_agent_scheduler_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", result.data.id)
  return true
}

export async function POST(request: Request) {
  const admin = createAdminClient()
  if (!(await authorize(request, admin))) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  const startedAt = new Date().toISOString()
  const schedulerRun = await admin
    .from("city_agent_scheduler_runs")
    .insert({
      trigger_source: "supabase-worker",
      status: "running",
      details: { startedAt, worker: "admin-api" },
    })
    .select("id")
    .single()

  if (schedulerRun.error || !schedulerRun.data) {
    return Response.json(
      { ok: false, error: "scheduler_run_persist_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }

  const runId = schedulerRun.data.id as string
  try {
    const stale = await recoverStaleCityAgentRuns({ maxRuns: 20 })
    const jobs: Awaited<ReturnType<typeof runNextCityAgentJob>>[] = []
    const maxJobs = Math.max(1, Math.min(Number(process.env.CITY_AGENT_WORKER_MAX_JOBS ?? 2), 4))

    for (let index = 0; index < maxJobs; index += 1) {
      // The runner applies the effective limit: regular modules stay bounded
      // to MAX_SOURCES, while an explicit shadow baseline may inspect all
      // registered sources up to MAX_BASELINE_SOURCES.
      const summary = await runNextCityAgentJob({ maxSources: 50, dryRun: false })
      if (!summary.claimed) break
      jobs.push(summary)
    }

    const status = jobs.some((job) => job.status === "failed")
      ? "partial"
      : jobs.some((job) => job.status === "partial")
        ? "partial"
        : "succeeded"
    await admin
      .from("city_agent_scheduler_runs")
      .update({
        finished_at: new Date().toISOString(),
        jobs_processed: jobs.length,
        status,
        details: {
          startedAt,
          worker: "admin-api",
          staleRunsRecovered: stale.recoveredCount,
          staleRunErrors: stale.errors,
          jobStatuses: jobs.map((job) => job.status),
          linkageSource: "city_agent_scheduler_job_links",
        },
      })
      .eq("id", runId)

    return Response.json(
      {
        ok: true,
        schedulerRunId: runId,
        staleRunsRecovered: stale.recoveredCount,
        jobsProcessed: jobs.length,
        jobs,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker_failed"
    await admin
      .from("city_agent_scheduler_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "failed",
        error_summary: message.slice(0, 2_000),
        details: { startedAt, worker: "admin-api" },
      })
      .eq("id", runId)

    console.error("Supabase City-Agent worker failed:", error)
    return Response.json(
      { ok: false, error: "worker_failed", schedulerRunId: runId },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
