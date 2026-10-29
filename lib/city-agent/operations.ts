import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { claimedBefore, staleJobDisposition } from "./stale-job"

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
  started_at: string | null
}
type HeldJob = {
  id: string
  status: string
  agent_profile: string | null
  claimed_at: string | null
}

function missingClaimParameter(message: string) {
  return /PGRST202|Could not find the function|schema cache/i.test(message)
}

export async function recoverStaleCityAgentRuns(options: OperationsOptions = {}) {
  const admin = createAdminClient()
  const now = options.now ?? new Date()
  const maxAgeMs = Math.max(5 * 60 * 1000, Math.min(options.maxAgeMs ?? 30 * 60 * 1000, 6 * 60 * 60 * 1000))
  const staleBefore = new Date(now.getTime() - maxAgeMs).toISOString()
  const maxRuns = Math.max(1, Math.min(Math.trunc(options.maxRuns ?? 20), 50))
  const result = await admin
    .from("city_agent_runs")
    .select("id,job_id,city_id,orchestrator_profile,started_at")
    .eq("status", "running")
    .lt("started_at", staleBefore)
    .order("started_at", { ascending: true })
    .limit(maxRuns)

  if (result.error) throw new Error(`Stale City-Agent-Runs konnten nicht geladen werden: ${result.error.message}`)

  const recovered: string[] = []
  const errors: string[] = []
  const jobOutcomes: Array<{ runId: string; jobId: string | null; disposition: string }> = []
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
      .select("id")
    if (updated.error) {
      errors.push(`${run.id}: ${updated.error.message}`)
      continue
    }
    if (!updated.data?.length) continue

    let disposition = "leave_missing"
    if (run.job_id) {
      const jobResult = await admin
        .from("automation_jobs")
        .select("id,status,agent_profile,claimed_at")
        .eq("id", run.job_id)
        .maybeSingle()
      if (jobResult.error) {
        errors.push(`${run.id}: ${jobResult.error.message}`)
        disposition = "job_lookup_failed"
      } else {
        const job = (jobResult.data ?? null) as HeldJob | null
        disposition = staleJobDisposition({
          runStartedAt: run.started_at,
          orchestratorProfile: run.orchestrator_profile,
          job,
        })
        if (disposition === "fail_held_claim" && job) {
          const profile = (run.orchestrator_profile || "ben").trim().slice(0, 160)
          const claimedUntil = claimedBefore(run.started_at)
          let failed = await admin.rpc("fail_automation_job", {
            p_job_id: run.job_id,
            p_agent_profile: profile,
            p_error_code: "stale_city_agent_run",
            p_claimed_before: claimedUntil,
          })
          if (failed.error && missingClaimParameter(failed.error.message)) {
            failed = await admin.rpc("fail_automation_job", {
              p_job_id: run.job_id,
              p_agent_profile: profile,
              p_error_code: "stale_city_agent_run",
            })
          }
          if (failed.error) {
            errors.push(`${run.id}: ${failed.error.message}`)
            disposition = "fail_rejected"
          } else {
            const returned = failed.data as { status?: string } | null
            if (returned?.status === "claimed") disposition = "leave_reclaimed"
            else if (returned?.status !== "queued" && returned?.status !== "failed") disposition = "leave_terminal"
          }
        }
      }
    }

    recovered.push(run.id)
    jobOutcomes.push({ runId: run.id, jobId: run.job_id, disposition })
    await admin.from("city_agent_run_audit").insert({
      run_id: run.id,
      action: "failed",
      actor_type: "system",
      actor_profile: "automation-scheduler",
      details: {
        reason: "stale_run",
        staleBefore,
        jobDisposition: disposition,
        protected_action_executed: false,
      },
    })
  }

  return {
    staleBefore,
    recoveredRunIds: recovered,
    recoveredCount: recovered.length,
    jobOutcomes,
    errors,
  }
}
