import type { SupabaseClient } from '@supabase/supabase-js'
import { canManageFeedback, readEntitlements, type Entitlements } from '@/lib/partners/entitlements'
import { validUuid } from '@/lib/partners/feedback'

export type TaskStatus = 'draft' | 'active' | 'paused' | 'ended'
export type EligibleTaskDeal = { id: string; title: string; description: string; terms: string; expires_at: string | null }
export type TaskRewardOffer = { deal_id: string; title: string; description: string; terms: string; expires_at: string }
export type TaskReward = TaskRewardOffer & { grant_id: string; selection_id: string; partner_id: string; status: 'available' | 'redeemed' | 'expired' }
export type TaskReceipt = {
  participation_id: string; task_id: string; partner_id: string; title: string; description: string
  status: 'started' | 'completed' | 'expired'; started_at: string; completion_deadline: string
  reward_offer: TaskRewardOffer; reward: TaskReward | null
}
export type PartnerTask = {
  id: string; partner_id: string; title: string; description: string; kind: 'partner_confirmed'
  status: TaskStatus; revision: number; reward_deal_id: string; starts_at: string; ends_at: string
  max_participants: number | null; remaining_places: number | null; reward_offer: TaskRewardOffer | null; participation: TaskReceipt | null
  started_count?: number; completed_count?: number; reward_count?: number; redeemed_count?: number
}
export type PartnerTaskInput = Pick<PartnerTask, 'title' | 'description' | 'kind' | 'status' | 'reward_deal_id' | 'starts_at' | 'ends_at' | 'max_participants'> & { id?: string; revision?: number }
export type PartnerTaskSettings = { partner_id: string; tasks: PartnerTask[]; available_deals: EligibleTaskDeal[]; reward_valid_days: 30 }
export type TaskErrorCode = 'backend_missing' | 'access_denied' | 'entitlements_unavailable' | 'revision_conflict' | 'invalid_input' | 'invalid_response' | 'token_expired' | 'reward_unavailable' | 'capacity_reserved' | 'partner_inactive' | 'failed'
export type PartnerTaskSettingsRead = { available: boolean; reason: TaskErrorCode | null; actorId: string | null; canConfirm: boolean; settings: PartnerTaskSettings | null }
export type TaskConfirmationPreview = { partner_id: string; participation_id: string; task_title: string; task_description: string; reward_title: string; status: 'started' | 'completed'; expires_at: string }
export type TaskConfirmationSummary = { confirmed: true; partner_id: string; participation_id: string; task_title: string; reward_title: string }

export class PartnerTaskError extends Error {
  constructor(public code: TaskErrorCode, message: string) { super(message); this.name = 'PartnerTaskError' }
}
function invalid() { return new PartnerTaskError('invalid_response', 'Die Aufgaben-Daten konnten nicht geladen werden. Bitte erneut laden.') }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  return value as Record<string, unknown>
}
function uuid(value: unknown): string { if (typeof value !== 'string' || !validUuid(value)) throw invalid(); return value }
function text(value: unknown, max?: number): string {
  if (typeof value !== 'string' || (max !== undefined && (!value.trim() || value.length > max))) throw invalid()
  return value
}
function integer(value: unknown, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw invalid()
  return value
}
export function isTaskInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:[0-5]\d)$/.test(value) || Number(value.slice(11, 13)) > 23 || !Number.isFinite(Date.parse(value))) return false
  const calendar = new Date(value.slice(0, 10) + 'T00:00:00Z')
  return Number.isFinite(calendar.getTime()) && calendar.toISOString().slice(0, 10) === value.slice(0, 10)
}
function instant(value: unknown): string { if (!isTaskInstant(value)) throw invalid(); return value }
function offer(value: unknown): TaskRewardOffer {
  const v = object(value)
  return { deal_id: uuid(v.deal_id), title: text(v.title, Infinity), description: text(v.description), terms: text(v.terms), expires_at: instant(v.expires_at) }
}
function sameOffer(a: TaskRewardOffer, b: TaskRewardOffer) {
  return a.deal_id === b.deal_id && a.title === b.title && a.description === b.description && a.terms === b.terms && Date.parse(a.expires_at) === Date.parse(b.expires_at)
}
function receipt(value: unknown, partnerId: string, taskId: string): TaskReceipt {
  const v = object(value), savedOffer = offer(v.reward_offer)
  if (v.partner_id !== partnerId || v.task_id !== taskId || !['started', 'completed', 'expired'].includes(v.status as string)) throw invalid()
  const started = instant(v.started_at), deadline = instant(v.completion_deadline)
  if (Date.parse(deadline) <= Date.parse(started) || Date.parse(deadline) > Date.parse(savedOffer.expires_at)) throw invalid()
  let reward: TaskReward | null = null
  if (v.reward !== null) {
    const r = object(v.reward), rewardOffer = offer(r)
    if (v.status !== 'completed' || r.partner_id !== partnerId || !['available', 'redeemed', 'expired'].includes(r.status as string) || !sameOffer(savedOffer, rewardOffer)) throw invalid()
    reward = { ...rewardOffer, grant_id: uuid(r.grant_id), selection_id: uuid(r.selection_id), partner_id: partnerId, status: r.status as TaskReward['status'] }
  } else if (v.status === 'completed') throw invalid()
  return { participation_id: uuid(v.participation_id), task_id: taskId, partner_id: partnerId, title: text(v.title, 120), description: text(v.description, 1000), status: v.status as TaskReceipt['status'], started_at: started, completion_deadline: deadline, reward_offer: savedOffer, reward }
}

