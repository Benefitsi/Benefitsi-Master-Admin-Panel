import 'server-only'
import { getAdminSession } from './admin'
import { createClient } from './supabase/server'
import { executeFinanceOperation, financeEndpoint, getFinanceAccess } from './finance-agent'

export async function financeSession() {
  const supabase = await createClient()
  return getFinanceAccess(supabase, await getAdminSession(supabase))
}

async function bridge(request: Record<string, unknown>) {
  const base = process.env.M1_BRIDGE_URL?.trim()
  const secret = process.env.M1_BRIDGE_SECRET?.trim()
  if (!base || !secret) throw new Error('Die vorhandene M1-Bridge ist nicht konfiguriert.')
  const response = await fetch(financeEndpoint(base), {
    method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(request), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok || !response.body) throw new Error('Der M1-Finanzdienst ist derzeit nicht erreichbar.')
  const maximum = request.action === 'finance-export' ? 2 * 1024 * 1024 : 128 * 1024
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) throw new Error('Die Finanzantwort überschreitet das sichere Leselimit.')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export async function requestFinance(operation: string, input: Record<string, unknown> = {}) {
  return executeFinanceOperation(operation, input, await financeSession(), bridge)
}
