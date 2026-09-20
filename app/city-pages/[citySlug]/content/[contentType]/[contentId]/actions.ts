"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import {
  cityContentEditorDefinitions,
  type EditorField,
} from "@/lib/city-pages/content-editor"
import {
  isCityContentType,
  type CityContentType,
} from "@/lib/city-operations/contracts"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function rawText(formData: FormData, key: string, maxLength = 10000) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 80),
    ),
  )
}

function parseField(field: EditorField, formData: FormData) {
  if (field.kind === "opening_hours") {
    return Array.from({ length: 7 }, (_, index) => index + 1).flatMap(
      (weekday) => {
        const closed =
          formData.get(`${field.name}_${weekday}_closed`) === "on"
        const opens = rawText(
          formData,
          `${field.name}_${weekday}_opens`,
          5,
        )
        const closes = rawText(
          formData,
          `${field.name}_${weekday}_closes`,
          5,
        )
        if (closed) {
          if (opens || closes) throw new Error(`opening_hours:${field.name}`)
          return [{ weekday, closed: true }]
        }
        if (!opens && !closes) return []
        if (
          !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(opens) ||
          !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(closes) ||
          closes <= opens
        ) {
          throw new Error(`opening_hours:${field.name}`)
        }
        return [{ weekday, closed: false, opens, closes }]
      },
    )
  }

  if (field.kind === "checkbox") {
    return formData.get(field.name) === "on"
  }

  if (field.kind === "weekdays") {
    const values = formData
      .getAll(field.name)
      .filter((value): value is string => typeof value === "string")
      .map(Number)
    if (values.some((value) => !Number.isInteger(value) || value < 1 || value > 7)) {
      throw new Error(`weekdays:${field.name}`)
    }
    return Array.from(new Set(values)).sort()
  }

  const value = rawText(formData, field.name, field.maxLength ?? 10000)
  if (!value) {
    if (field.required) throw new Error(`required:${field.name}`)
    return field.kind === "tags" ? [] : null
  }

  if (field.kind === "tags") {
    const values = parseTags(value)
    if (field.required && values.length === 0) {
      throw new Error(`required:${field.name}`)
    }
    return values
  }

  if (field.kind === "url") {
    const url = new URL(value)
    if (!["https:", "http:"].includes(url.protocol)) {
      throw new Error(`url:${field.name}`)
    }
    return value
  }

  if (field.kind === "datetime") {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new Error(`date:${field.name}`)
    return date.toISOString()
  }

  if (field.kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`date:${field.name}`)
    }
    return value
  }

  if (field.kind === "time") {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new Error(`time:${field.name}`)
    }
    return value
  }

  if (field.kind === "number") {
    const number = Number(value.replace(",", "."))
    if (
      !Number.isFinite(number) ||
      (field.min !== undefined && number < field.min) ||
      (field.max !== undefined && number > field.max)
    ) {
      throw new Error(`number:${field.name}`)
    }
    return number
  }

  if (field.kind === "partner" || field.kind === "deal") {
    if (!UUID_PATTERN.test(value)) throw new Error(`uuid:${field.name}`)
    return value
  }

  if (field.name === "slug" && !SLUG_PATTERN.test(value)) {
    throw new Error("slug:slug")
  }

  if (
    field.kind === "select" &&
    !field.options?.some((option) => option.value === value)
  ) {
    throw new Error(`option:${field.name}`)
  }

  return value
}

function editorPath(
  citySlug: string,
  contentType: CityContentType,
  contentId: string,
) {
  return `/city-pages/${encodeURIComponent(citySlug)}/content/${contentType}/${contentId}`
}

