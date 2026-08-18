import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export const fieldControlModes = ["AUTO", "MANUAL", "LOCKED"] as const
export type FieldControlMode = (typeof fieldControlModes)[number]

export type CityEditorEntityType =
  | "CITY_HOMEPAGE"
  | "PLACE"
  | "EVENT"
  | "ROUTE"
  | "GUIDE"
  | "PLAYGROUND"
  | "CLUB"
  | "CHALLENGE"
  | "BENEFIT"
  | "BUSINESS"
  | "COLLECTION"
  | "HUB"
  | "EDITORIAL_ARTICLE"
  | "COMMUNITY"
  | "CITY_STAMP"

export type CityFieldControl = {
  fieldPath: string
  mode: FieldControlMode
  reason: string | null
  updatedBy: string | null
  updatedAt: string | null
}

type JsonRow = Record<string, unknown>
type AdminClient = ReturnType<typeof createAdminClient>

const contentEntityMap: Record<string, CityEditorEntityType> = {
  events: "EVENT",
  places: "PLACE",
  playgrounds: "PLAYGROUND",
  clubs: "CLUB",
  routes: "ROUTE",
  guides: "GUIDE",
  challenges: "CHALLENGE",
  benefits: "BENEFIT",
}

export function fieldControlEntityType(value: string): CityEditorEntityType {
  return contentEntityMap[value] ?? "EDITORIAL_ARTICLE"
}

export function normalizeFieldControlMode(value: unknown): FieldControlMode {
  return fieldControlModes.includes(value as FieldControlMode)
    ? (value as FieldControlMode)
    : "AUTO"
}

export function fieldControlLabel(mode: FieldControlMode) {
  return mode === "AUTO"
    ? "Automatisch"
    : mode === "MANUAL"
      ? "Manuell"
      : "Gesperrt"
}

export function fieldControlMap(
  value: unknown,
): Record<string, CityFieldControl> {
  if (!Array.isArray(value)) return {}

  return Object.fromEntries(
    value.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return []
      const row = item as JsonRow
      const fieldPath = typeof row.field_path === "string" ? row.field_path : ""
      if (!fieldPath) return []
      return [[fieldPath, {
        fieldPath,
        mode: normalizeFieldControlMode(row.mode),
        reason: typeof row.reason === "string" ? row.reason : null,
        updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
      } satisfies CityFieldControl]]
    }),
  )
}

export async function loadFieldControls(
  admin: AdminClient,
  cityId: string,
  entityType: CityEditorEntityType,
  entityId: string,
) {
  const result = await admin
    .from("city_content_field_controls")
    .select("field_path,mode,reason,updated_by,updated_at")
    .eq("city_id", cityId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)

  // This keeps local development usable before the production migration is
  // applied, while production still fails closed in the write action.
  if (result.error) {
    if (result.error.code === "42P01" || /field_controls/i.test(result.error.message)) {
      return {}
    }
    throw new Error(`Feldpflegezustände konnten nicht geladen werden: ${result.error.message}`)
  }

  return fieldControlMap(result.data)
}

export function stableValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "null"
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export function fieldValuesEqual(left: unknown, right: unknown) {
  return stableValue(left) === stableValue(right)
}

export function resolveFieldControl({
  currentMode,
  requestedMode,
  changed,
  isNew,
  confirmedAutoUpdate,
}: {
  currentMode: FieldControlMode
  requestedMode: FieldControlMode
  changed: boolean
  isNew: boolean
  confirmedAutoUpdate: boolean
}): { mode: FieldControlMode; reason: string | null } | { error: string } {
  if (currentMode === "LOCKED") {
    if (requestedMode !== "LOCKED" && requestedMode !== "MANUAL") {
      return { error: "locked_requires_manual" }
    }
    if (changed && requestedMode !== "MANUAL") {
      return { error: "locked_field" }
    }
  }

  if (currentMode === "MANUAL" && requestedMode === "AUTO" && !confirmedAutoUpdate) {
    return { error: "auto_unlock_confirmation" }
  }

  // A changed AUTO field becomes MANUAL. This is the important safety rule:
  // an editor cannot accidentally turn an automated field into a lock merely
  // by typing into it.
  if (changed && (currentMode === "AUTO" || isNew)) {
    return { mode: "MANUAL", reason: "manual_value_edit" }
  }

  if (changed && currentMode === "LOCKED" && requestedMode === "MANUAL") {
    return { mode: "MANUAL", reason: "manual_unlock_and_edit" }
  }

  return {
    mode: requestedMode,
    reason: requestedMode === currentMode ? null : "mode_changed",
  }
}

export function modeFormKey(fieldPath: string) {
  return `mode_${fieldPath}`
}
