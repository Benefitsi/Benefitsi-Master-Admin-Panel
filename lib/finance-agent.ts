import { contractTimestampMs } from './agent-control'
import { parseAnalyticsPermissions } from './analytics/permissions'

export const FINANCE_PROFILE = 'benefitsi-finance'
export type FinanceAccess = { isAdmin: boolean; financeRead: boolean }
export type FinanceSource = { id: string; label: string; state: 'available' | 'missing' | 'not_connected'; role: string }
export type FinanceTask = { code: string; title: string }
export type FinanceDeadline = { id: string; title: string; dueOn: string; sourceUrl: string; evidenceDocumentId: string; reviewedBy: string }
export type FinanceRun = {
  schemaVersion: 1; profile: typeof FINANCE_PROFILE; runId: string; task: 'setup' | 'review'
  status: 'blocked' | 'needs_review' | 'failed'; startedAt: string; finishedAt: string
  counts: { documents: number; payments: number; issues: number; duplicateCandidates: number }
  tasks: FinanceTask[]; sources: FinanceSource[]; deadlines: FinanceDeadline[]
}
export type FinanceStatus = {
  schemaVersion: 1; profile: typeof FINANCE_PROFILE; service: 'startable'; observedAt: string
  lastRun: FinanceRun | null; sources: FinanceSource[]
  rules: { id: string; title: string; url: string; checkedOn: string; application: string }[]
}
export type FinanceExport = { schemaVersion: 1; profile: typeof FINANCE_PROFILE; runId: string; format: 'json' | 'csv'; content: string }

type PermissionReader = { rpc(name: 'get_my_analytics_permissions_v1'): PromiseLike<{ data: unknown; error: unknown }> }

export async function getFinanceAccess(client: PermissionReader, session: { isAdmin: boolean } | null): Promise<FinanceAccess> {
  if (!session?.isAdmin) return { isAdmin: false, financeRead: false }
  try {
    const result = await client.rpc('get_my_analytics_permissions_v1')
    return { isAdmin: true, financeRead: !result.error && parseAnalyticsPermissions(result.data).financeRead }
  } catch { return { isAdmin: true, financeRead: false } }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/
function invalid(): never { throw new Error('Ungültige Finanzantwort oder ungültiger Auftrag.') }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(); return value as Record<string, unknown> }
function text(value: unknown, max = 240): string { if (typeof value !== 'string' || !value.trim() || value.length > max) return invalid(); return value }
function id(value: unknown): string { const result = text(value, 80); if (!IDENTIFIER.test(result)) return invalid(); return result }
function uuid(value: unknown): string { const result = text(value, 36); if (!UUID.test(result)) return invalid(); return result }
function timestamp(value: unknown): string { const result = text(value, 80); if (contractTimestampMs(result) === null) return invalid(); return result }
function day(value: unknown): string { const result = text(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result + 'T00:00:00Z')) || new Date(result + 'T00:00:00Z').toISOString().slice(0, 10) !== result) return invalid(); return result }
function list<T>(value: unknown, max: number, normalize: (v: unknown) => T): T[] { if (!Array.isArray(value) || value.length > max) return invalid(); return value.map(normalize) }
function officialUrl(value: unknown): string {
  const result = text(value, 1000)
  const url = new URL(result)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || !['www.elster.de', 'www.faq.elster.de', 'www.bundesfinanzministerium.de', 'amtliche-handbuecher.bundesfinanzministerium.de', 'www.gesetze-im-internet.de'].includes(url.hostname)) return invalid()
  return result
}
function envelope(value: unknown) { const r = record(value); if (r.schemaVersion !== 1 || r.profile !== FINANCE_PROFILE) return invalid(); return r }
function sources(value: unknown): FinanceSource[] {
  return list(value, 16, v => {
    const r = record(v)
    if (!['available', 'missing', 'not_connected'].includes(String(r.state))) return invalid()
    return { id: id(r.id), label: text(r.label), state: r.state as FinanceSource['state'], role: id(r.role) }
  })
}

export function parseFinanceRun(value: unknown): FinanceRun {
  const r = envelope(value), c = record(r.counts)
  if (!['setup', 'review'].includes(String(r.task)) || !['blocked', 'needs_review', 'failed'].includes(String(r.status))) return invalid()
  const counts = {} as FinanceRun['counts']
  for (const key of ['documents', 'payments', 'issues', 'duplicateCandidates'] as const) {
    if (!Number.isSafeInteger(c[key]) || (c[key] as number) < 0 || (c[key] as number) > 10000) return invalid()
    counts[key] = c[key] as number
  }
  const startedAt = timestamp(r.startedAt), finishedAt = timestamp(r.finishedAt)
  if (Date.parse(finishedAt) < Date.parse(startedAt) || Date.parse(finishedAt) > Date.now() + 5 * 60_000) return invalid()
  return { schemaVersion: 1, profile: FINANCE_PROFILE, runId: uuid(r.runId), task: r.task as FinanceRun['task'],
    status: r.status as FinanceRun['status'], startedAt, finishedAt, counts,
    tasks: list(r.tasks, 64, v => { const t = record(v); return { code: id(t.code), title: text(t.title, 600) } }),
    sources: sources(r.sources),
    deadlines: list(r.deadlines, 50, v => { const d = record(v); return { id: id(d.id), title: text(d.title), dueOn: day(d.dueOn), sourceUrl: officialUrl(d.sourceUrl), evidenceDocumentId: id(d.evidenceDocumentId), reviewedBy: text(d.reviewedBy) } }),
  }
}

export function parseFinanceStatus(value: unknown): FinanceStatus {
  const r = envelope(value)
  if (r.service !== 'startable') return invalid()
  return { schemaVersion: 1, profile: FINANCE_PROFILE, service: 'startable', observedAt: timestamp(r.observedAt),
    lastRun: r.lastRun === null ? null : parseFinanceRun(r.lastRun), sources: sources(r.sources),
    rules: list(r.rules, 16, v => { const rule = record(v); return { id: id(rule.id), title: text(rule.title), url: officialUrl(rule.url), checkedOn: day(rule.checkedOn), application: text(rule.application, 600) } }),
  }
}

export function financeEndpoint(base: string) {
  const url = new URL(base)
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Finanz-Bridge benötigt eine sichere URL.')
  return new URL('/hermes/finance', url)
}

export async function executeFinanceOperation(operation: string, input: Record<string, unknown>, access: FinanceAccess, gateway: (request: Record<string, unknown>) => Promise<unknown>): Promise<FinanceStatus | FinanceRun | FinanceExport> {
  if (access.isAdmin !== true || access.financeRead !== true) throw new Error('Admin- und Finanzberechtigung erforderlich.')
  const base = { schemaVersion: 1, profile: FINANCE_PROFILE } as const
  if (operation === 'status') return parseFinanceStatus(await gateway({ ...base, action: 'finance-status' }))
  if (operation === 'setup' || operation === 'review') {
    const requestId = uuid(input.requestId)
    const result = parseFinanceRun(await gateway({ ...base, action: 'finance-run', task: operation, requestId }))
    if (result.runId !== requestId || result.task !== operation) return invalid()
    return result
  }
  if (operation === 'export') {
    const runId = uuid(input.runId)
    if (input.format !== 'json' && input.format !== 'csv') return invalid()
    const r = envelope(await gateway({ ...base, action: 'finance-export', runId, format: input.format }))
    if (r.runId !== runId || r.format !== input.format || typeof r.content !== 'string' || r.content.length > 1024 * 1024) return invalid()
    return { ...base, runId, format: input.format, content: r.content }
  }
  return invalid()
}
