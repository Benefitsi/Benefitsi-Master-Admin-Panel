import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import {
  getCityMemoryAdminSlot,
} from "@/lib/city-memory/config"
import {
  isMediaStatus,
} from "@/lib/city-media/contracts"
import {
  cleanText,
  nullableText,
  validHttpUrl,
  writeMediaAudit,
} from "@/lib/city-media/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { notifyPublicRevalidation } from "@/lib/public-revalidation"

export const runtime = "nodejs"

const blockedPendingStatuses = new Set(["REVIEW", "PUBLISHED"])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ citySlug: string }> },
) {
  const { adminSession } = await requireAdmin()
  const { citySlug } = await params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const memoryId = cleanText(body?.memoryId, 180)
  const action = cleanText(body?.action, 40)

  if (!body || !memoryId || !["save", "submit_review", "publish", "archive"].includes(action)) {
    return NextResponse.json({ error: "invalid_memory_action" }, { status: 400 })
  }

  const slot = getCityMemoryAdminSlot(citySlug, memoryId)
  if (!slot) return NextResponse.json({ error: "memory_slot_not_found" }, { status: 404 })

  const admin = createAdminClient()
  const cityResult = await admin
    .from("cities")
    .select("id,name,slug")
    .eq("slug", citySlug)
    .maybeSingle()
  if (cityResult.error || !cityResult.data) {
    return NextResponse.json({ error: "city_not_found" }, { status: 404 })
  }

  const assignmentResult = await admin
    .from("city_media_assignments")
    .select("*")
    .eq("city_id", cityResult.data.id)
    .eq("entity_type", "COLLECTION")
    .eq("entity_key", memoryId)
    .eq("role", "MEMORY_STAMP_ARTWORK")
    .maybeSingle()
  if (assignmentResult.error || !assignmentResult.data) {
    return NextResponse.json({ error: "memory_asset_not_found" }, { status: 404 })
  }

  const existingResult = await admin
    .from("city_media_assets")
    .select("*")
    .eq("id", assignmentResult.data.media_asset_id)
    .maybeSingle()
  if (existingResult.error || !existingResult.data) {
    return NextResponse.json({ error: "asset_not_found" }, { status: 404 })
  }
  if (existingResult.data.city_id && existingResult.data.city_id !== cityResult.data.id) {
    return NextResponse.json({ error: "asset_city_mismatch" }, { status: 409 })
  }

  const requestedStatus = isMediaStatus(body.status) ? body.status : null
  const actionStatus = action === "publish"
    ? "PUBLISHED"
    : action === "submit_review"
      ? "REVIEW"
      : action === "archive"
        ? "ARCHIVED"
        : requestedStatus

  if (slot.status === "PENDING_PLACE_RELATION" && actionStatus && blockedPendingStatuses.has(actionStatus)) {
    return NextResponse.json({ error: "pending_place_relation" }, { status: 409 })
  }

  const update: Record<string, unknown> = {
    updated_by: adminSession.user.id,
    updated_at: new Date().toISOString(),
  }
  const textFields = [
    ["title", "title", 240],
    ["altText", "alt_text", 400],
    ["photographer", "photographer", 240],
    ["copyrightHolder", "copyright_holder", 240],
    ["license", "license", 160],
    ["provenanceNote", "provenance_note", 2000],
  ] as const
  for (const [bodyKey, databaseKey, maxLength] of textFields) {
    if (bodyKey in body) update[databaseKey] = nullableText(body[bodyKey], maxLength)
  }
  if ("sourceUrl" in body) update.source_url = validHttpUrl(body.sourceUrl)
  if ("licenseUrl" in body) update.license_url = validHttpUrl(body.licenseUrl)
  if (actionStatus) update.status = actionStatus

  if (Object.keys(update).length === 2) {
    return NextResponse.json({ error: "no_memory_changes" }, { status: 400 })
  }

  const result = await admin
    .from("city_media_assets")
    .update(update)
    .eq("id", existingResult.data.id)
    .select("*")
    .single()
  if (result.error || !result.data) {
    return NextResponse.json({ error: "memory_asset_update_failed" }, { status: 500 })
  }

  await writeMediaAudit(admin, adminSession, {
    cityId: cityResult.data.id,
    mediaAssetId: existingResult.data.id,
    assignmentId: assignmentResult.data.id,
    action: action === "archive" ? "ARCHIVE" : "UPDATE_METADATA",
    entityType: "COLLECTION",
    entityKey: memoryId,
    role: "MEMORY_STAMP_ARTWORK",
    previousState: existingResult.data,
    nextState: result.data,
  })

  await notifyPublicRevalidation({ resource: "memory", citySlug })

  return NextResponse.json({ asset: result.data, slotStatus: slot.status })
}