export function normalizePartnerTask(value: unknown, partnerId: string, management = false): PartnerTask {
  const v = object(value), id = uuid(v.id), configuredDeal = uuid(v.reward_deal_id)
  if (v.partner_id !== partnerId || v.kind !== 'partner_confirmed' || !['draft', 'active', 'paused', 'ended'].includes(v.status as string)) throw invalid()
  const start = instant(v.starts_at), end = instant(v.ends_at)
  if (Date.parse(end) <= Date.parse(start)) throw invalid()
  const capacity = v.max_participants === null ? null : integer(v.max_participants, 1)
  const remaining = v.remaining_places === null ? null : integer(v.remaining_places, 0)
  if (capacity === null ? remaining !== null : remaining === null || remaining > capacity) throw invalid()
  const participation = v.participation === null ? null : receipt(v.participation, partnerId, id)
  const rewardOffer = v.reward_offer === null ? null : offer(v.reward_offer)
  const title = text(v.title, 120), description = text(v.description, 1000)
  if (management && participation) throw invalid()
  if (participation ? !rewardOffer || !sameOffer(rewardOffer, participation.reward_offer) || title !== participation.title || description !== participation.description : rewardOffer && rewardOffer.deal_id !== configuredDeal) throw invalid()
  if (!management && !participation && !rewardOffer) throw invalid()
  const result: PartnerTask = { id, partner_id: partnerId, title, description, kind: 'partner_confirmed', status: v.status as TaskStatus, revision: integer(v.revision, 1), reward_deal_id: configuredDeal, starts_at: start, ends_at: end, max_participants: capacity, remaining_places: remaining, reward_offer: rewardOffer, participation }
  for (const key of ['started_count', 'completed_count', 'reward_count', 'redeemed_count'] as const) if (v[key] !== undefined) result[key] = integer(v[key], 0)
  return result
}

function normalizeSettings(value: unknown, partnerId: string): PartnerTaskSettings {
  const v = object(value)
  if (v.available !== true || v.partner_id !== partnerId || v.reward_valid_days !== 30 || !Array.isArray(v.tasks) || !Array.isArray(v.available_deals)) throw invalid()
  const tasks = v.tasks.map(item => normalizePartnerTask(item, partnerId, true))
  const deals = v.available_deals.map(item => {
    const d = object(item)
    return { id: uuid(d.id), title: text(d.title, Infinity), description: text(d.description), terms: text(d.terms), expires_at: d.expires_at === null ? null : instant(d.expires_at) }
  })
  if (new Set(tasks.map(t => t.id)).size !== tasks.length || new Set(deals.map(d => d.id)).size !== deals.length) throw invalid()
  return { partner_id: partnerId, tasks, available_deals: deals, reward_valid_days: 30 }
}

