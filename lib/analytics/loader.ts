import type { createClient } from "@/lib/supabase/server"
import type {
  AnalyticsPermissions,
  BusinessAnalyticsFilters,
  BusinessAnalyticsPayloadV1,
} from "./contracts"
import { toBusinessAnalyticsRpcFilters } from "./filters"
import {
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

    const analyticsResult = await supabase.rpc("get_business_analytics_v1", {
      p_filters: toBusinessAnalyticsRpcFilters(filters),
    })

    if (analyticsResult.error) {
      return rpcFailure(analyticsResult.error, permissions)
    }

    const normalized = normalizeBusinessAnalyticsPayload(
      analyticsResult.data,
      filters,
    )
    const payload = permissions.financeRead
      ? normalized
      : redactFinanceData(normalized)

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
