import 'server-only'
import type { MemoryCatalog } from './memory-stamps'
import type { requireAdmin } from '@/lib/admin'

export async function loadCityMemoryCatalog(citySlug: string, supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase']): Promise<MemoryCatalog | null> {
  const result = await supabase.rpc('admin_city_memory_catalog', { p_city_slug: citySlug })
  if (result.error) throw new Error('Die Entdeckerstempel konnten nicht geladen werden. Bitte erneut versuchen.')
  const catalog = result.data as MemoryCatalog | null
  if (!catalog) return null
  const areaIds = catalog.places.filter(p => p.geometry_type === 'POLYGON').map(p => p.id)
  if (!areaIds.length) return catalog
  // Read through the same authenticated session and city boundary as the editor.
  // Missing geometry leaves the form usable; the map explicitly flags that area.
  const areas = await supabase.from('city_places').select('id,geometry_geojson')
    .eq('city_id', catalog.city.id).in('id', areaIds)
  const geometries = new Map((areas.error ? [] : areas.data ?? []).map(p => [p.id, p.geometry_geojson]))
  return { ...catalog, places: catalog.places.map(p => ({ ...p, geometry_geojson: geometries.get(p.id) })) }
}
