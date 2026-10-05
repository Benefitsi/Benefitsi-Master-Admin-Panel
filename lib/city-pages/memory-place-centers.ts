import type { MemoryCatalog, MemoryZone } from './memory-stamps'

type Place = MemoryCatalog['places'][number]
const valid = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max

export function memoryPlaceCenter(place?: Place): [number, number] | null {
  const lat = place?.geometry_type === 'POINT' ? place.latitude : place?.map_center_latitude
  const lon = place?.geometry_type === 'POINT' ? place.longitude : place?.map_center_longitude
  return valid(lat, -90, 90) && valid(lon, -180, 180) ? [lat, lon] : null
}

export function bindMemoryZones(zones: MemoryZone[], placeId: string | null, places: Place[]): MemoryZone[] {
  return zones.map((zone, index) => {
    const source = index === 0 || zone.zone_key === 'primary' || zone.verification_type === 'AREA' ? placeId : zone.source_place_id ?? placeId
    const center = zone.verification_type === 'POINT_RADIUS' ? memoryPlaceCenter(places.find(p => p.id === source)) : null
    return { ...zone, source_place_id: source, safe_latitude: center?.[0] ?? null, safe_longitude: center?.[1] ?? null }
  })
}
