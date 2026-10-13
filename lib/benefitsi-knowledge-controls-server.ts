import 'server-only'
import { createHash } from 'node:crypto'
import { createClient } from './supabase/server'
import { getFinanceAccess } from './finance-agent'
import { getAdminSession } from './admin'
import { executeKnowledgeOperation, knowledgeEndpoint, KnowledgeControlError, type KnowledgeReceipt, type KnowledgeTasks, type KnowledgeNote } from './benefitsi-knowledge-controls'

async function bridge(request: Record<string, unknown>): Promise<unknown> {
  const base = process.env.M1_BRIDGE_URL?.trim()
  const secret = process.env.M1_BRIDGE_SECRET?.trim()
  if (!base || !secret) throw new KnowledgeControlError('unavailable')
  let response: Response
  try {
    response = await fetch(knowledgeEndpoint(base), {
      method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify(request), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000),
    })
  } catch { throw new KnowledgeControlError('unavailable') }
  if (response.status === 409) { await response.body?.cancel().catch(() => undefined); throw new KnowledgeControlError('conflict') }
  if (!response.ok || !response.body || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) { await response.body?.cancel().catch(() => undefined); throw new KnowledgeControlError('unavailable') }
  const maximum = request.action === 'note-read' ? 512 * 1024 : request.action === 'task-list' ? 256 * 1024 : 64 * 1024
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) throw new KnowledgeControlError('limit_exceeded')
      chunks.push(value)
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown }
    catch { throw new KnowledgeControlError('invalid_response') }
  } catch (error) {
    if (error instanceof KnowledgeControlError) throw error
    throw new KnowledgeControlError('unavailable')
  } finally { await reader.cancel().catch(() => undefined) }
}
export async function requestKnowledge(action: 'note-create' | 'task-list' | 'note-read', input?: unknown): Promise<KnowledgeReceipt | KnowledgeTasks | KnowledgeNote> {
  const session = await getAdminSession()
  const result = await executeKnowledgeOperation(action, input, { isAdmin: session?.isAdmin === true }, bridge)
  if (action === 'note-read') {
    const note = result as KnowledgeNote
    const bytes = Buffer.from(note.content, 'utf8')
    if (bytes.byteLength !== note.byteLength || bytes.byteLength > 65536 || bytes.toString('utf8') !== note.content || createHash('sha256').update(bytes).digest('hex') !== note.sha256) throw new KnowledgeControlError('invalid_response')
    if (note.profileId === 'benefitsi-finance') {
      const access = await getFinanceAccess(await createClient(), session)
      if (access.financeRead !== true) throw new KnowledgeControlError('permission_denied')
    }
  }
  if (action === 'task-list') {
    const tasks = result as KnowledgeTasks
    if (tasks.items.some(item => item.profileId === 'benefitsi-finance')) {
      const access = await getFinanceAccess(await createClient(), session)
      if (access.financeRead !== true) return { ...tasks, items: tasks.items.filter(item => item.profileId !== 'benefitsi-finance'), truncated: true }
    }
  }
  return result
}
export async function requestKnowledgeTasks(): Promise<KnowledgeTasks> {
  return await requestKnowledge('task-list') as KnowledgeTasks
}

export async function requestKnowledgeNote(id: string): Promise<KnowledgeNote> {
  return await requestKnowledge('note-read', { id }) as KnowledgeNote
}
