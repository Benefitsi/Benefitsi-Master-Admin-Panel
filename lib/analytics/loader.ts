import type { createClient } from "@/lib/supabase/server"
import type {
  AnalyticsPermissions,
  BusinessAnalyticsFilters,
  BusinessAnalyticsPayloadV1,
} from "./contracts"
import { toBusinessAnalyticsRpcFilters } from "./filters"
import { mergeAnalyticsExtension } from "./merge"
import {
  createEmptyBusinessAnalyticsPayload,
  normalizeBusinessAnalyticsPayload,
  redactFinanceData,
} from "./normalize"
import { parseAnalyticsPermissions } from "./permissions"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type RpcError = {
  code?: string
  message?: string
}

export type BusinessAnalyticsLoadResult =
  | {
      state: "ready" | "empty" | "partial"
      permissions: AnalyticsPermissions
      payload: BusinessAnalyticsPayloadV1
    }
  | {
      state: "forbidden"
      permissions: AnalyticsPermissions
    }
  | {
      state: "setup_required" | "unavailable"
      permissions: AnalyticsPermissions | null
    }

export async function loadBusinessAnalytics(
  supabase: SupabaseServerClient,
  filters: BusinessAnalyticsFilters,
): Promise<BusinessAnalyticsLoadResult> {
  try {
    const permissionResult = await supabase.rpc(
      "get_my_analytics_permissions_v1",
    )

    if (permissionResult.error) {
      return rpcFailure(permissionResult.error)
    }

    const permissions = parseAnalyticsPermissions(permissionResult.data)
    if (!permissions.businessAnalyticsRead) {
      return { state: "forbidden", permissions }
    }

    const rpcFilters = toBusinessAnalyticsRpcFilters(filters)
    const [analyticsResult, nesResult, productEventResult] = await Promise.all([
      supabase.rpc("get_business_analytics_v1", { p_filters: rpcFilters }),
      supabase.rpc("get_nes_analytics_v1", { p_filters: rpcFilters }),
      supabase.rpc("get_product_event_analytics_v1", { p_filters: rpcFilters }),
    ])

    let normalized: BusinessAnalyticsPayloadV1
    if (analyticsResult.error) {
      if (
        analyticsResult.error.code === "22023" &&
        !productEventResult.error
      ) {
        normalized = createEmptyBusinessAnalyticsPayload(
          filters,
          new Date(),
          "Für dieses Environment liegen keine materialisierten Business-Snapshots vor; die Product-Event-Sicht bleibt separat verfügbar.",
        )
      } else {
        return rpcFailure(analyticsResult.error, permissions)
      }
    } else {
      normalized = normalizeBusinessAnalyticsPayload(
        analyticsResult.data,
        filters,
      )
    }
    if (nesResult.error) {
      if (!isMissingAnalyticsMigration(nesResult.error)) {
        console.error("NES analytics RPC failed", safeError(nesResult.error))
      }
      normalized = {
        ...normalized,
        status: normalized.status === "empty" ? "empty" : "partial",
        caveats: [
          ...normalized.caveats,
          "NES-Shadow-Daten sind in dieser Umgebung noch nicht verfügbar.",
        ],
      }
    } else {
      const nesPayload = normalizeBusinessAnalyticsPayload(
        nesResult.data,
        filters,
      )
      normalized = mergeNesAnalytics(normalized, nesPayload)
    }
    if (productEventResult.error) {
      if (!isMissingAnalyticsMigration(productEventResult.error)) {
        console.error(
          "Product event analytics RPC failed",
          safeError(productEventResult.error),
        )
      }
      normalized = {
        ...normalized,
        status: normalized.status === "empty" ? "empty" : "partial",
        caveats: [
          ...normalized.caveats,
          "Product-Event-Messbetrieb und Funnel sind in dieser Umgebung noch nicht verfügbar.",
        ],
      }
    } else {
      const productEventPayload = normalizeBusinessAnalyticsPayload(
        productEventResult.data,
        filters,
      )
      normalized = mergeAnalyticsExtension(normalized, productEventPayload, [
        "product",
        "dataQuality",
      ])
    }
    const labeled = await enrichPartnerFilterLabels(supabase, normalized)
    const payload = permissions.financeRead
      ? labeled
      : redactFinanceData(labeled)

    return {
      state: payload.status,
      permissions,
      payload,
    }
  } catch (error) {
    console.error("Business analytics loader failed unexpectedly", safeError(error))
    return { state: "unavailable", permissions: null }
  }
}

function mergeNesAnalytics(
  base: BusinessAnalyticsPayloadV1,
  nes: BusinessAnalyticsPayloadV1,
): BusinessAnalyticsPayloadV1 {
  const cities = new Map(
    [...base.filterOptions.cities, ...nes.filterOptions.cities].map((city) => [
      city.id,
      city,
    ]),
  )
  const definitions = new Map(
    [...base.definitions, ...nes.definitions].map((definition) => [
      `${definition.key}:${definition.version}`,
      definition,
    ]),
  )

  return {
    ...base,
    status:
      base.status === "ready" && nes.status === "ready"
        ? "ready"
        : base.status === "empty" && nes.status === "empty"
          ? "empty"
          : "partial",
    generatedAt:
      Date.parse(nes.generatedAt) > Date.parse(base.generatedAt)
        ? nes.generatedAt
        : base.generatedAt,
    filterOptions: {
      ...base.filterOptions,
      cities: [...cities.values()].sort((a, b) =>
        a.label.localeCompare(b.label, "de"),
      ),
    },
    sections: {
      ...base.sections,
      engagement: nes.sections.engagement,
    },
    definitions: [...definitions.values()],
    caveats: [...new Set([...base.caveats, ...nes.caveats])],
  }
}

async function enrichPartnerFilterLabels(
  supabase: SupabaseServerClient,
  payload: BusinessAnalyticsPayloadV1,
) {
  const partnerOptions = payload.filterOptions.partners
  if (!partnerOptions.length) {
    return payload
  }

  const partnerIds = partnerOptions.map((option) => option.id)
  const partnerResult = await supabase
    .from("partners")
    .select("id,name")
    .in("id", partnerIds)

  if (partnerResult.error) {
    console.error(
      "Analytics partner labels could not be loaded",
      safeError(partnerResult.error),
    )
    return payload
  }

  const labels = new Map(
    (partnerResult.data ?? [])
      .filter(
        (partner): partner is { id: string; name: string } =>
          typeof partner.id === "string" &&
          typeof partner.name === "string" &&
          partner.name.trim().length > 0,
      )
      .map((partner) => [partner.id, partner.name.trim()]),
  )

  if (!labels.size) {
    return payload
  }

  return {
    ...payload,
    filterOptions: {
      ...payload.filterOptions,
      partners: partnerOptions.map((option) => ({
        ...option,
        label: labels.get(option.id) ?? option.label,
      })),
    },
  }
}

function rpcFailure(
  error: RpcError,
  permissions: AnalyticsPermissions | null = null,
): BusinessAnalyticsLoadResult {
  if (isMissingAnalyticsMigration(error)) {
    return { state: "setup_required", permissions }
  }

  console.error("Business analytics RPC failed", safeError(error))
  return { state: "unavailable", permissions }
}

function isMissingAnalyticsMigration(error: RpcError) {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.code === "42P01" ||
    error.code === "42703"
  )
}

function safeError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return { code: "unknown" }
  }

  const value = error as RpcError
  return {
    code: value.code ?? "unknown",
    message: value.message?.slice(0, 180) ?? "No message",
  }
}
