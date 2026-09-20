import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAdminSession } from "../admin"
import { createAdminClient } from "../supabase/admin"
import { trustedMediaThumbnail, type MediaInventoryData, type MediaSource } from "./inventory"

type Row = Record<string, unknown>
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null
const unavailable = <T>(): MediaSource<T> => ({ rows: [], state: "unavailable" })

async function read(query: () => PromiseLike<{ data: unknown; error: unknown }>, limit: number): Promise<MediaSource<Row>> {
  try {
    const { data, error } = await query()
    if (error || !Array.isArray(data)) return unavailable()
    const rows = data.filter((row): row is Row => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    if (rows.length !== data.length) return unavailable()
    // Conservatively mark an exactly full response as limited; no total counts
    // are inferred from capped PostgREST results.
    return { rows, state: rows.length >= limit ? "limited" : "ok" }
  } catch { return unavailable() }
}

export async function loadMediaInventory(client: SupabaseClient): Promise<MediaInventoryData> {
  const session = await getAdminSession(client)
  if (session?.isAdmin !== true) throw new Error("Admin-Zugriff erforderlich.")
  const checkedAt = new Date().toISOString()
  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch {
    return { checkedAt, assets: unavailable(), assignments: unavailable(), cities: unavailable(), places: unavailable() }
  }
  const [assets, assignments, cities] = await Promise.all([
    read(() => admin.from("city_media_assets").select("id,city_id,title,alt_text,status,source_type,public_url,mime_type").order("updated_at", { ascending: false }).limit(200), 200),
    read(() => admin.from("city_media_assignments").select("id,city_id,media_asset_id,entity_type,entity_id,entity_key,role,is_primary,manual_lock").order("id").limit(500), 500),
    read(() => admin.from("cities").select("id,name,slug").order("name").limit(200), 200),
  ])
  const cityIds = [...new Set(assignments.rows.map(row => text(row.city_id)).filter((id): id is string => Boolean(id)))]
  const places = cityIds.length
    ? await read(() => admin.from("city_places").select("id,city_id,name,canonical_slug").in("city_id", cityIds).order("id").limit(500), 500)
    : { rows: [], state: assignments.state === "ok" ? "ok" : "unavailable" } as MediaSource<Row>
  return {
    checkedAt,
    assets: { state: assets.state, rows: assets.rows.map(row => ({
      id: String(row.id), cityId: text(row.city_id), title: text(row.title) || "Bild ohne Titel", altText: text(row.alt_text),
      status: text(row.status) || "UNKNOWN", sourceType: text(row.source_type) || "UNKNOWN",
      thumbnail: ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(String(row.mime_type))
        ? trustedMediaThumbnail(row.public_url, process.env.NEXT_PUBLIC_SUPABASE_URL) : null,
    })) },
    assignments: { state: assignments.state, rows: assignments.rows.map(row => ({
      id: String(row.id), cityId: String(row.city_id), assetId: String(row.media_asset_id), entityType: String(row.entity_type),
      entityId: text(row.entity_id), entityKey: text(row.entity_key), role: String(row.role), isPrimary: row.is_primary === true, manualLock: row.manual_lock === true,
    })) },
    cities: { state: cities.state, rows: cities.rows.map(row => ({ id: String(row.id), slug: text(row.slug) || "", name: text(row.name) || "Stadt ohne Namen" })) },
    places: { state: places.state, rows: places.rows.map(row => ({ id: String(row.id), cityId: String(row.city_id), name: text(row.name) || "Ort ohne Namen", canonicalSlug: text(row.canonical_slug) })) },
  }
}
