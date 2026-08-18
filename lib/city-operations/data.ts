import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  normalizeIssues,
  normalizeReviewStage,
  normalizeReviewVerdict,
  type CityContentType,
  type CityGeoMembership,
  type CityOperationsData,
  type CityReviewAuditEntry,
  type CityReviewRecord,
  type GeoArea,
} from "./contracts"

type JsonRow = Record<string, unknown>

type ContentDefinition = {
  contentType: CityContentType
  table: string
  titleField: string
  categoryField?: string
  descriptionField: string
  select: string
}

const contentDefinitions: ContentDefinition[] = [
  {
    contentType: "events",
    table: "city_events",
    titleField: "title",
    categoryField: "category",
    descriptionField: "description",
    select:
      "id,city_id,title,canonical_slug,description,category,status,source_name,source_url,start_date,end_date,expires_at,last_verified_at,updated_at",
  },
  {
    contentType: "places",
    table: "city_places",
    titleField: "name",
    categoryField: "category",
    descriptionField: "description",
    select:
      "id,city_id,name,canonical_slug,description,category,status,source_url,expires_at,last_verified_at,updated_at",
  },
  {
    contentType: "playgrounds",
    table: "city_playgrounds",
    titleField: "name",
    descriptionField: "description",
    select:
      "id,city_id,name,description,status,source_url,expires_at,last_verified_at,updated_at",
  },
  {
    contentType: "clubs",
    table: "city_clubs",
    titleField: "name",
    categoryField: "category",
    descriptionField: "description",
    select:
      "id,city_id,name,description,category,status,source_url,expires_at,last_verified_at,updated_at",
  },
  {
    contentType: "routes",
    table: "city_routes",
    titleField: "title",
    categoryField: "type",
    descriptionField: "description",
    select:
      "id,city_id,title,canonical_slug,description,type,status,source_url,expires_at,last_verified_at,updated_at",
  },
  {
    contentType: "guides",
    table: "city_guides",
    titleField: "title",
    categoryField: "category",
    descriptionField: "description",
    select:
      "id,city_id,title,slug,description,category,status,source_url,expires_at,last_verified_at,updated_at",
  },
  {
    contentType: "challenges",
    table: "city_challenges",
    titleField: "title",
    descriptionField: "description",
    select:
      "id,city_id,title,description,status,source_url,expires_at,last_verified_at,updated_at",
  },
  {
    contentType: "benefits",
    table: "city_partner_benefits",
    titleField: "title",
    categoryField: "type",
    descriptionField: "description",
    select:
      "id,city_id,title,description,type,status,source_url,expires_at,last_verified_at,updated_at",
  },
]

function asText(value: unknown) {
  return typeof value === "string" ? value : null
}

