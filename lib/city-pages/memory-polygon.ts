export type MemoryMapPoint = [latitude: number, longitude: number]
export type MemoryPolygon = { type: 'Polygon'; coordinates: [number, number][][] }
export const maximumMemoryVertices = 100

type Position = [number, number]
const epsilon = 1e-12
const same = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1]
const cross = (a: Position, b: Position, c: Position) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const onSegment = (a: Position, b: Position, p: Position) => Math.abs(cross(a, b, p)) <= epsilon && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])

function intersects(a: Position, b: Position, c: Position, d: Position) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
  return ((abC > epsilon && abD < -epsilon || abC < -epsilon && abD > epsilon) && (cdA > epsilon && cdB < -epsilon || cdA < -epsilon && cdB > epsilon))
    || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)
}

// Custom drawings have one simple outer ring. Existing place polygons keep
// their separate legacy parser, including support for holes.
export function parseMemoryPolygon(value: unknown): MemoryPolygon | null {
  if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'Polygon' || !('coordinates' in value) || !Array.isArray(value.coordinates) || value.coordinates.length !== 1) return null
  const ring = value.coordinates[0]
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > maximumMemoryVertices + 1) return null
  for (const point of ring) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(n => typeof n === 'number' && Number.isFinite(n)) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 85.05112878) return null
  }
  const points = ring as Position[]
  if (!same(points[0], points[points.length - 1])) return null
  const count = points.length - 1
  let area = 0
  for (let i = 0; i < count; i++) {
    area += cross(points[0], points[i], points[i + 1])
    for (let j = i + 1; j < count; j++) {
      if (same(points[i], points[j])) return null
      if (j === i + 1 || i === 0 && j === count - 1) continue
      if (intersects(points[i], points[i + 1], points[j], points[j + 1])) return null
    }
  }
  if (Math.abs(area) <= epsilon) return null
  return { type: 'Polygon', coordinates: [points.map(p => [p[0], p[1]])] }
}

export function memoryPolygonFromVertices(vertices: MemoryMapPoint[]): MemoryPolygon | null {
  if (vertices.length < 3 || vertices.length > maximumMemoryVertices) return null
  const ring = vertices.map(([lat, lon]) => [lon, lat])
  return parseMemoryPolygon({ type: 'Polygon', coordinates: [[...ring, ring[0]]] })
}
