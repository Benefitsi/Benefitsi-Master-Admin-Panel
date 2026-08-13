export const cityContentTypes = [
  "events",
  "places",
  "playgrounds",
  "clubs",
  "routes",
  "guides",
  "challenges",
  "benefits",
] as const

export type CityContentType = (typeof cityContentTypes)[number]

export type CityReviewStage =
  | "agent_draft"
  | "ready_for_human"
  | "correction_requested"
  | "rejected"
  | "published"
  | "archived"

export type CityReviewVerdict =
  | "unreviewed"
  | "pass"
  | "needs_correction"
  | "reject"

export type CityReviewIssue = {
  code: string
  field: string
  severity: "blocking" | "warning" | "info"
  message: string
  suggestion?: string
  actual?: string
  expected?: string
}

export type CityReviewRecord = {
  id: string
  reviewId: string | null
  cityId: string
  cityName: string
  citySlug: string
  contentType: CityContentType
  title: string
  description: string
  category: string | null
  contentStatus: string
  stage: CityReviewStage
  verdict: CityReviewVerdict
  summary: string | null
  issues: CityReviewIssue[]
  sourceName: string | null
  sourceUrl: string | null
  sourceStatus: string
  sourceVerified: boolean
  sourceCheckedAt: string | null
  endTimeVerified: boolean
  agentProfile: string | null
  reviewerProfile: string | null
  startsAt: string | null
  endsAt: string | null
  expiresAt: string | null
  lastVerifiedAt: string | null
  updatedAt: string | null
}

export type CityReviewAuditEntry = {
  id: string
  action: string
  actorType: string
  actorProfile: string | null
  details: Record<string, unknown>
  createdAt: string
}

export type GeoArea = {
  id: string
  name: string
  slug: string
  areaType: string
  status: string
}

export type CityGeoMembership = {
  cityId: string
  geoAreaId: string
  relationType: string
  isPrimary: boolean
  sortOrder: number
}

export type CityOperationsData = {
  records: CityReviewRecord[]
  geoAreas: GeoArea[]
  memberships: CityGeoMembership[]
  warnings: string[]
  migrationReady: boolean
}

const validStages = new Set<CityReviewStage>([
  "agent_draft",
  "ready_for_human",
  "correction_requested",
  "rejected",
  "published",
  "archived",
])

const validVerdicts = new Set<CityReviewVerdict>([
  "unreviewed",
  "pass",
  "needs_correction",
  "reject",
])

export function isCityContentType(value: string): value is CityContentType {
  return cityContentTypes.includes(value as CityContentType)
}

export function normalizeReviewStage(value: unknown): CityReviewStage {
  return validStages.has(value as CityReviewStage)
    ? (value as CityReviewStage)
    : "agent_draft"
}

export function normalizeReviewVerdict(value: unknown): CityReviewVerdict {
  return validVerdicts.has(value as CityReviewVerdict)
    ? (value as CityReviewVerdict)
    : "unreviewed"
}

function cleanText(value: unknown, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

export function normalizeIssues(value: unknown): CityReviewIssue[] {
  if (!Array.isArray(value)) return []

  return value.slice(0, 30).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []

    const source = item as Record<string, unknown>
    const message = cleanText(source.message, 1200)
    if (!message) return []

    const rawSeverity = cleanText(source.severity, 20)
    const severity: CityReviewIssue["severity"] =
      rawSeverity === "blocking" || rawSeverity === "warning"
        ? rawSeverity
        : "info"

    return [
      {
        code: cleanText(source.code, 80) || "review_issue",
        field: cleanText(source.field, 80) || "content",
        severity,
        message,
        suggestion: cleanText(source.suggestion, 1200) || undefined,
        actual: cleanText(source.actual, 500) || undefined,
        expected: cleanText(source.expected, 500) || undefined,
      },
    ]
  })
}

export function hasBlockingIssues(record: Pick<CityReviewRecord, "issues">) {
  return record.issues.some((issue) => issue.severity === "blocking")
}

export function canPublishReview(
  record: Pick<
    CityReviewRecord,
    | "contentType"
    | "reviewId"
    | "stage"
    | "verdict"
    | "issues"
    | "sourceUrl"
    | "sourceVerified"
    | "sourceStatus"
    | "sourceCheckedAt"
    | "endTimeVerified"
    | "endsAt"
    | "expiresAt"
  >,
  now = new Date(),
) {
  const publishableContentTypes = new Set<CityContentType>([
    "events",
    "places",
    "playgrounds",
    "clubs",
    "routes",
    "guides",
    "challenges",
    "benefits",
  ])
  if (
    !publishableContentTypes.has(record.contentType) ||
    !record.reviewId ||
    record.stage !== "ready_for_human" ||
    record.verdict !== "pass" ||
    hasBlockingIssues(record) ||
    !record.sourceVerified ||
    record.sourceStatus !== "verified" ||
    !record.sourceCheckedAt
  ) {
    return false
  }

  try {
    const source = new URL(record.sourceUrl ?? "")
    const checkedAt = new Date(record.sourceCheckedAt)
    const oldestAllowed = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const futureTolerance = new Date(now.getTime() + 5 * 60 * 1000)

    const baseGateSatisfied =
      source.protocol === "https:" &&
      !Number.isNaN(checkedAt.getTime()) &&
      checkedAt >= oldestAllowed &&
      checkedAt <= futureTolerance
    if (!baseGateSatisfied) return false

    if (record.contentType === "events") {
      if (!record.endTimeVerified || !record.endsAt || !record.expiresAt) {
        return false
      }
      const endsAt = new Date(record.endsAt)
      const expiresAt = new Date(record.expiresAt)
      return (
        !Number.isNaN(endsAt.getTime()) &&
        !Number.isNaN(expiresAt.getTime()) &&
        expiresAt >= endsAt
      )
    }

    if (!record.expiresAt) return true
    const expiresAt = new Date(record.expiresAt)
    return !Number.isNaN(expiresAt.getTime()) && expiresAt > now
  } catch {
    return false
  }
}

export function filterCityReviewRecords(
  records: CityReviewRecord[],
  filters: {
    city?: string
    regionCityIds?: Set<string>
    contentType?: string
    stage?: string
    query?: string
  },
) {
  const query = filters.query?.trim().toLocaleLowerCase("de") ?? ""

  return records.filter((record) => {
    if (filters.city && record.citySlug !== filters.city) return false
    if (
      filters.regionCityIds &&
      !filters.regionCityIds.has(record.cityId)
    ) {
      return false
    }
    if (filters.contentType && record.contentType !== filters.contentType) {
      return false
    }
    if (filters.stage && record.stage !== filters.stage) return false
    if (
      query &&
      !`${record.title} ${record.cityName} ${record.description}`
        .toLocaleLowerCase("de")
        .includes(query)
    ) {
      return false
    }
    return true
  })
}

export function stageLabel(stage: CityReviewStage) {
  return {
    agent_draft: "Agent-Entwurf",
    ready_for_human: "Bereit zur Prüfung",
    correction_requested: "Korrektur erforderlich",
    rejected: "Abgelehnt",
    published: "Veröffentlicht",
    archived: "Archiviert",
  }[stage]
}

export function contentTypeLabel(contentType: CityContentType) {
  return {
    events: "Veranstaltung",
    places: "Ort",
    playgrounds: "Spielplatz",
    clubs: "Verein",
    routes: "Route",
    guides: "Guide",
    challenges: "Challenge",
    benefits: "Vorteil",
  }[contentType]
}
