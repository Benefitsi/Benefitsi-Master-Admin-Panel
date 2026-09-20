export type MediaCity = { id: string; slug: string; name: string }
export type MediaPlace = { id: string; cityId: string; name: string; canonicalSlug: string | null }
export type MediaAssignment = {
  id: string; cityId: string; assetId: string; entityType: string
  entityId: string | null; entityKey: string | null; role: string
  isPrimary: boolean; manualLock: boolean
}
export type MediaAsset = {
  id: string; cityId: string | null; title: string; altText: string | null
  status: string; sourceType: string; thumbnail: string | null
}
export type MediaSource<T> = { rows: T[]; state: "ok" | "unavailable" | "limited" }
export type MediaInventoryData = {
  checkedAt: string; assets: MediaSource<MediaAsset>; assignments: MediaSource<MediaAssignment>
  cities: MediaSource<MediaCity>; places: MediaSource<MediaPlace>
}

const safeSegment = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 180

// These targets follow the active public Web contracts: collection anchors use
// the record ID; detail routes prefer canonicalSlug. A target is a place to
// inspect, not proof that this assignment wins the public resolver or review.
export function publicMediaPreviewHref({ asset, assignment, city, place }: {
  asset: Pick<MediaAsset, "id" | "cityId" | "status">
  assignment: Pick<MediaAssignment, "assetId" | "cityId" | "entityType" | "entityId" | "entityKey" | "role">
  city: MediaCity | null | undefined
  place: MediaPlace | null | undefined
}): string | null {
  if (!city || !place || asset.status !== "PUBLISHED" || !safeSegment(city.slug)) return null
  if (assignment.assetId !== asset.id || assignment.cityId !== city.id || place.cityId !== city.id || (asset.cityId !== null && asset.cityId !== city.id)) return null
  if (assignment.entityType !== "PLACE" || !["CARD", "HERO"].includes(assignment.role)) return null
  if (!assignment.entityId && !assignment.entityKey) return null
  if (assignment.entityId && assignment.entityId !== place.id) return null
  if (assignment.entityKey && assignment.entityKey !== place.canonicalSlug && assignment.entityKey !== place.id) return null
  if (!safeSegment(place.id) || (place.canonicalSlug && !safeSegment(place.canonicalSlug))) return null
  const base = `https://benefitsi.de/stadt/${encodeURIComponent(city.slug)}`
  return assignment.role === "CARD"
    ? `${base}/sehenswuerdigkeiten#place-${encodeURIComponent(place.id)}`
    : `${base}/entdecken/ort/${encodeURIComponent(place.canonicalSlug || place.id)}`
}

// Never emit arbitrary source URLs, signed URLs or non-image content into the
// browser. Official external source images remain listed without a thumbnail.
export function trustedMediaThumbnail(value: unknown, storageOrigin: unknown): string | null {
  if (typeof value !== "string" || typeof storageOrigin !== "string") return null
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(storageOrigin)) return null
  try {
    const url = new URL(value)
    const path = decodeURIComponent(url.pathname)
    if (url.origin !== new URL(storageOrigin).origin || url.username || url.password || url.search || url.hash) return null
    if (!path.startsWith("/storage/v1/object/public/city-media/") || path.split("/").some(part => part === "." || part === "..")) return null
    if (/%|\\/.test(path) || !/\.(jpe?g|png|webp|avif)$/i.test(path)) return null
    return url.href
  } catch { return null }
}

export function findAssignmentPlace(assignment: MediaAssignment, places: MediaPlace[]): MediaPlace | undefined {
  if (assignment.entityType !== "PLACE") return undefined
  return places.find(place => place.cityId === assignment.cityId && (
    assignment.entityId ? place.id === assignment.entityId : Boolean(assignment.entityKey) && (place.canonicalSlug === assignment.entityKey || place.id === assignment.entityKey)
  ))
}
