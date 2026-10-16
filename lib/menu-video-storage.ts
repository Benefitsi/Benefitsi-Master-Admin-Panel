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
