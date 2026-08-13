"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function text(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function optionalUrl(formData: FormData, key: string) {
  const value = text(formData, key, 2000)
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? value : null
  } catch {
    return null
  }
}

function coordinate(
  formData: FormData,
  key: string,
  minimum: number,
  maximum: number,
) {
  const raw = text(formData, key, 40)
  if (!raw) return null
  const value = Number(raw.replace(",", "."))
  return Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : undefined
}

export async function updateCityPageProfile(formData: FormData) {
  await requireAdmin()

  const cityId = text(formData, "cityId", 80)
  const name = text(formData, "name", 180)
  const region = text(formData, "region", 180)
  const intro = text(formData, "intro", 4000)
  const heroImageUrl = optionalUrl(formData, "heroImageUrl")
  const heroImageAlt = text(formData, "heroImageAlt", 300)
  const seoTitle = text(formData, "seoTitle", 180)
  const seoDescription = text(formData, "seoDescription", 500)
  const state = text(formData, "state", 120)
  const country = text(formData, "country", 120)
  const latitude = coordinate(formData, "latitude", -90, 90)
  const longitude = coordinate(formData, "longitude", -180, 180)

  if (
    !UUID_PATTERN.test(cityId) ||
    !name ||
    !intro ||
    latitude === undefined ||
    longitude === undefined ||
    (text(formData, "heroImageUrl", 2000) && !heroImageUrl)
  ) {
    redirect("/city-pages?error=profile_validation")
  }

  const admin = createAdminClient()
  const existing = await admin
    .from("cities")
    .select("slug")
    .eq("id", cityId)
    .maybeSingle()

  if (existing.error || !existing.data?.slug) {
    redirect("/city-pages?error=city_missing")
  }

  const slug = String(existing.data.slug)
  const result = await admin
    .from("cities")
    .update({
      name,
      region: region || null,
      intro,
      hero_image_url: heroImageUrl,
      hero_image_alt: heroImageAlt || null,
      seo_title: seoTitle || null,
      seo_description: seoDescription || null,
      state: state || null,
      country: country || "Deutschland",
      latitude,
      longitude,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cityId)

  if (result.error) {
    redirect(`/city-pages/${encodeURIComponent(slug)}?error=profile_save`)
  }

  revalidatePath("/city-pages")
  revalidatePath(`/city-pages/${slug}`)
  revalidatePath(`/stadt/${slug}`)
  redirect(`/city-pages/${encodeURIComponent(slug)}?success=profile_saved`)
}
