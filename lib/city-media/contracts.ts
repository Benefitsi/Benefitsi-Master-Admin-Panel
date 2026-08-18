export const mediaSourceTypes = [
  "MANUAL_UPLOAD",
  "PARTNER_UPLOAD",
  "OFFICIAL_SOURCE",
  "TOURISM_SOURCE",
  "AGENT_DISCOVERED",
  "EXISTING_ASSET",
  "FALLBACK",
] as const

export type CityMediaSourceType = (typeof mediaSourceTypes)[number]

export const mediaStatuses = [
  "DRAFT",
  "REVIEW",
  "PUBLISHED",
  "ARCHIVED",
  "REJECTED",
] as const

export type CityMediaStatus = (typeof mediaStatuses)[number]

export const mediaEntityTypes = [
  "CITY",
  "PLACE",
  "BUSINESS",
  "PARTNER_LOCATION",
  "EVENT",
  "ROUTE",
  "GUIDE",
  "COLLECTION",
  "HUB",
  "CITY_HOMEPAGE",
] as const

export type CityMediaEntityType = (typeof mediaEntityTypes)[number]

export const mediaRoles = [
  "HERO",
  "CARD",
  "GALLERY",
  "THUMBNAIL",
  "OG",
  "SECTION",
  "BACKGROUND",
] as const

export type CityMediaRole = (typeof mediaRoles)[number]

export type CityMediaCity = {
  id: string
  name: string
  slug: string
}

export type CityMediaEntityOption = {
  id?: string
  key?: string
  cityId: string
  entityType: CityMediaEntityType
  label: string
}

export type CityMediaAssignment = {
  id: string
  cityId: string
  mediaAssetId: string
  entityType: CityMediaEntityType
  entityId: string | null
  entityKey: string | null
  role: CityMediaRole
  sortOrder: number
  isPrimary: boolean
  manualLock: boolean
  focalX: number
  focalY: number
  desktopFocalX: number | null
  desktopFocalY: number | null
  mobileFocalX: number | null
  mobileFocalY: number | null
  createdAt: string
  updatedAt: string
  entityLabel?: string
}

export type CityMediaAsset = {
  id: string
  cityId: string | null
  storageBucket: string
  storagePath: string | null
  publicUrl: string
  mediaType: string
  mimeType: string
  width: number | null
  height: number | null
  fileSizeBytes: number | null
  contentHash: string | null
  title: string | null
  altText: string | null
  photographer: string | null
  copyrightHolder: string | null
  license: string | null
  licenseUrl: string | null
  sourceType: CityMediaSourceType
  sourceUrl: string | null
  provenanceNote: string | null
  status: CityMediaStatus
  createdAt: string
  updatedAt: string
  cityName?: string
  citySlug?: string
  assignments: CityMediaAssignment[]
}

export type CityMediaLibraryData = {
  cities: CityMediaCity[]
  assets: CityMediaAsset[]
  entityOptions: CityMediaEntityOption[]
  publicBaseUrl?: string
}

export const sourceLabels: Record<CityMediaSourceType, string> = {
  MANUAL_UPLOAD: "Manueller Upload",
  PARTNER_UPLOAD: "Partner-Upload",
  OFFICIAL_SOURCE: "Offizielle Quelle",
  TOURISM_SOURCE: "Tourismusquelle",
  AGENT_DISCOVERED: "Agent entdeckt",
  EXISTING_ASSET: "Bestehendes Asset",
  FALLBACK: "Fallback",
}

export const statusLabels: Record<CityMediaStatus, string> = {
  DRAFT: "Entwurf",
  REVIEW: "Prüfung",
  PUBLISHED: "Veröffentlicht",
  ARCHIVED: "Archiviert",
  REJECTED: "Abgelehnt",
}

export const entityTypeLabels: Record<CityMediaEntityType, string> = {
  CITY: "Stadt",
  PLACE: "Ort",
  BUSINESS: "Business",
  PARTNER_LOCATION: "Partner-Standort",
  EVENT: "Veranstaltung",
  ROUTE: "Route",
  GUIDE: "Guide",
  COLLECTION: "Sammlung",
  HUB: "Hub",
  CITY_HOMEPAGE: "Stadt-Homepage",
}

export const roleLabels: Record<CityMediaRole, string> = {
  HERO: "Hero",
  CARD: "Card",
  GALLERY: "Galerie",
  THUMBNAIL: "Thumbnail",
  OG: "Open Graph",
  SECTION: "Sektion",
  BACKGROUND: "Hintergrund",
}

/** Higher values win when no role-scoped manual lock exists. */
export const sourcePriority: Record<CityMediaSourceType, number> = {
  MANUAL_UPLOAD: 600,
  PARTNER_UPLOAD: 550,
  EXISTING_ASSET: 500,
  OFFICIAL_SOURCE: 400,
  TOURISM_SOURCE: 350,
  AGENT_DISCOVERED: 250,
  FALLBACK: 100,
}

export function isMediaSourceType(value: unknown): value is CityMediaSourceType {
  return typeof value === "string" && mediaSourceTypes.includes(value as CityMediaSourceType)
}

export function isMediaStatus(value: unknown): value is CityMediaStatus {
  return typeof value === "string" && mediaStatuses.includes(value as CityMediaStatus)
}

export function isMediaEntityType(value: unknown): value is CityMediaEntityType {
  return typeof value === "string" && mediaEntityTypes.includes(value as CityMediaEntityType)
}

export function isMediaRole(value: unknown): value is CityMediaRole {
  return typeof value === "string" && mediaRoles.includes(value as CityMediaRole)
}

export function mediaUsage(asset: CityMediaAsset) {
  return asset.assignments.map((assignment) => ({
    label: assignment.entityLabel || assignment.entityKey || assignment.entityId || "Unbekannte Entity",
    role: roleLabels[assignment.role],
    assignmentId: assignment.id,
  }))
}
