export const MENU_VIDEO_BUCKET = "menu-videos"
export const MAX_MENU_VIDEO_BYTES = 50 * 1024 * 1024

export function validateMenuVideoFile(file: { name: string; type: string; size: number }): string | null {
  if (!/\.mp4$/i.test(file.name) || file.type !== "video/mp4") {
    return "Bitte ein MP4-Video (H.264) auswählen."
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_MENU_VIDEO_BYTES) {
    return "Das Video muss zwischen 1 Byte und 50 MB groß sein."
  }
  return null
}

export function menuVideoStoragePath(
  value: string,
  storageOrigin: string,
  partnerId: string,
  menuId: string,
): string | null {
  try {
    const url = new URL(value)
    const origin = new URL(storageOrigin)
    const prefix = `/storage/v1/object/public/${MENU_VIDEO_BUCKET}/${partnerId}/${menuId}/`
    const fileName = url.pathname.slice(prefix.length)
    if (url.protocol !== "https:" || url.origin !== origin.origin ||
        url.username || url.password || url.search || url.hash ||
        !url.pathname.startsWith(prefix) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/i.test(fileName)) return null
    return `${partnerId}/${menuId}/${fileName}`
  } catch {
    return null
  }
}
