import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminSession } from '../admin'
import { createAdminClient } from '../supabase/admin'
import { parseAnalyticsPermissions } from './permissions'
import { cityMeasurementWindow } from './city-measurement-filters'
import type { BusinessAnalyticsFilters } from './contracts'
import { normalizeAieoMeasurement, type AieoMeasurementResult, type AieoScope } from './aieo-measurement'

export async function loadAieoMeasurement(supabase: SupabaseClient, filters: BusinessAnalyticsFilters): Promise<AieoMeasurementResult> {
  try {
    if (!(await getAdminSession(supabase))?.isAdmin) return { state: 'forbidden' }
    const permissions = await supabase.rpc('get_my_analytics_permissions_v1').abortSignal(AbortSignal.timeout(8000))
    if (permissions.error) return failure(permissions.error)
    if (!parseAnalyticsPermissions(permissions.data).businessAnalyticsRead) return { state: 'forbidden' }
    const window = cityMeasurementWindow(filters)
    if (window.state !== 'ready' || (filters.cityId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.cityId))) return { state: 'invalid_scope' }
    const scope: AieoScope = { from: window.from, until: window.until, environment: filters.environment, cityId: filters.cityId ?? null }
    let client: SupabaseClient
    try { client = createAdminClient() } catch { return { state: 'setup_required' } }
    const result = await client.rpc('aieo_measurement_readout', { p_from: scope.from, p_until: scope.until, p_environment: scope.environment, p_city_id: scope.cityId }).abortSignal(AbortSignal.timeout(8000))
    if (result.error) return failure(result.error)
    return { state: 'ready', scope, data: normalizeAieoMeasurement(result.data, scope) }
  } catch { return { state: 'unavailable' } }
}
function failure(error: { code?: string }): { state: 'setup_required' | 'unavailable' } {
  return { state: ['PGRST202', '42883', '42P01', '42703'].includes(error.code ?? '') ? 'setup_required' : 'unavailable' }
}
