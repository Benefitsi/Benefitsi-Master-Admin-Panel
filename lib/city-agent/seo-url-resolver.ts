import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

type Row = Record<string, unknown>
type AdminClient = ReturnType<typeof createAdminClient>

export type CitySeoEntityKind = "place" | "event" | "route" | "guide" | "hub"
export type CitySeoResolutionAction =
  | "IMPROVE_EXISTING"
  | "CREATE_NEW"
  | "MERGE_DUPLICATE"
  | "HUMAN_REVIEW"

export type CitySeoResolution = {
  resolverVersion: "city-url-resolver-v1"
  entityType: CitySeoEntityKind
  entityId: string | null
  canonicalUrl: string | null
  action: CitySeoResolutionAction
  matchedBy: "content_id" | "canonical_slug" | "title" | "source_module" | "hub" | "none"
  duplicateOf?: {
    entityId: string
    canonicalUrl: string
  }
  confidence: number
  humanReviewRequired: boolean
}

export type CitySeoDirectory = {
  cityId: string
  citySlug: string
  cityName: string
  places: CitySeoEntity[]
  events: CitySeoEntity[]
  routes: CitySeoEntity[]
  guides: CitySeoEntity[]
}

export type CitySeoEntity = {
  id: string
  title: string
  canonicalSlug: string
  status: string | null
  kind: Exclude<CitySeoEntityKind, "hub">
}

const hubSegments = {
  current: "aktuell",
  discovery: "entdecken",
  events: "veranstaltungen",
  routes: "routen",
  service: "stadtwissen",
  benefits: "vorteile",
} as const

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://benefitsi.de").replace(/\/+$/, "")
}

