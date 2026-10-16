import type { SupabaseClient } from "@supabase/supabase-js"
import type { PublicMicrositeConfig } from "./public-microsite-contract"

const PUBLIC_OBJECT_PREFIX = "/storage/v1/object/public/"
const IMAGE_BUCKETS = new Set([process.env.SUPABASE_PARTNER_MEDIA_BUCKET ?? "partner-assets", "city-media"])

type ImageReference = { slot: string; url: string }
type StorageImage = { bucket: string; path: string }

function selectedImages(snapshot: PublicMicrositeConfig): ImageReference[] {
  const slots: ImageReference[] = []
  for (const [group, keys] of Object.entries({
    branding: ["logoUrl", "partnerBadgeUrl"],
    hero: ["backgroundImageUrl"],
    deals: ["illustrationUrl", "topDealImageUrl"],
    seo: ["ogImageUrl"],
  })) {
    const values = snapshot[group as keyof PublicMicrositeConfig] as Record<string, unknown>
    for (const key of keys) {
      const url = values[key]
      if (typeof url === "string" && url) slots.push({ slot: `${group}.${key}`, url })
    }
  }
  for (const [slot, url] of Object.entries(snapshot.elementText)) {
    if ((/(?:Url|\.logo)$/.test(slot) || slot === "footer.benefitsiLogo") && url) {
      slots.push({ slot, url })
    }
  }
  return slots
}

function ownStorageImage(value: string, origin: string): StorageImage | "invalid" | null {
  let url: URL
  try { url = new URL(value) } catch { return null }
  if (url.origin !== origin) return null
  if (!url.pathname.startsWith(PUBLIC_OBJECT_PREFIX)) {
    return url.pathname.startsWith("/storage/v1/") ? "invalid" : null
  }
  const [bucket, ...encodedSegments] = url.pathname.slice(PUBLIC_OBJECT_PREFIX.length).split("/")
  if (!IMAGE_BUCKETS.has(bucket) || !encodedSegments.length) return "invalid"
  try {
    const segments = encodedSegments.map(segment => decodeURIComponent(segment))
    if (segments.some(segment => !segment || segment === "." || segment === ".." ||
        /[\\/\u0000-\u001f\u007f]/.test(segment) || /%2(?:e|f)|%5c/i.test(segment))) return "invalid"
    return { bucket, path: segments.join("/") }
  } catch { return "invalid" }
}

async function imageExists(supabase: SupabaseClient, image: StorageImage, timeoutMs: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => supabase.storage.from(image.bucket).info(image.path))
        .then(({ data, error }) => !error && !!data && /^image\//i.test(data.contentType ?? ""))
        .catch(() => false),
      new Promise<false>(resolve => { timeout = setTimeout(() => resolve(false), timeoutMs) }),
    ])
    return result
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

/** Check only images selected for the public snapshot. Private library/history
 * entries are retained but do not block an otherwise valid publication. */
export async function unavailablePublishedImages(
  supabase: SupabaseClient,
  snapshot: PublicMicrositeConfig,
  storageOrigin: string,
  timeoutMs = 5000,
): Promise<string[]> {
  let origin: string
  try { origin = new URL(storageOrigin).origin } catch { return ["Medienspeicher nicht konfiguriert"] }
  const checked = new Map<string, { image: StorageImage; slots: string[] }>()
  const blockers: string[] = []
  for (const { slot, url } of selectedImages(snapshot)) {
    const image = ownStorageImage(url, origin)
    if (image === null) continue // External images are never fetched by this check.
    if (image === "invalid") { blockers.push(`Bildquelle „${slot}“: ungültiger eigener Storagepfad`); continue }
    const key = `${image.bucket}/${image.path}`
    const existing = checked.get(key)
    if (existing) existing.slots.push(slot)
    else checked.set(key, { image, slots: [slot] })
  }
  const results = await Promise.all([...checked.values()].map(async ({ image, slots }) =>
    await imageExists(supabase, image, timeoutMs)
      ? null
      : `Bildquelle „${slots.join(", ")}“: eigenes Bild nicht lesbar oder nicht vorhanden`,
  ))
  return [...blockers, ...results.filter((result): result is string => result !== null)]
}
