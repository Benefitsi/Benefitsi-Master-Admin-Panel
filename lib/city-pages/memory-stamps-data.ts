import 'server-only'
import type { MemoryCatalog } from './memory-stamps'
import type { requireAdmin } from '@/lib/admin'

export async function loadCityMemoryCatalog(citySlug: string, supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase']): Promise<MemoryCatalog | null> {
  const result = await supabase.rpc('admin_city_memory_catalog', { p_city_slug: citySlug })
  if (result.error) throw new Error('Die Entdeckerstempel konnten nicht geladen werden. Bitte erneut versuchen.')
  return result.data as MemoryCatalog | null
}
