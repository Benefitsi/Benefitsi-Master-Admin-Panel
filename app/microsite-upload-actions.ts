"use server"

import { randomUUID } from "node:crypto"
import sharp from "sharp"
import { canEditPartnerMicrosite, getPartnerPortalSession } from "@/lib/partner-portal"
import { createClient } from "@/lib/supabase/server"

const BUCKET = process.env.SUPABASE_PARTNER_MEDIA_BUCKET ?? "partner-assets"
const MAX_BYTES = 10 * 1024 * 1024
const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Failure = { ok: false; message: string }

async function access(partnerId: string) {
  if (typeof partnerId !== "string" || !UUID.test(partnerId)) return null
  const supabase = await createClient()
  const session = await getPartnerPortalSession(supabase)
  return session && canEditPartnerMicrosite(session, partnerId) ? supabase : null
}

function isStagedPath(partnerId: string, path: string) {
  if (typeof path !== "string" || !UUID.test(partnerId)) return false
  const prefix = `microsites/${partnerId}/staging/`
  if (!path.startsWith(prefix)) return false
  const filename = path.slice(prefix.length)
  const match = /^([0-9a-f-]+)\.(png|jpg|webp|svg)$/.exec(filename)
  return !!match && UUID.test(match[1])
}

/** Only metadata travels through the action. The selected file is sent directly
 * to Storage, avoiding multipart request limits and inspector input lifetimes. */
export async function prepareMicrositeImageUpload(
  partnerId: string,
  file: { name: string; type: string; size: number },
): Promise<{ ok: true; bucket: string; path: string; token: string } | Failure> {
  try {
    const supabase = await access(partnerId)
    if (!supabase) return { ok: false, message: "Bitte mit einem berechtigten Zugang erneut anmelden." }
    if (!file || !Object.hasOwn(EXTENSIONS, file.type)) return { ok: false, message: "Bitte ein PNG-, JPEG-, WebP- oder SVG-Bild auswählen." }
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_BYTES) return { ok: false, message: "Das Bild muss zwischen 1 Byte und 10 MB groß sein." }
    const path = `microsites/${partnerId}/staging/${randomUUID()}.${EXTENSIONS[file.type]}`
    const result = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false })
    if (result.error || !result.data) return { ok: false, message: "Der Bildupload konnte nicht vorbereitet werden. Bitte erneut versuchen." }
    return { ok: true, bucket: BUCKET, path, token: result.data.token }
  } catch {
    return { ok: false, message: "Der Bildupload konnte nicht vorbereitet werden. Bitte erneut versuchen." }
  }
}

export async function completeMicrositeImageUpload(partnerId: string, path: string): Promise<{ ok: true; url: string } | Failure> {
  if (!isStagedPath(partnerId, path)) return { ok: false, message: "Ungültiger Bildupload. Bitte das Bild erneut auswählen." }
  try {
    const supabase = await access(partnerId)
    if (!supabase) return { ok: false, message: "Bitte mit einem berechtigten Zugang erneut anmelden." }
    const storage = supabase.storage.from(BUCKET)
    try {
      // Validate the stored object, not just the browser's declared file size.
      const info = await storage.info(path)
      if (info.error || !info.data) return { ok: false, message: "Das hochgeladene Bild konnte nicht gelesen werden. Bitte erneut versuchen." }
      if (!Object.hasOwn(EXTENSIONS, info.data.contentType ?? "")) return { ok: false, message: "Dieser Bildtyp wird nicht unterstützt." }
      if (!Number.isSafeInteger(info.data.size) || !info.data.size || info.data.size > MAX_BYTES) return { ok: false, message: "Das Bild darf maximal 10 MB groß sein." }
      const downloaded = await storage.download(path)
      if (downloaded.error || !downloaded.data || downloaded.data.size > MAX_BYTES) return { ok: false, message: "Das Bild konnte nicht vollständig geladen werden. Bitte erneut versuchen." }
      const result = await sharp(Buffer.from(await downloaded.data.arrayBuffer()), { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 2880, height: 2880, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 90, effort: 5 })
        .toBuffer({ resolveWithObject: true })
      const finalPath = `microsites/${partnerId}/image-${randomUUID()}-${result.info.width}x${result.info.height}.webp`
      const uploaded = await storage.upload(finalPath, result.data, { contentType: "image/webp", upsert: false })
      if (uploaded.error) return { ok: false, message: "Das Bild konnte nicht dauerhaft gespeichert werden. Bitte erneut versuchen." }
      return { ok: true, url: storage.getPublicUrl(finalPath).data.publicUrl }
    } finally {
      // Completed public images are immutable. Never delete one here, even when
      // the user selected another image while this request was running.
      await storage.remove([path]).catch(() => undefined)
    }
  } catch {
    return { ok: false, message: "Das Bild konnte nicht verarbeitet werden. Bitte erneut versuchen oder ein anderes Bild auswählen." }
  }
}

export async function discardMicrositeImageUpload(partnerId: string, path: string): Promise<{ ok: boolean; message?: string }> {
  if (!isStagedPath(partnerId, path)) return { ok: false, message: "Ungültiger Bildupload." }
  try {
    const supabase = await access(partnerId)
    if (!supabase) return { ok: false, message: "Keine Berechtigung für diesen Bildupload." }
    const result = await supabase.storage.from(BUCKET).remove([path])
    return { ok: !result.error }
  } catch {
    return { ok: false, message: "Der angefangene Bildupload konnte nicht entfernt werden." }
  }
}
