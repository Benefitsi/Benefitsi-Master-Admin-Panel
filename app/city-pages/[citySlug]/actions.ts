"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import {
  fieldValuesEqual,
  loadFieldControls,
  normalizeFieldControlMode,
  resolveFieldControl,
} from "@/lib/city-pages/field-controls"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseBoundedDecimalInput } from "@/lib/city-pages/number-inputs"

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
  return parseBoundedDecimalInput(raw, minimum, maximum)
}

export async function updateCityPageProfile(formData: FormData) {
  const { adminSession } = await requireAdmin()

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

  if (!UUID_PATTERN.test(cityId)) {
    redirect("/city-pages?error=profile_validation")
  }

  const admin = createAdminClient()
  const existing = await admin
    .from("cities")
    .select("*")
    .eq("id", cityId)
    .maybeSingle()

  if (existing.error || !existing.data?.slug) {
    redirect("/city-pages?error=city_missing")
  }

  const slug = String(existing.data.slug)
  const current = existing.data as Record<string, unknown>
  const existingControls = await loadFieldControls(
    admin,
    cityId,
    "CITY_HOMEPAGE",
    cityId,
  )
  const confirmedAutoUpdate = formData.get("confirm_auto_update") === "on"

  const submittedValues: Record<string, unknown> = {
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
  }
  const formKeyByField: Record<string, string> = {
    name: "name",
    region: "region",
    intro: "intro",
    hero_image_url: "heroImageUrl",
    hero_image_alt: "heroImageAlt",
    seo_title: "seoTitle",
    seo_description: "seoDescription",
    state: "state",
    country: "country",
    latitude: "latitude",
    longitude: "longitude",
  }
  const fieldControlChanges: Array<{
    fieldPath: string
    beforeValue: unknown
    afterValue: unknown
    modeBefore: "AUTO" | "MANUAL" | "LOCKED"
    modeAfter: "AUTO" | "MANUAL" | "LOCKED"
    reason: string | null
  }> = []

  for (const fieldPath of Object.keys(formKeyByField)) {
    const currentMode = existingControls[fieldPath]?.mode ?? "AUTO"
    const requestedMode = normalizeFieldControlMode(
      text(formData, `mode_${fieldPath}`, 12) || currentMode,
    )
    const currentValue = current[fieldPath] ?? null
    const formKey = formKeyByField[fieldPath]
    const preserveLocked = currentMode === "LOCKED" && requestedMode === "LOCKED" && !formData.has(formKey)
    const submittedValue = preserveLocked ? currentValue : submittedValues[fieldPath]
    const changed = !fieldValuesEqual(currentValue, submittedValue)
    const decision = resolveFieldControl({
      currentMode,
      requestedMode,
      changed,
      isNew: false,
      confirmedAutoUpdate,
    })

    if ("error" in decision) {
      redirect(`/city-pages/${encodeURIComponent(slug)}?error=${decision.error}`)
    }

    submittedValues[fieldPath] = submittedValue
    if (changed || decision.mode !== currentMode) {
      fieldControlChanges.push({
        fieldPath,
        beforeValue: currentValue,
        afterValue: submittedValue,
        modeBefore: currentMode,
        modeAfter: decision.mode,
        reason: decision.reason,
      })
    }
  }

  const submittedHeroRaw = text(formData, "heroImageUrl", 2000)
  const submittedLatitudeRaw = text(formData, "latitude", 40)
  const submittedLongitudeRaw = text(formData, "longitude", 40)
  if (
    !String(submittedValues.name ?? "").trim() ||
    !String(submittedValues.intro ?? "").trim() ||
    submittedValues.latitude === undefined ||
    submittedValues.longitude === undefined ||
    (submittedHeroRaw && !submittedValues.hero_image_url) ||
    (submittedLatitudeRaw && submittedValues.latitude === undefined) ||
    (submittedLongitudeRaw && submittedValues.longitude === undefined)
  ) {
    redirect(`/city-pages/${encodeURIComponent(slug)}?error=profile_validation`)
  }

  const now = new Date().toISOString()
  const result = await admin
    .from("cities")
    .update({
      ...submittedValues,
      updated_at: now,
    })
    .eq("id", cityId)

  if (result.error) {
    redirect(`/city-pages/${encodeURIComponent(slug)}?error=profile_save`)
  }

  if (fieldControlChanges.length) {
    const controlsResult = await admin
      .from("city_content_field_controls")
      .upsert(
        fieldControlChanges.map((change) => ({
          city_id: cityId,
          entity_type: "CITY_HOMEPAGE",
          entity_id: cityId,
          field_path: change.fieldPath,
          mode: change.modeAfter,
          reason: change.reason,
          updated_by: adminSession.user.id,
          updated_at: now,
        })),
        { onConflict: "city_id,entity_type,entity_id,field_path" },
      )

    if (controlsResult.error) {
      redirect(`/city-pages/${encodeURIComponent(slug)}?error=control_sync`)
    }

    const auditResult = await admin.from("city_editor_audit").insert(
      fieldControlChanges.map((change) => ({
        city_id: cityId,
        entity_type: "CITY_HOMEPAGE",
        entity_id: cityId,
        field_path: change.fieldPath,
        action: change.modeBefore === change.modeAfter ? "SAVE" : "MODE_CHANGE",
        before_value: change.beforeValue ?? null,
        after_value: change.afterValue ?? null,
        mode_before: change.modeBefore,
        mode_after: change.modeAfter,
        actor_id: adminSession.user.id,
        actor_profile:
          adminSession.profile?.display_name ||
          adminSession.profile?.email ||
          adminSession.user.email ||
          "Benefitsi Admin",
        reason: change.reason,
      })),
    )

    if (auditResult.error) {
      redirect(`/city-pages/${encodeURIComponent(slug)}?error=audit_sync`)
    }
  }

  revalidatePath("/city-pages")
  revalidatePath(`/city-pages/${slug}`)
  revalidatePath(`/stadt/${slug}`)
  redirect(`/city-pages/${encodeURIComponent(slug)}?success=profile_saved`)
}
