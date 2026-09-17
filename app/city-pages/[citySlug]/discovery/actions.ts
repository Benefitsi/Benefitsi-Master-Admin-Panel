"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseDiscoveryChoice, isSelectableDiscoveryAsset, type DiscoverySaveResult } from "@/lib/city-pages/discovery-images"
import { refreshPublicCity } from "@/lib/city-pages/public-revalidation"

export async function saveDiscoveryImage(value: unknown): Promise<DiscoverySaveResult> {
  const { adminSession } = await requireAdmin()
  const input = parseDiscoveryChoice(value)
  if (!input) return { ok: false, code: "invalid", message: "Bitte Bildauswahl und Bildausschnitt prüfen." }
  const admin = createAdminClient()
  const city = await admin.from("cities").select("id,slug").eq("id", input.cityId).maybeSingle()
  if (city.error || !city.data || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(city.data.slug)) return { ok: false, code: "unavailable", message: "Die Stadt konnte nicht geladen werden." }

  const entityKey = `discovery:${input.category}`
  const existing = await admin.from("city_media_assignments").select("*")
    .eq("city_id", input.cityId).eq("entity_type", "CITY_HOMEPAGE").is("entity_id", null).eq("entity_key", entityKey).eq("role", "CARD").maybeSingle()
  if (existing.error) return { ok: false, code: "failed", message: "Die aktuelle Auswahl konnte nicht geladen werden. Bitte erneut versuchen." }
  const current = existing.data
  const conflict: DiscoverySaveResult = { ok: false, code: "conflict", message: "Diese Auswahl wurde inzwischen geändert. Bitte die Seite neu laden und erneut auswählen." }
  if ((current?.id ?? null) !== input.expectedId || (current?.updated_at ?? null) !== input.expectedUpdatedAt) return conflict

  if (input.mode === "manual") {
    const asset = await admin.from("city_media_assets").select("id,city_id,status,media_type,public_url").eq("id", input.assetId!).maybeSingle()
    if (asset.error || !asset.data || !isSelectableDiscoveryAsset(asset.data, city.data.id)) return { ok: false, code: "unavailable", message: "Dieses Bild ist für die Stadt nicht mehr freigegeben. Bitte ein anderes Bild wählen." }
  }

  if (input.mode === "automatic" && !current) return { ok: true, assignment: null, refresh: "ok", auditSaved: true }
  const now = new Date(Math.max(Date.now(), current ? Date.parse(current.updated_at) + 1 : 0)).toISOString()
  const payload = {
    city_id: city.data.id, media_asset_id: input.assetId, entity_type: "CITY_HOMEPAGE", entity_id: null, entity_key: entityKey, role: "CARD",
    is_primary: true, manual_lock: true, sort_order: 0, focal_x: input.focalX, focal_y: input.focalY,
    desktop_focal_x: null, desktop_focal_y: null, mobile_focal_x: null, mobile_focal_y: null,
    updated_by: adminSession.user.id, updated_at: now,
  }
  const result = input.mode === "automatic"
    ? await admin.from("city_media_assignments").delete().select("*").eq("city_id", input.cityId).eq("entity_type", "CITY_HOMEPAGE").is("entity_id", null).eq("entity_key", entityKey).eq("role", "CARD").eq("id", current.id).eq("updated_at", input.expectedUpdatedAt!).maybeSingle()
    : current
      ? await admin.from("city_media_assignments").update(payload).select("*").eq("city_id", input.cityId).eq("entity_type", "CITY_HOMEPAGE").is("entity_id", null).eq("entity_key", entityKey).eq("role", "CARD").eq("id", current.id).eq("updated_at", input.expectedUpdatedAt!).maybeSingle()
      : await admin.from("city_media_assignments").insert({ ...payload, created_by: adminSession.user.id }).select("*").maybeSingle()
  if (result.error?.code === "23505" || (!result.error && !result.data)) return conflict
  if (result.error) return { ok: false, code: "failed", message: "Die Bildauswahl konnte nicht gespeichert werden. Bitte erneut versuchen." }
  const assignment = input.mode === "automatic" ? null : result.data
  const audit = await admin.from("city_media_audit").insert({
    city_id: city.data.id, media_asset_id: assignment?.media_asset_id ?? current.media_asset_id,
    assignment_id: assignment?.id ?? null, actor_id: adminSession.user.id, actor_email: adminSession.user.email ?? null,
    action: input.mode === "automatic" ? "UNASSIGN" : current ? "REPLACE" : "ASSIGN",
    entity_type: "CITY_HOMEPAGE", entity_id: null, entity_key: entityKey, role: "CARD", previous_state: current, next_state: assignment,
  })
  const refresh = await refreshPublicCity(city.data.slug, city.data.id)
  revalidatePath(`/city-pages/${city.data.slug}/discovery`)
  return { ok: true, assignment, refresh, auditSaved: !audit.error }
}
