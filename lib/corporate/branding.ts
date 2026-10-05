import type { SupabaseClient } from "@supabase/supabase-js"
import { isRecord, isTimestamp } from "@/lib/corporate/requests"

export type CorporateBranding = { logo_path: string | null; welcome_text: string }
export const MAX_LOGO_BYTES = 524288
const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const logoKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/
const emptyBranding: CorporateBranding = { logo_path: null, welcome_text: "" }
export function validLogoPath(value: unknown, companyId: string): value is string {
  return canonicalUuid.test(companyId) && typeof value === "string" && value.startsWith(`${companyId}/`) && logoKey.test(value.slice(37))
}
export function normalizeWelcomeText(value: unknown): string | null {
  if (typeof value !== "string" || [...value.trim()].length > 500 || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(value)) return null
  return value.trim()
}
export function parseCorporateBranding(value: unknown, companyId: string): CorporateBranding {
  if (!canonicalUuid.test(companyId) || !isRecord(value) || (value.logo_path !== null && !validLogoPath(value.logo_path, companyId))) return { ...emptyBranding }
  const text = normalizeWelcomeText(value.welcome_text)
  return text === null ? { ...emptyBranding } : { logo_path: value.logo_path, welcome_text: text }
}
export function validLogoBytes(bytes: Uint8Array, mime: string): boolean {
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES) return false
  if (mime === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (mime === "image/webp") return bytes.length >= 12 && [82, 73, 70, 70].every((byte, index) => bytes[index] === byte) && [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte)
  return false
}
export type BrandingImage = { mime: string; base64: string }
export type BrandingMutation = {
  status: "idle" | "updated" | "invalid" | "not_found" | "conflict" | "error"
  message: string; updatedAt?: string; branding?: CorporateBranding; cleanupWarning?: string
}
export const brandingFailure: BrandingMutation = { status: "error", message: "Das Speichern konnte nicht bestätigt werden. Bitte den Serverstand neu laden; Ihre Eingaben bleiben bis dahin erhalten." }
const invalid: BrandingMutation = { status: "invalid", message: "Bitte Begrüßung und Logo prüfen: maximal 500 Zeichen, PNG, JPEG oder WebP bis 512 KB." }
const cleanupWarning = "Eine alte Bilddatei konnte noch nicht bereinigt werden."
type BrandingClient = Pick<SupabaseClient, "rpc" | "storage">
async function removeUnbound(client: BrandingClient, path: string): Promise<boolean> {
  try { const { error } = await client.storage.from("corporate-logos").remove([path]); return !error } catch { return false }
}
export async function saveCorporateBranding(client: BrandingClient, data: FormData): Promise<BrandingMutation> {
  const companyId = data.get("companyId"), expected = data.get("expectedUpdatedAt")
  const rawWelcomeText = data.get("welcomeText")
  // Multipart transport canonicalizes textarea newlines to CRLF. Stored DTOs stay strict.
  const welcomeText = normalizeWelcomeText(typeof rawWelcomeText === "string" ? rawWelcomeText.replace(/\r\n/g, "\n") : rawWelcomeText)
  const path = data.get("logoPath"), file = data.get("logo")
  if (typeof companyId !== "string" || !canonicalUuid.test(companyId) || !isTimestamp(expected) || welcomeText === null
    || (path !== "" && !validLogoPath(path, companyId)) || (file !== null && (typeof file === "string" || file.size < 1 || file.size > MAX_LOGO_BYTES))) return invalid
  let chosenPath = path === "" ? null : path as string
  let attemptedPath: string | null = null
  if (file && typeof file !== "string") {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!validLogoBytes(bytes, file.type)) return invalid
      const extension = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp"
      attemptedPath = `${companyId}/${crypto.randomUUID()}.${extension}`
      const { error } = await client.storage.from("corporate-logos").upload(attemptedPath, bytes, { contentType: file.type, upsert: false, cacheControl: "0" })
      if (error) return brandingFailure
      chosenPath = attemptedPath
    } catch { return brandingFailure }
  }
  try {
    const { data: result, error } = await client.rpc("update_corporate_branding", { p_company_id: companyId, p_expected_updated_at: expected, p_welcome_text: welcomeText, p_logo_path: chosenPath })
    if (error || !isRecord(result)) return brandingFailure
    if (result.status === "invalid" || result.status === "not_found" || result.status === "conflict") {
      if (attemptedPath && !await removeUnbound(client, attemptedPath)) console.warn("Corporate branding rejected-upload cleanup incomplete")
      return result.status === "invalid" ? invalid : { status: result.status, message: result.status === "conflict" ? "Der Firmenauftritt wurde inzwischen geändert. Ihre Eingaben bleiben erhalten. Bitte den Serverstand neu laden." : "Dieses Firmenkonto ist nicht mehr verfügbar. Bitte den Serverstand neu laden." }
    }
    if (result.status !== "updated" || !isTimestamp(result.updated_at) || (result.previous_logo_path !== null && !validLogoPath(result.previous_logo_path, companyId))) return brandingFailure
    const cleanupFailed = result.previous_logo_path && result.previous_logo_path !== chosenPath && !await removeUnbound(client, result.previous_logo_path)
    if (cleanupFailed) console.warn("Corporate branding previous-logo cleanup incomplete")
    return { status: "updated", message: "Firmenauftritt gespeichert.", updatedAt: result.updated_at, branding: { logo_path: chosenPath, welcome_text: welcomeText }, ...(cleanupFailed ? { cleanupWarning } : {}) }
  } catch { return brandingFailure }
}
export async function readCorporateLogo(client: BrandingClient, companyId: string, path: string): Promise<BrandingImage | null> {
  if (!validLogoPath(path, companyId)) return null
  try {
    const { data, error } = await client.storage.from("corporate-logos").download(path)
    if (error || !data || data.size < 1 || data.size > MAX_LOGO_BYTES) return null
    const bytes = new Uint8Array(await data.arrayBuffer())
    if (!validLogoBytes(bytes, data.type)) return null
    return { mime: data.type, base64: Buffer.from(bytes).toString("base64") }
  } catch { return null }
}
