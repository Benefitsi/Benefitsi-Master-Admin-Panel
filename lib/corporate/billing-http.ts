import { timingSafeEqual } from 'node:crypto'
import type Stripe from 'stripe'
import { assertMetadata, ensure, providerUrl, ref, row, type BillingIntent, type Row, type Rpc } from '@/lib/stripe/corporate-contracts'
import type { CorporateProvider } from '@/lib/stripe/corporate-provider'
export const billingHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer' }
export const billingResponse = (body: Row, status = 200) => Response.json(body, { status, headers: billingHeaders })
export function secretMatches(expected: string | undefined, provided: string | null) { return Boolean(expected && expected.length >= 32 && provided && Buffer.byteLength(expected) === Buffer.byteLength(provided) && timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) }
class HttpError extends Error { constructor(readonly code: number, readonly state: string) { super(state) } }
async function bodyText(request: Request, limit: number) {
  if (Number(request.headers.get('content-length') || 0) > limit || !request.body) throw new HttpError(400, 'invalid')
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0
  try { while (true) { const next = await reader.read(); if (next.done) break; length += next.value.byteLength; if (length > limit) throw new HttpError(400, 'invalid'); chunks.push(next.value) } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export type OwnerConnection = { authenticate(): Promise<boolean>; rpc: Rpc }
export type OwnerDependencies = { origin: string; proxySecret: string; provider: CorporateProvider; owner(jwt: string): Promise<OwnerConnection>; worker: { run(operationId: string): Promise<Row>; verifySetup(session: string): Promise<Row> }; reconciler: { reconcile(kind: 'invoice', reference: string, event: string): Promise<Row>; context(kind: 'invoice', reference: string): Promise<Row | null> } }
export async function ownerBillingRequest(request: Request, mode: 'setup' | 'status' | 'recovery', deps: OwnerDependencies) {
  try {
    const bearer = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '')
    if (!bearer || !secretMatches(deps.proxySecret, request.headers.get('x-benefitsi-corporate-proxy-secret'))) throw new HttpError(401, 'unauthenticated')
    if (request.headers.get('origin') !== deps.origin) throw new HttpError(403, 'forbidden')
    let body: Row
    try { body = row(JSON.parse(await bodyText(request, 4096))) } catch { throw new HttpError(400, 'invalid') }
    const keys = mode === 'setup' ? ['companyId', 'contractId', 'requestId', 'expectedVersion'] : mode === 'status' ? ['companyId', 'contractId', 'requestId'] : ['companyId', 'contractId', 'periodId']
    if (Object.keys(body).length !== keys.length || keys.some(k => typeof body[k] !== 'string' || (k === 'expectedVersion' ? !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(String(body[k])) : !uuid.test(String(body[k]))))) throw new HttpError(400, 'invalid')
    const owner = await deps.owner(bearer[1])
    if (!await owner.authenticate()) throw new HttpError(401, 'unauthenticated')
    const read = async () => {
      const dto = await owner.rpc('get_corporate_contract', { p_company_id: body.companyId })
      if (dto.status !== 'ok' || dto.company_id !== body.companyId || (!dto.contract || row(dto.contract).contract_id !== body.contractId)) throw new HttpError(403, 'forbidden')
      const context = await owner.rpc('get_corporate_payment_context', { p_contract_id: body.contractId, p_period_id: body.periodId ?? null })
      if (context.status !== 'ok' || context.company_id !== body.companyId || context.contract_id !== body.contractId || (mode === 'recovery' && context.period_id !== body.periodId)) throw new HttpError(403, 'forbidden')
      if (context.environment !== 'test' || context.provider_account_ref !== deps.provider.config.account || context.return_origin !== deps.origin) throw new HttpError(409, 'conflict')
      return { dto, context }
    }
    let current = await read()
    if (mode === 'setup') {
      const result = await owner.rpc('request_corporate_payment_setup', { p_request_id: body.requestId, p_contract_id: body.contractId, p_expected_version: body.expectedVersion })
      if (result.status !== 'requested') throw new HttpError(result.status === 'conflict' ? 409 : result.status === 'invalid' ? 400 : 403, result.status === 'conflict' ? 'conflict' : result.status === 'invalid' ? 'invalid' : 'forbidden')
      ensure(result.setup_request_id === body.requestId && typeof result.operation_id === 'string')
      let operationId: string | null = result.operation_id
      for (let step = 0; step < 2 && operationId; step++) {
        const done = await deps.worker.run(operationId)
        if (!['recorded', 'replayed'].includes(String(done.status))) break
        ensure(done.setup_request_id === body.requestId, 'setup_chain_mismatch')
        operationId = typeof done.next_operation_id === 'string' ? done.next_operation_id : null
        if (step === 0) { current = await read(); if (current.context.setup_session_ref) break }
      }
      current = await read()
    }
    if (mode === 'recovery') {
      const before = current.context
      if (!before.invoice_ref) return billingResponse({ status: 'pending' }, 202)
      const result = await deps.reconciler.reconcile('invoice', String(before.invoice_ref), `owner_${String(body.periodId)}`)
      const reconciliation = await deps.reconciler.context('invoice', String(before.invoice_ref))
      ensure(reconciliation, 'reconciliation_context_missing')
      const invoice = await deps.provider.stripe.invoices.retrieve(String(before.invoice_ref), {}, deps.provider.options())
      ensure(invoice.livemode === false && ref(invoice.customer) === before.customer_ref && invoice.id === before.invoice_ref)
      assertMetadata(invoice.metadata, { company_id: String(body.companyId), contract_id: String(body.contractId) } as BillingIntent, false)
      if (!await owner.authenticate()) throw new HttpError(403, 'forbidden')
      current = await read(); if (current.context.customer_ref !== before.customer_ref || current.context.invoice_ref !== before.invoice_ref) throw new HttpError(409, 'conflict')
      const state = result.payment_state || result.status
      if (state === 'paid') return billingResponse({ status: 'paid' })
      if (reconciliation.contract_review_required || row(reconciliation.intent).recovery_blocked || ['payment_review', 'unavailable'].includes(String(state)) || ['void', 'uncollectible'].includes(invoice.status || '')) return billingResponse({ status: 'payment_review' })
      if (['action_required', 'failed'].includes(String(state)) && invoice.status === 'open' && invoice.hosted_invoice_url) return billingResponse({ status: 'action_required', paymentUrl: providerUrl(invoice.hosted_invoice_url, 'invoice') })
      return billingResponse({ status: 'pending' }, 202)
    }
    if (current.context.setup_request_id !== body.requestId || row(current.dto.payment_setup).setup_request_id !== body.requestId) throw new HttpError(409, 'conflict')
    const before = current.context; let checkoutUrl: string | null = null, expired = false
    if (before.setup_session_ref && row(current.dto.payment_setup).state !== 'ready') {
      await deps.provider.account()
      const session = await deps.provider.stripe.checkout.sessions.retrieve(String(before.setup_session_ref), {}, deps.provider.options())
      ensure(session.livemode === false && session.mode === 'setup' && ref(session.customer) === before.customer_ref && session.id === before.setup_session_ref)
      assertMetadata(session.metadata, { company_id: String(body.companyId), contract_id: String(body.contractId) } as BillingIntent, false)
      if (session.status === 'complete' && mode === 'status') {
        const result = await owner.rpc('get_corporate_payment_context', { p_contract_id: body.contractId, p_period_id: null })
        if (result.setup_session_ref !== before.setup_session_ref || result.setup_request_id !== body.requestId) throw new HttpError(409, 'conflict')
        // Runtime exposes only a known-session enqueue, never arbitrary service RPC authority.
        const verify = await deps.worker.verifySetup(String(before.setup_session_ref))
        ensure(!verify.setup_request_id || verify.setup_request_id === body.requestId)
      } else if (session.status === 'open' && session.expires_at * 1000 > deps.provider.now()) checkoutUrl = providerUrl(session.url, 'checkout')
      else expired = session.status === 'expired' || session.expires_at * 1000 <= deps.provider.now()
    }
    if (!await owner.authenticate()) throw new HttpError(403, 'forbidden')
    current = await read()
    if (current.context.setup_request_id !== body.requestId || current.context.setup_session_ref !== before.setup_session_ref || current.context.customer_ref !== before.customer_ref) throw new HttpError(409, 'conflict')
    if (row(current.dto.payment_setup).state === 'ready') return billingResponse({ status: 'setup_verified', requestId: body.requestId })
    if (expired) return billingResponse({ status: 'expired', requestId: body.requestId })
    if (checkoutUrl) return billingResponse({ status: 'ready', requestId: body.requestId, checkoutUrl })
    return billingResponse({ status: 'pending', requestId: body.requestId }, 202)
  } catch (error) { return error && typeof error === 'object' && 'message' in error && error.message === 'corporate_access_denied' ? billingResponse({ status: 'forbidden' }, 403) : error instanceof HttpError ? billingResponse({ status: error.state }, error.code) : billingResponse({ status: 'unavailable' }, 503) }
}
export async function corporateWebhook(request: Request, deps: { secret: string; stripe: Stripe; account: string; receive(event: Stripe.Event): Promise<unknown> }) {
  let event: Stripe.Event
  try { ensure(deps.secret.startsWith('whsec_')); event = deps.stripe.webhooks.constructEvent(await bodyText(request, 262144), request.headers.get('stripe-signature') || '', deps.secret); ensure(event.livemode === false && (!event.account || event.account === deps.account)) }
  catch { return billingResponse({ status: 'invalid' }, 400) }
  try { await deps.receive(event); return billingResponse({ status: 'received' }) } catch { return billingResponse({ status: 'unavailable' }, 503) }
}
export async function corporateDispatch(request: Request, secret: string, tick: () => Promise<Row>) {
  const bearer = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '')
  if (!bearer || !secretMatches(secret, bearer[1])) return billingResponse({ status: 'unauthenticated' }, 401)
  try { const body = row(JSON.parse(await bodyText(request, 64))); if (Object.keys(body).length) return billingResponse({ status: 'invalid' }, 400) } catch { return billingResponse({ status: 'invalid' }, 400) }
  try { return billingResponse(await tick()) } catch { return billingResponse({ status: 'unavailable' }, 503) }
}
