import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { discoveryCategories, discoveryImageUrl, isSelectableDiscoveryAsset, type DiscoveryAssignment, type DiscoveryAsset } from "./discovery-images"

export async function loadDiscoveryImages(citySlug: string) {
  const admin = createAdminClient()
  const cityResult = await admin.from("cities").select("id,slug,name").eq("slug", citySlug).maybeSingle()
  if (cityResult.error) throw new Error("Die Stadt konnte nicht geladen werden.")
  if (!cityResult.data) return null
  const city = cityResult.data as { id: string; slug: string; name: string }
  const [media, assignments] = await Promise.all([
    admin.from("city_media_assets").select("id,city_id,title,alt_text,public_url,status,media_type,photographer,copyright_holder,license").or(`city_id.eq.${city.id},city_id.is.null`).eq("status", "PUBLISHED").eq("media_type", "image").order("title"),
    admin.from("city_media_assignments").select("id,media_asset_id,entity_key,manual_lock,focal_x,focal_y,updated_at").eq("city_id", city.id).eq("entity_type", "CITY_HOMEPAGE").is("entity_id", null).eq("role", "CARD").in("entity_key", discoveryCategories.map(c => `discovery:${c.key}`)),
  ])
  if (media.error || assignments.error) throw new Error("Die Bildauswahl konnte nicht geladen werden. Bitte erneut versuchen.")
  const assets: DiscoveryAsset[] = (media.data ?? []).filter(asset => isSelectableDiscoveryAsset(asset, city.id)).map(asset => ({
    id: asset.id, title: asset.title || asset.alt_text || "Stadtbild", url: discoveryImageUrl(asset.public_url)!, alt: asset.alt_text || asset.title || "",
    credit: [asset.photographer || asset.copyright_holder, asset.license].filter(Boolean).join(" · ") || null,
  }))
  return { city, assets, assignments: (assignments.data ?? []) as DiscoveryAssignment[] }
}