function publicUrl(path: string) {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`
}

/**
 * Agent-side adapter for the public City URL contract. The public app owns
 * the renderer; this single adapter keeps proposal URLs on the same route
 * vocabulary instead of using source URLs or component-local guesses.
 */
export function getCitySeoUrl(
  citySlug: string,
  entityType: CitySeoEntityKind,
  slug?: string | null,
  hubKind?: keyof typeof hubSegments,
) {
  const base = `/stadt/${encodeURIComponent(citySlug)}`
  if (entityType === "hub") {
    if (!hubKind) return null
    return publicUrl(`${base}/${hubSegments[hubKind]}`)
  }
  const safeSlug = text(slug)
  if (!safeSlug) return null
  const route = entityType === "place"
    ? "ort"
    : entityType === "event"
      ? "event"
      : entityType === "route"
        ? "route"
        : null
  return publicUrl(route ? `${base}/entdecken/${route}/${encodeURIComponent(safeSlug)}` : `${base}/${encodeURIComponent(safeSlug)}`)
}

function normalize(value: string) {
  return value
    .replace(/&(?:amp|bull|raquo);/gi, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function stem(value: string) {
  if (value.length <= 5) return value
  return value
    .replace(/(?:ern|ern|en|er|es|e|s)$/i, "")
    .replace(/(.)\1+$/g, "$1")
}

function tokens(value: string) {
  return new Set(normalize(value).split(/\s+/).filter(Boolean).map(stem))
}

function identityVariants(value: string, citySlug: string) {
  const normalized = normalize(value)
  const cityTokens = tokens(citySlug)
  return normalized
    .split(/\s+/)
    .filter((token) => token && !cityTokens.has(stem(token)))
    .filter((token) => !["stadt", "verbandsgemeinde", "suedliche", "weinstrasse", "am", "official", "tourism", "events", "event", "calendar", "catalog", "geo", "vg"].includes(token))
    .map(stem)
}

function tokensEquivalent(left: string, right: string) {
  return left === right ||
    // "Burg Trifels" is a common editorial/source label for the existing
    // "Reichsburg Trifels" entity. Keep this alias narrow: broad suffix
    // matching would incorrectly map "Trifelsbad" to the castle.
    (left === "burg" && right.endsWith("burg")) ||
    (right === "burg" && left.endsWith("burg"))
}

function tokenMatch(left: string[], right: string[]) {
  if (!left.length || !right.length) return 0
  const matches = left.filter((token) => right.some((candidate) => tokensEquivalent(token, candidate))).length
  return matches / Math.max(left.length, right.length)
}

/**
 * Source pages often add harmless chrome such as "Node", a provider name,
 * language labels or an external identifier to the title. Matching the full
 * token set would miss an existing City entity in those cases. Requiring all
 * canonical identity tokens to be present keeps this bounded and avoids
 * broad substring matches such as Trifels -> Trifelsbad.
 */
function candidateCoverage(observed: string[], candidate: string[]) {
  if (!observed.length || !candidate.length) return 0
  const matched = candidate.filter((token) => observed.some((value) => tokensEquivalent(value, token))).length
  return matched / candidate.length
}

function identitySlugMatches(sourceSlug: string, canonicalSlug: string, citySlug: string) {
  const sourceTokens = identityVariants(sourceSlug, citySlug).sort()
  const canonicalTokens = identityVariants(canonicalSlug, citySlug).sort()
  return sourceTokens.length > 0
    && sourceTokens.length === canonicalTokens.length
    && sourceTokens.every((token, index) => token === canonicalTokens[index])
}

function entityKindForContentType(contentType: string | null): Exclude<CitySeoEntityKind, "hub"> | null {
  if (contentType === "city_place") return "place"
  if (contentType === "city_event") return "event"
  if (contentType === "city_route") return "route"
  if (contentType === "city_guide") return "guide"
  return null
}

function entityRows(directory: CitySeoDirectory, kind: Exclude<CitySeoEntityKind, "hub">) {
  return directory[`${kind}s` as "places" | "events" | "routes" | "guides"]
}

function sourceHub(sourceSlug: string, title: string): keyof typeof hubSegments | null {
  const value = `${normalize(sourceSlug)} ${normalize(title)}`
  if (/(event|veranstalt|markt|calendar|city events)/.test(value)) return "events"
  if (/(tourism|tourismus|discovery|entdecken|sehenswuerdig)/.test(value)) return "discovery"
  if (/(stadt official|stadtgeschichte|geschichte|service|verwaltung)/.test(value)) return "service"
  return null
}

function findEntity(
  directory: CitySeoDirectory,
  kind: Exclude<CitySeoEntityKind, "hub">,
  title: string,
  sourceSlug: string,
) {
  const candidates = entityRows(directory, kind)
  const titleTokens = identityVariants(title, directory.citySlug)
  const sourceTokens = identityVariants(sourceSlug, directory.citySlug)
  const scored = candidates.map((candidate) => {
    const candidateTokens = identityVariants(`${candidate.canonicalSlug} ${candidate.title}`, directory.citySlug)
    const canonicalTokens = identityVariants(candidate.canonicalSlug, directory.citySlug)
    const titleScore = tokenMatch(titleTokens, candidateTokens)
    const sourceScore = tokenMatch(sourceTokens, canonicalTokens)
    const titleCoverage = candidateCoverage(titleTokens, candidateTokens)
    const sourceCoverage = candidateCoverage(sourceTokens, canonicalTokens)
    const exactSlug = identitySlugMatches(sourceSlug, candidate.canonicalSlug, directory.citySlug)
    const noisyTitleMatch = titleCoverage >= 0.85 && candidateTokens.length <= 4
    const noisySourceMatch = sourceCoverage >= 0.85 && canonicalTokens.length <= 4
    return {
      candidate,
      score: exactSlug
        ? 1
        : Math.max(titleScore, sourceScore * 0.95, noisyTitleMatch ? titleCoverage * 0.9 : 0, noisySourceMatch ? sourceCoverage * 0.9 : 0),
      exactSlug,
    }
  }).sort((left, right) => right.score - left.score)

  const best = scored[0]
  const second = scored[1]
  if (!best || best.score < 0.62 || (second && best.score - second.score < 0.08 && !best.exactSlug)) return null
  return { entity: best.candidate, matchedBy: best.exactSlug ? "canonical_slug" as const : "title" as const, confidence: Math.min(0.99, Math.max(0.72, best.score)) }
}

function contentEntity(directory: CitySeoDirectory, contentType: string | null, contentId: string | null) {
  const kind = entityKindForContentType(contentType)
  if (!kind || !contentId) return null
  const entity = entityRows(directory, kind).find((candidate) => candidate.id === contentId)
  return entity ? { entity, kind } : null
}

export function resolveCitySeoOpportunity(input: {
  directory: CitySeoDirectory
  contentType: string | null
  contentId: string | null
  title: string
  sourceSlug: string
  sourceTrustTier?: string | null
  existingEntityKeys?: Set<string>
}): CitySeoResolution {
  const { directory } = input
  const direct = contentEntity(directory, input.contentType, input.contentId)
  if (direct) {
    const canonicalUrl = getCitySeoUrl(directory.citySlug, direct.kind, direct.entity.canonicalSlug)
    return {
      resolverVersion: "city-url-resolver-v1",
      entityType: direct.kind,
      entityId: direct.entity.id,
      canonicalUrl,
      action: "IMPROVE_EXISTING",
      matchedBy: "content_id",
      confidence: 0.99,
      humanReviewRequired: false,
    }
  }

  const kind = entityKindForContentType(input.contentType)
  const match = kind ? findEntity(directory, kind, input.title, input.sourceSlug) : null
  if (match) {
    const canonicalUrl = getCitySeoUrl(directory.citySlug, match.entity.kind, match.entity.canonicalSlug)
    const key = `${match.entity.kind}:${match.entity.id}`
    const duplicate = input.existingEntityKeys?.has(key)
    return {
      resolverVersion: "city-url-resolver-v1",
      entityType: match.entity.kind,
      entityId: match.entity.id,
      canonicalUrl,
      action: duplicate ? "MERGE_DUPLICATE" : "IMPROVE_EXISTING",
      matchedBy: match.matchedBy,
      ...(duplicate ? { duplicateOf: { entityId: match.entity.id, canonicalUrl: canonicalUrl ?? "" } } : {}),
      confidence: match.confidence,
      humanReviewRequired: Boolean(duplicate) || input.sourceTrustTier === "C" || input.sourceTrustTier === "D",
    }
  }

  const hub = sourceHub(input.sourceSlug, input.title)
  if (hub) {
    const canonicalUrl = getCitySeoUrl(directory.citySlug, "hub", null, hub)
    const key = `hub:${hub}`
    const duplicate = input.existingEntityKeys?.has(key)
    return {
      resolverVersion: "city-url-resolver-v1",
      entityType: "hub",
      entityId: hub,
      canonicalUrl,
      action: duplicate ? "MERGE_DUPLICATE" : "IMPROVE_EXISTING",
      matchedBy: "source_module",
      ...(duplicate ? { duplicateOf: { entityId: key, canonicalUrl: canonicalUrl ?? "" } } : {}),
      confidence: 0.91,
      humanReviewRequired: Boolean(duplicate),
    }
  }

  const safeForCreate = ["A", "B"].includes(input.sourceTrustTier ?? "") && Boolean(kind)
  return {
    resolverVersion: "city-url-resolver-v1",
    entityType: kind ?? "hub",
    entityId: null,
    canonicalUrl: null,
    action: safeForCreate ? "CREATE_NEW" : "HUMAN_REVIEW",
    matchedBy: "none",
    confidence: safeForCreate ? 0.74 : 0.55,
    humanReviewRequired: true,
  }
}

export async function loadCitySeoDirectory(admin: AdminClient, cityId: string): Promise<CitySeoDirectory> {
  const [cityResult, placesResult, eventsResult, routesResult, guidesResult] = await Promise.all([
    admin.from("cities").select("id,slug,name").eq("id", cityId).maybeSingle(),
    admin.from("city_places").select("id,name,canonical_slug,status").eq("city_id", cityId).limit(1000),
    admin.from("city_events").select("id,title,canonical_slug,status").eq("city_id", cityId).limit(1000),
    admin.from("city_routes").select("id,title,canonical_slug,status").eq("city_id", cityId).limit(1000),
    admin.from("city_guides").select("id,title,slug,status").eq("city_id", cityId).limit(1000),
  ])
  const error = [cityResult, placesResult, eventsResult, routesResult, guidesResult].find((result) => result.error)?.error
  if (error) throw new Error(`SEO-Entity-Verzeichnis konnte nicht geladen werden: ${error.message}`)
  const city = cityResult.data as Row | null
  if (!city) throw new Error(`Stadt ${cityId} konnte für die SEO-Auflösung nicht geladen werden.`)
  const rowsFor = (value: unknown, kind: Exclude<CitySeoEntityKind, "hub">, slugKey: "canonical_slug" | "slug") =>
    (Array.isArray(value) ? value : []).flatMap((row) => {
      if (!row || typeof row !== "object") return []
      const item = row as Row
      const id = text(item.id)
      const title = text(item.name) || text(item.title)
      const canonicalSlug = text(item[slugKey])
      if (!id || !title || !canonicalSlug) return []
      return [{ id, title, canonicalSlug, status: text(item.status) || null, kind }]
    })
  return {
    cityId,
    citySlug: text(city.slug),
    cityName: text(city.name),
    places: rowsFor(placesResult.data, "place", "canonical_slug"),
    events: rowsFor(eventsResult.data, "event", "canonical_slug"),
    routes: rowsFor(routesResult.data, "route", "canonical_slug"),
    guides: rowsFor(guidesResult.data, "guide", "slug"),
  }
}
