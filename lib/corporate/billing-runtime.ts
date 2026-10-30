import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getStripeTestClient } from '@/lib/stripe/config'
import { CorporateProvider } from '@/lib/stripe/corporate-provider'
import { CorporateWorker } from '@/lib/stripe/corporate-worker'
import { CorporateReconciler } from '@/lib/stripe/corporate-reconciliation'
import { ensure, row, type Row, type Rpc } from '@/lib/stripe/corporate-contracts'
import { corporateEmailConfig, sendCorporateNotification } from '@/lib/corporate/notification-email'
import type { OwnerConnection } from '@/lib/corporate/billing-http'
import type { DocumentStorage } from '@/lib/corporate/recurring-documents'
const selectedAccount = 'acct_1T3ZuLH0Ev7iKGq0'
export function corporateReadiness(env: Record<string, string | undefined> = process.env) {
  let reason: string | null = null
  if (env.BENEFITSI_CORPORATE_BILLING_ENABLED !== 'true') reason = 'billing_disabled'
  else if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_') || env.BENEFITSI_CORPORATE_STRIPE_ACCOUNT !== selectedAccount) reason = 'test_account_not_configured'
  else if (!env.BENEFITSI_CORPORATE_PROXY_SECRET || env.BENEFITSI_CORPORATE_PROXY_SECRET.length < 32 || !env.BENEFITSI_CORPORATE_WORKER_SECRET || env.BENEFITSI_CORPORATE_WORKER_SECRET.length < 32 || !env.STRIPE_CORPORATE_WEBHOOK_SECRET?.startsWith('whsec_')) reason = 'corporate_secrets_missing'
  else if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL || !(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) reason = 'database_not_configured'
  else if (!env.BENEFITSI_CORPORATE_PROVIDER_POLICY_EVIDENCE || !env.BENEFITSI_CORPORATE_REQUIRED_NOTICES_EVIDENCE) reason = 'provider_notice_policy_unverified'
  try { const origin = new URL(env.BENEFITSI_CORPORATE_WEB_ORIGIN || ''); if (origin.origin !== env.BENEFITSI_CORPORATE_WEB_ORIGIN || origin.protocol !== 'https:' || origin.username || origin.password) reason ||= 'return_origin_not_configured' } catch { reason ||= 'return_origin_not_configured' }
  // Configuration only. Evidence strings are not proof of legal approval, delivery or provider settings.
  return { environment: 'test' as const, configured: reason === null, reason, live_enabled: false as const }
}
const transport = (fetcher: typeof fetch): typeof fetch => (input, init) => fetcher(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) })
export function corporateRpc(client: SupabaseClient): Rpc { return async (name, args) => { const result = await client.rpc(name, args); if (result.error) throw Error(result.error.code === '42501' ? 'corporate_access_denied' : 'corporate_rpc_failed'); return row(result.data) } }
export function originalOwner(jwt: string, config: { url: string; publishableKey: string }, fetcher: typeof fetch = fetch): OwnerConnection {
  const client = createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Authorization: `Bearer ${jwt}` }, fetch: transport(fetcher) } })
  return { rpc: corporateRpc(client), authenticate: async () => {
    const { data, error } = await client.auth.getUser(jwt)
    if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) return false
    const user = data.user as unknown as Row
    if (user.deleted_at || (typeof user.banned_until === 'string' && Date.parse(user.banned_until) > Date.now())) return false
    const deletion = await client.rpc('account_deletion_active', { p_user_id: data.user.id })
    if (deletion.error) throw Error('corporate_account_unavailable')
    return deletion.data === false
  } }
}
export function corporateRuntime() {
  const env = process.env; ensure(corporateReadiness(env).configured, 'corporate_not_configured')
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transport(fetch) } })
  const rpc = corporateRpc(client), stripe = getStripeTestClient()
  const provider = new CorporateProvider(stripe, { account: selectedAccount, origin: env.BENEFITSI_CORPORATE_WEB_ORIGIN! })
  const reconciler = new CorporateReconciler(provider, rpc, client.storage as unknown as DocumentStorage)
  const worker = new CorporateWorker(provider, rpc, (kind, reference, event) => reconciler.reconcile(kind, reference, event))
  const ownerDeps = { origin: provider.config.origin, proxySecret: env.BENEFITSI_CORPORATE_PROXY_SECRET!, provider, reconciler, owner: async (jwt: string) => originalOwner(jwt, { url: env.NEXT_PUBLIC_SUPABASE_URL!, publishableKey: (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)! }), worker: {
    run: (id: string) => worker.run(id),
    verifySetup: async (session: string) => { const requested = await rpc('request_corporate_setup_verification', { p_setup_session_ref: session }); if (requested.status !== 'requested') return requested; ensure(typeof requested.operation_id === 'string'); return worker.run(requested.operation_id) },
  } }
  const tick = () => corporateTick({ provider, rpc, worker, reconcile: (reference: string) => reconciler.reconcile('invoice', reference, 'contact_sweep'), notify: () => sendCorporateNotification(rpc, corporateEmailConfig(env)) })
  return { ownerDeps, worker, provider, tick, workerSecret: env.BENEFITSI_CORPORATE_WORKER_SECRET!, webhook: { stripe, secret: env.STRIPE_CORPORATE_WEBHOOK_SECRET!, account: selectedAccount, receive: async (event: import('stripe').default.Event) => { provider.deadline = provider.now() + 90000; try { return await reconciler.webhook(event) } finally { provider.deadline = Infinity } } } }
}

export async function corporateTick(deps: { provider: CorporateProvider; rpc: Rpc; worker: { run(): Promise<Row> }; reconcile(reference: string): Promise<Row>; notify(): Promise<number> }) {
  let failed = false, processed = 0, notifications = 0
  try { const materialized = await deps.rpc('materialize_corporate_due_periods', { p_limit: 1 }); ensure(materialized.status === 'ok') } catch { failed = true }
  try {
    const sweep = await deps.rpc('sweep_corporate_billing_contacts', { p_limit: 1 })
    ensure(sweep.status === 'ok' && Array.isArray(sweep.reconcile) && sweep.reconcile.length <= 1)
    for (const reference of sweep.reconcile) {
      deps.provider.deadline = deps.provider.now() + 35000
      try { await deps.reconcile(String(row(reference).invoice_ref)) } finally { deps.provider.deadline = Infinity }
    }
  } catch { failed = true }
  // Even when document/provider reads fail, queued protective pauses must progress.
  try { const result = await deps.worker.run(); processed = result.status === 'idle' ? 0 : 1 } catch { failed = true }
  try { notifications = await deps.notify() } catch { failed = true }
  ensure(!failed, 'corporate_tick_incomplete')
  return { status: 'ok', processed, notifications }
}
