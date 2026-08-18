import { timingSafeEqual } from "node:crypto"
import { runNextCityAgentJob } from "@/lib/city-agent/runner"
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

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: process.env.CRON_SECRET ? 401 : 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const citySlug = typeof body.citySlug === "string" ? body.citySlug.trim().toLowerCase() : "annweiler"
  if (!/^[a-z0-9-]{1,80}$/.test(citySlug)) {
    return Response.json({ ok: false, error: "city_slug_invalid" }, { status: 400 })
  }

  const admin = createAdminClient()
  const city = await admin.from("cities").select("id,slug").eq("slug", citySlug).maybeSingle()
  if (city.error || !city.data) {
    return Response.json({ ok: false, error: "city_not_found" }, { status: 404 })
  }
  const control = await admin.from("city_agent_city_controls").select("operating_mode,city_profile").eq("city_id", city.data.id).maybeSingle()
  if (control.error || !control.data) {
    return Response.json({ ok: false, error: "city_agent_control_missing" }, { status: 409 })
  }
  if (control.data.operating_mode !== "SHADOW") {
    return Response.json({ ok: false, error: "shadow_mode_required" }, { status: 409 })
  }

  const day = new Date().toISOString().slice(0, 10)
  const force = body.force === true
  const queued = await admin.rpc("enqueue_automation_job", {
    p_job_type: "city_scan",
    p_priority: 100,
    p_city_id: city.data.id,
    p_target_type: "city_agent_baseline",
    p_target_id: city.data.id,
    p_human_gate: "none",
    p_input: {
      scope: "all_registered_sources",
      baseline: true,
      moduleKey: "full_city_audit",
      operatingMode: "SHADOW",
      shadow: true,
      cityProfile: control.data.city_profile,
      requested_by: "shadow_baseline_endpoint",
      pii_allowed: false,
    },
    p_available_at: new Date().toISOString(),
    p_deduplication_key: force
      ? `city-agent-baseline:${city.data.id}:${day}:retry:${Date.now()}`
      : `city-agent-baseline:${city.data.id}:${day}`,
    p_actor_type: "system",
    p_actor_id: null,
    p_actor_profile: "shadow-baseline",
  })
  if (queued.error) {
    console.error("Shadow baseline enqueue failed:", queued.error.message)
    return Response.json({ ok: false, error: "baseline_enqueue_failed" }, { status: 500 })
  }

  try {
    const summary = await runNextCityAgentJob({
      cityId: city.data.id,
      agentProfile: "ben",
      maxSources: 50,
      dryRun: true,
      baseline: true,
      moduleKey: "full_city_audit",
    })
    return Response.json({ ok: true, citySlug, summary }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Shadow baseline failed:", error)
    return Response.json({ ok: false, error: "baseline_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } })
  }
}
