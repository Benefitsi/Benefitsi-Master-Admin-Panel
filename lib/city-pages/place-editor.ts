import { safeGuideLink } from "@/lib/city-pages/guide-editor"

export type PlaceStorySection = { title: string; body: string }

function invalid(): never { throw new Error("invalid_place_content") }
function plainText(raw: unknown, max: number, required = false): string {
  if (typeof raw !== "string" || raw.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw) || /<\/?[a-z][^>]*>/i.test(raw)) invalid()
  const value = raw.trim()
  if (required && !value) invalid()
  for (const match of value.matchAll(/!?\[[^\]]*\]\(\s*<?([^\s)>]+)/g)) {
    if (!safeGuideLink(match[1])) invalid()
  }
  return value
}

export function parsePlaceStory(raw: unknown): PlaceStorySection[] {
  if (typeof raw !== "string" || raw.length > 240000) invalid()
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value) || value.length > 30) invalid()
  return value.map(section => {
    if (!section || typeof section !== "object" || Array.isArray(section) || Object.keys(section).some(key => !["title", "body"].includes(key))) invalid()
    return { title: plainText(section.title, 200, true), body: plainText(section.body, 20000, true) }
  })
}

export function parsePlaceCanonicalSlug(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== "string" || raw.length > 120) invalid()
  const value = raw.trim()
  if (!value) return null
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) invalid()
  return value
}

export function parsePlaceLocationDescription(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  return plainText(raw, 2000) || null
}
