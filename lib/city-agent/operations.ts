import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

type OperationsOptions = {
  now?: Date
  maxAgeMs?: number
  maxRuns?: number
}

type StaleRun = {
  id: string
  job_id: string | null
  city_id: string
  orchestrator_profile: string | null
}

export async function recoverStaleCityAgentRuns(options: OperationsOptions = {}) {
  const admin = createAdminClient()
  const now = options.now ?? new Date()
  const maxAgeMs = Math.max(5 * 60 * 1000, Math.min(options.maxAgeMs ?? 30 * 60 * 1000, 6 * 60 * 60 * 1000))
  const staleBefore = new Date(now.getTime() - maxAgeMs).toISOString()
  const maxRuns = Math.max(1, Math.min(Math.trunc(options.maxRuns ?? 20), 50))
  const result = await admin
    .from("city_agent_runs")
    .select("id,job_id,city_id,orchestrator_profile")
    .eq("status", "running")
    .lt("started_at", staleBefore)
    .order("started_at", { ascending: true })
    .limit(maxRuns)

  if (result.error) throw new Error(`Stale City-Agent-Runs konnten nicht geladen werden: ${result.error.message}`)

  const recovered: string[] = []
  const errors: string[] = []
  for (const run of (result.data ?? []) as StaleRun[]) {
    const updated = await admin
      .from("city_agent_runs")
      .update({
        status: "failed",
        error_code: "stale_run",
        error_summary: "Run wurde wegen überschrittener Lease-Zeit kontrolliert beendet.",
        finished_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", run.id)
      .eq("status", "running")
    if (updated.error) {
      errors.push(`${run.id}: ${updated.error.message}`)
      continue
    }

    recovered.push(run.id)
    await admin.from("city_agent_run_audit").insert({
      run_id: run.id,
      action: "failed",
      actor_type: "system",
      actor_profile: "automation-scheduler",
      details: {
        reason: "stale_run",
        staleBefore,
        protected_action_executed: false,
      },
    })

    if (run.job_id) {
      await admin.rpc("fail_automation_job", {
        p_job_id: run.job_id,
        p_agent_profile: run.orchestrator_profile || "ben",
        p_error_code: "stale_city_agent_run",
      })
    }
  }

  return {
    staleBefore,
    recoveredRunIds: recovered,
    recoveredCount: recovered.length,
    errors,
  }
}

