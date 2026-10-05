import type { PartnerWithDeals } from "./admin-data"

export type PartnerMediaQualityIssue = {
  label: string
  width: number
  height: number
  targetWidth: number
  targetHeight: number
  url: string
}

export type PartnerMediaQualityAudit = {
  lowResolution: PartnerMediaQualityIssue[]
  unverified: Array<{ label: string; url: string }>
}

type MediaTarget = {
  label: string
  minWidth: number
  minHeight: number
}

const targets = {
  logo: { label: "Logo", minWidth: 190, minHeight: 190 },
  feature: { label: "Feature image", minWidth: 1440, minHeight: 940 },
  discover: { label: "Discovery image", minWidth: 768, minHeight: 840 },
  cover: { label: "Cover", minWidth: 1200, minHeight: 1200 },
  menuItem: { label: "Menu item", minWidth: 192, minHeight: 192 },
  menuCategory: { label: "Menu category", minWidth: 1200, minHeight: 504 },
  dealDrop: { label: "Deal image", minWidth: 1420, minHeight: 800 },
  micrositeHero: { label: "Microsite hero", minWidth: 1440, minHeight: 960 },
  micrositeOther: { label: "Microsite image", minWidth: 768, minHeight: 768 },
} satisfies Record<string, MediaTarget>

// These legacy files predate dimension-tagged upload names. Their dimensions
// were measured from the stored images during the Supabase media audit.
const knownLegacyDimensions: Record<string, { width: number; height: number }> = {
  "discover-1784743533509-dc.png": { width: 440, height: 500 },
  "discover-1784743768660-dc.png": { width: 440, height: 500 },
  "pinocchio-eis.jpg": { width: 65, height: 80 },
  "riesen-becher.jpg": { width: 64, height: 80 },
  "schneemann-becher.jpg": { width: 65, height: 80 },
}

type Candidate = {
  url: string
  target: MediaTarget
}

type Dimensions = { width: number; height: number }
const measuredDimensions = new Map<string, Dimensions>()
const pendingMeasurements = new Map<string, Promise<void>>()
const measurementListeners = new Set<() => void>()
let measurementRevision = 0
export const getMediaMeasurementRevision = () => measurementRevision
export const getServerMediaMeasurementRevision = () => 0
export const getRecordedMediaDimensions = (url: string) => measuredDimensions.get(url)

// Prepared uploads carry the real canvas dimensions in their generated names.
// Publish those dimensions immediately; the preview load confirms them again.
export function recordPreparedMediaDimensions(url: string, fileName: string) {
  const dimensions = dimensionsFromUrl(fileName)
  if (dimensions) recordMediaDimensions(url, dimensions)
}

export function subscribeMediaMeasurements(listener: () => void) {
  measurementListeners.add(listener)
  return () => { measurementListeners.delete(listener) }
}

export function recordMediaDimensions(url: string, dimensions: Dimensions) {
  if (!dimensions.width || !dimensions.height) return
  const previous = measuredDimensions.get(url)
  if (previous?.width === dimensions.width && previous.height === dimensions.height) return
  measuredDimensions.set(url, dimensions)
  measurementRevision += 1
  measurementListeners.forEach(listener => listener())
}

