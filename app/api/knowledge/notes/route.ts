import { getAdminSession } from '@/lib/admin'
import { KnowledgeControlError, knowledgeErrorMessage, parseKnowledgeCreate, parseKnowledgeNoteRead } from '@/lib/benefitsi-knowledge-controls'
import { requestKnowledge, requestKnowledgeNote } from '@/lib/benefitsi-knowledge-controls-server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const noStore = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }
const maximum = 64 * 1024
async function body(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new KnowledgeControlError('limit_exceeded')
  if (!request.body) throw new KnowledgeControlError('invalid_request')
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
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
    catch { throw new KnowledgeControlError('invalid_request') }
  } finally { await reader.cancel().catch(() => undefined) }
}
function errorResponse(error: unknown) {
  const code = error instanceof KnowledgeControlError ? error.code : 'unavailable'
  const status = { invalid_request: 400, invalid_response: 502, permission_denied: 403, unavailable: 503, conflict: 409, limit_exceeded: 413 }[code]
  return Response.json({ error: code, message: knowledgeErrorMessage(code) }, { status, headers: noStore })
}
export async function POST(request: Request) {
  try {
    const session = await getAdminSession()
    if (session?.isAdmin !== true) throw new KnowledgeControlError('permission_denied')
    if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new KnowledgeControlError('permission_denied')
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) return Response.json({ error: 'invalid_request' }, { status: 415, headers: noStore })
    const input = parseKnowledgeCreate(await body(request))
    return Response.json(await requestKnowledge('note-create', input), { headers: noStore })
  } catch (error) { return errorResponse(error) }
}

export async function GET(request: Request) {
  try {
    const session = await getAdminSession()
    if (session?.isAdmin !== true || request.headers.get('sec-fetch-site') === 'cross-site') throw new KnowledgeControlError('permission_denied')
    const query = new URL(request.url).searchParams
    if (query.size !== 1 || !query.has('id')) throw new KnowledgeControlError('invalid_request')
    const { id } = parseKnowledgeNoteRead({ id: query.get('id') })
    return Response.json(await requestKnowledgeNote(id), { headers: noStore })
  } catch (error) { return errorResponse(error) }
}
