import type Stripe from 'stripe'
import { CorporateProvider } from '@/lib/stripe/corporate-provider'
import { ensure, ref, type Row, type Rpc } from '@/lib/stripe/corporate-contracts'
import { attachProviderOriginal, type DocumentStorage, type ReconciliationContext } from '@/lib/corporate/recurring-documents'
export class CorporateReconciler {
  constructor(readonly provider: CorporateProvider, readonly rpc: Rpc, readonly storage: DocumentStorage | null, readonly fetcher: typeof fetch = fetch) {}
  async context(kind: 'invoice' | 'payment' | 'charge', reference: string) {
    const c = await this.rpc('get_corporate_reconciliation_context', { p_environment: 'test', p_provider_account_ref: this.provider.config.account, p_reference_kind: kind, p_reference: reference })
    return c.status === 'ok' ? c as ReconciliationContext : null
  }
  async reconcile(kind: 'invoice' | 'payment' | 'charge', reference: string, event: string): Promise<Row> {
    let context = await this.context(kind, reference)
    if (!context) return { status: 'unavailable' }
    ensure(context.operation_kind !== 'pause_invoice_recovery', 'invalid_evidence_operation')
    await this.provider.account(context.intent)
    context = await attachProviderOriginal(context, this.provider, this.rpc, this.storage, this.fetcher)
    const evidence = await this.provider.evidence(context.intent, context.document_refs, event)
    return this.rpc('apply_corporate_invoice_evidence', { p_operation_id: context.operation_id, p_evidence: evidence })
  }
  async webhook(event: Stripe.Event) {
    ensure(!event.livemode && (!event.account || event.account === this.provider.config.account), 'invalid_event_environment')
    await this.provider.account()
    const object = event.data.object
    if (object.object === 'checkout.session' && ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      // The RPC only admits the exact currently bound session; no provider customer search.
      return this.rpc('request_corporate_setup_verification', { p_setup_session_ref: object.id })
    }
    if (object.object === 'invoice') return this.reconcile('invoice', object.id, event.id)
    if (object.object === 'invoice_payment') return this.reconcile('payment', object.id, event.id)
    if (object.object === 'charge') return this.reconcile('charge', object.id, event.id)
    if (object.object === 'refund' || object.object === 'dispute') {
      const current = object.object === 'refund' ? await this.provider.stripe.refunds.retrieve(object.id, {}, this.provider.options()) : await this.provider.stripe.disputes.retrieve(object.id, {}, this.provider.options())
      if ('livemode' in current) ensure(current.livemode === false)
      const charge = ref(current.charge); if (charge) return this.reconcile('charge', charge, event.id)
    }
    return { status: 'ignored' }
  }
}