// Recheck replaced media from its final public URL. Prepared-file dimensions
// are useful for immediate feedback, but this confirms what storage serves.
export async function remeasureMediaUrls(urls: string[], options: { refresh?: boolean } = {}) {
  const uniqueUrls = [...new Set(urls)].filter(url => url && !/\.svg(?:[?#]|$)/i.test(url))
  let index = 0
  await Promise.all(Array.from({ length: Math.min(4, uniqueUrls.length) }, async () => {
    while (index < uniqueUrls.length) {
      const url = uniqueUrls[index++]
      const dimensions = await new Promise<Dimensions | null>(resolve => {
        const image = new Image()
        const finish = (result: Dimensions | null) => {
          clearTimeout(timeout)
          image.onload = null
          image.onerror = null
          resolve(result)
        }
        const timeout = setTimeout(() => finish(null), 15000)
        image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight })
        image.onerror = () => finish(null)
        if (options.refresh) {
          // Re-read saved assets even when storage kept the same public URL.
          const refreshedUrl = new URL(url, window.location.href)
          refreshedUrl.searchParams.set("_media_quality_check", String(Date.now()))
          image.src = refreshedUrl.toString()
        } else {
          image.src = url
        }
      })
      if (dimensions) recordMediaDimensions(url, dimensions)
      else if (measuredDimensions.delete(url)) {
        measurementRevision += 1
        measurementListeners.forEach(listener => listener())
      }
    }
  }))
}

// Four workers prevent a large partner list from flooding storage with requests.
export async function measurePartnerMedia(partners: PartnerWithDeals[], cancelled: () => boolean) {
  const urls = [...new Set(partners.flatMap(partner => collectCandidates(partner).map(candidate => candidate.url)))]
  let index = 0
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (index < urls.length && !cancelled()) {
      const url = urls[index++]
      if (measuredDimensions.has(url) || /\.svg(?:[?#]|$)/i.test(url)) continue
      let pending = pendingMeasurements.get(url)
      if (!pending) {
        pending = new Promise<void>(resolve => {
          const image = new Image()
          const finish = () => {
            clearTimeout(timeout)
            image.onload = null
            image.onerror = null
            resolve()
          }
          const timeout = setTimeout(finish, 15000)
          image.onload = () => {
            recordMediaDimensions(url, { width: image.naturalWidth, height: image.naturalHeight })
            finish()
          }
          image.onerror = finish
          image.src = url
        }).finally(() => { pendingMeasurements.delete(url) })
        pendingMeasurements.set(url, pending)
      }
      await pending
    }
  }))
}

function collectCandidates(partner: PartnerWithDeals): Candidate[] {
  const candidates = new Map<string, Candidate>()
  const add = (url: unknown, target: MediaTarget) => {
    if (typeof url !== "string" || !url.trim()) return
    const normalized = url.trim()
    const key = `${target.label}:${normalized}`
    if (!candidates.has(key)) {
      candidates.set(key, { url: normalized, target })
    }
  }

  add(partner.logo_url, targets.logo)
  add(partner.feature_card_url, targets.feature)
  add(partner.discover_card_image_url, targets.discover)
  for (const [index, url] of (partner.cover_urls ?? []).entries()) {
    add(url, { ...targets.cover, label: `Cover ${index + 1}` })
  }

  for (const deal of partner.deals) {
    const metadata = asRecord(deal.metadata)
    add(metadata?.card_image_url, targets.dealDrop)
  }

  for (const menu of partner.menus) {
    for (const category of menu.categories) {
      add(
        category.image_url,
        category.name
          ? { ...targets.menuCategory, label: `Menu category: ${category.name}` }
          : targets.menuCategory,
      )
      for (const item of category.items) {
        add(
          item.image_url,
          item.name
            ? { ...targets.menuItem, label: `Menu item: ${item.name}` }
            : targets.menuItem,
        )
      }
    }
    for (const item of menu.items) {
      add(
        item.image_url,
        item.name
          ? { ...targets.menuItem, label: `Menu item: ${item.name}` }
          : targets.menuItem,
      )
    }
  }

  for (const version of [
    partner.microsite?.draftVersion,
    partner.microsite?.publishedVersion,
  ]) {
    const config = asRecord(version?.config)
    const assets = asRecord(config?.assets)
    const library = Array.isArray(assets?.library) ? assets.library : []
    for (const asset of library) {
      const record = asRecord(asset)
      if (typeof record?.url !== "string") continue
      const slot = typeof record.slot === "string" ? record.slot : ""
      const label = typeof record.label === "string" ? record.label : "Microsite image"
      const target = targetForMicrositeSlot(slot, label)
      add(record.url, target)
    }
  }

  return [...candidates.values()]
}

// The partner list warning should describe the images visible in the partner
// media editor. Deals, menus, and microsite libraries have their own editors
// and must not make the partner's main media warning appear stale.
export function inspectPartnerMediaQuality(partner: PartnerWithDeals, useMeasured = false): PartnerMediaQualityAudit {
  const candidates: Candidate[] = []
  const add = (url: string | null | undefined, target: MediaTarget) => {
    if (url?.trim()) candidates.push({ url: url.trim(), target })
  }
  add(partner.logo_url, targets.logo)
  add(partner.feature_card_url, targets.feature)
  add(partner.discover_card_image_url, targets.discover)
  for (const [index, url] of (partner.cover_urls ?? []).entries()) {
    add(url, { ...targets.cover, label: `Cover ${index + 1}` })
  }

  const lowResolution: PartnerMediaQualityIssue[] = []
  const unverified: PartnerMediaQualityAudit["unverified"] = []
  for (const candidate of candidates) {
    if (/\.svg(?:[?#]|$)/i.test(candidate.url)) continue
    const dimensions = (useMeasured ? measuredDimensions.get(candidate.url) : null) ?? dimensionsFromUrl(candidate.url)
    if (!dimensions) {
      unverified.push({ label: candidate.target.label, url: candidate.url })
    } else if (dimensions.width < candidate.target.minWidth || dimensions.height < candidate.target.minHeight) {
      lowResolution.push({
        label: candidate.target.label,
        width: dimensions.width,
        height: dimensions.height,
        targetWidth: candidate.target.minWidth,
        targetHeight: candidate.target.minHeight,
        url: candidate.url,
      })
    }
  }
  return { lowResolution, unverified }
}

function dimensionsFromUrl(value: string) {
  try {
    const pathname = new URL(value, "https://local.invalid").pathname
    const fileName = pathname.split("/").at(-1) ?? ""
    const legacyDimensions = knownLegacyDimensions[fileName.toLowerCase()]
    if (legacyDimensions) return legacyDimensions

    const matches = Array.from(
      fileName.matchAll(/(?:^|[-_.])(\d{2,5})x(\d{2,5})(?=$|[-_.])/gi),
    )
    const lastMatch = matches.at(-1)
    if (!lastMatch) return null

    const width = Number(lastMatch[1])
    const height = Number(lastMatch[2])
    return width > 0 && height > 0 ? { width, height } : null
  } catch {
    return null
  }
}

export function inspectMediaDimensions(
  label: string,
  url: string,
  dimensions: Dimensions | null = dimensionsFromUrl(url),
): PartnerMediaQualityIssue | null {
  // Vector artwork remains sharp regardless of its intrinsic pixel dimensions.
  if (/\.svg(?:[?#]|$)/i.test(url)) return null
  const target = Object.values(targets).find((target) => target.label === label)
    ?? (label === "Feature" ? targets.feature
      : label === "Discover" ? targets.discover
      : label === "Deal Drop card" ? targets.dealDrop : null)
  if (!target || !dimensions) return null
  if (dimensions.width >= target.minWidth && dimensions.height >= target.minHeight) return null
  return {
    label, url, ...dimensions,
    targetWidth: target.minWidth, targetHeight: target.minHeight,
  }
}

function targetForMicrositeSlot(slot: string, label: string): MediaTarget {
  const normalized = slot.toLowerCase()
  if (normalized.includes("logo")) return { ...targets.logo, label }
  if (normalized.includes("feature")) return { ...targets.feature, label }
  if (normalized.includes("discover")) return { ...targets.discover, label }
  if (normalized.includes("cover")) return { ...targets.cover, label }
  if (normalized.includes("menuitem")) return { ...targets.menuItem, label }
  if (normalized.includes("menu") && normalized.includes("category")) {
    return { ...targets.menuCategory, label }
  }
  if (normalized.includes("hero") || normalized.includes("background")) {
    return { ...targets.micrositeHero, label }
  }
  return { ...targets.micrositeOther, label }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value))
    } catch {
      return null
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
