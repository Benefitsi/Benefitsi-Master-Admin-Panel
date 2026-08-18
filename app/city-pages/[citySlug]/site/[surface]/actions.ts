"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import {
  configFieldPaths,
  isCitySurfaceType,
  loadCitySurfaceEditor,
  cityCollectionSurfaceKeys,
  surfaceScope,
  type CitySurfaceType,
} from "@/lib/city-pages/surface-configs"
import {
  fieldControlEntityType,
  fieldValuesEqual,
  normalizeFieldControlMode,
  resolveFieldControl,
} from "@/lib/city-pages/field-controls"
import { createAdminClient } from "@/lib/supabase/admin"

type CitySurfaceEditor = NonNullable<Awaited<ReturnType<typeof loadCitySurfaceEditor>>>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function text(formData: FormData, key: string, max = 5000) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function jsonValue(formData: FormData, key: string): unknown {
  const value = text(formData, key, 100_000)
  if (!value) return []
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`invalid_json:${key}`)
  }
}

function surfacePath(citySlug: string, surface: CitySurfaceType, scopeKey: string) {
  return `/city-pages/${encodeURIComponent(citySlug)}/site/${surface}?key=${encodeURIComponent(scopeKey)}`
}

function validText(value: string, max: number) {
  return value.length <= max ? value || null : value.slice(0, max)
}

function normalizeFeatured(value: unknown, editor: CitySurfaceEditor) {
  if (!Array.isArray(value)) throw new Error("invalid_featured_refs")
  const options = new Map(editor.entityOptions.map((option) => [`${option.entityType}:${option.id}`, option]))
  const result = value.slice(0, 40).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return []
    const row = entry as Record<string, unknown>
    const id = typeof row.id === "string" ? row.id : ""
    const entityType = typeof row.entityType === "string" ? row.entityType : ""
    const option = options.get(`${entityType}:${id}`)
    if (!option) throw new Error("invalid_featured_ref")
    return [{ id: option.id, entityType: option.entityType, slug: option.slug ?? undefined }]
  })
  return result
}

function normalizeTarget(value: unknown, editor: CitySurfaceEditor) {
  if (value === null || (Array.isArray(value) && value.length === 0)) return null
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_target")
  const key = typeof (value as Record<string, unknown>).key === "string" ? String((value as Record<string, unknown>).key) : ""
  const target = editor.targetOptions.find((option) => option.key === key)
  if (!target) throw new Error("invalid_target")
  return { key: target.key, kind: target.kind, href: target.href }
}

function normalizeNavigation(value: unknown, editor: CitySurfaceEditor) {
  if (!Array.isArray(value)) throw new Error("invalid_navigation")
  const allowedKeys = new Set(editor.navigationItems.map((item) => item.itemKey))
  const options = new Map(editor.targetOptions.map((option) => [option.key, option]))
  const seen = new Set<string>()
  return value.slice(0, 100).flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return []
    const row = entry as Record<string, unknown>
    const itemKey = typeof row.itemKey === "string" ? row.itemKey : ""
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 120) : ""
    const targetKey = typeof row.targetKey === "string" ? row.targetKey : ""
    const target = options.get(targetKey)
    if (!allowedKeys.has(itemKey) || seen.has(itemKey) || !label || !target) throw new Error("invalid_navigation")
    seen.add(itemKey)
    const numericOrder = Number(row.order)
    return [{ itemKey, label, visible: row.visible !== false, order: Number.isInteger(numericOrder) ? Math.max(0, Math.min(999, numericOrder)) : index, target: { key: target.key, kind: target.kind, href: target.href } }]
  })
}

function normalizeSections(value: unknown, allowed: string[]) {
  if (!Array.isArray(value)) return {}
  const allowedSet = new Set(allowed)
  return Object.fromEntries(value.filter((item): item is string => typeof item === "string" && allowedSet.has(item)).map((item) => [item, true]))
}

function errorCode(error: unknown) {
  return error instanceof Error && error.message.startsWith("invalid_") ? error.message : "save_failed"
}

