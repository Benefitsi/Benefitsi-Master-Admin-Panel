"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { auditCityAgentProposals } from "@/lib/city-agent/proposal-audit"
import { simulateCityAgentHealth } from "@/lib/city-agent/health"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function value(formData: FormData, key: string, maxLength: number) {
  const raw = formData.get(key)
  return typeof raw === "string" ? raw.trim().slice(0, maxLength) : ""
}

function finish(kind: "success" | "error", code: string): never {
  revalidatePath("/automation")
  redirect(`/automation?${kind}=${encodeURIComponent(code)}`)
}

function actor(session: Awaited<ReturnType<typeof requireAdmin>>["adminSession"]) {
  return {
    id: session.user.id,
    profile:
      session.profile?.display_name ||
      session.profile?.email ||
      session.user.email ||
      "Benefitsi Admin",
  }
}

export async function enqueueCityScan(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const cityId = value(formData, "cityId", 80)
  if (!UUID_PATTERN.test(cityId)) finish("error", "city_validation")

  const identity = actor(adminSession)
  const day = new Date().toISOString().slice(0, 10)
  const result = await createAdminClient().rpc("enqueue_automation_job", {
    p_job_type: "city_scan",
    p_priority: 60,
    p_city_id: cityId,
    p_target_type: "city",
    p_target_id: cityId,
    p_human_gate: "none",
    p_input: {
      scope: "current_public_sources",
      pii_allowed: false,
      requested_by: "admin_dashboard",
    },
    p_available_at: new Date().toISOString(),
    p_deduplication_key: `city-scan:${cityId}:${day}`,
    p_actor_type: "admin",
    p_actor_id: identity.id,
    p_actor_profile: identity.profile,
  })
  if (result.error) finish("error", "city_scan_enqueue")
  finish("success", "city_scan_queued")
}

export async function scheduleAllDueCityScans() {
  const { adminSession } = await requireAdmin()
  const identity = actor(adminSession)
  const result = await createAdminClient().rpc("schedule_due_city_scans", {
    p_actor_profile: identity.profile,
  })
  if (result.error) finish("error", "city_schedule")
  finish("success", "due_city_scans_queued")
}

export async function enqueueShadowBaseline(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const cityId = value(formData, "cityId", 80)
  if (!UUID_PATTERN.test(cityId)) finish("error", "baseline_city_validation")

  const admin = createAdminClient()
  const control = await admin
    .from("city_agent_city_controls")
    .select("operating_mode,city_profile")
    .eq("city_id", cityId)
    .maybeSingle()
  if (control.error || !control.data) finish("error", "baseline_control_missing")
  if (control.data.operating_mode !== "SHADOW") finish("error", "baseline_requires_shadow")

  const identity = actor(adminSession)
  const day = new Date().toISOString().slice(0, 10)
  const result = await admin.rpc("enqueue_automation_job", {
    p_job_type: "city_scan",
    p_priority: 100,
    p_city_id: cityId,
    p_target_type: "city_agent_baseline",
    p_target_id: cityId,
    p_human_gate: "none",
    p_input: {
      scope: "all_registered_sources",
      baseline: true,
      moduleKey: "full_city_audit",
      operatingMode: "SHADOW",
      shadow: true,
      cityProfile: control.data.city_profile,
      requested_by: "admin_shadow_baseline",
      pii_allowed: false,
    },
    p_available_at: new Date().toISOString(),
    p_deduplication_key: `city-agent-baseline:${cityId}:${day}`,
    p_actor_type: "admin",
    p_actor_id: identity.id,
    p_actor_profile: identity.profile,
  })
  if (result.error) finish("error", "baseline_enqueue")
  finish("success", "shadow_baseline_queued")
}

