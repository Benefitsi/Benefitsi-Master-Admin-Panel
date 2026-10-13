export const KNOWLEDGE_PROFILES = ['ben', 'benefitsi-content', 'benefitsi-finance', 'benefitsi-seo', 'city-annweiler', 'benefitsi-menu'] as const
export const KNOWLEDGE_FOLDERS = { task: '96 Aufgaben', decision: '95 Agenten/Entscheidungen', result: '95 Agenten/Ergebnisse' } as const
export type KnowledgeKind = keyof typeof KNOWLEDGE_FOLDERS
export type KnowledgeProfile = (typeof KNOWLEDGE_PROFILES)[number]
export type KnowledgeCreate = { schemaVersion: 1; action: 'note-create'; kind: KnowledgeKind; title: string; content: string; profileId?: KnowledgeProfile; dueDate?: string; requestId: string }
export type KnowledgeReceipt = { id?: string; schemaVersion: 1; sourceId: 'benefitsi-obsidian'; ownership: 'BENEFITSI_EXTERNAL'; checkedAt: string; path: string; title: string; kind: KnowledgeKind; sha256: string; readbackVerified: true; created: boolean; mirrorState: 'pending' }
export type KnowledgeTasks = { schemaVersion: 1; sourceId: 'benefitsi-obsidian'; ownership: 'BENEFITSI_EXTERNAL'; checkedAt: string; items: { id: string; title: string; dueDate: string | null; profileId: KnowledgeProfile | null; path: string; createdAt: string; state: 'open' }[]; truncated: boolean }

export type KnowledgeNote = { schemaVersion: 1; sourceId: 'benefitsi-obsidian'; ownership: 'BENEFITSI_EXTERNAL'; checkedAt: string; id: string; path: string; title: string; kind: KnowledgeKind; profileId: KnowledgeProfile | null; createdAt: string; modifiedAt: string; sha256: string; hashVersion: 'sha256-bytes-v1'; byteLength: number; content: string }

