import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type { AdminSession } from "@/lib/admin"

export const MEDIA_MAX_FILE_SIZE = 10 * 1024 * 1024
export const MEDIA_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const

export type SupportedMediaMimeType = (typeof MEDIA_ALLOWED_MIME_TYPES)[number]

/**
 * The browser-provided MIME type is advisory. Verify the file signature
 * before it reaches Storage so a renamed or malformed file cannot enter the
 * city catalog as a valid image.
 */
export function hasValidImageSignature(
  buffer: Buffer,
  mimeType: string,
): mimeType is SupportedMediaMimeType {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }

  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }

  if (mimeType === "image/webp") {
    return buffer.length >= 16 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP"
  }

  if (mimeType === "image/avif") {
    if (buffer.length < 16 || buffer.toString("ascii", 4, 8) !== "ftyp") return false
    const brands = [buffer.toString("ascii", 8, 12)]
    for (let offset = 16; offset + 4 <= buffer.length; offset += 4) brands.push(buffer.toString("ascii", offset, offset + 4))
    return brands.some((brand) => brand === "avif" || brand === "avis")
  }

  return false
}

export type MediaAdminClient = ReturnType<typeof createAdminClient>

export function cleanText(value: unknown, maxLength = 2000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

export function nullableText(value: unknown, maxLength = 2000) {
  const result = cleanText(value, maxLength)
  return result || null
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function isSafeSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

export function validHttpUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

export function adminActor(session: AdminSession) {
  return {
    actor_id: session.user.id,
    actor_email:
      session.profile?.email?.trim() || session.user.email?.trim() || null,
  }
}

export async function writeMediaAudit(
  admin: MediaAdminClient,
  session: AdminSession,
  payload: {
    cityId?: string | null
    mediaAssetId?: string | null
    assignmentId?: string | null
    action: string
    entityType?: string | null
    entityId?: string | null
    entityKey?: string | null
    role?: string | null
    previousState?: unknown
    nextState?: unknown
  },
) {
  const actor = adminActor(session)
  const result = await admin.from("city_media_audit").insert({
    city_id: payload.cityId ?? null,
    media_asset_id: payload.mediaAssetId ?? null,
    assignment_id: payload.assignmentId ?? null,
    ...actor,
    action: payload.action,
    entity_type: payload.entityType ?? null,
    entity_id: payload.entityId ?? null,
    entity_key: payload.entityKey ?? null,
    role: payload.role ?? null,
    previous_state: payload.previousState ?? null,
    next_state: payload.nextState ?? null,
  })

  if (result.error) {
    console.error("City media audit write failed:", result.error.message)
  }
}

export function imageExtension(mimeType: string) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  }[mimeType] || "bin"
}

export function safeFileStem(fileName: string) {
  const stem = fileName
    .replace(/\.[^/.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 70)
  return stem || "city-media"
}