export async function setCityAgentOperatingMode(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const cityId = value(formData, "cityId", 80)
  const nextMode = value(formData, "operatingMode", 20)
  if (!UUID_PATTERN.test(cityId) || !["DISABLED", "SHADOW"].includes(nextMode)) {
    finish("error", "operating_mode_validation")
  }

  const admin = createAdminClient()
  const current = await admin
    .from("city_agent_city_controls")
    .select("operating_mode")
    .eq("city_id", cityId)
    .maybeSingle()
  if (current.error || !current.data) finish("error", "operating_mode_missing")

  const identity = actor(adminSession)
  const update = await admin
    .from("city_agent_city_controls")
    .update({
      operating_mode: nextMode,
      auto_publish_enabled: false,
      updated_by: identity.id,
      paused_reason: nextMode === "DISABLED" ? "Manuell pausiert" : null,
      updated_at: new Date().toISOString(),
    })
    .eq("city_id", cityId)
  if (update.error) finish("error", "operating_mode_update")

  await admin.from("city_agent_control_audit").insert({
    city_id: cityId,
    actor_id: identity.id,
    actor_profile: identity.profile,
    previous_mode: current.data.operating_mode,
    next_mode: nextMode,
    details: { phase: "shadow", autoPublishEnabled: false },
  })
  finish("success", `operating_mode_${nextMode.toLowerCase()}`)
}

export async function reviewAutomationRecommendation(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const jobId = value(formData, "jobId", 80)
  const decision = value(formData, "decision", 20)
  const note = value(formData, "note", 2000)
  const confirmed = formData.get("confirm") === "yes"

  if (
    !UUID_PATTERN.test(jobId) ||
    !["approved", "rejected"].includes(decision) ||
    !confirmed
  ) {
    finish("error", "review_validation")
  }

  const identity = actor(adminSession)
  const result = await createAdminClient().rpc("review_automation_job", {
    p_job_id: jobId,
    p_decision: decision,
    p_actor_id: identity.id,
    p_actor_profile: identity.profile,
    p_note: note || null,
  })
  if (result.error) finish("error", "review_failed")
  finish("success", `recommendation_${decision}`)
}

export async function reviewCityAgentProposal(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const proposalId = value(formData, "proposalId", 80)
  const decision = value(formData, "decision", 20)
  const confirmed = formData.get("confirm") === "yes"

  if (!UUID_PATTERN.test(proposalId) || !["approved", "rejected"].includes(decision) || !confirmed) {
    finish("error", "proposal_review_validation")
  }

  const profile =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Benefitsi Admin"
  const admin = createAdminClient()
  const result = await admin
    .from("city_agent_proposals")
    .update({ status: decision, updated_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("status", "needs_human")
    .select("id,run_id")
    .maybeSingle()

  if (result.error || !result.data) finish("error", "proposal_review_failed")

  await admin.from("city_agent_run_audit").insert({
    run_id: result.data.run_id,
    action: "review_linked",
    actor_type: "admin",
    actor_profile: profile,
    details: {
      proposalId,
      decision,
      protected_action_executed: false,
    },
  })

  finish("success", `proposal_${decision}`)
}

export async function auditCityAgentProposalQuality() {
  await requireAdmin()
  try {
    const summary = await auditCityAgentProposals()
    finish("success", `quality_audit_${summary.total}_${summary.superseded}`)
  } catch (error) {
    console.error("City-Agent quality audit failed:", error)
    finish("error", "quality_audit_failed")
  }
}

export async function simulateCityAgentHealthChecks() {
  await requireAdmin()
  const admin = createAdminClient()
  const city = await admin.from("cities").select("id").eq("slug", "annweiler").maybeSingle()
  if (city.error || !city.data?.id) finish("error", "health_city_missing")
  const cityId = city.data?.id
  if (!cityId) finish("error", "health_city_missing")

  const results = simulateCityAgentHealth()
  const inserts = await admin.from("city_agent_health_checks").insert(results.map((result) => ({
    city_id: cityId,
    check_type: result.scenario,
    mode: "SIMULATION",
    status: result.passed ? "PASSED" : "FAILED",
    summary: `${result.scenario}: ${result.status}`,
    details: { expected: result.status, passed: result.passed, reason: result.reason, protected_action_executed: false },
  })))
  if (inserts.error) finish("error", "health_simulation_failed")
  finish("success", `health_simulation_${results.filter((result) => result.passed).length}_${results.length}`)
}
