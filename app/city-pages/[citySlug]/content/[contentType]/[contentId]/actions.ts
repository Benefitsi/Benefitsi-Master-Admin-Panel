"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import {
  fieldControlEntityType,
  fieldValuesEqual,
  loadFieldControls,
  normalizeFieldControlMode,
  resolveFieldControl,
  type FieldControlMode,
} from "@/lib/city-pages/field-controls"
import {
  cityContentEditorDefinitions,
  type EditorField,
} from "@/lib/city-pages/content-editor"
import {
  isCityContentType,
  cityFieldRisk,
  summarizeCityFieldRisks,
  type CityContentType,
} from "@/lib/city-operations/contracts"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseLocalizedDecimal } from "@/lib/city-pages/number-inputs"
import { validateCityContentCrossFields } from "@/lib/city-pages/content-validation"

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

function hasFieldValue(field: EditorField, formData: FormData) {
  if (field.kind === "opening_hours") {
    return Array.from({ length: 7 }, (_, index) => index + 1).some((weekday) =>
      [
        `${field.name}_${weekday}_closed`,
        `${field.name}_${weekday}_opens`,
        `${field.name}_${weekday}_closes`,
      ].some((key) => formData.has(key)),
    )
  }
  return formData.has(field.name)
}

function parseField(
  field: EditorField,
  formData: FormData,
  lockedFallback?: unknown,
  preserveLockedFallback = false,
) {
  if (preserveLockedFallback && !hasFieldValue(field, formData)) {
    return lockedFallback
  }

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

  if (field.kind === "relations") {
    const values = formData
      .getAll(field.name)
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
    if (values.some((value) => !UUID_PATTERN.test(value))) {
      throw new Error(`relation:${field.name}`)
    }
    return Array.from(new Set(values))
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
    const number = parseLocalizedDecimal(value)
    if (
      number === undefined ||
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

  if (field.kind === "relation") {
    if (!UUID_PATTERN.test(value)) throw new Error(`relation:${field.name}`)
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

  if (
    !UUID_PATTERN.test(cityId) ||
    !SLUG_PATTERN.test(citySlug) ||
    !isCityContentType(contentTypeValue) ||
    !["draft", "review"].includes(intent) ||
    (contentIdValue !== "new" && !UUID_PATTERN.test(contentIdValue))
  ) {
    redirect("/city-pages?error=content_validation")
  }

  const contentType = contentTypeValue
  const definition = cityContentEditorDefinitions[contentType]
  const targetPath = editorPath(citySlug, contentType, contentIdValue)

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

  let currentValues: Record<string, unknown> = {}
  let currentRecordSnapshot: Record<string, unknown> | null = null
  let currentScheduleSnapshot: Record<string, unknown> | null = null
  let existingReview: Record<string, unknown> | null = null
  if (contentIdValue !== "new") {
    const currentRecordResult = await admin
      .from(definition.table)
      .select("*")
      .eq("id", contentIdValue)
      .eq("city_id", cityId)
      .maybeSingle()

    if (currentRecordResult.error || !currentRecordResult.data) {
      redirect(`${targetPath}?error=content_missing`)
    }

    currentValues = (currentRecordResult.data as Record<string, unknown>) ?? {}
    currentRecordSnapshot = { ...currentValues }

    const existingReviewResult = await admin
      .from("city_content_reviews")
      .select("*")
      .eq("content_type", contentTypeValue)
      .eq("content_id", contentIdValue)
      .maybeSingle()

    if (existingReviewResult.error) {
      redirect(`${targetPath}?error=review_sync`)
    }
    existingReview = (existingReviewResult.data as Record<string, unknown> | null) ?? null
  }

  if (contentType === "events" && contentIdValue !== "new") {
    const scheduleResult = await admin
      .from("city_event_schedules")
      .select("*")
      .eq("event_id", contentIdValue)
      .maybeSingle()

    if (scheduleResult.error) {
      redirect(`${targetPath}?error=schedule_sync`)
    }

    if (scheduleResult.data) {
      const schedule = scheduleResult.data as Record<string, unknown>
      currentScheduleSnapshot = { ...schedule }
      currentValues = {
        ...currentValues,
        recurrence_frequency: schedule.frequency,
        recurrence_interval_count: schedule.interval_count,
        recurrence_weekdays: schedule.weekdays,
        recurrence_month_day: schedule.month_day,
        recurrence_start_time: schedule.start_time,
        recurrence_end_time: schedule.end_time,
        recurrence_starts_on: schedule.starts_on,
        recurrence_ends_on: schedule.ends_on,
        recurrence_display_text: schedule.display_text,
        recurrence_exception_dates: schedule.exception_dates,
      }
    }
  }

  const entityType = fieldControlEntityType(contentType)
  const existingControls = contentIdValue === "new"
    ? {}
    : await loadFieldControls(admin, cityId, entityType, contentIdValue)
  const confirmedAutoUpdate = formData.get("confirm_auto_update") === "on"

  let parsedPayload: Record<string, unknown>
  try {
    parsedPayload = Object.fromEntries(
      definition.fields.map((field) => [
        field.name,
        parseField(
          field,
          formData,
          currentValues[field.name],
          existingControls[field.name]?.mode === "LOCKED" &&
            normalizeFieldControlMode(
              rawText(
                formData,
                `mode_${field.name}`,
                12,
              ) || existingControls[field.name]?.mode,
            ) === "LOCKED",
        ),
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

  const changedFields = new Set(
    definition.fields
      .filter(
        (field) =>
          !fieldValuesEqual(currentValues[field.name], parsedPayload[field.name]),
      )
      .map((field) => field.name),
  )
  const nextValues = {
    ...currentValues,
    ...payload,
    ...schedulePayload,
  }
  const crossFieldValidation = validateCityContentCrossFields({
    contentType,
    currentValues,
    nextValues,
    changedFields,
    isNew: contentIdValue === "new",
  })
  if (crossFieldValidation.errors.length) {
    redirect(`${targetPath}?error=${crossFieldValidation.errors[0].code}`)
  }

  const changedFieldList = Array.from(changedFields)
  const previousChangedFields = Array.isArray(existingReview?.changed_fields)
    ? existingReview.changed_fields.filter(
        (field): field is string => typeof field === "string",
      )
    : []
  const reviewChangedFields = Array.from(
    new Set([...previousChangedFields, ...changedFieldList]),
  )
  const fieldRiskSummary = {
    ...(existingReview?.field_risk_summary &&
    typeof existingReview.field_risk_summary === "object" &&
    !Array.isArray(existingReview.field_risk_summary)
      ? (existingReview.field_risk_summary as Record<string, string>)
      : {}),
    ...summarizeCityFieldRisks(reviewChangedFields),
  }
  const currentEditHasHighFreshnessField = changedFieldList.some(
    (field) => cityFieldRisk(field) === "HIGH_FRESHNESS_FACT",
  )
  const sourceNeedsRecheck =
    currentEditHasHighFreshnessField || changedFields.has("source_url")

  const fieldControlChanges: Array<{
    fieldPath: string
    beforeValue: unknown
    afterValue: unknown
    modeBefore: FieldControlMode
    modeAfter: FieldControlMode
    reason: string | null
  }> = []

  for (const field of definition.fields) {
    const currentMode = existingControls[field.name]?.mode ?? "AUTO"
    const requestedMode = normalizeFieldControlMode(
      rawText(formData, `mode_${field.name}`, 12) || currentMode,
    )
    const currentValue = currentValues[field.name]
    const changed = !fieldValuesEqual(currentValue, parsedPayload[field.name])
    const decision = resolveFieldControl({
      currentMode,
      requestedMode,
      changed,
      isNew: contentIdValue === "new",
      confirmedAutoUpdate,
    })

    if ("error" in decision) {
      redirect(`${targetPath}?error=${decision.error}`)
    }

    if (changed || decision.mode !== currentMode) {
      fieldControlChanges.push({
        fieldPath: field.name,
        beforeValue: currentValue ?? null,
        afterValue: parsedPayload[field.name] ?? null,
        modeBefore: currentMode,
        modeAfter: decision.mode,
        reason: decision.reason,
      })
    }
  }

  const relationTableByField: Record<string, string> = {
    place_id: "city_places",
    related_place_ids: "city_places",
    related_event_ids: "city_events",
    related_route_ids: "city_routes",
    related_guide_ids: "city_guides",
  }
  for (const [fieldName, table] of Object.entries(relationTableByField)) {
    const rawValue = parsedPayload[fieldName]
    const ids = Array.isArray(rawValue)
      ? rawValue
      : rawValue
        ? [rawValue]
        : []
    if (!ids.length) continue
    const result = await admin
      .from(table)
      .select("id")
      .eq("city_id", cityId)
      .in("id", ids as string[])
    if (result.error || (result.data ?? []).length !== ids.length) {
      redirect(`${targetPath}?error=invalid_relation`)
    }
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

  const status = intent === "review" ? "needs_review" : "draft"
  const now = new Date().toISOString()
  let contentId = contentIdValue

  const publishedSnapshot = existingReview?.published_snapshot ?? (
    contentIdValue !== "new" && currentRecordSnapshot?.status === "active"
      ? {
          record: currentRecordSnapshot,
          schedule: contentType === "events" ? currentScheduleSnapshot : null,
        }
      : null
  )

  // Protect the last public version before changing the primary record. This
  // keeps a published entity resolvable while the new draft is being saved,
  // even if a later database write fails.
  if (contentIdValue !== "new") {
    const snapshotResult = await admin
      .from("city_content_reviews")
      .upsert(
        {
          city_id: cityId,
          content_type: contentType,
          content_id: contentIdValue,
          stage: "agent_draft",
          verdict: "unreviewed",
          published_snapshot: publishedSnapshot,
          updated_at: now,
        },
        { onConflict: "content_type,content_id" },
      )

    if (snapshotResult.error) {
      redirect(`${targetPath}?error=review_sync`)
    }
  }

  if (contentIdValue === "new") {
    const insertResult = await admin
      .from(definition.table)
      .insert({ ...payload, city_id: cityId, status, updated_at: now })
      .select("id")
      .single()

    if (insertResult.error || !insertResult.data?.id) {
      redirect(`${targetPath}?error=save_failed`)
    }
    contentId = String(insertResult.data.id)
  } else {
    const updateResult = await admin
      .from(definition.table)
      .update({ ...payload, status, updated_at: now })
      .eq("id", contentIdValue)
      .eq("city_id", cityId)

    if (updateResult.error) {
      redirect(`${targetPath}?error=save_failed`)
    }
  }

  if (fieldControlChanges.length) {
    const controlResult = await admin
      .from("city_content_field_controls")
      .upsert(
        fieldControlChanges.map((change) => ({
          city_id: cityId,
          entity_type: entityType,
          entity_id: contentId,
          field_path: change.fieldPath,
          mode: change.modeAfter,
          reason: change.reason,
          updated_by: adminSession.user.id,
          updated_at: now,
        })),
        { onConflict: "city_id,entity_type,entity_id,field_path" },
      )

    if (controlResult.error) {
      redirect(`${editorPath(citySlug, contentType, contentId)}?error=control_sync`)
    }

    const editorAuditResult = await admin.from("city_editor_audit").insert(
      fieldControlChanges
        .filter((change) => definition.fields.some((field) => field.name === change.fieldPath && field.storage !== "schedule"))
        .map((change) => ({
          city_id: cityId,
          entity_type: entityType,
          entity_id: contentId,
          field_path: change.fieldPath,
          action: change.modeBefore === change.modeAfter ? "SAVE" : "MODE_CHANGE",
          before_value: change.beforeValue ?? null,
          after_value: change.afterValue ?? null,
          mode_before: change.modeBefore,
          mode_after: change.modeAfter,
          actor_id: adminSession.user.id,
          actor_profile: getActorProfile(adminSession),
          reason: change.reason,
        })),
    )

    if (editorAuditResult.error) {
      redirect(`${editorPath(citySlug, contentType, contentId)}?error=audit_sync`)
    }
  }

  if (contentType === "events") {
    const frequency =
      typeof schedulePayload.recurrence_frequency === "string"
        ? schedulePayload.recurrence_frequency
        : ""

    if (frequency) {
      const scheduleResult = await admin
        .from("city_event_schedules")
        .upsert(
          {
            city_id: cityId,
            event_id: contentId,
            frequency,
            interval_count:
              typeof schedulePayload.recurrence_interval_count === "number"
                ? schedulePayload.recurrence_interval_count
                : 1,
            weekdays:
              frequency === "weekly"
                ? schedulePayload.recurrence_weekdays
                : [],
            month_day:
              frequency === "monthly"
                ? schedulePayload.recurrence_month_day
                : null,
            start_time: schedulePayload.recurrence_start_time,
            end_time: schedulePayload.recurrence_end_time,
            starts_on: schedulePayload.recurrence_starts_on,
            ends_on: schedulePayload.recurrence_ends_on,
            exception_dates:
              schedulePayload.recurrence_exception_dates ?? [],
            timezone: "Europe/Berlin",
            display_text: schedulePayload.recurrence_display_text,
            source_url: payload.source_url,
            expires_at: payload.expires_at,
            status,
            updated_at: now,
          },
          { onConflict: "event_id" },
        )

      if (scheduleResult.error) {
        redirect(
          `${editorPath(citySlug, contentType, contentId)}?error=schedule_sync`,
        )
      }
    } else if (contentIdValue !== "new") {
      const archiveResult = await admin
        .from("city_event_schedules")
        .update({ status: "archived", updated_at: now })
        .eq("event_id", contentId)

      if (archiveResult.error) {
        redirect(
          `${editorPath(citySlug, contentType, contentId)}?error=schedule_sync`,
        )
      }
    }
  }

  const sourceUrl =
    typeof payload.source_url === "string" ? payload.source_url : null
  const actorProfile =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Benefitsi Admin"
  const reviewResult = await admin
    .from("city_content_reviews")
    .upsert(
      {
        city_id: cityId,
        content_type: contentType,
        content_id: contentId,
        stage: "agent_draft",
        verdict: "unreviewed",
        summary:
          intent === "review"
            ? "Manuell bearbeitet. Ein optionaler Agent-Recheck wurde angefordert; die menschliche Freigabe bleibt unabhängig möglich."
            : "Manueller Entwurf. Menschliche Freigabe ist nach der Prüfung möglich.",
        issues: [
          ...crossFieldValidation.warnings.map((issue) => ({
            code: issue.code,
            field: issue.field,
            severity: issue.severity,
            message: issue.message,
          })),
        ],
        changed_fields: reviewChangedFields,
        field_risk_summary: fieldRiskSummary,
        source_status: sourceNeedsRecheck
          ? sourceUrl
            ? "unchecked"
            : "missing"
          : existingReview?.source_status === "verified"
            ? "verified"
            : sourceUrl
              ? String(existingReview?.source_status || "unchecked")
              : "missing",
        source_verified: sourceNeedsRecheck
          ? false
          : existingReview?.source_verified === true,
        source_checked_at: sourceNeedsRecheck
          ? null
          : typeof existingReview?.source_checked_at === "string"
            ? existingReview.source_checked_at
            : null,
        end_time_verified: sourceNeedsRecheck
          ? false
          : existingReview?.end_time_verified === true,
        agent_profile: null,
        reviewer_profile: actorProfile,
        reviewed_by: null,
        reviewed_at: null,
        manual_verified_by: sourceNeedsRecheck
          ? null
          : existingReview?.manual_verified_by ?? null,
        manual_verified_at: sourceNeedsRecheck
          ? null
          : existingReview?.manual_verified_at ?? null,
        manual_verification_source: sourceNeedsRecheck
          ? null
          : existingReview?.manual_verification_source ?? null,
        manual_verification_note: sourceNeedsRecheck
          ? null
          : existingReview?.manual_verification_note ?? null,
        publication_method: null,
        published_snapshot: publishedSnapshot,
        updated_at: now,
      },
      { onConflict: "content_type,content_id" },
    )
    .select("id")
    .single()

  if (reviewResult.error || !reviewResult.data?.id) {
    redirect(`${editorPath(citySlug, contentType, contentId)}?error=review_sync`)
  }

  const auditResult = await admin.from("city_content_review_audit").insert({
    review_id: reviewResult.data.id,
    city_id: cityId,
    content_type: contentType,
    content_id: contentId,
    action: "draft_discovered",
    actor_type: "admin",
    actor_id: adminSession.user.id,
    actor_profile: actorProfile,
    details: {
      source: "central_city_content_editor",
      intent,
      changed_fields: reviewChangedFields,
      field_risk_summary: fieldRiskSummary,
      cross_field_warnings: crossFieldValidation.warnings.map((issue) => ({
        code: issue.code,
        field: issue.field,
        message: issue.message,
      })),
      field_control_changes: fieldControlChanges.map((change) => ({
        field: change.fieldPath,
        before: change.beforeValue,
        after: change.afterValue,
        mode_before: change.modeBefore,
        mode_after: change.modeAfter,
        reason: change.reason,
      })),
    },
  })

  if (auditResult.error) {
    redirect(`${editorPath(citySlug, contentType, contentId)}?error=audit_sync`)
  }

  if (fieldControlChanges.length) {
    const manualAuditResult = await admin.from("city_content_review_audit").insert({
      review_id: reviewResult.data.id,
      city_id: cityId,
      content_type: contentType,
      content_id: contentId,
      action: "manual_edit",
      actor_type: "admin",
      actor_id: adminSession.user.id,
      actor_profile: actorProfile,
      details: {
        source: "central_city_content_editor",
        changed_fields: reviewChangedFields,
        field_changes: fieldControlChanges.map((change) => ({
          field: change.fieldPath,
          before: change.beforeValue,
          after: change.afterValue,
          mode_before: change.modeBefore,
          mode_after: change.modeAfter,
          reason: change.reason,
        })),
      },
    })

    if (manualAuditResult.error) {
      redirect(`${editorPath(citySlug, contentType, contentId)}?error=audit_sync`)
    }
  }

  if (intent === "review") {
    const queueResult = await admin.rpc("enqueue_automation_job", {
      p_job_type: "content_correction",
      p_priority: 65,
      p_city_id: cityId,
      p_target_type: contentType,
      p_target_id: contentId,
      p_human_gate: "none",
      p_input: {
        content_type: contentType,
        content_id: contentId,
        requested_by: "central_city_content_editor",
        pii_allowed: false,
      },
      p_available_at: now,
      p_deduplication_key: `content-review:${contentType}:${contentId}:${now.slice(0, 16)}`,
      p_actor_type: "admin",
      p_actor_id: adminSession.user.id,
      p_actor_profile: actorProfile,
    })

    if (queueResult.error) {
      redirect(`${editorPath(citySlug, contentType, contentId)}?error=queue_failed`)
    }
  }

  revalidatePath("/city-pages")
  revalidatePath(`/city-pages/${citySlug}`)
  revalidatePath("/city-operations")
  redirect(
    `${editorPath(citySlug, contentType, contentId)}?success=${
      intent === "review" ? "review_queued" : "draft_saved"
    }`,
  )
}

function getActorProfile(session: Awaited<ReturnType<typeof requireAdmin>>["adminSession"]) {
  return session.profile?.display_name || session.profile?.email || session.user.email || "Benefitsi Admin"
}

export async function restoreCityContentField(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const citySlug = rawText(formData, "citySlug", 180)
  const contentTypeValue = rawText(formData, "contentType", 40)
  const contentId = rawText(formData, "contentId", 80)
  const auditId = rawText(formData, "auditId", 80)

  if (!SLUG_PATTERN.test(citySlug) || !isCityContentType(contentTypeValue) || !UUID_PATTERN.test(contentId) || !UUID_PATTERN.test(auditId)) {
    redirect("/city-pages?error=restore_validation")
  }

  const contentType = contentTypeValue
  const definition = cityContentEditorDefinitions[contentType]
  const targetPath = editorPath(citySlug, contentType, contentId)
  const admin = createAdminClient()
  const cityResult = await admin.from("cities").select("id,slug").eq("slug", citySlug).maybeSingle()
  if (cityResult.error || !cityResult.data) redirect(`${targetPath}?error=city_missing`)

  const entityType = fieldControlEntityType(contentType)
  const auditResult = await admin
    .from("city_editor_audit")
    .select("id,field_path,action,before_value,after_value,mode_before,mode_after,actor_profile,created_at")
    .eq("id", auditId)
    .eq("city_id", cityResult.data.id)
    .eq("entity_type", entityType)
    .eq("entity_id", contentId)
    .maybeSingle()
  const audit = auditResult.data as unknown as Record<string, unknown> | null
  const fieldPath = typeof audit?.field_path === "string" ? audit.field_path : ""
  const field = definition.fields.find((candidate) => candidate.name === fieldPath && candidate.storage !== "schedule")
  if (auditResult.error || !audit || audit.action === "RESTORE" || !field) redirect(`${targetPath}?error=restore_invalid`)

  const currentResult = await admin.from(definition.table).select(field.name).eq("id", contentId).eq("city_id", cityResult.data.id).maybeSingle()
  if (currentResult.error || !currentResult.data) redirect(`${targetPath}?error=content_missing`)
  const currentRecordResult = await admin
    .from(definition.table)
    .select("*")
    .eq("id", contentId)
    .eq("city_id", cityResult.data.id)
    .maybeSingle()
  if (currentRecordResult.error || !currentRecordResult.data) redirect(`${targetPath}?error=content_missing`)

  const currentRecord = currentRecordResult.data as unknown as Record<string, unknown>
  const beforeValue = currentRecord[field.name] ?? null
  let currentScheduleSnapshot: Record<string, unknown> | null = null
  if (contentType === "events") {
    const scheduleResult = await admin
      .from("city_event_schedules")
      .select("*")
      .eq("event_id", contentId)
      .maybeSingle()
    if (scheduleResult.error) redirect(`${targetPath}?error=schedule_sync`)
    currentScheduleSnapshot = scheduleResult.data
      ? { ...(scheduleResult.data as unknown as Record<string, unknown>) }
      : null
  }

  const existingReviewResult = await admin
    .from("city_content_reviews")
    .select("id,stage,verdict,changed_fields,published_snapshot")
    .eq("content_type", contentType)
    .eq("content_id", contentId)
    .maybeSingle()
  if (existingReviewResult.error) redirect(`${targetPath}?error=review_sync`)

  const existingReview = existingReviewResult.data as unknown as {
    id: string
    stage: string
    verdict: string
    changed_fields: unknown
    published_snapshot: unknown
  } | null
  const publishedSnapshot = existingReview?.published_snapshot ?? (
    currentRecord.status === "active"
      ? { record: currentRecord, schedule: currentScheduleSnapshot }
      : null
  )
  if (!publishedSnapshot) redirect(`${targetPath}?error=restore_snapshot_missing`)

  const now = new Date().toISOString()
  const changedFields = Array.isArray(existingReview?.changed_fields)
    ? existingReview.changed_fields.filter(
        (value): value is string => typeof value === "string",
      )
    : []
  const reviewPayload = {
    stage: "agent_draft",
    verdict: "unreviewed",
    reviewer_profile: getActorProfile(adminSession),
    reviewed_by: null,
    reviewed_at: null,
    publication_method: null,
    changed_fields: Array.from(new Set([...changedFields, field.name])),
    published_snapshot: publishedSnapshot,
    updated_at: now,
  }
  const reviewResult = existingReview?.id
    ? await admin
      .from("city_content_reviews")
      .update(reviewPayload)
      .eq("id", existingReview.id)
      .select("id")
      .single()
    : await admin
      .from("city_content_reviews")
      .insert({
        ...reviewPayload,
        city_id: cityResult.data.id,
        content_type: contentType,
        content_id: contentId,
      })
      .select("id")
      .single()
  if (reviewResult.error || !reviewResult.data?.id) redirect(`${targetPath}?error=review_sync`)

  // Persist the complete last-known-good snapshot before touching the primary
  // row. If the following record update fails, the old public revision stays
  // active; if a later audit/promotion step fails, the resolver can still
  // serve this snapshot instead of returning a 404.
  const updateResult = await admin
    .from(definition.table)
    .update({ [field.name]: audit.before_value ?? null, status: "needs_review", updated_at: now })
    .eq("id", contentId)
    .eq("city_id", cityResult.data.id)
  if (updateResult.error) redirect(`${targetPath}?error=restore_save`)

  const restoreAudit = await admin.from("city_editor_audit").insert({
    city_id: cityResult.data.id,
    entity_type: entityType,
    entity_id: contentId,
    field_path: field.name,
    action: "RESTORE",
    before_value: beforeValue,
    after_value: audit.before_value ?? null,
    mode_before: audit.mode_after ?? null,
    mode_after: audit.mode_after ?? null,
    actor_id: adminSession.user.id,
    actor_profile: getActorProfile(adminSession),
    reason: `restore:${auditId}`,
  })
  if (restoreAudit.error) redirect(`${targetPath}?error=restore_audit`)

  // Restore is a new human-approved revision, not a second publication
  // implementation. The central RPC performs the atomic promotion of the
  // restored record, review state, publication method and publication audit.
  const publishResult = await admin.rpc("human_publish_city_content", {
    p_review_id: reviewResult.data.id,
    p_actor_id: adminSession.user.id,
    p_actor_profile: getActorProfile(adminSession),
    p_note: `restore:${auditId}`,
    p_manual_verification_source: null,
    p_manual_verification_note: null,
  })
  if (publishResult.error) redirect(`${targetPath}?error=restore_publish`)

  revalidatePath(`/city-pages/${citySlug}`)
  revalidatePath(targetPath)
  revalidatePath("/city-operations")
  redirect(`${targetPath}?success=restored`)
}
