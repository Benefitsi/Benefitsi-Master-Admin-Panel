import type { DashboardData, PartnerWithDeals } from "../admin-data"
import { canonicalPartnerSlug } from "../partner-paths"

export type EcosystemPage = {
  id: string
  title: string
  kind: "Stadtseite" | "Microsite"
  description: string
  status: string
  href: string | null
  adminHref: string
}

export type PublicMicrositeDirectoryItem = {
  id: string
  partner_id: string
  slug: string
  published_version_id: string
}

export type PublicMicrositeDirectory = {
  state: "available" | "unavailable"
  items: PublicMicrositeDirectoryItem[]
}

const unavailable: PublicMicrositeDirectory = { state: "unavailable", items: [] }
const hasText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0

/** Narrow the authoritative public RPC result; never retain private/config data. */
export function parsePublicMicrositeDirectory(data: unknown, error?: unknown): PublicMicrositeDirectory {
  if (error || !Array.isArray(data)) return { ...unavailable, items: [] }
  const items: PublicMicrositeDirectoryItem[] = []
  for (const value of data) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...unavailable, items: [] }
    const row = value as Record<string, unknown>
    if (![row.id, row.partner_id, row.slug, row.published_version_id].every(hasText)) {
      return { ...unavailable, items: [] }
    }
    items.push({
      id: row.id as string,
      partner_id: row.partner_id as string,
      slug: row.slug as string,
      published_version_id: row.published_version_id as string,
    })
  }
  return { state: "available", items }
}

/** Uses loaded rows only. Row counts are not system-wide page totals. */
export function buildPageDirectory(
  dashboard: Pick<DashboardData, "partners" | "cities" | "errors">,
  publicDirectory: PublicMicrositeDirectory = unavailable,
): EcosystemPage[] {
  const partial = dashboard.errors.length > 0
  const statusWithWarning = (status: string) => partial ? `${status} · Daten unvollständig` : status
  const cityNames = new Map(dashboard.cities.map(city => [city.id, city.name]))
  const publicById = new Map(publicDirectory.items.map(item => [item.id, item]))
  const cities: EcosystemPage[] = dashboard.cities.map(city => {
    const slug = hasText(city.slug) ? encodeURIComponent(city.slug) : null
    return {
      id: `city:${city.id}`,
      title: city.name?.trim() || "Stadt ohne Namen",
      kind: "Stadtseite",
      description: "Lokale Inhalte und Angebote",
      status: statusWithWarning(slug ? "Stadtseite" : "Slug fehlt"),
      href: slug ? `https://benefitsi.de/stadt/${slug}` : null,
      adminHref: slug ? `/city-pages/${slug}` : "/city-pages",
    }
  })
  const microsites: EcosystemPage[] = dashboard.partners.map((partner, index) => {
    const microsite = partner.microsite
    const publication = microsite ? publicById.get(microsite.id) : undefined
    const eligible = publicDirectory.state === "available" &&
      partner.is_active === true && partner.status === "active" &&
      microsite?.status === "published" && Boolean(microsite.published_version_id) &&
      publication?.partner_id === partner.id && publication?.published_version_id === microsite?.published_version_id
    return {
      id: `microsite:${partner.id || microsite?.id || index}`,
      title: partner.name?.trim() || partner.short_name?.trim() || "Partner ohne Namen",
      kind: "Microsite",
      description: partner.city_name?.trim() || (partner.city_id ? cityNames.get(partner.city_id)?.trim() : null) ||
        partner.address?.trim() || "Standort nicht hinterlegt",
      status: statusWithWarning(eligible ? "Öffentlich freigegeben" : micrositeStatus(partner, publicDirectory.state, partial)),
      href: eligible && publication ? `https://benefitsi.de/partner/${encodeURIComponent(canonicalPartnerSlug(publication.slug))}` : null,
      adminHref: partner.id ? `/?partner=${encodeURIComponent(partner.id)}&view=microsite#partners` : "/#partners",
    }
  })
  return [...cities, ...microsites]
}

function micrositeStatus(partner: PartnerWithDeals, publicState: PublicMicrositeDirectory["state"], partial: boolean): string {
  const microsite = partner.microsite
  if (!microsite) return partial ? "Status unbekannt" : "Noch keine Microsite"
  if (microsite.status === "archived") return "Archiviert"
  if (microsite.status === "draft") return "Entwurf"
  if (microsite.status === "review") return "In Prüfung"
  if (microsite.status === "approved") return "Freigegeben · nicht veröffentlicht"
  if (microsite.status !== "published") return "Status unbekannt"
  if (!microsite.published_version_id) return "Veröffentlichung unvollständig"
  if (partner.is_active === false || (hasText(partner.status) && partner.status !== "active")) return "Partner nicht aktiv"
  if (partner.is_active !== true || !hasText(partner.status)) return "Partnerstatus unbekannt"
  return publicState === "unavailable" ? "Öffentliche Freigabe nicht geprüft" : "Nicht öffentlich freigegeben"
}
