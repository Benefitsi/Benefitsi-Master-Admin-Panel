import type { SupabaseClient } from "@supabase/supabase-js"
import { MENU_VIDEO_BUCKET, menuVideoStoragePath, validateMenuVideoFile } from "@/lib/menu-video"

export async function verifyMenuVideoUpload(
  supabase: SupabaseClient,
  url: string,
  origin: string,
  partnerId: string,
  menuId: string,
): Promise<string | null> {
  const path = menuVideoStoragePath(url, origin, partnerId, menuId)
  if (!path) return "Das Video gehört nicht zu diesem Menü. Bitte erneut hochladen."
  const { data, error } = await supabase.storage.from(MENU_VIDEO_BUCKET).info(path)
  if (error || !data) return "Das hochgeladene Video wurde nicht gefunden. Bitte erneut hochladen."
  return validateMenuVideoFile({
    name: path,
    type: data.contentType ?? "",
    size: data.size ?? 0,
  })
}

export async function removeUnusedMenuVideos(
  supabase: SupabaseClient,
  urls: string[],
  origin: string,
  partnerId: string,
  menuId: string,
): Promise<void> {
  for (const url of new Set(urls)) {
    const path = menuVideoStoragePath(url, origin, partnerId, menuId)
    if (!path) continue
    const { data, error } = await supabase.from("menu_items")
      .select("id").eq("video_url", url).limit(1)
    if (error || !data || data.length) continue
    await supabase.storage.from(MENU_VIDEO_BUCKET).remove([path])
  }
}
