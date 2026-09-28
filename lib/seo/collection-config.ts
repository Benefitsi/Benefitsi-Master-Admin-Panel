import { createHash } from 'node:crypto'
import { readComparisonConfig, type ComparisonConfig } from './seo-comparison'

export const COLLECTION_KINDS = ['crawl', 'gsc', 'gbp', 'psi', 'rank'] as const
export type CollectionKind = (typeof COLLECTION_KINDS)[number]
export type CollectionSettings = {
  target_id?: string
  enabled: boolean
  crawl_enabled: boolean
  gsc_enabled: boolean
  gbp_enabled: boolean
  psi_enabled: boolean
  rank_enabled: boolean
  gsc_property: string | null
  gbp_location: string | null
  updated_at?: string
}
export const collectionLabels: Record<CollectionKind, string> = {
  crawl: 'Webseitenprüfung', gsc: 'Google Search Console', gbp: 'Google-Unternehmensprofil',
  psi: 'Lighthouse / PageSpeed', rank: 'Google-Rankings',
}
export const collectionStateLabels: Record<string, string> = {
  ok: 'Erfolgreich', partial: 'Teilweise erfasst', no_data: 'Keine Daten im Zeitraum',
  unconfigured: 'Zugang fehlt', auth_error: 'Google erneut verbinden', forbidden: 'Berechtigung fehlt',
  rate_limited: 'Anbieterlimit erreicht', timeout: 'Zeitüberschreitung', invalid_response: 'Antwort nicht auswertbar',
  provider_error: 'Anbieter nicht erreichbar', blocked: 'Aktion erforderlich', unsupported: 'Noch nicht unterstützt',
  queued: 'Wartet', running: 'Läuft', completed: 'Abgeschlossen', failed: 'Fehlgeschlagen',
}
function host(value: string) { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') }
export function validGscProperty(url: string, property: string) {
  try {
    const canonical = new URL(url)
    if (property.startsWith('sc-domain:')) {
      const domain = property.slice(10).toLowerCase()
      return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) && (canonical.hostname === domain || canonical.hostname.endsWith(`.${domain}`))
    }
    const site = new URL(property)
    return site.protocol === 'https:' && !site.port && !site.username && !site.password && !site.search && !site.hash &&
      canonical.origin === site.origin && (canonical.pathname === site.pathname || canonical.pathname.startsWith(site.pathname.endsWith('/') ? site.pathname : site.pathname + '/'))
  } catch { return false }
}
export function normalizeCollectionSettings(value: Record<string, unknown>, target: {canonical_url: string; provider_config: Record<string, unknown>}): CollectionSettings {
  const bool = (key: string, fallback = false) => value[key] === undefined ? fallback : value[key] === true
  const gscProperty = typeof value.gsc_property === 'string' ? value.gsc_property.trim() : ''
  const gbpLocation = typeof value.gbp_location === 'string' ? value.gbp_location.trim() : ''
  if (gscProperty && (gscProperty.length > 2048 || !validGscProperty(target.canonical_url, gscProperty))) throw Error('property_mismatch')
  if (gbpLocation && !/^locations\/\d{1,40}$/.test(gbpLocation)) throw Error('invalid_gbp_location')
  if (bool('gsc_enabled') && !gscProperty) throw Error('property_required')
  if (bool('gbp_enabled') && !gbpLocation) throw Error('gbp_location_required')
  if (bool('rank_enabled')) {
    const comparison = readComparisonConfig(target.provider_config.comparison)
    if (!comparison) throw Error('comparison_required')
    if (comparison.channel !== 'organic') throw Error('maps_unsupported')
    if (host(comparison.subjectUrl) !== host(target.canonical_url)) throw Error('comparison_mismatch')
  }
  return {
    enabled: bool('enabled'), crawl_enabled: bool('crawl_enabled', true), gsc_enabled: bool('gsc_enabled'),
    gbp_enabled: bool('gbp_enabled'), psi_enabled: bool('psi_enabled'), rank_enabled: bool('rank_enabled'),
    gsc_property: gscProperty || null, gbp_location: gbpLocation || null,
  }
}
export function normalizeFreeBudget(value: Record<string, unknown>) {
  const limit = value.monthly_request_limit === undefined ? 0 : Number(value.monthly_request_limit)
  if (!Number.isInteger(limit) || limit < 0 || limit > 4500) throw Error('invalid_limit')
  const confirmed = value.free_tier_confirmed === true
  if (limit > 0 && !confirmed) throw Error('free_confirmation_required')
  return {monthly_request_limit: limit, free_tier_confirmed: confirmed}
}
export function requestContextKey(config: ComparisonConfig, keyword: string) {
  return createHash('sha256').update(JSON.stringify(['brightdata-organic-v1', keyword, config.channel, config.location, config.locale, config.device, 10])).digest('hex')
}
export type HealthIssue = {code: string; message: string; targetId?: string; kind?: string}
export function collectionHealth(runtime: {enabled: boolean; last_tick_finished_at: string | null; last_tick_error: string | null}, runs: Array<{status: string; state?: string | null; target_id: string; kind: string}>, now = new Date()): HealthIssue[] {
  const issues: HealthIssue[] = []
  if (!runtime.enabled) issues.push({code:'worker_disabled',message:'Die automatische Erfassung ist angehalten.'})
  else if (!runtime.last_tick_finished_at) issues.push({code:'worker_never_ran',message:'Noch kein abgeschlossener automatischer Prüflauf.'})
  else if (!Number.isFinite(Date.parse(runtime.last_tick_finished_at)) || now.getTime() - Date.parse(runtime.last_tick_finished_at) > 45 * 60_000) issues.push({code:'worker_stale',message:'Seit über 45 Minuten fehlt ein abgeschlossener Prüflauf.'})
  if (runtime.last_tick_error) issues.push({code:'worker_error',message:'Der letzte Prüflauf meldet einen technischen Fehler.'})
  const seen = new Set<string>()
  for (const run of runs) {
    const key = `${run.target_id}:${run.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    if (run.status === 'failed' || run.status === 'blocked') issues.push({code:`provider_${run.state ?? 'error'}`,message:`${collectionLabels[run.kind as CollectionKind] ?? run.kind}: ${collectionStateLabels[run.state ?? 'failed'] ?? 'Prüfung erforderlich'}`, targetId:run.target_id,kind:run.kind})
  }
  return issues
}
