import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import { isPendingCityMemorySlot } from "@/lib/city-memory/config"
import {
  isMediaSourceType,
  isMediaStatus,
} from "@/lib/city-media/contracts"
import {
  nullableText,
  validHttpUrl,
  writeMediaAudit,
} from "@/lib/city-media/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { adminSession } = await requireAdmin()
  const { assetId } = await params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !assetId) return NextResponse.json({ error: "invalid_request" }, { status: 400 })

  const admin = createAdminClient()
  const existingResult = await admin.from("city_media_assets").select("*").eq("id", assetId).maybeSingle()
  if (existingResult.error || !existingResult.data) return NextResponse.json({ error: "asset_not_found" }, { status: 404 })

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
  for (const [bodyKey, dbKey, maxLength] of textFields) {
    if (bodyKey in body) update[dbKey] = nullableText(body[bodyKey], maxLength)
  }
  if ("sourceUrl" in body) update.source_url = validHttpUrl(body.sourceUrl)
  if ("licenseUrl" in body) update.license_url = validHttpUrl(body.licenseUrl)
  if (isMediaSourceType(body.sourceType)) update.source_type = body.sourceType
  const requestedStatus = isMediaStatus(body.status) ? body.status : null
  if (requestedStatus && ["REVIEW", "PUBLISHED"].includes(requestedStatus)) {
    if (!existingResult.data.city_id) {
      return NextResponse.json({ error: "memory_guard_lookup_failed" }, { status: 500 })
    }
    const [cityResult, assignmentResult] = await Promise.all([
      admin.from("cities").select("slug").eq("id", existingResult.data.city_id).maybeSingle(),
      admin
        .from("city_media_assignments")
        .select("entity_key")
        .eq("media_asset_id", assetId)
        .eq("entity_type", "COLLECTION")
        .eq("role", "CARD")
        .not("entity_key", "is", null),
    ])
    if (cityResult.error || assignmentResult.error || !cityResult.data) {
      return NextResponse.json({ error: "memory_guard_lookup_failed" }, { status: 500 })
    }
    const citySlug = cityResult.data.slug
    const isPending = (assignmentResult.data ?? []).some((assignment) =>
      typeof assignment.entity_key === "string" && isPendingCityMemorySlot(citySlug, assignment.entity_key),
    )
    if (isPending) {
      return NextResponse.json({ error: "pending_place_relation" }, { status: 409 })
    }
  }
  if (requestedStatus) update.status = requestedStatus

  const result = await admin.from("city_media_assets").update(update).eq("id", assetId).select("*").single()
  if (result.error || !result.data) return NextResponse.json({ error: "asset_update_failed" }, { status: 500 })

  await writeMediaAudit(admin, adminSession, {
    cityId: existingResult.data.city_id,
    mediaAssetId: assetId,
    action: "UPDATE_METADATA",
    previousState: existingResult.data,
    nextState: result.data,
  })
  return NextResponse.json({ asset: result.data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { adminSession } = await requireAdmin()
  const { assetId } = await params
  const admin = createAdminClient()
  const assetResult = await admin.from("city_media_assets").select("*").eq("id", assetId).maybeSingle()
  if (assetResult.error || !assetResult.data) return NextResponse.json({ error: "asset_not_found" }, { status: 404 })

  const usageResult = await admin.from("city_media_assignments").select("id,city_id,entity_type,entity_id,entity_key,role").eq("media_asset_id", assetId)
  if (usageResult.error) return NextResponse.json({ error: "usage_lookup_failed" }, { status: 500 })
  if ((usageResult.data ?? []).length) {
    await writeMediaAudit(admin, adminSession, {
      cityId: assetResult.data.city_id,
      mediaAssetId: assetId,
      action: "DELETE_BLOCKED",
      previousState: { assignments: usageResult.data },
    })
    return NextResponse.json(
      { error: "asset_in_use", assignments: usageResult.data },
      { status: 409 },
    )
  }

  const deleteResult = await admin
    .from("city_media_assets")
    .delete()
    .eq("id", assetId)
  if (deleteResult.error) return NextResponse.json({ error: "asset_delete_failed" }, { status: 500 })

  let storageCleanupWarning = false
  if (assetResult.data.storage_path) {
    const storageResult = await admin.storage.from(assetResult.data.storage_bucket || "city-media").remove([assetResult.data.storage_path])
    if (storageResult.error) {
      storageCleanupWarning = true
      console.error("City media storage cleanup failed:", storageResult.error.message)
    }
  }

  await writeMediaAudit(admin, adminSession, {
    cityId: assetResult.data.city_id,
    // city_media_audit.media_asset_id is intentionally nullable with ON DELETE SET NULL.
    // Keep the deletion event even though the asset row no longer exists.
    mediaAssetId: null,
    action: "DELETE",
    previousState: assetResult.data,
    nextState: { status: "DELETED", storageCleanupWarning },
  })
  return NextResponse.json({ ok: true, storageCleanupWarning })
}
