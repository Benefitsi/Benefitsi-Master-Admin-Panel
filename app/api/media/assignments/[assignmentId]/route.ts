import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { isMediaRole } from "@/lib/city-media/contracts"
import { writeMediaAudit } from "@/lib/city-media/server"

export const runtime = "nodejs"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const { adminSession } = await requireAdmin()
  const { assignmentId } = await params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const admin = createAdminClient()
  const existingResult = await admin.from("city_media_assignments").select("*").eq("id", assignmentId).maybeSingle()
  if (existingResult.error || !existingResult.data) return NextResponse.json({ error: "assignment_not_found" }, { status: 404 })
  if ("role" in (body ?? {}) && !isMediaRole(body?.role)) return NextResponse.json({ error: "invalid_assignment" }, { status: 400 })

  const update: Record<string, unknown> = {
    updated_by: adminSession.user.id,
    updated_at: new Date().toISOString(),
  }
  if (Number.isFinite(Number(body?.sortOrder))) update.sort_order = Math.max(0, Number(body?.sortOrder))
  if (typeof body?.isPrimary === "boolean") update.is_primary = body.isPrimary
  if (typeof body?.manualLock === "boolean") update.manual_lock = body.manualLock
  if (isMediaRole(body?.role)) update.role = body.role
  for (const key of ["focalX", "focalY", "desktopFocalX", "desktopFocalY", "mobileFocalX", "mobileFocalY"] as const) {
    if (key in (body ?? {})) update[snakeCase(key)] = pointOrNull(body?.[key])
  }

  const result = await admin.from("city_media_assignments").update(update).eq("id", assignmentId).select("*").single()
  if (result.error || !result.data) return NextResponse.json({ error: "assignment_update_failed" }, { status: 500 })
  const focalPointChanged = [
    "focal_x",
    "focal_y",
    "desktop_focal_x",
    "desktop_focal_y",
    "mobile_focal_x",
    "mobile_focal_y",
  ].some((key) => existingResult.data[key] !== result.data[key])
  const action = existingResult.data.role !== result.data.role
    ? "ROLE_CHANGE"
    : existingResult.data.manual_lock !== result.data.manual_lock
    ? result.data.manual_lock ? "LOCK" : "UNLOCK"
    : focalPointChanged
      ? "FOCAL_POINT"
    : existingResult.data.sort_order !== result.data.sort_order ? "REORDER" : "UPDATE_METADATA"
  await writeMediaAudit(admin, adminSession, {
    cityId: result.data.city_id,
    mediaAssetId: result.data.media_asset_id,
    assignmentId,
    action,
    entityType: result.data.entity_type,
    entityId: result.data.entity_id,
    entityKey: result.data.entity_key,
    role: result.data.role,
    previousState: existingResult.data,
    nextState: result.data,
  })
  return NextResponse.json({ assignment: result.data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const { adminSession } = await requireAdmin()
  const { assignmentId } = await params
  const admin = createAdminClient()
  const existingResult = await admin.from("city_media_assignments").select("*").eq("id", assignmentId).maybeSingle()
  if (existingResult.error || !existingResult.data) return NextResponse.json({ error: "assignment_not_found" }, { status: 404 })
  const result = await admin.from("city_media_assignments").delete().eq("id", assignmentId)
  if (result.error) return NextResponse.json({ error: "assignment_delete_failed" }, { status: 500 })
  await writeMediaAudit(admin, adminSession, {
    cityId: existingResult.data.city_id,
    mediaAssetId: existingResult.data.media_asset_id,
    assignmentId,
    action: "UNASSIGN",
    entityType: existingResult.data.entity_type,
    entityId: existingResult.data.entity_id,
    entityKey: existingResult.data.entity_key,
    role: existingResult.data.role,
    previousState: existingResult.data,
  })
  return NextResponse.json({ ok: true })
}

function snakeCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function pointOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.5
}
