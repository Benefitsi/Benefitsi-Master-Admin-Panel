import type { SupabaseClient } from "@supabase/supabase-js"
import type { VisitLevelPartner } from "./partner-visit-levels"

// Read only the fields used by the reference, through the authenticated Admin
// client. Paging avoids silently treating the API row limit as a complete list.
export async function loadVisitLevelPartners(supabase: SupabaseClient): Promise<VisitLevelPartner[]> {
  const partners: VisitLevelPartner[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("partners")
      .select("id,name,category,level_frequency")
      .order("id")
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!Array.isArray(data)) throw new Error("Partnerdaten nicht verfügbar")
    partners.push(...data as VisitLevelPartner[])
    if (data.length < pageSize) return partners
  }
}
