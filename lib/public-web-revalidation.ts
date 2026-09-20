import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

export type PublicRefreshResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "invalid_target" | "lookup_failed" | "unavailable" }

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const validSlug = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 120 && slugPattern.test(value)

/** Called after a successful public-state commit. No caller-supplied URL/tag/path. */
export async function invalidatePublicPartner(
  supabase: SupabaseClient,
  partnerId: string,
  micrositeSlug?: string | null,
): Promise<PublicRefreshResult> {
  const secret = process.env.BENEFITSI_WEB_REVALIDATION_SECRET?.trim()
  const configured = process.env.BENEFITSI_WEB_REVALIDATION_URL?.trim()
  if (!secret || secret.length < 32 || !configured) return { ok: false, reason: "not_configured" }
  let target: URL
  try {
    target = new URL(configured)
    const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
    if ((target.protocol !== "https:" && !(local && target.protocol === "http:")) ||
        target.username || target.password || target.search || target.hash || target.pathname !== "/api/revalidate") {
      return { ok: false, reason: "invalid_target" }
    }
  } catch { return { ok: false, reason: "invalid_target" } }

  const headers: Record<string, string> = {
    authorization: `Bearer ${secret}`, "content-type": "application/json",
  }
  const previewBypass = process.env.BENEFITSI_WEB_PROTECTION_BYPASS_SECRET?.trim()
  if (process.env.VERCEL_ENV === "preview" && target.hostname.endsWith(".vercel.app") && previewBypass) {
    headers["x-vercel-protection-bypass"] = previewBypass
  }

  try {
    const { data, error } = await supabase.from("partners").select("slug,cities(slug)").eq("id", partnerId).maybeSingle()
    if (error || !data || !validSlug(data.slug)) return { ok: false, reason: "lookup_failed" }
    const city = Array.isArray(data.cities) ? data.cities[0] : data.cities
    const citySlug: unknown = city?.slug
    if (citySlug != null && !validSlug(citySlug)) return { ok: false, reason: "lookup_failed" }
    const slugs = [...new Set([data.slug, ...(validSlug(micrositeSlug) ? [micrositeSlug] : [])])]
    for (const partnerSlug of slugs) {
      let delivered = false
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch(target, {
            method: "POST", redirect: "error", cache: "no-store",
            headers,
            body: JSON.stringify({ resource: "partner", partnerSlug, ...(citySlug ? { citySlug } : {}) }),
            signal: AbortSignal.timeout(2500),
          })
          if (response.ok && (await response.json()).ok === true) { delivered = true; break }
          if (response.status >= 400 && response.status < 500) break
        } catch { /* A lost response can be retried: invalidation is idempotent. */ }
      }
      if (!delivered) return { ok: false, reason: "unavailable" }
    }
    return { ok: true }
  } catch { return { ok: false, reason: "lookup_failed" } }
}