export async function saveCityContent(formData: FormData) {
  const { adminSession, supabase } = await requireAdmin()
  const cityId = rawText(formData, "cityId", 80)
  const citySlug = rawText(formData, "citySlug", 180)
  const contentTypeValue = rawText(formData, "contentType", 40)
  const contentIdValue = rawText(formData, "contentId", 80)
  const intent = rawText(formData, "intent", 20)
  const expectedUpdatedAt = rawText(formData, "expectedUpdatedAt", 80)

  if (
    !UUID_PATTERN.test(cityId) ||
    !SLUG_PATTERN.test(citySlug) ||
    !isCityContentType(contentTypeValue) ||
    !["draft", "review"].includes(intent) ||
    (contentIdValue !== "new" &&
      (!UUID_PATTERN.test(contentIdValue) ||
        !expectedUpdatedAt ||
        Number.isNaN(Date.parse(expectedUpdatedAt))))
  ) {
    redirect("/city-pages?error=content_validation")
  }

  const contentType = contentTypeValue
  const definition = cityContentEditorDefinitions[contentType]
  const targetPath = editorPath(citySlug, contentType, contentIdValue)

  let parsedPayload: Record<string, unknown>
  try {
    parsedPayload = Object.fromEntries(
      definition.fields.map((field) => [
        field.name,
        parseField(field, formData),
      ]),
    )
  } catch {
    redirect(`${targetPath}?error=field_validation`)
  }

  const payload = Object.fromEntries(
    definition.fields
      .filter((field) => field.storage !== "schedule")
      .map((field) => [field.name, parsedPayload[field.name]]),
  )
  const schedulePayload = Object.fromEntries(
    definition.fields
      .filter((field) => field.storage === "schedule")
      .map((field) => [field.name, parsedPayload[field.name]]),
  )

  if (contentType === "events") {
    const start = new Date(String(payload.start_date))
    const end = new Date(String(payload.end_date))
    const expires = new Date(String(payload.expires_at))
    if (end < start || expires < end) {
      redirect(`${targetPath}?error=date_order`)
    }
    if (
      payload.price_type === "paid" &&
      typeof payload.price_label !== "string"
    ) {
      redirect(`${targetPath}?error=event_price_validation`)
    }
    if (
      payload.organizer_email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.organizer_email))
    ) {
      redirect(`${targetPath}?error=event_contact_validation`)
    }

    const frequency =
      typeof schedulePayload.recurrence_frequency === "string"
        ? schedulePayload.recurrence_frequency
        : ""
    if (frequency) {
      const weekdays = Array.isArray(schedulePayload.recurrence_weekdays)
        ? schedulePayload.recurrence_weekdays
        : []
      const monthDay = schedulePayload.recurrence_month_day
      const startTime = schedulePayload.recurrence_start_time
      const endTime = schedulePayload.recurrence_end_time
      const startsOn = schedulePayload.recurrence_starts_on
      const endsOn = schedulePayload.recurrence_ends_on
      const displayText = schedulePayload.recurrence_display_text
      const sourceUrl = payload.source_url

      if (
        !["weekly", "monthly"].includes(frequency) ||
        !startTime ||
        !endTime ||
        !startsOn ||
        !endsOn ||
        !displayText ||
        !sourceUrl ||
        String(endTime) <= String(startTime) ||
        String(endsOn) < String(startsOn) ||
        (frequency === "weekly" && weekdays.length === 0) ||
        (frequency === "monthly" &&
          (typeof monthDay !== "number" || weekdays.length > 0))
      ) {
        redirect(`${targetPath}?error=recurrence_validation`)
      }

      const exceptionDates = Array.isArray(
        schedulePayload.recurrence_exception_dates,
      )
        ? schedulePayload.recurrence_exception_dates
        : []
      if (
        exceptionDates.some(
          (date) =>
            typeof date !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            date < String(startsOn) ||
            date > String(endsOn),
        )
      ) {
        redirect(`${targetPath}?error=recurrence_validation`)
      }
    }
  }

  if (contentType === "places") {
    if (
      payload.admission_type === "paid" &&
      typeof payload.admission_label !== "string"
    ) {
      redirect(`${targetPath}?error=place_admission_validation`)
    }
    if (
      payload.contact_email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.contact_email))
    ) {
      redirect(`${targetPath}?error=place_contact_validation`)
    }
  }

  const admin = createAdminClient()
  const cityResult = await admin
    .from("cities")
    .select("id,slug")
    .eq("id", cityId)
    .eq("slug", citySlug)
    .maybeSingle()

  if (cityResult.error || !cityResult.data) {
    redirect("/city-pages?error=city_missing")
  }

  const partnerId =
    typeof payload.partner_id === "string" && payload.partner_id
      ? payload.partner_id
      : null
  if (partnerId) {
    const partnerResult = await supabase
      .from("partners")
      .select("id")
      .eq("id", partnerId)
      .eq("city_id", cityId)
      .maybeSingle()

    if (partnerResult.error || !partnerResult.data) {
      redirect(`${targetPath}?error=invalid_partner`)
    }
  }

  const dealId =
    typeof payload.deal_id === "string" && payload.deal_id
      ? payload.deal_id
      : null
  if (dealId) {
    if (!partnerId) {
      redirect(`${targetPath}?error=invalid_deal`)
    }

    const dealResult = await supabase
      .from("deals")
      .select("id")
      .eq("id", dealId)
      .eq("partner_id", partnerId)
      .maybeSingle()

    if (dealResult.error || !dealResult.data) {
      redirect(`${targetPath}?error=invalid_deal`)
    }
  }

  const frequency = schedulePayload.recurrence_frequency
  const schedule = contentType === "events" && typeof frequency === "string" && frequency
    ? {
        frequency,
        interval_count: schedulePayload.recurrence_interval_count ?? 1,
        weekdays: frequency === "weekly" ? schedulePayload.recurrence_weekdays : [],
        month_day: frequency === "monthly" ? schedulePayload.recurrence_month_day : null,
        start_time: schedulePayload.recurrence_start_time,
        end_time: schedulePayload.recurrence_end_time,
        starts_on: schedulePayload.recurrence_starts_on,
        ends_on: schedulePayload.recurrence_ends_on,
        exception_dates: schedulePayload.recurrence_exception_dates ?? [],
        display_text: schedulePayload.recurrence_display_text,
      }
    : null
  const actorProfile =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Benefitsi Admin"

  // The database owns the entire transaction, including published snapshot,
  // recurrence, review, audit and queue. No draft can be partially committed.
  const saveResult = await admin.rpc("save_city_content_draft_atomic", {
    p_city_id: cityId,
    p_content_type: contentType,
    p_content_id: contentIdValue === "new" ? null : contentIdValue,
    p_expected_updated_at: contentIdValue === "new" ? null : expectedUpdatedAt,
    p_payload: payload,
    p_schedule: schedule,
    p_intent: intent,
    p_actor_id: adminSession.user.id,
    p_actor_profile: actorProfile,
  })
  if (saveResult.error || !saveResult.data?.ok || !saveResult.data?.content_id) {
    const error = saveResult.error?.message === "content_conflict"
      ? "content_conflict"
      : "save_failed"
    redirect(`${targetPath}?error=${error}`)
  }
  const contentId = String(saveResult.data.content_id)

  revalidatePath("/city-pages")
  revalidatePath(`/city-pages/${citySlug}`)
  revalidatePath("/city-operations")
  redirect(
    `${editorPath(citySlug, contentType, contentId)}?success=${
      intent === "review" ? "review_queued" : "draft_saved"
    }`,
  )
}
