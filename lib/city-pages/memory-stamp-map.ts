import type { MemoryCatalog, MemoryZone } from './memory-stamps'
import { memoryPlaceCenter } from './memory-place-centers'
import { parseMemoryPolygon } from './memory-polygon'

export type MemoryMapPlace = MemoryCatalog['places'][number]
type Point = [number, number]
type ZoneLabel = { key: string; number: number; label: string; active: boolean }
export type MemoryMapPreview = {
  circles: (ZoneLabel & { center: Point; radius: number })[]
  areas: (ZoneLabel & { rings: Point[][]; edgeTolerance: number; custom: boolean })[]
  place: { name: string; center: Point } | null
  issues: string[]
}

const valid = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
// Web Mercator cannot display the poles. Never silently clamp a collection point.
const position = (lat: unknown, lng: unknown): Point | null => valid(lat, -85.05112878, 85.05112878) && valid(lng, -180, 180) ? [lat, lng] : null

function polygon(value: unknown): Point[][] | null {
  if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'Polygon' || !('coordinates' in value) || !Array.isArray(value.coordinates) || !value.coordinates.length) return null
  const rings: Point[][] = []
  for (const ring of value.coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) return null
    const points: Point[] = []
    for (const point of ring) {
      if (!Array.isArray(point)) return null
      const pair = position(point[1], point[0])
      if (!pair) return null
      points.push(pair)
    }
    const first = points[0], last = points[points.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) return null
    let area = 0
    for (let i = 1; i < points.length; i++) area += points[i - 1][0] * points[i][1] - points[i][0] * points[i - 1][1]
    if (!area) return null
    rings.push(points)
  }
  return rings
}

export function memoryMapPreview(zones: MemoryZone[], place?: MemoryMapPlace): MemoryMapPreview {
  const sourceCenter = memoryPlaceCenter(place)
  const center = sourceCenter && position(...sourceCenter)
  const preview: MemoryMapPreview = { circles: [], areas: [], place: place && center ? { name: place.name, center } : null, issues: [] }
  zones.forEach((zone, index) => {
    const label = { key: zone.zone_key, number: index + 1, label: zone.label || `Sammelbereich ${index + 1}`, active: zone.active }
    if (zone.verification_type === 'AREA') {
      const custom = zone.geometry_geojson != null
      const rings = custom ? polygon(parseMemoryPolygon(zone.geometry_geojson)) : place?.geometry_type === 'POLYGON' ? polygon(place.geometry_geojson) : null
      if (rings && valid(zone.edge_tolerance_meters, 0, 50)) preview.areas.push({ ...label, rings, edgeTolerance: zone.edge_tolerance_meters, custom })
      else preview.issues.push(`${label.label}: Die Flächengrenze ist nicht verfügbar oder die Randtoleranz ist ungültig.`)
    } else {
      const point = position(zone.safe_latitude, zone.safe_longitude)
      if (point && valid(zone.unlock_radius_meters, 1, 10000)) preview.circles.push({ ...label, center: point, radius: zone.unlock_radius_meters })
      else preview.issues.push(`${label.label}: Bitte gültige Koordinaten und einen Radius von 1 bis 10.000 Metern eingeben.`)
    }
  })
  return preview
}