export function canConfirmPartnerTask(rights: Entitlements) { return ['owner', 'admin', 'benefitsi_admin'].includes(rights.role) }
export function taskError(error: unknown): PartnerTaskError {
  if (error instanceof PartnerTaskError) return error
  const e = error && typeof error === 'object' ? error as { code?: string; message?: string } : {}
  if (['PGRST202', '42883'].includes(e.code ?? '')) return new PartnerTaskError('backend_missing', 'Aufgaben sind für diesen Betrieb noch nicht verfügbar.')
  if (e.message?.includes('task_revision_conflict')) return new PartnerTaskError('revision_conflict', 'Die Aufgabe wurde inzwischen geändert. Lade den aktuellen Serverstand und gleiche ihn mit deinem Entwurf ab.')
  if (e.message?.includes('task_token_expired')) return new PartnerTaskError('token_expired', 'Die Bestätigung ist abgelaufen. Bitte einen aktuellen Bestätigungscode vom Gast anfordern.')
  if (e.message?.includes('task_reward_unavailable')) return new PartnerTaskError('reward_unavailable', 'Der Vorteil ist nicht mehr geeignet. Bitte Vorteile neu laden und die Vorschau erneut prüfen.')
  if (e.message?.includes('task_capacity_below_reserved')) return new PartnerTaskError('capacity_reserved', 'Die Teilnehmerzahl darf nicht unter bereits reservierte Plätze sinken.')
  if (e.message?.includes('task_partner_inactive')) return new PartnerTaskError('partner_inactive', 'Dieser Betrieb ist nicht aktiv. Eine Bestätigung ist derzeit nicht möglich.')
  if (e.code === '42501' || e.message?.includes('tasks_pro_required') || e.message?.includes('partner_access_denied') || e.message?.includes('task_auth_required')) return new PartnerTaskError('access_denied', 'Für diese Handlung fehlt das berechtigte Verwaltungsrecht.')
  return new PartnerTaskError('failed', 'Die Aufgaben konnten nicht geladen oder gespeichert werden. Bitte erneut versuchen.')
}
async function trustedRights(client: SupabaseClient, partnerId: string) {
  try { return await readEntitlements(client, partnerId) }
  catch (error) {
    const failure = taskError(error)
    if (failure.code === 'access_denied') throw failure
    throw new PartnerTaskError('entitlements_unavailable', 'Die Aufgaben-Rechte sind derzeit nicht verfügbar. Bitte erneut laden.')
  }
}
export async function taskActor(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user || data.user.is_anonymous || !validUuid(data.user.id)) throw new PartnerTaskError('access_denied', 'Bitte mit einem berechtigten Partnerkonto anmelden.')
  return data.user.id
}
export async function readPartnerTaskSettings(client: SupabaseClient, partnerId: string, confirmationOnly = false): Promise<PartnerTaskSettingsRead> {
  if (!validUuid(partnerId)) throw new PartnerTaskError('invalid_input', 'Bitte einen gültigen Betrieb auswählen.')
  let actorId: string | null = null, canConfirm = false
  try {
    actorId = await taskActor(client)
    const rights = await trustedRights(client, partnerId)
    canConfirm = canConfirmPartnerTask(rights)
    if (confirmationOnly || !canManageFeedback(rights)) return { available: false, reason: 'access_denied', actorId, canConfirm, settings: null }
    const { data, error } = await client.rpc('get_partner_task_settings', { p_partner_id: partnerId })
    if (error) throw taskError(error)
    const settings = normalizeSettings(data, partnerId)
    if (await taskActor(client) !== actorId) throw new PartnerTaskError('access_denied', 'Das Konto wurde gewechselt. Bitte neu laden.')
    return { available: true, reason: null, actorId, canConfirm, settings }
  } catch (error) {
    const failure = taskError(error)
    if (!['backend_missing', 'access_denied', 'entitlements_unavailable'].includes(failure.code)) throw failure
    return { available: false, reason: failure.code, actorId, canConfirm: failure.code === 'access_denied' || failure.code === 'entitlements_unavailable' ? false : canConfirm, settings: null }
  }
}

