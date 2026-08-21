import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import { isPendingCityMemorySlot } from "@/lib/city-memory/config"
import {
  isMediaEntityType,
  isMediaRole,
} from "@/lib/city-media/contracts"
import { cleanText, isUuid, writeMediaAudit } from "@/lib/city-media/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { adminSession } = await requireAdmin()
  const { assetId } = await params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const entityType = body?.entityType
  const role = body?.role
  const cityId = body?.cityId
  const entityId = body?.entityId
  const entityKey = cleanText(body?.entityKey, 180)

  if (!isUuid(assetId) || !isUuid(cityId) || !isMediaEntityType(entityType) || !isMediaRole(role) || (!isUuid(entityId) && !entityKey)) {
    return NextResponse.json({ error: "invalid_assignment" }, { status: 400 })
  }

  const admin = createAdminClient()
  const [assetResult, cityResult] = await Promise.all([
    admin.from("city_media_assets").select("*").eq("id", assetId).maybeSingle(),
    admin.from("cities").select("id,slug").eq("id", cityId).maybeSingle(),
  ])
  if (assetResult.error || !assetResult.data) return NextResponse.json({ error: "asset_not_found" }, { status: 404 })
  if (cityResult.error || !cityResult.data) return NextResponse.json({ error: "city_not_found" }, { status: 404 })
  if (assetResult.data.city_id && assetResult.data.city_id !== cityId) return NextResponse.json({ error: "asset_city_mismatch" }, { status: 409 })
  if (
    entityType === "COLLECTION" &&
    role === "CARD" &&
    entityKey &&
    isPendingCityMemorySlot(cityResult.data.slug, entityKey) &&
    ["REVIEW", "PUBLISHED"].includes(String(assetResult.data.status))
  ) {
    return NextResponse.json({ error: "pending_place_relation" }, { status: 409 })
  }

  const lookup = admin
    .from("city_media_assignments")
    .select("*")
    .eq("city_id", cityId)
    .eq("entity_type", entityType)
    .eq("role", role)
  const existingResult = role === "GALLERY"
    ? { data: null, error: null }
    : isUuid(entityId)
      ? await lookup.eq("entity_id", entityId).maybeSingle()
      : await lookup.eq("entity_key", entityKey).is("entity_id", null).maybeSingle()

  let nextGalleryOrder: number | null = null
  if (role === "GALLERY" && !Number.isInteger(body?.sortOrder)) {
    const galleryOrderResult = await admin
      .from("city_media_assignments")
      .select("sort_order")
      .eq("city_id", cityId)
      .eq("entity_type", entityType)
      .eq("role", role)
      .eq(isUuid(entityId) ? "entity_id" : "entity_key", isUuid(entityId) ? entityId : entityKey)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!galleryOrderResult.error && galleryOrderResult.data) {
      nextGalleryOrder = Number(galleryOrderResult.data.sort_order) + 1
    } else if (!galleryOrderResult.error) {
      nextGalleryOrder = 0
    }
  }

  const now = new Date().toISOString()
  const payload = {
    city_id: cityId,
    media_asset_id: assetId,
    entity_type: entityType,
    entity_id: isUuid(entityId) ? entityId : null,
    entity_key: isUuid(entityId) ? null : entityKey,
    role,
    sort_order: Number.isInteger(body?.sortOrder)
      ? Math.max(0, Number(body?.sortOrder))
      : nextGalleryOrder ?? 0,
    is_primary: body?.isPrimary !== false,
    manual_lock: body?.manualLock !== false,
    focal_x: normalizedPoint(body?.focalX),
    focal_y: normalizedPoint(body?.focalY),
    desktop_focal_x: normalizedPointOrNull(body?.desktopFocalX),
    desktop_focal_y: normalizedPointOrNull(body?.desktopFocalY),
    mobile_focal_x: normalizedPointOrNull(body?.mobileFocalX),
    mobile_focal_y: normalizedPointOrNull(body?.mobileFocalY),
    updated_by: adminSession.user.id,
    updated_at: now,
  }
  const result = existingResult.data
    ? await admin.from("city_media_assignments").update(payload).eq("id", existingResult.data.id).select("*").single()
    : await admin.from("city_media_assignments").insert({ ...payload, created_by: adminSession.user.id }).select("*").single()

  if (result.error || !result.data) return NextResponse.json({ error: "assignment_save_failed" }, { status: 500 })
  await writeMediaAudit(admin, adminSession, {
    cityId,
    mediaAssetId: assetId,
    assignmentId: result.data.id,
    action: existingResult.data ? "REPLACE" : "ASSIGN",
    entityType,
    entityId: result.data.entity_id,
    entityKey: result.data.entity_key,
    role,
    previousState: existingResult.data,
    nextState: result.data,
  })
  return NextResponse.json({ assignment: result.data })
}

function normalizedPoint(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.5
}

function normalizedPointOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  return normalizedPoint(value)
}
