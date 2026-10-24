import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js"

// PostgREST caps each response at 1,000 rows. Read the complete global menu
// catalogue in stable pages so a bulk import cannot hide other partners' items.
export async function readAllMenuItems<T>(
  client: SupabaseClient,
): Promise<{ data: T[] | null; error: PostgrestError | null }> {
  const pageSize = 500
  const rows: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const result = await client
      .from("menu_items")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (result.error) return { data: null, error: result.error }
    const page = (result.data ?? []) as T[]
    rows.push(...page)
    if (page.length < pageSize) return { data: rows, error: null }
  }
}
