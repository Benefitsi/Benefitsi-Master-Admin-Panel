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
  logo: { label: "Logo", minWidth: 84, minHeight: 84 },
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

export function inspectPartnerMediaQuality(
  partner: PartnerWithDeals,
): PartnerMediaQualityAudit {
  const candidates = new Map<string, Candidate>()
  const add = (url: unknown, target: MediaTarget) => {
    if (typeof url !== "string" || !url.trim()) return
    const normalized = url.trim()
    if (!candidates.has(normalized)) {
      candidates.set(normalized, { url: normalized, target })
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

  const lowResolution: PartnerMediaQualityIssue[] = []
  const unverified: PartnerMediaQualityAudit["unverified"] = []

  for (const candidate of candidates.values()) {
    const dimensions = dimensionsFromUrl(candidate.url)
    if (!dimensions) {
      unverified.push({ label: candidate.target.label, url: candidate.url })
      continue
    }

    if (
      dimensions.width < candidate.target.minWidth ||
      dimensions.height < candidate.target.minHeight
    ) {
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
      fileName.matchAll(/(?:^|[-_])(\d{2,5})x(\d{2,5})(?=$|[-_.])/gi),
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
