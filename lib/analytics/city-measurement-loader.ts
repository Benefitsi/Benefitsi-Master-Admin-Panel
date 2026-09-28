import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getAdminSession } from "../admin"
import { createAdminClient } from "../supabase/admin"
import type { BusinessAnalyticsFilters } from "./contracts"
import type { CityMeasurementResult, CityMeasurementScope, CityMeasurementSource, MeasurementCity } from "./city-measurement-contracts"
import { cityMeasurementWindow } from "./city-measurement-filters"
import { normalizeCityConversion, normalizeCityWebOperations } from "./city-measurement-normalize"
import { parseAnalyticsPermissions } from "./permissions"

const RPC_TIMEOUT_MS = 8_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function loadCityMeasurement(
  supabase: SupabaseClient,
  filters: BusinessAnalyticsFilters,
): Promise<CityMeasurementResult> {
  try {
    // The permission check must finish before a privileged client exists.
    const session = await getAdminSession(supabase)
    if (!session?.isAdmin) return { state: "forbidden" }
    const permissionResult = await supabase.rpc("get_my_analytics_permissions_v1")
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
    if (permissionResult.error) return sourceFailure(permissionResult.error)
    if (!parseAnalyticsPermissions(permissionResult.data).businessAnalyticsRead) return { state: "forbidden" }

    const cityResult = await supabase.from("cities").select("id,name,slug").order("name").limit(500)
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
    if (cityResult.error || !Array.isArray(cityResult.data)) return { state: "unavailable" }
    const cities = normalizeCities(cityResult.data)
    if (!filters.cityId) return { state: "selection_required", cities }
    const city = cities.find(city => city.id === filters.cityId)
    if (!city) return { state: "invalid_scope", reason: "unknown_city", cities }
    const window = cityMeasurementWindow(filters)
    if (window.state !== "ready") return { state: "invalid_scope", reason: window.state, cities }

    const scope: CityMeasurementScope = {
      city, dateFrom: filters.dateFrom, dateTo: filters.dateTo,
      from: window.from, until: window.until, environment: filters.environment, checkedAt: new Date().toISOString(),
    }
    let operations: ReturnType<typeof createAdminClient>
    try { operations = createAdminClient() }
    catch {
      return { state: "loaded", cities, scope, conversion: { state: "setup_required" }, operations: { state: "setup_required" } }
    }
    const args = { p_city_slug: city.slug, p_from: window.from, p_until: window.until, p_environment: filters.environment }
    const [conversion, webOperations] = await Promise.all([
      readSource(operations, "city_conversion_readout", args, value => normalizeCityConversion(value, scope),
        value => value.web?.eventCount === 0 && value.confirmedVisits === 0 && value.confirmedRedemptions === 0 && value.partnerRequests.submitted === 0),
      readSource(operations, "city_web_operations_readout", args, value => normalizeCityWebOperations(value, scope),
        value => value.coverage === "no_observations"),
    ])
    return { state: "loaded", cities, scope, conversion, operations: webOperations }
  } catch {
    // Neither raw RPC errors nor partially parsed responses cross this boundary.
    return { state: "unavailable" }
  }
}

async function readSource<T>(
  client: SupabaseClient,
  name: "city_conversion_readout" | "city_web_operations_readout",
  args: { p_city_slug: string; p_from: string; p_until: string; p_environment: string },
  normalize: (value: unknown) => T,
  isEmpty: (value: T) => boolean,
): Promise<CityMeasurementSource<T>> {
  try {
    const result = await client.rpc(name, args).abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
    if (result.error) return sourceFailure(result.error)
    const data = normalize(result.data)
    return { state: isEmpty(data) ? "empty" : "ready", data }
  } catch { return { state: "unavailable" } }
}

function normalizeCities(rows: unknown[]): MeasurementCity[] {
  const cities = new Map<string, MeasurementCity>()
  for (const input of rows) {
    if (typeof input !== "object" || input === null) continue
    const value = input as Record<string, unknown>
    if (typeof value.id !== "string" || !UUID.test(value.id) || typeof value.slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) || value.slug.length > 100 ||
      typeof value.name !== "string" || !value.name.trim() || value.name.length > 120) continue
    cities.set(value.id, { id: value.id, slug: value.slug, name: value.name.trim() })
  }
  return [...cities.values()]
}

function sourceFailure(error: unknown): { state: "setup_required" } | { state: "unavailable" } {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null
  return typeof code === "string" && ["PGRST202", "42883", "42P01", "42703"].includes(code) ? { state: "setup_required" } : { state: "unavailable" }
}
