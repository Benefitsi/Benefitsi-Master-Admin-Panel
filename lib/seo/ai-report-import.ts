export const AI_REPORT_PROVIDERS = {
  google_search_generative_ai: { label: 'Google Search generative AI', metric: 'KI-Impressionen', url: 'https://search.google.com/search-console' },
  bing_ai_performance: { label: 'Bing AI Performance', metric: 'Zitate', url: 'https://www.bing.com/webmasters' },
} as const
export type AiReportProvider = keyof typeof AI_REPORT_PROVIDERS
export type AiReportImport = {
  target_id: string; provider: AiReportProvider; report_scope: 'property' | 'page'; scope_url: string;
  period_start: string; period_end: string; report_timezone: string; metric_value: number; exported_at: string;
}
export type AiReportRow = AiReportImport & { id: string; imported_at: string }
export function aiReportMetric(provider: AiReportProvider) { return AI_REPORT_PROVIDERS[provider].metric }
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value).toISOString().slice(0,10) !== value) throw Error('invalid_ai_report')
  return value
}
export function validateAiReportImport(input: Record<string, unknown>, target: { id: string; canonical_url: string }, now = new Date()): AiReportImport {
  if (input.evidence_confirmed !== true || !Object.hasOwn(AI_REPORT_PROVIDERS, String(input.provider))) throw Error('invalid_ai_report')
  const scopeUrl = target.canonical_url
  if (!/^https:\/\/benefitsi\.de(?:\/(?:stadt\/[a-z0-9-]+(?:\/[a-z0-9-]+)*|partner\/[a-z0-9-]+|fuer-partner|fuer-nutzer|partner-werden|vorteile|app)?\/?)?$/.test(scopeUrl) ||
    /(?:^|\/)(?:konto|admin|auth|login|registrieren|bestaetigen|abmelden|erstellen|bearbeiten)(?:\/|$)/.test(scopeUrl)) throw Error('invalid_ai_report')
  if (!['property','page'].includes(String(input.report_scope)) || (input.report_scope === 'property' && !['https://benefitsi.de','https://benefitsi.de/'].includes(scopeUrl))) throw Error('invalid_ai_report')
  const start = date(input.period_start), end = date(input.period_end)
  if (start > end || end > now.toISOString().slice(0,10) || (Date.parse(end)-Date.parse(start))/86400000 > 92) throw Error('invalid_ai_report')
  if (!['America/Los_Angeles','Europe/Berlin','UTC','provider_unspecified'].includes(String(input.report_timezone))) throw Error('invalid_ai_report')
  if (typeof input.metric_value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(input.metric_value)) throw Error('invalid_ai_report')
  const count = Number(input.metric_value)
  if (!Number.isSafeInteger(count)) throw Error('invalid_ai_report')
  if (typeof input.exported_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.exported_at)) throw Error('invalid_ai_report')
  const exported = new Date(`${input.exported_at}:00Z`)
  if (!Number.isFinite(exported.getTime()) || exported.toISOString().slice(0,16) !== input.exported_at || exported.getTime() > now.getTime() || exported.getTime() < Date.parse(end)) throw Error('invalid_ai_report')
  return { target_id: target.id, provider: input.provider as AiReportProvider, report_scope: input.report_scope as 'property'|'page', scope_url: scopeUrl,
    period_start: start, period_end: end, report_timezone: String(input.report_timezone), metric_value: count, exported_at: exported.toISOString() }
}
export function normalizeAiReportRows(input: unknown): AiReportRow[] {
  if (!Array.isArray(input) || input.length > 50) throw Error('invalid_ai_reports')
  return input.map(row => {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || typeof row.imported_at !== 'string' || !Number.isFinite(Date.parse(row.imported_at)) || typeof row.exported_at !== 'string' || !Number.isFinite(Date.parse(row.exported_at)) || typeof row.metric_value !== 'number') throw Error('invalid_ai_reports')
    const validated = validateAiReportImport({ ...row, metric_value: String(row.metric_value), exported_at: new Date(row.exported_at).toISOString().slice(0,16), evidence_confirmed: true }, { id: row.target_id, canonical_url: row.scope_url })
    return { ...validated, exported_at: new Date(row.exported_at).toISOString(), id: row.id, imported_at: row.imported_at }
  })
}
