import "server-only"

import { loadCityOperationsData } from "@/lib/city-operations/data"
import { loadFieldControls, type CityFieldControl } from "@/lib/city-pages/field-controls"
import { createAdminClient } from "@/lib/supabase/admin"

type JsonRow = Record<string, unknown>

export type CityPageSummary = {
  id: string
  name: string
  slug: string
  region: string | null
  updatedAt: string | null
  profileComplete: boolean
  possibleDuplicate: boolean
  activeContentCount: number
  openReviewCount: number
  blockingIssueCount: number
  pendingCommunityCount: number
  confirmedSubscriberCount: number
}

export type CityPagesData = {
  cities: CityPageSummary[]
  warnings: string[]
}

export type CityPageProfile = {
  id: string
  name: string
  slug: string
  region: string
  intro: string
  heroImageUrl: string
  heroImageAlt: string
  seoTitle: string
  seoDescription: string
  state: string
  country: string
  latitude: number | null
  longitude: number | null
  updatedAt: string | null
}

export type CityPageDetail = {
  city: CityPageProfile | null
  records: Awaited<ReturnType<typeof loadCityOperationsData>>["records"]
  regions: string[]
  warnings: string[]
  fieldControls: Record<string, CityFieldControl>
}

function rows(value: unknown): JsonRow[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is JsonRow =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : []
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function countByCity(items: JsonRow[], predicate: (row: JsonRow) => boolean) {
  const counts = new Map<string, number>()

  for (const item of items) {
    if (!predicate(item)) continue
    const cityId = String(item.city_id ?? "")
    if (!cityId) continue
    counts.set(cityId, (counts.get(cityId) ?? 0) + 1)
  }

  return counts
}

export async function loadCityPagesData(): Promise<CityPagesData> {
  const admin = createAdminClient()
  const operations = await loadCityOperationsData()
  const warnings = [...operations.warnings]

  const extendedCitiesResult = await admin
    .from("cities")
    .select(
      "id,name,slug,region,intro,hero_image_url,seo_title,seo_description,updated_at",
    )
    .order("name")

  let cityRows: unknown = extendedCitiesResult.data

  if (extendedCitiesResult.error) {
    warnings.push(
      "Erweiterte Seitendaten konnten nicht vollständig geladen werden. Bitte die Stadtseiten-Migration prüfen.",
    )
    const basicCitiesResult = await admin
      .from("cities")
      .select("id,name,slug")
      .order("name")

    if (basicCitiesResult.error) {
      throw new Error(
        `Städteseiten konnten nicht geladen werden: ${basicCitiesResult.error.message}`,
      )
    }
    cityRows = basicCitiesResult.data
  }

  const [communityResult, newsletterResult] = await Promise.all([
    admin
      .from("city_community_submissions")
      .select("city_id,status")
      .limit(5000),
    admin
      .from("city_newsletter_subscriptions")
      .select("city_id,status")
      .limit(10000),
  ])

  if (communityResult.error) {
    warnings.push(
      "Community-Einreichungen sind in dieser Übersicht noch nicht verfügbar.",
    )
  }
  if (newsletterResult.error) {
    warnings.push(
      "Newsletter-Zahlen sind in dieser Übersicht noch nicht verfügbar.",
    )
  }

  const pendingCommunity = countByCity(
    rows(communityResult.data),
    (row) => row.status === "needs_review",
  )
  const confirmedSubscribers = countByCity(
    rows(newsletterResult.data),
    (row) => row.status === "confirmed",
  )

  const normalizedCityRows = rows(cityRows)
  const cityNameCounts = new Map<string, number>()

  for (const city of normalizedCityRows) {
    const normalizedName = (text(city.name) ?? "").toLocaleLowerCase("de")
    if (!normalizedName) continue
    cityNameCounts.set(
      normalizedName,
      (cityNameCounts.get(normalizedName) ?? 0) + 1,
    )
  }

  if (Array.from(cityNameCounts.values()).some((count) => count > 1)) {
    warnings.push(
      "Mögliche Stadt-Dubletten gefunden. Bitte vor weiteren Automationen zusammenführen, damit Inhalte und Statistiken nicht geteilt werden.",
    )
  }

  return {
    cities: normalizedCityRows.map((city) => {
      const cityId = String(city.id ?? "")
      const cityName = text(city.name) ?? "Unbenannter Ort"
      const records = operations.records.filter(
        (record) => record.cityId === cityId,
      )

      return {
        id: cityId,
        name: cityName,
        slug: text(city.slug) ?? "",
        region: text(city.region),
        updatedAt: text(city.updated_at),
        profileComplete: Boolean(
          text(city.intro) &&
            text(city.hero_image_url) &&
            text(city.seo_title) &&
            text(city.seo_description),
        ),
        possibleDuplicate:
          (cityNameCounts.get(cityName.toLocaleLowerCase("de")) ?? 0) > 1,
        activeContentCount: records.filter(
          (record) => record.contentStatus === "active",
        ).length,
        openReviewCount: records.filter(
          (record) =>
            !["published", "rejected", "archived"].includes(record.stage),
        ).length,
        blockingIssueCount: records.filter((record) =>
          record.issues.some((issue) => issue.severity === "blocking"),
        ).length,
        pendingCommunityCount: pendingCommunity.get(cityId) ?? 0,
        confirmedSubscriberCount: confirmedSubscribers.get(cityId) ?? 0,
      }
    }),
    warnings: Array.from(new Set(warnings)),
  }
}

export async function loadCityPageDetail(
  citySlug: string,
): Promise<CityPageDetail> {
  const admin = createAdminClient()
  const operations = await loadCityOperationsData()
  const cityResult = await admin
    .from("cities")
    .select(
      "id,name,slug,region,intro,hero_image_url,hero_image_alt,seo_title,seo_description,state,country,latitude,longitude,updated_at",
    )
    .eq("slug", citySlug)
    .maybeSingle()

  if (cityResult.error) {
    throw new Error(
      `Stadtprofil konnte nicht geladen werden: ${cityResult.error.message}`,
    )
  }

  const city = cityResult.data as JsonRow | null
  if (!city) {
    return {
      city: null,
      records: [],
      regions: [],
      warnings: operations.warnings,
      fieldControls: {},
    }
  }

  const cityId = String(city.id ?? "")
  const fieldControls = await loadFieldControls(
    admin,
    cityId,
    "CITY_HOMEPAGE",
    cityId,
  )
  const membershipAreaIds = new Set(
    operations.memberships
      .filter((membership) => membership.cityId === cityId)
      .map((membership) => membership.geoAreaId),
  )

  return {
    city: {
      id: cityId,
      name: text(city.name) ?? "Unbenannter Ort",
      slug: text(city.slug) ?? "",
      region: text(city.region) ?? "",
      intro: text(city.intro) ?? "",
      heroImageUrl: text(city.hero_image_url) ?? "",
      heroImageAlt: text(city.hero_image_alt) ?? "",
      seoTitle: text(city.seo_title) ?? "",
      seoDescription: text(city.seo_description) ?? "",
      state: text(city.state) ?? "",
      country: text(city.country) ?? "Deutschland",
      latitude:
        typeof city.latitude === "number" ? city.latitude : null,
      longitude:
        typeof city.longitude === "number" ? city.longitude : null,
      updatedAt: text(city.updated_at),
    },
    records: operations.records.filter((record) => record.cityId === cityId),
    regions: operations.geoAreas
      .filter((area) => membershipAreaIds.has(area.id))
      .map((area) => area.name),
    warnings: operations.warnings,
    fieldControls,
  }
}
