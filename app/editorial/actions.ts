"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function text(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function rawText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key)
  return typeof value === "string" ? value.slice(0, maxLength) : ""
}

function optionalUrl(formData: FormData, key: string) {
  const value = text(formData, key, 2000)
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? value : null
  } catch {
    return null
  }
}

function parseJsonArray(formData: FormData, key: string) {
  const value = rawText(formData, key, 60000).trim()
  if (!value) return []

  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function parseContent(formData: FormData) {
  const value = parseJsonArray(formData, "contentJson")
  if (!value) return null

  const sections = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const record = entry as Record<string, unknown>
    const heading = typeof record.heading === "string" ? record.heading.trim() : ""
    const paragraphs = Array.isArray(record.paragraphs)
      ? record.paragraphs
          .filter((paragraph): paragraph is string => typeof paragraph === "string")
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
      : []

    return heading && paragraphs.length ? [{ heading, paragraphs }] : []
  })

  return sections.length === value.length && sections.length > 0 ? sections : null
}

function parseLinks(formData: FormData, key: "sourcesJson" | "relatedLinksJson", urlKey: "url" | "href") {
  const value = parseJsonArray(formData, key)
  if (!value) return null

  const links = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const record = entry as Record<string, unknown>
    const label = typeof record.label === "string" ? record.label.trim() : ""
    const target = typeof record[urlKey] === "string" ? record[urlKey].trim() : ""
    if (!label || !target) return []

    if (target.startsWith("/")) return [{ label, [urlKey]: target }]
    try {
      const parsed = new URL(target)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return []
    } catch {
      return []
    }

    return [{ label, [urlKey]: target }]
  })

  return links.length === value.length ? links : null
}

function dateValue(formData: FormData) {
  const raw = text(formData, "publishedAt", 80)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function buildPayload(formData: FormData) {
  const scope = text(formData, "scope", 20)
  const cityId = text(formData, "cityId", 80)
  const partnerId = text(formData, "partnerId", 80)
  const title = text(formData, "title", 180)
  const slug = text(formData, "slug", 180).toLocaleLowerCase("de")
  const excerpt = text(formData, "excerpt", 500)
  const imageUrl = optionalUrl(formData, "imageUrl")
  const publishedAt = dateValue(formData)
  const content = parseContent(formData)
  const sources = parseLinks(formData, "sourcesJson", "url")
  const relatedLinks = parseLinks(formData, "relatedLinksJson", "href")
  const status = text(formData, "status", 20)

  if (
    !["global", "city", "partner"].includes(scope) ||
    !title ||
    title.length < 3 ||
    !SLUG_PATTERN.test(slug) ||
    !excerpt ||
    excerpt.length < 20 ||
    !content ||
    !sources ||
    !relatedLinks ||
    publishedAt === undefined ||
    !["draft", "needs_review", "active", "archived"].includes(status) ||
    (scope === "city" && !UUID_PATTERN.test(cityId)) ||
    (scope !== "city" && cityId) ||
    (scope === "partner" && !UUID_PATTERN.test(partnerId)) ||
    (scope !== "partner" && partnerId) ||
    (text(formData, "imageUrl", 2000) && !imageUrl)
  ) {
    return null
  }

  const isActive = status === "active"

  return {
    scope,
    city_id: scope === "city" ? cityId : null,
    partner_id: scope === "partner" ? partnerId : null,
    slug,
    title,
    excerpt,
    eyebrow: text(formData, "eyebrow", 120) || "Magazin",
    category: text(formData, "category", 120) || "Editorial",
    audience: text(formData, "audience", 20) === "partner" ? "partner" : "benefitsi",
    content,
    sources,
    related_links: relatedLinks,
    image_url: imageUrl,
    image_alt: text(formData, "imageAlt", 300) || null,
    status,
    published_at: isActive ? publishedAt ?? new Date().toISOString() : null,
    last_verified_at: isActive ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }
}

function invalidRedirect(path: string): never {
  redirect(`${path}?error=validation`)
}

export async function createEditorialPost(formData: FormData) {
  await requireAdmin()
  const payload = buildPayload(formData)
  if (!payload) invalidRedirect("/editorial/new")

  const result = await createAdminClient().from("editorial_posts").insert(payload)
  if (result.error) {
    const error = result.error.code === "23505" ? "duplicate_slug" : "save"
    redirect(`/editorial/new?error=${error}`)
  }

  revalidatePath("/editorial")
  redirect("/editorial?success=created")
}

export async function updateEditorialPost(formData: FormData) {
  await requireAdmin()
  const postId = text(formData, "postId", 80)
  const payload = buildPayload(formData)
  if (!UUID_PATTERN.test(postId) || !payload) invalidRedirect(`/editorial/${encodeURIComponent(postId)}`)

  const result = await createAdminClient()
    .from("editorial_posts")
    .update(payload)
    .eq("id", postId)

  if (result.error) {
    const error = result.error.code === "23505" ? "duplicate_slug" : "save"
    redirect(`/editorial/${encodeURIComponent(postId)}?error=${error}`)
  }

  revalidatePath("/editorial")
  redirect("/editorial?success=saved")
}

export async function archiveEditorialPost(formData: FormData) {
  await requireAdmin()
  const postId = text(formData, "postId", 80)
  if (!UUID_PATTERN.test(postId)) redirect("/editorial?error=archive")

  const result = await createAdminClient()
    .from("editorial_posts")
    .update({
      status: "archived",
      published_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)

  if (result.error) redirect("/editorial?error=archive")

  revalidatePath("/editorial")
  redirect("/editorial?success=archived")
}
