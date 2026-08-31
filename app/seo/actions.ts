"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/admin"
import { validateSeoFetchUrl } from "@/lib/seo/seo-url-policy"
import { deriveInitialSeoKeywords } from "@/lib/seo/seo-keywords"

const FULL_SEO_MEASUREMENT_TYPES = [
  "seo_rank_check",
  "seo_local_rank_check",
  "seo_ai_visibility_check",
  "seo_drift_check",
  "seo_recommendation",
] as const

async function ensureSeoKeywordSet(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  targetId: string,
  sourceUrl: string,
) {
  const existing = await supabase
    .from("seo_keyword_sets")
    .select("id")
    .eq("target_id", targetId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return

  const keywords = deriveInitialSeoKeywords(sourceUrl)
  if (keywords.length === 0) {
    throw new Error("Für dieses SEO-Ziel konnten keine Start-Keywords abgeleitet werden.")
  }

  const created = await supabase.from("seo_keyword_sets").insert({
    target_id: targetId,
    name: "URL-derived starter set (Review)",
    locale: "de-DE",
    device: "mobile",
    search_engine: "google",
    location: null,
    keywords,
    is_active: true,
  })

  if (created.error && created.error.code !== "23505") {
    throw new Error(created.error.message)
  }
}

async function enqueueFullSeoMeasurements(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  targetId: string,
  actorId: string,
) {
  const results = await Promise.all(
    FULL_SEO_MEASUREMENT_TYPES.map((jobType) =>
      supabase.rpc("enqueue_seo_measurement_job", {
        p_target_id: targetId,
        p_job_type: jobType,
        p_priority: jobType === "seo_rank_check" ? 55 : 45,
        p_actor_id: actorId,
      }),
    ),
  )
  const failure = results.find((result) => result.error)
  if (failure?.error) throw new Error(failure.error.message)
}

export async function enqueueSeoAudit(formData: FormData): Promise<void> {
  const targetId = String(formData.get("target_id") ?? "").trim()
  if (!targetId) {
    redirect("/seo?error=Bitte+ein+SEO-Ziel+ausw%C3%A4hlen")
  }

  const { supabase, adminSession } = await requireAdmin()
  const targetResult = await supabase
    .from("seo_targets")
    .select("id,canonical_url,status")
    .eq("id", targetId)
    .maybeSingle()

  if (targetResult.error || !targetResult.data) {
    redirect(
      `/seo?error=${encodeURIComponent(
        targetResult.error?.message || "SEO-Ziel wurde nicht gefunden",
      )}`,
    )
  }

  if (targetResult.data.status !== "active") {
    redirect("/seo?error=Nur+aktive+SEO-Ziele+k%C3%B6nnen+gestartet+werden")
  }

  const sourceUrl = String(targetResult.data.canonical_url ?? "")
  const validation = validateSeoFetchUrl(sourceUrl)
  if (!validation.ok) {
    redirect(`/seo?error=${encodeURIComponent(validation.reason)}`)
  }

  try {
    await ensureSeoKeywordSet(supabase, targetId, validation.url.href)
    const rpcResult = await supabase.rpc("enqueue_seo_audit_job", {
      p_target_id: targetId,
      p_source_url: validation.url.href,
      p_priority: 60,
      p_actor_id: adminSession.user.id,
    })

    if (rpcResult.error) throw new Error(rpcResult.error.message)
    await enqueueFullSeoMeasurements(supabase, targetId, adminSession.user.id)
  } catch (actionError) {
    redirect(`/seo?error=${encodeURIComponent(actionError instanceof Error ? actionError.message : "SEO-Job konnte nicht angelegt werden")}`)
  }

  revalidatePath("/seo")
  redirect(`/seo?started=1&target=${encodeURIComponent(targetId)}`)
}

export async function enqueueSeoRankCheck(formData: FormData): Promise<void> {
  const targetId = String(formData.get("target_id") ?? "").trim()
  if (!targetId) {
    redirect("/seo?error=Bitte+ein+SEO-Ziel+ausw%C3%A4hlen")
  }

  const { supabase, adminSession } = await requireAdmin()
  const targetResult = await supabase
    .from("seo_targets")
    .select("id,canonical_url,status")
    .eq("id", targetId)
    .maybeSingle()

  if (targetResult.error || !targetResult.data) {
    redirect(
      `/seo?error=${encodeURIComponent(
        targetResult.error?.message || "SEO-Ziel wurde nicht gefunden",
      )}`,
    )
  }

  if (targetResult.data.status !== "active") {
    redirect("/seo?error=Nur+aktive+SEO-Ziele+k%C3%B6nnen+gestartet+werden")
  }

  const sourceUrl = String(targetResult.data.canonical_url ?? "")
  const validation = validateSeoFetchUrl(sourceUrl)
  if (!validation.ok) {
    redirect(`/seo?error=${encodeURIComponent(validation.reason)}`)
  }

  try {
    await ensureSeoKeywordSet(supabase, targetId, validation.url.href)
    const rpcResult = await supabase.rpc("enqueue_seo_measurement_job", {
      p_target_id: targetId,
      p_job_type: "seo_rank_check",
      p_priority: 55,
      p_actor_id: adminSession.user.id,
    })

    if (rpcResult.error) throw new Error(rpcResult.error.message)
  } catch (actionError) {
    redirect(`/seo?error=${encodeURIComponent(actionError instanceof Error ? actionError.message : "Ranktracking konnte nicht angelegt werden")}`)
  }

  revalidatePath("/seo")
  redirect(`/seo?rank=1&target=${encodeURIComponent(targetId)}`)
}
