import 'server-only';
import Stripe from 'stripe';
import { createHash, randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requirePartnerBaseUrl } from '@/lib/stripe/config';
import { stripeId, partnerEventCustomer, validatePartnerPrice, validatePartnerPortal, type PartnerContract, type BillingEnvironment, type PreviousBilling } from './partner-billing-contracts';
import { assertDedicatedCustomer, readPartnerSubscription, type BillingSnapshot } from './partner-billing-provider';
type Context = {
    trial_quota_window: {
        period_end: string;
    } | null;
    partner_id: string;
    environment: BillingEnvironment;
    customer_id: string | null;
    contracts: PartnerContract[];
    subscription: PreviousBilling | null;
    configuration: {
        enabled: boolean;
        portal_configuration_id: string | null;
    };
};
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await createAdminClient().rpc(name, args);
    if (error)
        throw Error(error.message);
    return data as T;
}
function transport(environment?: BillingEnvironment) {
    const configured = process.env.BENEFITSI_PARTNER_BILLING_ENVIRONMENT;
    if (process.env.BENEFITSI_PARTNER_BILLING_ENABLED !== 'true' || !['test', 'live'].includes(configured || '') || (environment && environment !== configured))
        throw Error('billing_release_disabled');
    const key = process.env.BENEFITSI_PARTNER_STRIPE_SECRET_KEY?.trim();
    if (!key?.startsWith(configured === 'live' ? 'sk_live_' : 'sk_test_'))
        throw Error('billing_transport_environment_mismatch');
    return new Stripe(key, { apiVersion: '2026-06-24.dahlia', appInfo: { name: 'Benefitsi Partner SaaS', version: '1' } });
}
async function context(partner: string): Promise<Context> {
    const c = await rpc<Context>('partner_billing_context', { p_partner_id: partner });
    if (!c?.configuration.enabled)
        throw Error('billing_release_disabled');
    transport(c.environment);
    return c;
}
async function owner(partner: string, checkout = true) {
    const client = await createClient();
    const { data, error } = await client.rpc('get_partner_billing_readiness', { p_partner_id: partner });
    if (error || !data || (checkout && !data.enabled))
        throw Error(error?.message || data?.reason || 'billing_unavailable');
    return client;
}
async function locked<T>(partner: string, eventId: string, fingerprint: string, work: (c: Context, stripe: Stripe, command: (action: string, data: Record<string, unknown>) => Promise<unknown>) => Promise<T>) {
    const claim = await rpc<{
        duplicate?: boolean;
        fence: number;
    }>('partner_billing_claim', { p_partner_id: partner, p_event_id: eventId, p_fingerprint: fingerprint });
    if (claim.duplicate)
        return { duplicate: true };
    let finalized = false;
    const command = async (action: string, data: Record<string, unknown>) => { const result = await rpc('partner_billing_command', { p_partner_id: partner, p_fence: claim.fence, p_action: action, p_data: data }); if (action === 'batch' || action === 'complete')
        finalized = true; return result; };
    try {
        const c = await context(partner);
        const result = await work(c, transport(c.environment), command);
        if (!finalized)
            await command('complete', { event_id: eventId });
        return result;
    }
    catch (error) {
        await command('failed', { event_id: eventId }).catch(() => { });
        throw error;
    }
}
export async function createPartnerCheckout(partner: string, offer: string, version: number, termsVersion: string) {
    const client = await owner(partner);
    await locked(partner, `customer:${randomUUID()}`, 'customer', async (c, stripe, command) => {
        if (!c.customer_id) {
            const customer = await stripe.customers.create({ metadata: { benefitsi_partner_saas: partner } }, { idempotencyKey: `partner-saas-customer:${c.environment}:${partner}` });
            if (customer.livemode !== (c.environment === 'live'))
                throw Error('billing_customer_environment_mismatch');
            await command('customer', { customer_id: customer.id });
        }
        return { ready: true };
    });
    const { data: id, error } = await client.rpc('prepare_partner_billing_checkout', { p_partner_id: partner, p_offer_code: offer, p_offer_version: version, p_terms_version: termsVersion });
    if (error || !id)
        throw Error(error?.message || 'billing_contract_required');
    return locked(partner, `checkout:${id}:${randomUUID()}`, id, async (c, stripe, command) => {
        const contract = c.contracts.find(x => x.id === id);
        if (!contract)
            throw Error('billing_contract_missing');
        if (!c.customer_id) throw Error('billing_customer_missing');
        await assertDedicatedCustomer(stripe, c.customer_id, c.contracts);
        if (!c.configuration.portal_configuration_id)
            throw Error('billing_portal_unavailable');
        const portal = await stripe.billingPortal.configurations.retrieve(c.configuration.portal_configuration_id);
        validatePartnerPortal(portal, c.configuration.portal_configuration_id, c.environment);
        if (portal.features.subscription_cancel.enabled)
            throw Error('billing_portal_cancellation_requires_scoped_action');
        if (contract.checkout_id) {
            const existing = await stripe.checkout.sessions.retrieve(contract.checkout_id);
            if (stripeId(existing.customer) !== c.customer_id)
                throw Error('billing_checkout_mismatch');
            if (existing.status === 'open' && existing.url)
                return { url: existing.url };
            if (existing.status === 'expired') {
                await command('expire', { contract_id: id, checkout_id: existing.id, provider_status: 'expired' });
                throw Error('billing_checkout_expired_retry');
            }
            throw Error('billing_confirmation_pending');
        }
        // Recover an unbound response through the fenced reconciliation path after expiry.
        if (Date.parse(contract.expires_at) <= Date.now())
            throw Error('billing_checkout_reconciliation_required');
        validatePartnerPrice(await stripe.prices.retrieve(contract.offer.stripe_price_id), contract.offer);
        if (contract.offer.setup_amount)
            validatePartnerPrice(await stripe.prices.retrieve(contract.offer.stripe_setup_price_id!), contract.offer, true);
        if (contract.offer.addon_code) {
            const base = latestContracts(c.contracts).find(x => !x.offer.addon_code && x.subscription_id);
            if (!base)
                throw Error('billing_addon_requires_pro');
            const snapshot = await readPartnerSubscription(stripe, base, c.customer_id, c.subscription);
            if (!['active', 'trialing'].includes(snapshot.state) || snapshot.cancel_at_period_end)
                throw Error('billing_addon_requires_pro');
        }
        const baseUrl = requirePartnerBaseUrl();
        const checkout = await stripe.checkout.sessions.create({ mode: 'subscription', customer: c.customer_id,
            line_items: [{ price: contract.offer.stripe_price_id, quantity: 1 }, ...(contract.offer.setup_amount ? [{ price: contract.offer.stripe_setup_price_id!, quantity: 1 }] : [])],
            client_reference_id: id, metadata: { benefitsi_partner_contract: id }, subscription_data: { metadata: { benefitsi_partner_contract: id }, ...(contract.offer.addon_code && c.trial_quota_window ? { billing_cycle_anchor: Math.floor(Date.parse(c.trial_quota_window.period_end) / 1000), proration_behavior: 'create_prorations' as const } : {}), ...(contract.trial_end ? { trial_end: Math.floor(Date.parse(contract.trial_end) / 1000), trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } } } : {}) },
            payment_method_collection: 'always', expires_at: Math.floor(Date.parse(contract.expires_at) / 1000),
            success_url: `${baseUrl}/partner/billing?partner=${encodeURIComponent(partner)}`, cancel_url: `${baseUrl}/partner/billing?partner=${encodeURIComponent(partner)}`,
        }, { idempotencyKey: `partner-saas-checkout:${id}` });
        if (checkout.livemode !== (c.environment === 'live') || !checkout.url || stripeId(checkout.customer) !== c.customer_id)
            throw Error('billing_checkout_mismatch');
        await command('checkout', { contract_id: id, checkout_id: checkout.id });
        return { url: checkout.url };
    });
}
function latestContracts(contracts: PartnerContract[]) {
    const newest = new Map<string, PartnerContract>();
    for (const contract of contracts) {
        const key = contract.offer.addon_code || 'plan';
        const previous = newest.get(key);
        if (!previous || contract.id === previous.id || Date.parse(contract.created_at) > Date.parse(previous.created_at))
            newest.set(key, contract);
    }
    return [...newest.values()];
}
async function reconcile(c: Context, stripe: Stripe, command: (action: string, data: Record<string, unknown>) => Promise<unknown>, eventId: string) {
    if (!c.customer_id)
        return { pending: true };
    const commands: {
        action: string;
        data: Record<string, unknown>;
    }[] = [], snapshots: {
        contract: PartnerContract;
        data: BillingSnapshot;
    }[] = [];
    for (const contract of latestContracts(c.contracts)) {
        if (!contract.checkout_id && !contract.subscription_id) {
            // Recover a lost create response with the dedicated customer plus persisted intent identity.
            const matches = [];
            for await (const session of stripe.checkout.sessions.list({ customer: c.customer_id, limit: 100 }))
                if (session.client_reference_id === contract.id)
                    matches.push(session);
            if (matches.length > 1)
                throw Error('billing_checkout_identity_conflict');
            if (matches.length === 1) {
                contract.checkout_id = matches[0].id;
                await command('checkout', { contract_id: contract.id, checkout_id: contract.checkout_id });
            }
            else if (Date.parse(contract.expires_at) <= Date.now()) {
                commands.push({ action: 'expire', data: { contract_id: contract.id, checkout_id: null, provider_status: 'expired' } });
                continue;
            }
            else
                continue;
        }
        if (contract.state === 'pending') {
            const checkout = await stripe.checkout.sessions.retrieve(contract.checkout_id!);
            if (stripeId(checkout.customer) !== c.customer_id || checkout.livemode !== (c.environment === 'live'))
                throw Error('billing_checkout_mismatch');
            if (checkout.status === 'expired') {
                commands.push({ action: 'expire', data: { contract_id: contract.id, checkout_id: checkout.id, provider_status: 'expired' } });
                continue;
            }
            if (checkout.status !== 'complete')
                continue;
        }
        const data = await readPartnerSubscription(stripe, contract, c.customer_id, contract.offer.addon_code ? null : c.subscription);
        snapshots.push({ contract, data });
    }
    const base = snapshots.find(s => !s.contract.offer.addon_code)?.data;
    const baseLapsed = base && (!['active', 'trialing', 'past_due'].includes(base.state) || (base.state === 'past_due' && (!base.past_due_since || Date.parse(String(base.past_due_since)) + 7 * 86400000 <= Date.now())));
    for (const s of snapshots) {
        if (s.contract.offer.addon_code && base && s.data.state !== 'canceled' && (baseLapsed || base.cancel_at_period_end)) {
            const subId = String(s.data.subscription_id);
            if (baseLapsed)
                await stripe.subscriptions.cancel(subId, { invoice_now: false, prorate: false });
            else
                await stripe.subscriptions.update(subId, { cancel_at: Math.floor(Math.min(Date.parse(base.period_end), Date.parse(s.data.period_end)) / 1000), proration_behavior: 'none' }, { idempotencyKey: `partner-base-cancel:${subId}:${base.period_end}` });
            s.data = await readPartnerSubscription(stripe, s.contract, c.customer_id, null);
        }
        commands.push({ action: 'apply', data: { ...s.data, event_id: eventId } });
    }
    // All commercial rows and event completion commit in a single DB transaction.
    await command('batch', { commands, event_id: eventId });
    return { received: true };
}
export async function reconcilePartnerBilling(partner: string, eventId = `reconcile:${randomUUID()}`, fingerprint = eventId) {
    return locked(partner, eventId, fingerprint, (c, stripe, command) => reconcile(c, stripe, command, eventId));
}
export async function handlePartnerBillingWebhook(payload: string, signature: string) {
    const stripe = transport(), secret = process.env.BENEFITSI_PARTNER_BILLING_WEBHOOK_SECRET?.trim();
    if (!secret?.startsWith('whsec_'))
        throw Error('billing_signature_configuration_missing');
    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(payload, signature, secret);
    }
    catch {
        throw Error('billing_invalid_signature');
    }
    if (event.livemode !== (process.env.BENEFITSI_PARTNER_BILLING_ENVIRONMENT === 'live') || event.account)
        throw Error('billing_event_environment_mismatch');
    if (!['checkout.session.completed', 'checkout.session.expired', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed', 'customer.subscription.trial_will_end', 'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'].includes(event.type))
        return { ignored: true };
    let customer = partnerEventCustomer(event);
    if (event.type.startsWith('charge.dispute.')) {
        const dispute = event.data.object as Stripe.Dispute;
        const charge = await stripe.charges.retrieve(stripeId(dispute.charge)!);
        customer = stripeId(charge.customer);
    }
    if (!customer)
        return { ignored: true };
    const c = await rpc<Context | null>('partner_billing_context', { p_customer_id: customer });
    if (!c)
        return { ignored: true };
    return reconcilePartnerBilling(c.partner_id, event.id, createHash('sha256').update(payload).digest('hex'));
}
export async function createPartnerPortal(partner: string) {
    await owner(partner, false);
    return locked(partner, `portal:${randomUUID()}`, 'portal', async (c, stripe) => {
        if (!c.customer_id || !c.configuration.portal_configuration_id)
            throw Error('billing_portal_unavailable');
        await assertDedicatedCustomer(stripe, c.customer_id, c.contracts);
        const config = await stripe.billingPortal.configurations.retrieve(c.configuration.portal_configuration_id);
        validatePartnerPortal(config, c.configuration.portal_configuration_id, c.environment);
        if (config.features.subscription_cancel.enabled)
            throw Error('billing_portal_cancellation_requires_scoped_action');
        return { url: (await stripe.billingPortal.sessions.create({ customer: c.customer_id, configuration: config.id, return_url: `${requirePartnerBaseUrl()}/partner/billing?partner=${encodeURIComponent(partner)}` })).url };
    });
}
export async function cancelPartnerSubscription(partner: string, offerCode: string) {
    await owner(partner, false);
    const eventId = `cancel:${randomUUID()}`;
    return locked(partner, eventId, 'owner-cancel', async (c, stripe, command) => {
        if (!c.customer_id)
            throw Error('billing_customer_missing');
        const contract = latestContracts(c.contracts).find(x => x.offer.offer_code === offerCode);
        if (!contract?.subscription_id)
            throw Error('billing_subscription_missing');
        await readPartnerSubscription(stripe, contract, c.customer_id, c.subscription);
        await stripe.subscriptions.update(contract.subscription_id, { cancel_at_period_end: true, proration_behavior: 'none' }, { idempotencyKey: `partner-cancel:${contract.id}` });
        return reconcile(c, stripe, command, eventId);
    });
}
export async function reconcileAllPartnerBilling() {
    const targets = await rpc<string[]>('partner_billing_reconcile_targets');
    const failures: string[] = [];
    for (const partner of targets) {
        try {
            await reconcilePartnerBilling(partner);
        }
        catch {
            failures.push(partner);
        }
    }
    return { checked: targets.length, failed: failures.length };
}
