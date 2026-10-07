export const AIEO_STAGES = {
  web_page_views: 'Öffentliche Seitenaufrufe',
  app_cta_clicks: 'Klicks zum App-Einstieg',
  app_handoff_attempts: 'Versuche, die App zu öffnen',
  native_entries: 'In der App angezeigte Einstiegsziele',
  app_opens: 'App geöffnet (bestehendes Ereignis)',
  qr_presentations: 'QR-Code angezeigt (bestehende Aktivierungsstufe)',
} as const
export type AieoScope = { from: string; until: string; environment: string; cityId: string | null }
export type AieoMeasurement = {
  stages: Array<{ key: keyof typeof AIEO_STAGES; events: number; actors: number; aiReferralEvents: number }>
  confirmedVisits: number
  confirmedRedemptions: number
  coverage: 'consented_observations' | 'partial_retention' | 'outside_retention'
}
export type AieoMeasurementResult =
  | { state: 'ready'; data: AieoMeasurement; scope: AieoScope }
  | { state: 'forbidden' | 'setup_required' | 'unavailable' | 'invalid_scope' }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_measurement')
  return value as Record<string, unknown>
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw Error('invalid_measurement')
  return value
}
export function normalizeAieoMeasurement(input: unknown, scope: AieoScope): AieoMeasurement {
  const value = record(input)
  if (value.source !== 'benefitsi_aieo_observations_v1' || value.environment !== scope.environment || value.city_id !== scope.cityId ||
    typeof value.from !== 'string' || Date.parse(value.from) !== Date.parse(scope.from) ||
    typeof value.until_exclusive !== 'string' || Date.parse(value.until_exclusive) !== Date.parse(scope.until) || value.conversion_rate !== null ||
    !['consented_observations', 'partial_retention', 'outside_retention'].includes(String(value.coverage))) throw Error('invalid_measurement')
  const stages = record(value.stages)
  const backend = record(value.backend_consented)
  return {
    stages: (Object.keys(AIEO_STAGES) as Array<keyof typeof AIEO_STAGES>).map(key => {
      const row = record(stages[key])
      const events = count(row.events), actors = count(row.observed_actors), aiReferralEvents = count(row.ai_referral_events)
      if (actors > events || aiReferralEvents > events) throw Error('invalid_measurement')
      return { key, events, actors, aiReferralEvents }
    }),
    confirmedVisits: count(backend.visit_confirmed), confirmedRedemptions: count(backend.redemption_confirmed),
    coverage: value.coverage as AieoMeasurement['coverage'],
  }
}