function asBoolean(value: unknown) {
  return value === true
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function rows(value: unknown): JsonRow[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is JsonRow =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : []
}

function missingReviewRecord(
  contentType: CityContentType,
  content: JsonRow,
  cityName: string,
  citySlug: string,
): CityReviewRecord {
  return {
    id: String(content.id ?? ""),
    reviewId: null,
    cityId: String(content.city_id ?? ""),
    cityName,
    citySlug,
    contentType,
    title: "",
    description: "",
    category: null,
    contentStatus: asText(content.status) ?? "draft",
    stage: "agent_draft",
    verdict: "unreviewed",
    summary: "Review-Metadaten fehlen. Der Inhalt darf noch nicht veröffentlicht werden.",
    issues: [
      {
        code: "review_metadata_missing",
        field: "review",
        severity: "blocking",
        message: "Für diesen Entwurf existiert noch kein zentraler Prüfdatensatz.",
        suggestion: "Review-Migration anwenden und den Entwurf erneut durch Ben prüfen lassen.",
      },
    ],
    sourceName: asText(content.source_name),
    sourceUrl: asText(content.source_url),
    sourceStatus: asText(content.source_url) ? "unchecked" : "missing",
    sourceVerified: false,
    sourceCheckedAt: null,
    endTimeVerified: contentType !== "events",
    agentProfile: null,
    reviewerProfile: null,
    changedFields: [],
    fieldRiskSummary: {},
    manualVerifiedBy: null,
    manualVerifiedAt: null,
    manualVerificationSource: null,
    manualVerificationNote: null,
    publicationMethod: null,
    publicSlug: asText(content.canonical_slug) ?? asText(content.slug),
    startsAt: asText(content.start_date),
    endsAt: asText(content.end_date),
    expiresAt: asText(content.expires_at),
    lastVerifiedAt: asText(content.last_verified_at),
    updatedAt: asText(content.updated_at),
  }
}

function mergeContentAndReview(
  definition: ContentDefinition,
  content: JsonRow,
  review: JsonRow | undefined,
  cityName: string,
  citySlug: string,
): CityReviewRecord {
  const fallback = missingReviewRecord(
    definition.contentType,
    content,
    cityName,
    citySlug,
  )

  fallback.title = asText(content[definition.titleField]) ?? "Ohne Titel"
  fallback.description =
    asText(content[definition.descriptionField]) ?? "Keine Beschreibung"
  fallback.category = definition.categoryField
    ? asText(content[definition.categoryField])
    : null

  if (!review) return fallback

  return {
    ...fallback,
    reviewId: asText(review.id),
    stage: normalizeReviewStage(review.stage),
    verdict: normalizeReviewVerdict(review.verdict),
    summary: asText(review.summary),
    issues: normalizeIssues(review.issues),
    sourceStatus: asText(review.source_status) ?? "unchecked",
    sourceVerified: asBoolean(review.source_verified),
    sourceCheckedAt: asText(review.source_checked_at),
    endTimeVerified: asBoolean(review.end_time_verified),
    agentProfile: asText(review.agent_profile),
    reviewerProfile: asText(review.reviewer_profile),
    changedFields: Array.isArray(review.changed_fields)
      ? review.changed_fields.filter(
          (field): field is string => typeof field === "string",
        )
      : [],
    fieldRiskSummary:
      review.field_risk_summary &&
      typeof review.field_risk_summary === "object" &&
      !Array.isArray(review.field_risk_summary)
        ? (review.field_risk_summary as Record<string, CityReviewRecord["fieldRiskSummary"][string]>)
        : {},
    manualVerifiedBy: asText(review.manual_verified_by),
    manualVerifiedAt: asText(review.manual_verified_at),
    manualVerificationSource: asText(review.manual_verification_source),
    manualVerificationNote: asText(review.manual_verification_note),
    publicationMethod:
      review.publication_method === "AGENT_VERIFIED" ||
      review.publication_method === "HUMAN_APPROVED"
        ? review.publication_method
        : null,
    publicSlug:
      asText(content.canonical_slug) ??
      asText(content.slug) ??
      fallback.publicSlug,
    updatedAt: asText(review.updated_at) ?? fallback.updatedAt,
  }
}

export async function loadCityOperationsData(): Promise<CityOperationsData> {
  const admin = createAdminClient()
  const warnings: string[] = []

  const citiesResult = await admin
    .from("cities")
    .select("id,name,slug")
    .order("name")

  if (citiesResult.error) {
    throw new Error(`Städte konnten nicht geladen werden: ${citiesResult.error.message}`)
  }

  const cityMap = new Map(
    rows(citiesResult.data).map((city) => [
      String(city.id),
      {
        name: asText(city.name) ?? "Unbekannter Ort",
        slug: asText(city.slug) ?? "",
      },
    ]),
  )

  const [
    reviewResult,
    geoAreaResult,
    membershipResult,
    ...contentResults
  ] = await Promise.all([
    admin.from("city_content_reviews").select("*").limit(2000),
    admin
      .from("geo_areas")
      .select("id,name,slug,area_type,status")
      .order("name"),
    admin
      .from("city_geo_areas")
      .select("city_id,geo_area_id,relation_type,is_primary,sort_order")
      .order("sort_order"),
    ...contentDefinitions.map((definition) =>
      admin
        .from(definition.table)
        .select(definition.select)
        .in("status", ["draft", "needs_review", "active"])
        .order("updated_at", { ascending: false })
        .limit(1000),
    ),
  ])

  const migrationReady =
    !reviewResult.error && !geoAreaResult.error && !membershipResult.error

  if (reviewResult.error) {
    warnings.push(
      "Die zentrale Review-Migration ist noch nicht verfügbar. Entwürfe werden vorsorglich blockiert.",
    )
  }
  if (geoAreaResult.error || membershipResult.error) {
    warnings.push(
      "Regionale Zuordnungen sind noch nicht verfügbar. Die Ortsfilter bleiben nutzbar.",
    )
  }

  const reviewMap = new Map(
    rows(reviewResult.data).map((review) => [
      `${review.content_type}:${review.content_id}`,
      review,
    ]),
  )

  const records = contentDefinitions.flatMap((definition, index) => {
    const result = contentResults[index]
    if (result.error) {
      warnings.push(
        `${definition.table} konnte nicht vollständig geladen werden: ${result.error.message}`,
      )
      return []
    }

    return rows(result.data).map((content) => {
      const city = cityMap.get(String(content.city_id)) ?? {
        name: "Unbekannter Ort",
        slug: "",
      }
      const review = reviewMap.get(
        `${definition.contentType}:${String(content.id)}`,
      )
      return mergeContentAndReview(
        definition,
        content,
        review,
        city.name,
        city.slug,
      )
    })
  })

  const geoAreas: GeoArea[] = rows(geoAreaResult.data).map((area) => ({
    id: String(area.id ?? ""),
    name: asText(area.name) ?? "Unbenannte Region",
    slug: asText(area.slug) ?? "",
    areaType: asText(area.area_type) ?? "editorial_region",
    status: asText(area.status) ?? "draft",
  }))

  const memberships: CityGeoMembership[] = rows(membershipResult.data).map(
    (membership) => ({
      cityId: String(membership.city_id ?? ""),
      geoAreaId: String(membership.geo_area_id ?? ""),
      relationType: asText(membership.relation_type) ?? "editorial",
      isPrimary: asBoolean(membership.is_primary),
      sortOrder: asNumber(membership.sort_order),
    }),
  )

  return {
    records,
    geoAreas,
    memberships,
    warnings,
    migrationReady,
  }
}

export async function loadCityReviewDetail(
  contentType: CityContentType,
  contentId: string,
) {
  const data = await loadCityOperationsData()
  const record =
    data.records.find(
      (candidate) =>
        candidate.contentType === contentType && candidate.id === contentId,
    ) ?? null

  if (!record?.reviewId) {
    return { ...data, record, audit: [] as CityReviewAuditEntry[] }
  }

  const admin = createAdminClient()
  const auditResult = await admin
    .from("city_content_review_audit")
    .select("id,action,actor_type,actor_profile,details,created_at")
    .eq("review_id", record.reviewId)
    .order("created_at", { ascending: false })
    .limit(100)

  if (auditResult.error) {
    data.warnings.push(
      `Audit-Verlauf konnte nicht geladen werden: ${auditResult.error.message}`,
    )
  }

  const audit: CityReviewAuditEntry[] = rows(auditResult.data).map((entry) => ({
    id: String(entry.id ?? ""),
    action: asText(entry.action) ?? "unknown",
    actorType: asText(entry.actor_type) ?? "unknown",
    actorProfile: asText(entry.actor_profile),
    details:
      entry.details && typeof entry.details === "object" && !Array.isArray(entry.details)
        ? (entry.details as Record<string, unknown>)
        : {},
    createdAt: asText(entry.created_at) ?? "",
  }))

  return { ...data, record, audit }
}
