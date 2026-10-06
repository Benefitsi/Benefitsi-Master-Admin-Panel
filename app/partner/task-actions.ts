'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getPartnerPortalSession } from '@/lib/partner-portal'
import { validUuid } from '@/lib/partners/feedback'
import { PartnerTaskError, confirmTaskConfirmation, previewTaskConfirmation, readPartnerTaskSettings, savePartnerTask, taskActor, taskError, validTaskToken, type PartnerTask, type PartnerTaskSettingsRead, type TaskConfirmationPreview, type TaskConfirmationSummary, type TaskErrorCode, type TaskStatus } from '@/lib/partners/tasks'

export type TaskActionResult = { ok: boolean; message?: string; code?: TaskErrorCode; actorId?: string; task?: PartnerTask; initial?: PartnerTaskSettingsRead; preview?: TaskConfirmationPreview; summary?: TaskConfirmationSummary }
function field(form: FormData, name: string) {
  const value = form.get(name)
  if (value !== null && typeof value !== 'string') throw new PartnerTaskError('invalid_input', 'Bitte gültige Aufgabenfelder eingeben.')
  return value ?? ''
}
async function context(form: FormData) {
  const partnerId = field(form, 'partner_id'), expectedActor = field(form, 'actor_id')
  if (!validUuid(partnerId) || !validUuid(expectedActor)) throw new PartnerTaskError('invalid_input', 'Bitte einen gültigen Betrieb auswählen und die Ansicht neu laden.')
  const client = await createClient(), actorId = await taskActor(client)
  if (actorId !== expectedActor) throw new PartnerTaskError('access_denied', 'Das Konto wurde gewechselt. Bitte die Ansicht neu laden.')
  const session = await getPartnerPortalSession(client)
  if (!session || session.user.id !== actorId || (!session.isAdmin && !session.partnerIds.includes(partnerId))) throw new PartnerTaskError('access_denied', 'Bitte mit einem berechtigten Partnerkonto anmelden.')
  return { client, partnerId, actorId }
}
function failure(error: unknown): TaskActionResult { const e = taskError(error); return { ok: false, code: e.code, message: e.message } }

export async function savePartnerTaskAction(_previous: TaskActionResult, form: FormData): Promise<TaskActionResult> {
  try {
    const id = field(form, 'id'), revision = field(form, 'revision'), capacity = field(form, 'max_participants')
    if ((revision && !/^[1-9]\d*$/.test(revision)) || (capacity && !/^[1-9]\d*$/.test(capacity))) throw new PartnerTaskError('invalid_input', 'Bitte eine ganze positive Teilnehmerzahl und gültige Revision eingeben.')
    const input = { ...(id ? { id, revision: Number(revision) } : {}), title: field(form, 'title'), description: field(form, 'description'), kind: field(form, 'kind') as 'partner_confirmed', status: field(form, 'status') as TaskStatus, reward_deal_id: field(form, 'reward_deal_id'), starts_at: field(form, 'starts_at'), ends_at: field(form, 'ends_at'), max_participants: capacity === '' ? null : Number(capacity) }
    if ((!id && revision) || (id && !revision)) throw new PartnerTaskError('invalid_input', 'Die Aufgabenrevision fehlt. Bitte neu laden.')
    const { client, partnerId, actorId } = await context(form)
    const task = await savePartnerTask(client, partnerId, input)
    revalidatePath('/partner')
    return { ok: true, message: 'Aufgabe gespeichert.', actorId, task }
  } catch (error) { return failure(error) }
}
export async function reloadPartnerTaskSettings(_previous: TaskActionResult, form: FormData): Promise<TaskActionResult> {
  try {
    const { client, partnerId, actorId } = await context(form)
    const initial = await readPartnerTaskSettings(client, partnerId)
    if (!initial.available || !initial.settings) return { ok: false, code: initial.reason ?? 'failed', message: initial.reason === 'backend_missing' ? 'Aufgaben sind noch nicht verfügbar.' : 'Die Aufgaben-Rechte sind nicht verfügbar. Bitte Verwaltungsrecht prüfen.' }
    return { ok: true, actorId, initial }
  } catch (error) { return failure(error) }
}
export async function previewPartnerTaskAction(_previous: TaskActionResult, form: FormData): Promise<TaskActionResult> {
  try {
    const token = field(form, 'token')
    if (!validTaskToken(token)) throw new PartnerTaskError('invalid_input', 'Bitte den vollständigen Aufgaben-Bestätigungscode einfügen.')
    const { client, partnerId, actorId } = await context(form)
    const preview = await previewTaskConfirmation(client, partnerId, token)
    return { ok: true, actorId, preview }
  } catch (error) { return failure(error) }
}
export async function confirmPartnerTaskAction(_previous: TaskActionResult, form: FormData): Promise<TaskActionResult> {
  try {
    const token = field(form, 'token'), participationId = field(form, 'participation_id')
    if (!validTaskToken(token) || !validUuid(participationId)) throw new PartnerTaskError('invalid_input', 'Bitte zuerst die Aufgabenbestätigung prüfen.')
    const { client, partnerId, actorId } = await context(form)
    const summary = await confirmTaskConfirmation(client, partnerId, token, participationId)
    revalidatePath('/partner')
    return { ok: true, actorId, summary, message: 'Erfüllung bestätigt. Der Gast erhält den persönlichen Vorteil in der App.' }
  } catch (error) { return failure(error) }
}
