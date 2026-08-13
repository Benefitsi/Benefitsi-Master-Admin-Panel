"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import { createAdminClient } from "@/lib/supabase/admin"

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
