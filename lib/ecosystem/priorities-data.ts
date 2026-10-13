import "server-only"
import { requestKnowledgeTasks } from "@/lib/benefitsi-knowledge-controls-server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAdminSession } from "@/lib/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildOverviewPriorities, type PrioritySource, type OverviewPriorities } from "./priorities"
async function source(query: () => PromiseLike<{ data: unknown; error: unknown }>, maximum: number): Promise<PrioritySource> {
  try {
    const result = await query()
    if (result.error || !Array.isArray(result.data)) throw new Error("unavailable")
    return { state: "ready", items: result.data.slice(0,maximum).filter(item=>item && typeof item==='object' && !Array.isArray(item)), truncated: result.data.length > maximum }
  } catch { return { state: "unavailable", items: [], truncated: false } }
}
export async function loadOverviewPriorities(client: SupabaseClient, now = new Date()): Promise<OverviewPriorities> {
  const session = await getAdminSession(client)
  if (!session?.isAdmin) throw new Error("Admin-Zugriff erforderlich.")
  let admin: ReturnType<typeof createAdminClient> | null = null
  try { admin = createAdminClient() } catch { /* Privileged sources stay explicitly unavailable. */ }
  const [jobs,editorial,workspace,knowledge] = await Promise.all([
    source(()=>admin!.from("automation_jobs").select("id,job_type,status,priority,created_at,city_id").in("status",["needs_human","failed"]).order("priority",{ascending:false}).order("created_at",{ascending:true}).limit(9),8),
    source(()=>admin!.from("editorial_posts").select("id,title,updated_at").eq("status","needs_review").order("updated_at",{ascending:true}).limit(7),6),
    source(()=>client.from("admin_workspace_pages").select("id,title,partner_id,status,due_date,tasks:content->tasks").eq("archived",false).neq("status","done").order("due_date",{ascending:true,nullsFirst:false}).order("updated_at",{ascending:false}).limit(17),16),
    (async (): Promise<PrioritySource> => {
      try {
        const result = await requestKnowledgeTasks()
        return { state: 'ready', items: result.items, truncated: result.truncated }
      } catch { return { state: 'unavailable', items: [], truncated: false } }
    })(),
  ])
  return buildOverviewPriorities({checkedAt:now.toISOString(),jobs,editorial,workspace,knowledge})
}