export type KnowledgeErrorCode = 'invalid_request' | 'invalid_response' | 'permission_denied' | 'unavailable' | 'conflict' | 'limit_exceeded'
export class KnowledgeControlError extends Error {
  constructor(public code: KnowledgeErrorCode) { super(knowledgeErrorMessage(code)); this.name = 'KnowledgeControlError' }
}
export function knowledgeErrorMessage(code: KnowledgeErrorCode) {
  return {
    invalid_request: 'Bitte gültige Angaben und eine passende Aufgabenfrist eingeben.',
    invalid_response: 'Die Speicherung konnte nicht durch einen gültigen Rücklesebeleg bestätigt werden.',
    permission_denied: 'Adminberechtigung erforderlich.',
    unavailable: 'Der Wissensdienst ist derzeit nicht verfügbar. Erneutes Speichern verwendet dieselbe Auftrags-ID.',
    conflict: 'Diese Auftrags-ID wurde bereits für einen anderen Inhalt verwendet.',
    limit_exceeded: 'Die Anfrage oder Antwort überschreitet das erlaubte Größenlimit.',
  }[code]
}
const fail = (code: KnowledgeErrorCode): never => { throw new KnowledgeControlError(code) }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function record(value: unknown, code: KnowledgeErrorCode): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(code)
  return value as Record<string, unknown>
}
function text(value: unknown, max: number, code: KnowledgeErrorCode): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\u0000')) return fail(code)
  return value
}
function uuid(value: unknown, code: KnowledgeErrorCode): string {
  const result = text(value, 36, code)
  if (!UUID.test(result)) return fail(code)
  return result.toLowerCase()
}
function day(value: unknown, code: KnowledgeErrorCode): string {
  const result = text(value, 10, code)
  const parsed = new Date(`${result}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) return fail(code)
  return result
}
function timestamp(value: unknown): string {
  const result = text(value, 80, 'invalid_response')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) return fail('invalid_response')
  day(result.slice(0, 10), 'invalid_response')
  return result
}
function profile(value: unknown, code: KnowledgeErrorCode): KnowledgeProfile {
  if (!(KNOWLEDGE_PROFILES as readonly unknown[]).includes(value)) return fail(code)
  return value as KnowledgeProfile
}
function kind(value: unknown, code: KnowledgeErrorCode): KnowledgeKind {
  if (value !== 'task' && value !== 'decision' && value !== 'result') return fail(code)
  return value
}
function path(value: unknown, noteKind: KnowledgeKind): string {
  const result = text(value, 500, 'invalid_response')
  if (!result.startsWith(`${KNOWLEDGE_FOLDERS[noteKind]}/`) || !result.endsWith('.md') || /[\\\u0000-\u001f]/.test(result) || result.split('/').some(part => !part || part === '.' || part === '..')) return fail('invalid_response')
  return result
}
function envelope(value: unknown) {
  const r = record(value, 'invalid_response')
  if (r.schemaVersion !== 1 || r.sourceId !== 'benefitsi-obsidian' || r.ownership !== 'BENEFITSI_EXTERNAL') return fail('invalid_response')
  return { r, base: { schemaVersion: 1 as const, sourceId: 'benefitsi-obsidian' as const, ownership: 'BENEFITSI_EXTERNAL' as const, checkedAt: timestamp(r.checkedAt) } }
}
export function parseKnowledgeCreate(value: unknown): KnowledgeCreate {
  const r = record(value, 'invalid_request')
  if (Object.keys(r).some(key => !['schemaVersion', 'action', 'kind', 'title', 'content', 'profileId', 'dueDate', 'requestId'].includes(key)) || r.schemaVersion !== 1 || r.action !== 'note-create') return fail('invalid_request')
  const noteKind = kind(r.kind, 'invalid_request')
  if (r.dueDate !== undefined && noteKind !== 'task') return fail('invalid_request')
  return { schemaVersion: 1, action: 'note-create', kind: noteKind, title: text(r.title, 140, 'invalid_request'), content: text(r.content, 12000, 'invalid_request'), requestId: uuid(r.requestId, 'invalid_request'),
    ...(r.profileId === undefined ? {} : { profileId: profile(r.profileId, 'invalid_request') }),
    ...(r.dueDate === undefined ? {} : { dueDate: day(r.dueDate, 'invalid_request') }),
  }
}
export function parseKnowledgeReceipt(value: unknown, request: KnowledgeCreate): KnowledgeReceipt {
  const { r, base } = envelope(value)
  if (r.kind !== request.kind || r.title !== request.title || typeof r.created !== 'boolean' || r.readbackVerified !== true || r.mirrorState !== 'pending' || typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256)) return fail('invalid_response')
  const notePath = path(r.path, request.kind)
  const returnedId = r.id === undefined ? undefined : uuid(r.id, 'invalid_response')
  if (returnedId !== undefined && returnedId !== request.requestId) return fail('invalid_response')
  const fileId = notePath.split('/').at(-1)?.replace(/\.md$/, '')
  const id = returnedId ?? (fileId === request.requestId ? request.requestId : undefined)
  return { ...base, ...(id ? { id } : {}), kind: request.kind, title: request.title, path: notePath, sha256: r.sha256, readbackVerified: true, created: r.created, mirrorState: 'pending' }
}
export function parseKnowledgeTasks(value: unknown): KnowledgeTasks {
  const { r, base } = envelope(value)
  if (!Array.isArray(r.items) || r.items.length > 200 || typeof r.truncated !== 'boolean') return fail('invalid_response')
  const ids = new Set<string>()
  const items = r.items.map(value => {
    const item = record(value, 'invalid_response'), id = uuid(item.id, 'invalid_response')
    if (ids.has(id) || item.state !== 'open') return fail('invalid_response')
    ids.add(id)
    return { id, title: text(item.title, 140, 'invalid_response'), dueDate: item.dueDate === null ? null : day(item.dueDate, 'invalid_response'), profileId: item.profileId === null ? null : profile(item.profileId, 'invalid_response'), path: path(item.path, 'task'), createdAt: timestamp(item.createdAt), state: 'open' as const }
  })
  return { ...base, items, truncated: r.truncated }
}
export function parseKnowledgeNoteRead(value: unknown): { id: string } {
  const r = record(value, 'invalid_request')
  if (Object.keys(r).some(key => key !== 'id')) return fail('invalid_request')
  return { id: uuid(r.id, 'invalid_request') }
}
export function parseKnowledgeNote(value: unknown, expectedId: string): KnowledgeNote {
  const { r, base } = envelope(value), noteKind = kind(r.kind, 'invalid_response')
  const id = uuid(r.id, 'invalid_response')
  if (id !== uuid(expectedId, 'invalid_request') || r.hashVersion !== 'sha256-bytes-v1' || typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256) || typeof r.byteLength !== 'number' || !Number.isInteger(r.byteLength) || r.byteLength < 1 || r.byteLength > 65536) return fail('invalid_response')
  return { ...base, id, kind: noteKind, title: text(r.title, 140, 'invalid_response'), path: path(r.path, noteKind), profileId: r.profileId === null ? null : profile(r.profileId, 'invalid_response'), createdAt: timestamp(r.createdAt), modifiedAt: timestamp(r.modifiedAt), sha256: r.sha256, hashVersion: 'sha256-bytes-v1', byteLength: r.byteLength, content: text(r.content, 65536, 'invalid_response') }
}
export function knowledgeEndpoint(base: string): URL {
  let url: URL
  try { url = new URL(base) } catch { return fail('unavailable') }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) return fail('unavailable')
  return new URL('/benefitsi/knowledge', url)
}
export async function executeKnowledgeOperation(action: string, input: unknown, access: { isAdmin: boolean }, gateway: (request: Record<string, unknown>) => Promise<unknown>): Promise<KnowledgeReceipt | KnowledgeTasks | KnowledgeNote> {
  if (access.isAdmin !== true) return fail('permission_denied')
  if (action === 'note-create') {
    const request = parseKnowledgeCreate(input)
    return parseKnowledgeReceipt(await gateway(request), request)
  }
  if (action === 'task-list') {
    if (input !== undefined && Object.keys(record(input, 'invalid_request')).length) return fail('invalid_request')
    return parseKnowledgeTasks(await gateway({ schemaVersion: 1, action: 'task-list' }))
  }
  if (action === 'note-read') {
    const request = parseKnowledgeNoteRead(input)
    return parseKnowledgeNote(await gateway({ schemaVersion: 1, action: 'note-read', ...request }), request.id)
  }
  return fail('invalid_request')
}
