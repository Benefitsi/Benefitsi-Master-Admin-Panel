import type { EditorialPost } from "@/lib/editorial-types"

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}
function text(value: unknown, max = 1500) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value.slice(0, 12) : [] }

export function safeEditorialReference(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null
  try {
    const url = new URL(value)
    // Intake sources are canonical URLs without query/fragment credentials.
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null
    if (!/^https?:\/\//i.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)) return null
    return url.href
  } catch { return null }
}

function timestamp(value: unknown): number {
  if (typeof value !== "string") return NaN
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!parts) return NaN
  const [, year, month, day, hour, minute, second] = parts.map(Number)
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) return NaN
  return Date.parse(value)
}

function dateLabel(value: unknown) {
  const time = timestamp(value)
  return Number.isFinite(time) ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(time) : null
}

function label(labels: Record<string, string>, key: unknown, fallback: string) {
  const name = text(key)
  return Object.hasOwn(labels, name) ? labels[name] : fallback
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, i) => sameJson(item, right[i]))
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false
  const a = record(left), b = record(right)
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && sameJson(a[key], b[key]))
}

export function normalizeEditorialIntake(value: unknown) {
  const row = record(value), research = record(row.research), latest = record(row.latest_proposal)
  const intent = label({ informational: "Information und Orientierung", local_visit: "Besuch vor Ort", booking_research: "Angebote und Buchung recherchieren" }, research.intent, "Nicht dokumentiert")
  const imageStatus = label({ approved: "Bildrechte laut Recherche freigegeben", needs_rights_review: "Bildrechte noch prüfen", not_required: "Kein Bild erforderlich" }, research.image_status, "Bildrechte nicht dokumentiert")
  const sources = array(research.sources).flatMap(value => {
    const source = record(value), url = safeEditorialReference(source.url)
    return url ? [{ url, checkedAt: dateLabel(source.checked_at), evidence: text(source.evidence) }] : []
  })
  const proposal = sameJson(row.initial_post, row.latest_proposal) ? null : {
    title: text(latest.title, 180), excerpt: text(latest.excerpt, 500),
    sections: array(latest.content).flatMap(value => {
      const section = record(value), heading = text(section.heading, 250)
      const paragraphs = array(section.paragraphs).map(value => text(value, 10000)).filter(Boolean)
      return heading && paragraphs.length ? [{ heading, paragraphs }] : []
    }),
    sources: array(latest.sources).flatMap(value => {
      const source = record(value), url = safeEditorialReference(source.url), label = text(source.label, 250)
      return url && label ? [{ url, label }] : []
    }),
  }
  return { primaryKeyword: text(research.primary_keyword, 120), secondaryKeywords: array(research.secondary_keywords).map(value => text(value, 120)).filter(Boolean), intent, imageStatus, imageEvidence: text(research.image_evidence), sources, proposal }
}

export type EditorialIntakeResult =
  | { state: "missing" }
  | { state: "unavailable" }
  | { state: "ready"; data: ReturnType<typeof normalizeEditorialIntake> }

export function editorialPublicPath(
  post: Pick<EditorialPost, "scope" | "slug" | "status" | "published_at">,
  city?: { slug: string }, partner?: { slug: string }, now = Date.now(),
): string | null {
  const publishedAt = timestamp(post.published_at)
  if (post.status !== "active" || !Number.isFinite(publishedAt) || publishedAt > now) return null
  const safeSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  if (!safeSlug(post.slug)) return null
  if (post.scope === "global") return `/blog/${post.slug}`
  if (post.scope === "city" && city && safeSlug(city.slug)) return `/stadt/${city.slug}/blog/${post.slug}`
  if (post.scope === "partner" && partner && safeSlug(partner.slug)) return `/partner/${partner.slug}/blog/${post.slug}`
  return null
}
