import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  type CityMediaAsset,
  type CityMediaAssignment,
  type CityMediaCity,
  type CityMediaEntityOption,
  type CityMediaEntityType,
  type CityMediaLibraryData,
  isMediaEntityType,
} from "@/lib/city-media/contracts"

type JsonRow = Record<string, unknown>

function rows(value: unknown): JsonRow[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRow => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : []
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function bool(value: unknown) {
  return value === true
}

function normalizeAssignment(row: JsonRow, entityLabel?: string): CityMediaAssignment {
  return {
    id: String(row.id),
    cityId: String(row.city_id),
    mediaAssetId: String(row.media_asset_id),
    entityType: String(row.entity_type) as CityMediaAssignment["entityType"],
    entityId: text(row.entity_id),
    entityKey: text(row.entity_key),
    role: String(row.role) as CityMediaAssignment["role"],
    sortOrder: number(row.sort_order) ?? 0,
    isPrimary: bool(row.is_primary),
    manualLock: bool(row.manual_lock),
    focalX: number(row.focal_x) ?? 0.5,
    focalY: number(row.focal_y) ?? 0.5,
    desktopFocalX: number(row.desktop_focal_x),
    desktopFocalY: number(row.desktop_focal_y),
    mobileFocalX: number(row.mobile_focal_x),
    mobileFocalY: number(row.mobile_focal_y),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    entityLabel,
  }
}

function normalizeAsset(row: JsonRow, city?: CityMediaCity, assignments: CityMediaAssignment[] = []): CityMediaAsset {
  return {
    id: String(row.id),
    cityId: text(row.city_id),
    storageBucket: text(row.storage_bucket) ?? "city-media",
    storagePath: text(row.storage_path),
    publicUrl: String(row.public_url ?? ""),
    mediaType: text(row.media_type) ?? "image",
    mimeType: text(row.mime_type) ?? "image/jpeg",
    width: number(row.width),
    height: number(row.height),
    fileSizeBytes: number(row.file_size_bytes),
    contentHash: text(row.content_hash),
    title: text(row.title),
    altText: text(row.alt_text),
    photographer: text(row.photographer),
    copyrightHolder: text(row.copyright_holder),
    license: text(row.license),
    licenseUrl: text(row.license_url),
    sourceType: String(row.source_type ?? "MANUAL_UPLOAD") as CityMediaAsset["sourceType"],
    sourceUrl: text(row.source_url),
    provenanceNote: text(row.provenance_note),
    status: String(row.status ?? "DRAFT") as CityMediaAsset["status"],
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    cityName: city?.name,
    citySlug: city?.slug,
    assignments,
  }
}

async function loadEntityOptions(admin: ReturnType<typeof createAdminClient>, cities: CityMediaCity[]) {
  const options: CityMediaEntityOption[] = []
  for (const city of cities) {
    options.push(
      { cityId: city.id, entityType: "CITY", id: city.id, key: city.slug, label: `${city.name} · Stadt` },
      { cityId: city.id, entityType: "CITY_HOMEPAGE", id: city.id, key: city.slug, label: `${city.name} · Homepage` },
    )
  }

  // The structured City Editor uses the same Media Library for the homepage,
  // hub and collection surfaces. Config rows are references, not a second
  // media store, so expose them as picker targets alongside content entities.
  const pageConfigsResult = await admin
    .from("city_page_configs")
    .select("id,city_id,scope_type,scope_key,title")
    .in("city_id", cities.map((city) => city.id))
  if (!pageConfigsResult.error) {
    const cityById = new Map(cities.map((city) => [city.id, city]))
    for (const row of rows(pageConfigsResult.data)) {
      const city = cityById.get(text(row.city_id) ?? "")
      const id = text(row.id)
      const scopeType = text(row.scope_type)
      const scopeKey = text(row.scope_key)
      if (!city || !id || !scopeKey) continue
      const entityType = scopeType === "HOMEPAGE" ? "CITY_HOMEPAGE" : scopeType === "HUB" ? "HUB" : scopeType === "COLLECTION" ? "COLLECTION" : null
      if (!entityType) continue
      options.push({ cityId: city.id, entityType, id, key: scopeKey, label: `${city.name} · ${text(row.title) ?? scopeKey}` })
    }
  }

  const definitions: Array<{ table: string; entityType: CityMediaEntityType; labelField: string; keyField?: string }> = [
    { table: "city_places", entityType: "PLACE", labelField: "name", keyField: "canonical_slug" },
    { table: "city_events", entityType: "EVENT", labelField: "title", keyField: "canonical_slug" },
    { table: "city_routes", entityType: "ROUTE", labelField: "title", keyField: "canonical_slug" },
    { table: "city_guides", entityType: "GUIDE", labelField: "title", keyField: "slug" },
    { table: "city_meetups", entityType: "HUB", labelField: "title", keyField: "canonical_slug" },
    { table: "partners", entityType: "BUSINESS", labelField: "name", keyField: "slug" },
    { table: "partners", entityType: "PARTNER_LOCATION", labelField: "name", keyField: "slug" },
  ]

  const results = await Promise.all(
    definitions.map(async (definition) => {
      const fields = ["id", "city_id", definition.labelField, ...(definition.keyField ? [definition.keyField] : [])].join(",")
      const result = await admin.from(definition.table).select(fields).limit(5000)
      return { definition, result }
    }),
  )

  for (const { definition, result } of results) {
    if (result.error) continue
    for (const row of rows(result.data)) {
      const cityId = text(row.city_id)
      const id = text(row.id)
      const label = text(row[definition.labelField])
      if (!cityId || !id || !label) continue
      options.push({
        cityId,
        entityType: definition.entityType,
        id,
        key: definition.keyField ? text(row[definition.keyField]) ?? undefined : undefined,
        label,
      })
    }
  }

  return options
}

export async function loadCityMediaLibraryData(): Promise<CityMediaLibraryData> {
  const admin = createAdminClient()
  const [citiesResult, assetsResult, assignmentsResult] = await Promise.all([
    admin.from("cities").select("id,name,slug").order("name"),
    admin.from("city_media_assets").select("*").order("updated_at", { ascending: false }).limit(2000),
    admin.from("city_media_assignments").select("*").order("sort_order", { ascending: true }).limit(5000),
  ])

  if (citiesResult.error) throw new Error(`Städte konnten nicht geladen werden: ${citiesResult.error.message}`)
  if (assetsResult.error) throw new Error(`Media Assets konnten nicht geladen werden: ${assetsResult.error.message}`)
  if (assignmentsResult.error) throw new Error(`Media-Zuweisungen konnten nicht geladen werden: ${assignmentsResult.error.message}`)

  const cities = rows(citiesResult.data).flatMap((row) => {
    const id = text(row.id)
    const name = text(row.name)
    const slug = text(row.slug)
    return id && name && slug ? [{ id, name, slug }] : []
  })
  const cityById = new Map(cities.map((city) => [city.id, city]))
  const entityOptions = await loadEntityOptions(admin, cities)
  const labelByReference = new Map(
    entityOptions.flatMap((option) => {
      const entries: [string, string][] = []
      if (option.id) entries.push([`${option.entityType}:id:${option.id}`, option.label])
      if (option.key) entries.push([`${option.entityType}:key:${option.key}`, option.label])
      return entries
    }),
  )
  const assignmentsByAsset = new Map<string, CityMediaAssignment[]>()

  for (const row of rows(assignmentsResult.data)) {
    const entityType = String(row.entity_type) as CityMediaEntityType
    if (!isMediaEntityType(entityType)) continue
    const entityId = text(row.entity_id)
    const entityKey = text(row.entity_key)
    const label = labelByReference.get(
      `${entityType}:${entityId ? `id:${entityId}` : `key:${entityKey}`}`,
    )
    const assignment = normalizeAssignment(row, label)
    const list = assignmentsByAsset.get(assignment.mediaAssetId) ?? []
    list.push(assignment)
    assignmentsByAsset.set(assignment.mediaAssetId, list)
  }

  const assets = rows(assetsResult.data).map((row) => {
    const city = cityById.get(text(row.city_id) ?? "")
    return normalizeAsset(row, city, assignmentsByAsset.get(String(row.id)) ?? [])
  })

  return {
    cities,
    assets,
    entityOptions,
    publicBaseUrl: (process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL?.trim() || "https://benefitsi.de").replace(/\/$/, ""),
  }
}