export function taskInput(value: PartnerTaskInput): PartnerTaskInput {
  const bad = () => { throw new PartnerTaskError('invalid_input', 'Bitte Titel, Anleitung, Vorteil, Zeitraum, Status und Teilnehmerzahl prüfen.') }
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 120 || typeof value.description !== 'string' || !value.description.trim() || value.description.trim().length > 1000 || value.kind !== 'partner_confirmed' || !['draft', 'active', 'paused', 'ended'].includes(value.status) || !validUuid(value.reward_deal_id) || !isTaskInstant(value.starts_at) || !isTaskInstant(value.ends_at) || Date.parse(value.ends_at) <= Date.parse(value.starts_at) || (value.max_participants !== null && (!Number.isSafeInteger(value.max_participants) || value.max_participants <= 0)) || (value.id !== undefined && (!validUuid(value.id) || !Number.isSafeInteger(value.revision) || value.revision! < 1)) || (value.id === undefined && value.revision !== undefined)) bad()
  return { ...(value.id ? { id: value.id, revision: value.revision } : {}), title: value.title.trim(), description: value.description.trim(), kind: 'partner_confirmed', status: value.status, reward_deal_id: value.reward_deal_id, starts_at: new Date(value.starts_at).toISOString(), ends_at: new Date(value.ends_at).toISOString(), max_participants: value.max_participants }
}
export async function savePartnerTask(client: SupabaseClient, partnerId: string, input: PartnerTaskInput): Promise<PartnerTask> {
  if (!validUuid(partnerId)) throw new PartnerTaskError('invalid_input', 'Bitte einen gültigen Betrieb auswählen.')
  const payload = taskInput(input)
  if (!canManageFeedback(await trustedRights(client, partnerId))) throw new PartnerTaskError('access_denied', 'Aufgaben verwalten benötigt das passende Verwaltungsrecht für Besuchsfeedback.')
  const { data, error } = await client.rpc('save_partner_task', { p_partner_id: partnerId, p_task: payload })
  if (error) throw taskError(error)
  const saved = normalizePartnerTask(data, partnerId, true)
  if ((payload.id && saved.id !== payload.id) || saved.revision !== (payload.revision ?? 0) + 1 || saved.title !== payload.title || saved.description !== payload.description || saved.status !== payload.status || saved.reward_deal_id !== payload.reward_deal_id || Date.parse(saved.starts_at) !== Date.parse(payload.starts_at) || Date.parse(saved.ends_at) !== Date.parse(payload.ends_at) || saved.max_participants !== payload.max_participants) throw invalid()
  return saved
}
export function validTaskToken(value: string) { return /^benefitsi-task:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) }
export async function previewTaskConfirmation(client: SupabaseClient, partnerId: string, token: string): Promise<TaskConfirmationPreview> {
  if (!validUuid(partnerId) || !validTaskToken(token)) throw new PartnerTaskError('invalid_input', 'Bitte einen gültigen Aufgaben-Bestätigungscode einfügen.')
  if (!canConfirmPartnerTask(await trustedRights(client, partnerId))) throw new PartnerTaskError('access_denied', 'Für Aufgabenbestätigungen fehlt das Verwaltungsrecht.')
  const { data, error } = await client.rpc('preview_partner_task_confirmation', { p_token: token })
  if (error) throw taskError(error)
  const v = object(data)
  if (v.partner_id !== partnerId || !['started', 'completed'].includes(v.status as string)) throw invalid()
  const result: TaskConfirmationPreview = { partner_id: partnerId, participation_id: uuid(v.participation_id), task_title: text(v.task_title, 120), task_description: text(v.task_description, 1000), reward_title: text(v.reward_title, Infinity), status: v.status as TaskConfirmationPreview['status'], expires_at: instant(v.expires_at) }
  if (result.status === 'started' && Date.parse(result.expires_at) <= Date.now()) throw new PartnerTaskError('token_expired', 'Die Bestätigung ist abgelaufen. Bitte einen aktuellen Code anfordern.')
  return result
}
export async function confirmTaskConfirmation(client: SupabaseClient, partnerId: string, token: string, participationId: string): Promise<TaskConfirmationSummary> {
  if (!validUuid(participationId)) throw new PartnerTaskError('invalid_input', 'Bitte zuerst die Aufgabenbestätigung prüfen.')
  // Fresh authorization and trusted token resolution precede the grant, including on retries.
  const current = await previewTaskConfirmation(client, partnerId, token)
  if (current.participation_id !== participationId) throw new PartnerTaskError('invalid_input', 'Der Bestätigungscode wurde geändert. Bitte erneut prüfen.')
  const { data, error } = await client.rpc('confirm_partner_task', { p_token: token })
  if (error) throw taskError(error)
  const v = object(data)
  if (v.confirmed !== true || v.partner_id !== partnerId || v.participation_id !== current.participation_id || v.task_title !== current.task_title || v.reward_title !== current.reward_title) throw invalid()
  return { confirmed: true, partner_id: partnerId, participation_id: current.participation_id, task_title: current.task_title, reward_title: current.reward_title }
}
