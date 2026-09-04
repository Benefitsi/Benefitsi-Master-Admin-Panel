import { createHash } from "node:crypto"
import type { CityAgentContentType, CityAgentTrustTier } from "./contracts"

export type EditorialDraftInput = {
  cityId: string
  citySlug: string
  cityName: string
  contentType: CityAgentContentType
  sourceSlug: string
  sourceUrl: string
  sourceTitle: string
  sourceText: string
  dateMentions: string[]
  retrievedAt: string
  sourceTrustTier: CityAgentTrustTier
  canonicalUrl?: string | null
}

export type EditorialDraftPayload = {
  scope: "city"
  city_id: string
  partner_id: null
  slug: string
  title: string
  excerpt: string
  eyebrow: "Automatisch recherchierter Entwurf"
  category: "Stadt & Region"
  audience: "benefitsi"
  content: Array<{ heading: string; paragraphs: string[] }>
  sources: Array<{ label: string; url: string }>
  related_links: Array<{ label: string; href: string }>
  image_url: null
  image_alt: null
  status: "draft"
  published_at: null
  last_verified_at: null
  updated_at: string
}

export type EditorialQualityStatus = "READY_FOR_REVIEW" | "NEEDS_ENRICHMENT" | "REJECTED"

export type EditorialQualityResult = {
  status: EditorialQualityStatus
  score: number
  issues: string[]
  checks: {
    sourceBound: boolean
    readableTitle: boolean
    usefulExcerpt: boolean
    structuredContent: boolean
    relatedContext: boolean
  }
}

const editorialContentTypes = new Set<CityAgentContentType>([
  "city_event",
  "city_place",
  "city_route",
  "city_guide",
  "city_newsletter",
])

function clean(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength)
}

function validHttpsUrl(value: string | null | undefined): value is string {
  try {
    return Boolean(value && new URL(value).protocol === "https:")
  } catch {
    return false
  }
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase("de-DE")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24)
}

export function editorialDraftKey(input: Pick<EditorialDraftInput, "cityId" | "contentType" | "sourceSlug" | "sourceUrl">) {
  return `city-agent-editorial:${hash([input.cityId, input.contentType, input.sourceSlug, input.sourceUrl].join("|"))}`
}

function eventFactsAreStable(input: EditorialDraftInput) {
  if (input.contentType !== "city_event") return true
  return input.dateMentions.some((mention) => {
    const value = mention.trim().toLowerCase()
    return value && !/(unknown|unbekannt|tbd|n\. ?a\.?|offen)/.test(value)
  })
}

function qualityText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

/**
 * A deterministic editorial gate for agent-created drafts. It does not
 * publish, rewrite, or invent content; it only decides whether the existing
 * source-bound payload is shaped well enough for a human review queue.
 */
export function evaluateEditorialDraft(draft: EditorialDraftPayload): EditorialQualityResult {
  const title = qualityText(draft.title)
  const excerpt = qualityText(draft.excerpt)
  const sourceBound = draft.sources.length > 0 && draft.sources.every((source) => validHttpsUrl(source.url) && qualityText(source.label).length > 0)
  const readableTitle = title.length >= 20 && title.length <= 90
  const usefulExcerpt = excerpt.length >= 80 && excerpt.length <= 500
  const paragraphCount = draft.content.reduce((count, section) => count + section.paragraphs.filter((paragraph) => qualityText(paragraph).length >= 20).length, 0)
  const structuredContent = draft.content.length >= 2 && paragraphCount >= 2
  const relatedContext = draft.related_links.every((link) => qualityText(link.label).length > 0 && (link.href.startsWith("/") || validHttpsUrl(link.href)))
  const checks = { sourceBound, readableTitle, usefulExcerpt, structuredContent, relatedContext }
  const issues: string[] = []
  if (!sourceBound) issues.push("Mindestens ein belastbarer HTTPS-Quellenbeleg fehlt.")
  if (!readableTitle) issues.push("Der Titel ist für einen redaktionellen Entwurf zu kurz oder zu lang.")
  if (!usefulExcerpt) issues.push("Der Teaser enthält noch zu wenig belastbare Information.")
  if (!structuredContent) issues.push("Der Entwurf braucht mindestens zwei informative Inhaltsabsätze.")
  if (!relatedContext) issues.push("Ein interner oder belastbarer Kontext-Link ist ungültig.")

  const score = Math.round(100 * Object.values(checks).filter(Boolean).length / Object.values(checks).length)
  const status: EditorialQualityStatus = !sourceBound
    ? "REJECTED"
    : score >= 80
      ? "READY_FOR_REVIEW"
      : score >= 60
        ? "NEEDS_ENRICHMENT"
        : "REJECTED"

  return { status, score, issues, checks }
}

/**
 * Build a bounded, source-bound draft. This helper only prepares a payload;
 * the runner decides whether and how it is persisted. It deliberately has no
 * publish status and never fabricates dates, prices, media, or opening hours.
 */
export function buildEditorialDraft(input: EditorialDraftInput): EditorialDraftPayload | null {
  const sourceTitle = clean(input.sourceTitle, 150)
  const sourceText = clean(input.sourceText, 2_000)
  const cityName = clean(input.cityName, 120)
  const sourceSlug = clean(input.sourceSlug, 160)
  const sourceUrl = input.sourceUrl.trim()
  const retrievedAt = new Date(input.retrievedAt)

  if (!input.cityId || !input.citySlug || !cityName || !editorialContentTypes.has(input.contentType)) return null
  if (input.sourceTrustTier !== "A" && input.sourceTrustTier !== "B") return null
  if (Number.isNaN(retrievedAt.getTime()) || !sourceTitle || sourceText.length < 60 || !validHttpsUrl(sourceUrl) || !eventFactsAreStable(input)) return null

  const title = clean(`${sourceTitle} · ${cityName}`, 180)
  const excerpt = clean(sourceText, 500)
  // Keep the public draft identity stable when the source title changes. The
  // source URL/slug is the deduplication boundary, not the current headline.
  const slug = slugify(`${input.citySlug}-${sourceSlug}-${input.contentType}`) || `stadt-agent-${hash(sourceUrl)}`
  if (title.length < 3 || excerpt.length < 20 || slug.length < 2) return null

  const relatedLinks = validHttpsUrl(input.canonicalUrl)
    ? [{ label: `${cityName} entdecken`, href: input.canonicalUrl }]
    : []
  const retrievedLabel = retrievedAt.toLocaleDateString("de-DE")
  const verificationText = `Die Quelle wurde am ${retrievedLabel} für diesen Entwurf geprüft.`

  return {
    scope: "city",
    city_id: input.cityId,
    partner_id: null,
    slug,
    title,
    excerpt,
    eyebrow: "Automatisch recherchierter Entwurf",
    category: "Stadt & Region",
    audience: "benefitsi",
    content: [
      { heading: "Das Wichtigste auf einen Blick", paragraphs: [sourceText] },
      { heading: "Quelle und Einordnung", paragraphs: [verificationText] },
    ],
    sources: [{ label: sourceSlug || "Primärquelle", url: sourceUrl }],
    related_links: relatedLinks,
    image_url: null,
    image_alt: null,
    status: "draft",
    published_at: null,
    last_verified_at: null,
    updated_at: retrievedAt.toISOString(),
  }
}
