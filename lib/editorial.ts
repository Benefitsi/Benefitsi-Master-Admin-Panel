import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type {
  EditorialLink,
  EditorialPost,
  EditorialSection,
  EditorialSource,
  EditorialTarget,
} from "@/lib/editorial-types"

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function asSections(value: unknown): EditorialSection[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const record = entry as Record<string, unknown>
    const heading = asString(record.heading).trim()
    const paragraphs = Array.isArray(record.paragraphs)
      ? record.paragraphs
          .filter((paragraph): paragraph is string => typeof paragraph === "string")
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
      : []

    return heading && paragraphs.length ? [{ heading, paragraphs }] : []
  })
}

function asLinks(value: unknown, key: "url" | "href") {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const record = entry as Record<string, unknown>
    const label = asString(record.label).trim()
    const target = asString(record[key]).trim()
    return label && target ? [{ label, [key]: target }] : []
  }) as Array<EditorialSource | EditorialLink>
}

function normalizePost(row: Record<string, unknown>): EditorialPost {
  return {
    id: asString(row.id),
    scope: row.scope === "city" || row.scope === "partner" ? row.scope : "global",
    city_id: typeof row.city_id === "string" ? row.city_id : null,
    partner_id: typeof row.partner_id === "string" ? row.partner_id : null,
    slug: asString(row.slug),
    title: asString(row.title),
    excerpt: asString(row.excerpt),
    eyebrow: asString(row.eyebrow) || "Magazin",
    category: asString(row.category) || "Editorial",
    audience: row.audience === "partner" ? "partner" : "benefitsi",
    content: asSections(row.content),
    sources: asLinks(row.sources, "url") as EditorialSource[],
    related_links: asLinks(row.related_links, "href") as EditorialLink[],
    image_url: typeof row.image_url === "string" ? row.image_url : null,
    image_alt: typeof row.image_alt === "string" ? row.image_alt : null,
    status:
      row.status === "needs_review" ||
      row.status === "active" ||
      row.status === "archived"
        ? row.status
        : "draft",
    published_at: typeof row.published_at === "string" ? row.published_at : null,
    last_verified_at:
      typeof row.last_verified_at === "string" ? row.last_verified_at : null,
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  }
}

export async function loadEditorialWorkspace() {
  const admin = createAdminClient()
  const [postsResult, citiesResult, partnersResult] = await Promise.all([
    admin.from("editorial_posts").select("*").order("updated_at", { ascending: false }),
    admin.from("cities").select("id,slug,name").order("name"),
    admin.from("partners").select("id,slug,name").order("name").limit(2000),
  ])

  const warnings: string[] = []
  if (postsResult.error) warnings.push("Editorial-Beiträge konnten nicht geladen werden.")
  if (citiesResult.error) warnings.push("Städte konnten nicht geladen werden.")
  if (partnersResult.error) warnings.push("Partner konnten nicht geladen werden.")

  return {
    posts: (postsResult.data ?? []).map((row) => normalizePost(row as Record<string, unknown>)),
    cities: (citiesResult.data ?? []) as EditorialTarget[],
    partners: (partnersResult.data ?? []) as EditorialTarget[],
    warnings,
  }
}

export async function loadEditorialPost(postId: string) {
  const result = await createAdminClient()
    .from("editorial_posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle()

  return result.data
    ? normalizePost(result.data as Record<string, unknown>)
    : null
}