export async function saveCitySurface(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const citySlug = text(formData, "citySlug", 120)
  const surfaceValue = text(formData, "surface", 30)
  const requestedKey = text(formData, "scopeKey", 120)
  const intent = text(formData, "intent", 20)
  if (!SLUG.test(citySlug) || !isCitySurfaceType(surfaceValue) || !["draft", "active"].includes(intent)) redirect("/city-pages?error=surface_validation")
  const surface = surfaceValue
  const editor = await loadCitySurfaceEditor(citySlug, surface, requestedKey)
  if (!editor) {
    redirect("/city-pages?error=city_missing")
    return
  }
  const targetPath = surfacePath(citySlug, surface, editor.scopeKey)
  try {
    const before = editor.config
    const relatedCollectionSlugs = formData.getAll("related_collection_slugs").filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20)
    const guideRelationIds = formData.getAll("guide_relation_ids").filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => UUID.test(item)).slice(0, 30)
    const filterVisibility = surface === "collections"
      ? normalizeSections(formData.getAll("filter_selection").filter((item): item is string => typeof item === "string"), ["category", "duration", "distance", "family", "price", "map"])
      : before?.filter_visibility ?? {}
    const commonPayload: Record<string, unknown> = {
      city_id: editor.city.id,
      scope_type: editor.scopeType,
      scope_key: editor.scopeKey,
      status: intent === "active" ? "ACTIVE" : "DRAFT",
      title: validText(text(formData, "title", 240), 240),
      subtitle: validText(text(formData, "subtitle", 500), 500),
      description: validText(text(formData, "description", 5000), 5000),
      eyebrow: validText(text(formData, "eyebrow", 180), 180),
      seo_title: validText(text(formData, "seo_title", 180), 180),
      seo_description: validText(text(formData, "seo_description", 500), 500),
      hero_image_alt: validText(text(formData, "hero_image_alt", 300), 300),
      primary_cta_label: validText(text(formData, "primary_cta_label", 120), 120),
      primary_cta_target: normalizeTarget(
        text(formData, "primary_cta_target_key", 180)
          ? { key: text(formData, "primary_cta_target_key", 180) }
          : jsonValue(formData, "primary_cta_target"),
        editor,
      ),
      featured_refs: normalizeFeatured(jsonValue(formData, "featured_refs"), editor),
      related_collection_slugs: relatedCollectionSlugs,
      guide_relation_ids: guideRelationIds,
      filter_visibility: filterVisibility,
      section_visibility: normalizeSections(formData.getAll("section_selection").filter((item): item is string => typeof item === "string"), ["hero", "current", "weekend", "discovery", "community", "routes", "benefits", "stamps", "newsletter", "quick-links", "current-feed", "news", "market", "collections", "entity-grid", "event-feed", "guides", "partners", "challenges", "service-links", "map", "editorial", "cta", "featured", "filters", "all-items", "recommendations", "cross-links"]),
      navigation_items: surface === "navigation" ? normalizeNavigation(jsonValue(formData, "navigation_items"), editor) : [],
      index_policy: text(formData, "index_policy", 20) === "noindex" ? "noindex" : "index",
      updated_by: adminSession.user.id,
      updated_at: new Date().toISOString(),
    }

    if (relatedCollectionSlugs.some((slug) => !cityCollectionSurfaceKeys.includes(slug as (typeof cityCollectionSurfaceKeys)[number]))) throw new Error("invalid_related_collections")
    if (guideRelationIds.length) {
      const guides = await createAdminClient().from("city_guides").select("id").eq("city_id", editor.city.id).in("id", guideRelationIds)
      if (guides.error || (guides.data ?? []).length !== guideRelationIds.length) throw new Error("invalid_guide_relations")
    }

    const admin = createAdminClient()
    const upsertResult = await admin.from("city_page_configs").upsert(commonPayload, { onConflict: "city_id,scope_type,scope_key" }).select("*").single()
    if (upsertResult.error || !upsertResult.data) redirect(`${targetPath}&error=surface_save`)
    const configId = String(upsertResult.data.id)

    const fields = configFieldPaths(surface)
    const fieldChanges = fields.flatMap((fieldPath) => {
      const beforeValue = before ? (before as Record<string, unknown>)[fieldPath] : null
      const afterValue = commonPayload[fieldPath] ?? null
      const currentMode = editor.fieldControls[fieldPath]?.mode ?? "AUTO"
      const requestedMode = normalizeFieldControlMode(text(formData, `mode_${fieldPath}`, 12) || currentMode)
      const changed = !fieldValuesEqual(beforeValue, afterValue)
      const decision = resolveFieldControl({ currentMode, requestedMode, changed, isNew: !before, confirmedAutoUpdate: formData.get("confirm_auto_update") === "on" })
      if ("error" in decision) throw new Error(decision.error)
      if (!changed && decision.mode === currentMode) return []
      return [{ fieldPath, beforeValue: beforeValue ?? null, afterValue: afterValue ?? null, modeBefore: currentMode, modeAfter: decision.mode, reason: decision.reason }]
    })

    if (fieldChanges.length) {
      const controlResult = await admin.from("city_content_field_controls").upsert(fieldChanges.map((change) => ({ city_id: editor.city.id, entity_type: fieldControlEntityType(editor.scopeType), entity_id: configId, field_path: change.fieldPath, mode: change.modeAfter, reason: change.reason, updated_by: adminSession.user.id, updated_at: new Date().toISOString() })), { onConflict: "city_id,entity_type,entity_id,field_path" })
      if (controlResult.error) redirect(`${targetPath}&error=control_sync`)
      const auditResult = await admin.from("city_editor_audit").insert(fieldChanges.map((change) => ({ city_id: editor.city.id, entity_type: editor.scopeType, entity_id: configId, field_path: change.fieldPath, action: change.modeBefore === change.modeAfter ? "SAVE" : "MODE_CHANGE", before_value: change.beforeValue, after_value: change.afterValue, mode_before: change.modeBefore, mode_after: change.modeAfter, actor_id: adminSession.user.id, actor_profile: adminSession.profile?.display_name || adminSession.profile?.email || adminSession.user.email || "Benefitsi Admin", reason: change.reason })))
      if (auditResult.error) redirect(`${targetPath}&error=audit_sync`)
    }
  } catch (error) {
    redirect(`${targetPath}&error=${encodeURIComponent(errorCode(error))}`)
  }
  revalidatePath(`/city-pages/${citySlug}`)
  revalidatePath(`/city-pages/${citySlug}/site/${surface}`)
  revalidatePath(`/stadt/${citySlug}`)
  redirect(`${targetPath}&success=surface_saved`)
}

