import "server-only"

import { getAdminSession } from "./admin"
import { createAdminClient } from "./supabase/admin"
import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeFounderCount, type FounderSnapshot } from "./founder-overview"

// Validate admin access before constructing any privileged client. Operational
// tables are service-only in production: expose exact counts/status, not rows.
export async function loadFounderOverview(client: SupabaseClient): Promise<FounderSnapshot> {
  const session = await getAdminSession(client)
  if (!session?.isAdmin) throw new Error("Admin-Zugriff erforderlich.")
  const checkedAt = new Date().toISOString()
  let operations: ReturnType<typeof createAdminClient> | null = null
  try { operations = createAdminClient() } catch { /* Missing source stays unknown. */ }
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }> | null) => {
    if (!query) return normalizeFounderCount({ count: null, error: true })
    try { return normalizeFounderCount(await query) }
    catch { return normalizeFounderCount({ count: null, error: true }) }
  }
  const [activePartners, failedJobs, pendingReviews, overdueSources, cityResult, pipeline] = await Promise.all([
    count(client.from("partners").select("id", { count: "exact", head: true }).eq("is_active", true).eq("status", "active")),
    count(operations ? operations.from("automation_jobs").select("id", { count: "exact", head: true }).eq("status", "failed") : null),
    count(operations ? operations.from("automation_jobs").select("id", { count: "exact", head: true }).eq("status", "needs_human") : null),
    count(operations ? operations.from("city_agent_sources").select("id", { count: "exact", head: true }).eq("active", true).lt("next_check_at", checkedAt) : null),
    operations ? operations.from("city_agent_runs").select("status,finished_at").eq("dry_run", false).order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(result => ({ data: result.data, unavailable: Boolean(result.error) }), () => ({ data: null, unavailable: true })) : Promise.resolve({ data: null, unavailable: true }),
    loadPipeline(operations),
  ])
  return {
    pipeline, checkedAt, activePartners, failedJobs, pendingReviews, overdueSources,
    cityRunUnavailable: cityResult.unavailable,
    cityRun: cityResult.data ? {
      status: typeof cityResult.data.status === "string" ? cityResult.data.status : "unknown",
      finishedAt: typeof cityResult.data.finished_at === "string" ? cityResult.data.finished_at : null,
    } : null,
  }
}

async function loadPipeline(client: ReturnType<typeof createAdminClient> | null): Promise<FounderSnapshot["pipeline"]> {
  if (!client) return null
  try {
    const { data, error } = await client
      .from("annweiler_event_pipeline_health")
      .select("last_run_at,summary")
      .eq("city_id", "b9e684e4-54b3-41ff-8f97-4426423893c2")
      .maybeSingle()
    if (error || !data) return null
    const health = data.summary?.health
    return {
      technicalOk: typeof health?.technical_ok === "boolean" ? health.technical_ok : null,
      lastRunAt: typeof data.last_run_at === "string" ? data.last_run_at : null,
      researchCheckedAt: typeof health?.research_checked_at === "string" ? health.research_checked_at : null,
    }
  } catch { return null }
}
