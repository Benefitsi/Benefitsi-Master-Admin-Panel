export const discoveryCategories = [
  { key: "viewpoints", title: "Burgen & Aussicht", caption: "Weitblick & Geschichte" },
  { key: "hiking", title: "Wandern", caption: "Neue Wege entdecken" },
  { key: "family", title: "Familie", caption: "Gemeinsam unterwegs" },
  { key: "culture", title: "Kultur", caption: "Geschichte erleben" },
  { key: "food", title: "Essen & Trinken", caption: "Zeit für eine Pause" },
  { key: "rain", title: "Bei Regen", caption: "Ideen für drinnen" },
] as const

export type DiscoveryCategory = typeof discoveryCategories[number]["key"]
export type DiscoveryAsset = { id: string; title: string; url: string; alt: string; credit: string | null }
export type DiscoveryAssignment = { id: string; media_asset_id: string; entity_key: string; manual_lock: boolean; focal_x: number; focal_y: number; updated_at: string }
export type DiscoveryChoice = {
  cityId: string
  category: DiscoveryCategory
  mode: "manual" | "automatic"
  assetId: string | null
  focalX: number
  focalY: number
  expectedId: string | null
  expectedUpdatedAt: string | null
}
export type DiscoverySaveResult =
  | { ok: false; code: "invalid" | "unavailable" | "conflict" | "failed"; message: string }
  | { ok: true; assignment: DiscoveryAssignment | null; refresh: "ok" | "not_configured" | "failed"; auditSaved: boolean }

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const point = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1

export function parseDiscoveryChoice(value: unknown): DiscoveryChoice | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (!uuid(v.cityId) || !discoveryCategories.some(c => c.key === v.category) || !["manual", "automatic"].includes(String(v.mode))) return null
  const newAssignment = v.expectedId === null && v.expectedUpdatedAt === null
  const existingAssignment = uuid(v.expectedId) && typeof v.expectedUpdatedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v.expectedUpdatedAt) && Number.isFinite(Date.parse(v.expectedUpdatedAt))
  if (!newAssignment && !existingAssignment) return null
  if (v.mode === "manual" && (!uuid(v.assetId) || !point(v.focalX) || !point(v.focalY))) return null
  return {
    cityId: v.cityId, category: v.category as DiscoveryCategory, mode: v.mode as DiscoveryChoice["mode"],
    assetId: v.mode === "manual" ? v.assetId as string : null,
    focalX: v.mode === "manual" ? v.focalX as number : 0.5,
    focalY: v.mode === "manual" ? v.focalY as number : 0.5,
    expectedId: v.expectedId as string | null, expectedUpdatedAt: v.expectedUpdatedAt as string | null,
  }
}

export function discoveryImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  // This allowlist matches the public city's image resolver.
  if (value.startsWith("/images/cities/") && !value.includes("..")) return `https://benefitsi.de${value}`
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password) return null
    const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://unconfigured.invalid").hostname
    if (url.hostname === supabaseHost && /^\/storage\/v1\/object\/public\/(city-media|partner-assets)\//.test(url.pathname)) return url.href
    if (url.hostname === "commons.wikimedia.org" && url.pathname.startsWith("/wiki/Special:FilePath/")) return url.href
  } catch { return null }
  return null
}

export function isSelectableDiscoveryAsset(asset: { city_id: string | null; status: string; media_type: string; public_url: string }, cityId: string) {
  return (asset.city_id === null || asset.city_id === cityId) && asset.status === "PUBLISHED" && asset.media_type === "image" && discoveryImageUrl(asset.public_url) !== null
}
