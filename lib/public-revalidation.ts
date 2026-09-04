import type { SupabaseClient } from "@supabase/supabase-js"

export type PublicRevalidationResource =
  | "city"
  | "event"
  | "place"
  | "route"
  | "guide"
  | "benefit"
  | "partner"
  | "memory"
  | "media"
  | "editorial"
  | "global_editorial"

export type PublicRevalidationInput = {
  resource: PublicRevalidationResource
  citySlug?: string
  partnerSlug?: string
}

export type PublicRevalidationResult =
  | { status: "not_configured" }
  | { status: "sent"; statusCode: number }
  | { status: "failed"; statusCode?: number }

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function validSlug(value: string | undefined) {
  return Boolean(value && slugPattern.test(value))
}

function endpointUrl() {
  const base =
    process.env.BENEFITSI_WEB_REVALIDATION_URL?.trim() ||
    process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL?.trim() ||
    process.env.NEXT_PUBLIC_BENEFITSI_CITY_BASE_URL?.trim() ||
    "https://benefitsi.de"
  return base.endsWith("/api/revalidate") ? base : `${base.replace(/\/+$/, "")}/api/revalidate`
}

export async function notifyPublicRevalidation(
  input: PublicRevalidationInput,
): Promise<PublicRevalidationResult> {
  const secret = process.env.BENEFITSI_WEB_REVALIDATION_SECRET?.trim()
  if (!secret) return { status: "not_configured" }
  if (!validSlug(input.citySlug) && input.resource !== "global_editorial") return { status: "failed" }
  if (input.partnerSlug && !validSlug(input.partnerSlug)) return { status: "failed" }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch(endpointUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
    return response.ok
      ? { status: "sent", statusCode: response.status }
      : { status: "failed", statusCode: response.status }
  } catch {
    return { status: "failed" }
  } finally {
    clearTimeout(timeout)
  }
}

export async function notifyCityPublicRevalidation(
  supabase: SupabaseClient,
  cityId: string,
  resource: PublicRevalidationResource,
) {
  try {
    const city = await supabase
      .from("cities")
      .select("slug")
      .eq("id", cityId)
      .maybeSingle()
    if (city.error || !city.data?.slug) return { status: "failed" as const }
    return notifyPublicRevalidation({ resource, citySlug: city.data.slug })
  } catch {
    return { status: "failed" as const }
  }
}

/** Resolve the existing partner/city identity before invalidating public caches. */
export async function notifyPartnerPublicRevalidation(
  supabase: SupabaseClient,
  partnerId: string,
) {
  try {
    const partner = await supabase
      .from("partners")
      .select("slug,city_id")
      .eq("id", partnerId)
      .maybeSingle()
    if (partner.error || !partner.data?.slug || !partner.data.city_id) return { status: "failed" as const }

    const city = await supabase
      .from("cities")
      .select("slug")
      .eq("id", partner.data.city_id)
      .maybeSingle()
    if (city.error || !city.data?.slug) return { status: "failed" as const }

    return notifyPublicRevalidation({
      resource: "partner",
      citySlug: city.data.slug,
      partnerSlug: partner.data.slug,
    })
  } catch {
    return { status: "failed" as const }
  }
}