export async function restoreCitySurfaceField(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const citySlug = text(formData, "citySlug", 120)
  const surfaceValue = text(formData, "surface", 30)
  const scopeKey = text(formData, "scopeKey", 120)
  const auditId = text(formData, "auditId", 80)
  if (!SLUG.test(citySlug) || !isCitySurfaceType(surfaceValue) || !UUID.test(auditId)) redirect("/city-pages?error=restore_validation")
  const surface = surfaceValue
  const editor = await loadCitySurfaceEditor(citySlug, surface, scopeKey)
  if (!editor?.config) redirect(surfacePath(citySlug, surface, scopeKey) + "&error=restore_missing")
  const audit = editor.audits.find((entry) => entry.id === auditId)
  if (!audit || !configFieldPaths(surface).includes(audit.fieldPath)) redirect(surfacePath(citySlug, surface, scopeKey) + "&error=restore_invalid")
  const admin = createAdminClient()
  const beforeValue = (editor.config as Record<string, unknown>)[audit.fieldPath] ?? null
  const updateResult = await admin.from("city_page_configs").update({ [audit.fieldPath]: audit.beforeValue, updated_at: new Date().toISOString(), updated_by: adminSession.user.id }).eq("id", editor.config.id).eq("city_id", editor.city.id)
  if (updateResult.error) redirect(surfacePath(citySlug, surface, scopeKey) + "&error=restore_save")
  const auditResult = await admin.from("city_editor_audit").insert({ city_id: editor.city.id, entity_type: editor.scopeType, entity_id: editor.config.id, field_path: audit.fieldPath, action: "RESTORE", before_value: beforeValue, after_value: audit.beforeValue, mode_before: editor.fieldControls[audit.fieldPath]?.mode ?? "MANUAL", mode_after: "MANUAL", actor_id: adminSession.user.id, actor_profile: adminSession.profile?.display_name || adminSession.profile?.email || adminSession.user.email || "Benefitsi Admin", reason: `restore:${audit.id}` })
  if (auditResult.error) redirect(surfacePath(citySlug, surface, scopeKey) + "&error=restore_audit")
  revalidatePath(`/city-pages/${citySlug}/site/${surface}`)
  revalidatePath(`/stadt/${citySlug}`)
  redirect(`${surfacePath(citySlug, surface, scopeKey)}&success=restored`)
}
