import 'server-only';
import Stripe from 'stripe';
import { createHash, randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requirePartnerBaseUrl } from '@/lib/stripe/config';
import { stripeId, partnerEventCustomer, validatePartnerPrice, validatePartnerPortal, type PartnerContract, type BillingEnvironment, type PreviousBilling } from './partner-billing-contracts';
import { isFounder, ensureFounderSubscription, founderTrialCancellation, validateFounderSchedule } from './partner-founder';
import { assertDedicatedCustomer, readPartnerSubscription, type BillingSnapshot } from './partner-billing-provider';
type Context = {
    trial_quota_window: {
        period_end: string;
    } | null;
    partner_id: string;
    environment: BillingEnvironment;
    customer_id: string | null;
    contracts: PartnerContract[];
    closed_founders?: PartnerContract[];
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
    return new Stripe(key, { apiVersion: '2026-06-24.dahlia', timeout: 30000, maxNetworkRetries: 0, appInfo: { name: 'Benefitsi Partner SaaS', version: '1' } });
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
type Command = (action: string, data: Record<string, unknown>) => Promise<unknown>;
type Mutation = { id: string; contract_id: string; subscription_id: string; operation: 'cancel' | 'update' | 'schedule_trial_cancel' | null; params: Stripe.SubscriptionUpdateParams & { schedule_id?: string; update?: Stripe.SubscriptionScheduleUpdateParams } | null; idempotency_key: string };
async function executeMutation(c: Context, stripe: Stripe, command: Command, mutation: Mutation) {
    const contract = c.contracts.find(x => x.id === mutation.contract_id && x.subscription_id === mutation.subscription_id);
    if (!contract || !c.customer_id) throw Error('billing_mutation_target_unknown');
    if (!mutation.operation) {
        // A timely Founder receipt remains actionable even before the first provider read.
        if (isFounder(contract) && contract.cancellation_at) return cancelFounder(c, stripe, command, contract, mutation);
        await command('mutation_finish', { id: mutation.id, outcome: 'not_dispatched' });
        return;
    }
    if (mutation.operation === 'schedule_trial_cancel') {
        const schedule = validateFounderSchedule(await stripe.subscriptionSchedules.retrieve(mutation.params!.schedule_id!), contract, c.customer_id);
        const end = Math.floor(Date.parse(contract.cancellation_at!) / 1000);
        if (Date.now() / 1000 >= end) {
            // Never rewrite a phase into the past. Preserve the exact saved order and
            // record uncertainty before dispatch so a lost response keeps Admin review.
            await command('founder_late_exit_review', { contract_id: contract.id });
            if (['active', 'not_started'].includes(schedule.status)) {
                const result = validateFounderSchedule(await stripe.subscriptionSchedules.cancel(schedule.id, { invoice_now: false, prorate: false }, { idempotencyKey: `${mutation.idempotency_key}:overdue-schedule` }), contract, c.customer_id);
                if (result.status !== 'canceled') throw Error('founder_cancellation_unconfirmed');
            } else if (!['canceled', 'completed', 'released'].includes(schedule.status)) throw Error('founder_cancellation_unconfirmed');
        } else if (schedule.status === 'active' && (schedule.end_behavior !== 'cancel' || schedule.phases[0].end_date !== end)) {
            const result = await stripe.subscriptionSchedules.update(schedule.id, mutation.params!.update!, { idempotencyKey: mutation.idempotency_key });
            validateFounderSchedule(result, contract, c.customer_id);
            if (result.end_behavior !== 'cancel' || result.phases[0]?.end_date !== end || result.phases[0]?.trial_end !== end) throw Error('founder_cancellation_unconfirmed');
        } else if (!['active', 'canceled', 'completed'].includes(schedule.status) && !(schedule.status === 'released' && Date.now() / 1000 >= end)) throw Error('founder_cancellation_unconfirmed');
        const subscription = await stripe.subscriptions.retrieve(mutation.subscription_id);
        if (subscription.id !== mutation.subscription_id || stripeId(subscription.customer) !== c.customer_id || subscription.livemode !== (c.environment === 'live')) throw Error('billing_mutation_target_mismatch');
        if (Date.now() / 1000 >= end && subscription.status !== 'canceled') {
            // Timely trial exit persists even if the provider crossed the paid boundary first.
            // Stop future renewal of this exact known subscription; invoice review is separate.
            const canceled = await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false }, { idempotencyKey: `${mutation.idempotency_key}:late-exit` });
            if (canceled.id !== mutation.subscription_id || canceled.status !== 'canceled') throw Error('founder_cancellation_unconfirmed');
        }
        await command('mutation_finish', { id: mutation.id, outcome: 'confirmed' });
        return;
    }
    const sub = await stripe.subscriptions.retrieve(mutation.subscription_id);
    if (stripeId(sub.customer) !== c.customer_id || sub.livemode !== (c.environment === 'live')) throw Error('billing_mutation_target_mismatch');
    const params = mutation.params!;
    // These immutable operations only shorten renewal; no resume/update from client input.
    const matches = (value: Stripe.Subscription) => value.status === 'canceled' || (mutation.operation === 'update' && (params.cancel_at_period_end === true ? value.cancel_at_period_end : value.cancel_at === params.cancel_at));
    let result = sub;
    if (!matches(sub)) result = mutation.operation === 'cancel'
        ? await stripe.subscriptions.cancel(mutation.subscription_id, { invoice_now: false, prorate: false }, { idempotencyKey: mutation.idempotency_key })
        : await stripe.subscriptions.update(mutation.subscription_id, params, { idempotencyKey: mutation.idempotency_key });
    if (result.id !== mutation.subscription_id || !matches(result)) throw Error('billing_mutation_outcome_unknown');
    await command('mutation_finish', { id: mutation.id, outcome: 'confirmed' });
}
async function beginMutation(command: Command, contract: PartnerContract, reason: string) {
    return await command('mutation_begin', { contract_id: contract.id, subscription_id: contract.subscription_id, reason }) as Mutation;
}
async function dispatchMutation(c: Context, stripe: Stripe, command: Command, mutation: Mutation, operation: 'cancel' | 'update' | 'schedule_trial_cancel', params: Record<string, unknown>) {
    // SQL checks the current unexpired fence immediately before authorizing immutable dispatch.
    const saved = await command('mutation_plan', { id: mutation.id, operation, params }) as Mutation;
    await executeMutation(c, stripe, command, saved);
}
async function locked<T>(partner: string, eventId: string, fingerprint: string, work: (c: Context, stripe: Stripe, command: (action: string, data: Record<string, unknown>) => Promise<unknown>) => Promise<T>) {
    const claim = await rpc<{
        duplicate?: boolean;
        fence: number;
        recovery?: Mutation;
    }>('partner_billing_claim', { p_partner_id: partner, p_event_id: eventId, p_fingerprint: fingerprint });
    if (claim.duplicate)
        return { duplicate: true };
    let finalized = false;
    const command = async (action: string, data: Record<string, unknown>) => { const result = await rpc('partner_billing_command', { p_partner_id: partner, p_fence: claim.fence, p_action: action, p_data: data }); if (action === 'batch' || action === 'complete')
        finalized = true; return result; };
    try {
        const c = await context(partner);
        const stripe = transport(c.environment);
        if (claim.recovery) await executeMutation(c, stripe, command, claim.recovery);
        const result = await work(c, stripe, command);
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
        const checkout = await stripe.checkout.sessions.create({ customer: c.customer_id,
            ...(isFounder(contract) ? { mode: 'setup' as const, currency: 'eur', setup_intent_data: { metadata: { benefitsi_partner_contract: id } } } : { mode: 'subscription' as const,
            line_items: [{ price: contract.offer.stripe_price_id, quantity: 1 }, ...(contract.offer.setup_amount ? [{ price: contract.offer.stripe_setup_price_id!, quantity: 1 }] : [])],
            subscription_data: { metadata: { benefitsi_partner_contract: id }, ...(contract.offer.addon_code && c.trial_quota_window ? { billing_cycle_anchor: Math.floor(Date.parse(c.trial_quota_window.period_end) / 1000), proration_behavior: 'create_prorations' as const } : {}) },
            payment_method_collection: 'always' as const }),
            client_reference_id: id, metadata: { benefitsi_partner_contract: id }, expires_at: Math.floor(Date.parse(contract.expires_at) / 1000),
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
function baseLapsed(base: BillingSnapshot) {
    return !['active', 'trialing', 'past_due'].includes(base.state) || (base.state === 'past_due' && (!base.past_due_since || Date.parse(String(base.past_due_since)) + 7 * 86400000 <= Date.now()));
}
async function reconcile(c: Context, stripe: Stripe, command: (action: string, data: Record<string, unknown>) => Promise<unknown>, eventId: string) {
    if (!c.customer_id)
        return { pending: true };
    for (const contract of c.closed_founders || []) {
        const evidence = await closedFounderObjects(stripe, c.customer_id, contract);
        if (evidence.objects.length) await command('founder_closed_object_review', { contract_id: contract.id, ...evidence });
    }
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
        if (isFounder(contract) && !await ensureFounderSubscription(stripe, contract, c.customer_id, command)) continue;
        if (isFounder(contract) && contract.cancellation_at) await cancelFounder(c, stripe, command, contract);
        const data = await readPartnerSubscription(stripe, contract, c.customer_id, contract.offer.addon_code ? null : c.subscription);
        if (!contract.subscription_id) {
            await command('bind_subscription', { ...data, checkout_id: contract.checkout_id });
            contract.subscription_id = String(data.subscription_id);
        }
        snapshots.push({ contract, data });
    }
    const baseEntry = snapshots.find(s => !s.contract.offer.addon_code);
    for (const s of snapshots) {
        const oldBase = baseEntry?.data;
        if (s.contract.offer.addon_code && oldBase && s.data.state !== 'canceled' && (baseLapsed(oldBase) || oldBase.cancel_at_period_end)) {
            const mutation = await beginMutation(command, s.contract, 'base_renewal_ended');
            // The durable barrier excludes newer snapshots before this fresh authoritative read.
            baseEntry!.data = await readPartnerSubscription(stripe, baseEntry!.contract, c.customer_id, c.subscription);
            const base = baseEntry!.data;
            s.data = await readPartnerSubscription(stripe, s.contract, c.customer_id, null);
            if (s.data.state === 'canceled' || (!baseLapsed(base) && !base.cancel_at_period_end))
                await command('mutation_finish', { id: mutation.id, outcome: 'not_dispatched' });
            else if (baseLapsed(base))
                await dispatchMutation(c, stripe, command, mutation, 'cancel', { invoice_now: false, prorate: false });
            else
                await dispatchMutation(c, stripe, command, mutation, 'update', { cancel_at: Math.floor(Math.min(Date.parse(base.period_end), Date.parse(s.data.period_end)) / 1000), proration_behavior: 'none' });
            s.data = await readPartnerSubscription(stripe, s.contract, c.customer_id, null);
        }
    }
    for (const s of snapshots) commands.push({ action: 'apply', data: { ...s.data, event_id: eventId } });
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
    if (!['subscription_schedule.created', 'subscription_schedule.updated', 'subscription_schedule.canceled', 'subscription_schedule.completed', 'subscription_schedule.released', 'checkout.session.completed', 'checkout.session.expired', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed', 'customer.subscription.trial_will_end', 'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'].includes(event.type))
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
async function cancelFounder(c: Context, stripe: Stripe, command: Command, contract: PartnerContract, prepared?: Mutation): Promise<void> {
    const mutation = prepared || await beginMutation(command, contract, 'owner_cancel');
    const snapshot = await readPartnerSubscription(stripe, contract, c.customer_id!, c.subscription);
    Object.assign(contract, await command('founder_cancel_terms', { contract_id: contract.id, period_end: snapshot.period_end }));
    if (snapshot.provider_status === 'canceled') { await command('mutation_finish', { id: mutation.id, outcome: 'not_dispatched' }); return; }
    const end = Math.floor(Date.parse(contract.cancellation_at!) / 1000);
    if (end <= Math.floor(Date.parse(contract.trial_end!) / 1000)) {
        const schedule = await stripe.subscriptionSchedules.retrieve(contract.schedule_id!);
        const update = founderTrialCancellation(schedule, contract, c.customer_id!);
        await dispatchMutation(c, stripe, command, mutation, 'schedule_trial_cancel', { schedule_id: schedule.id, update });
    } else await dispatchMutation(c, stripe, command, mutation, 'update', { cancel_at: end, proration_behavior: 'none' });
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
        if (isFounder(contract)) {
            await cancelFounder(c, stripe, command, contract);
            return reconcile(c, stripe, command, eventId);
        }
        const mutation = await beginMutation(command, contract, 'owner_cancel');
        await readPartnerSubscription(stripe, contract, c.customer_id, c.subscription);
        await dispatchMutation(c, stripe, command, mutation, 'update', { cancel_at_period_end: true, proration_behavior: 'none' });
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

export async function recoverPartnerBilling(partner: string) {
    await owner(partner, false);
    return reconcilePartnerBilling(partner);
}

/** Called only by the Admin-guarded review action; no provider mutations. */
export async function verifyFailedFounderActivation(partner: string) {
    return locked(partner, `activation-review:${randomUUID()}`, 'activation-review', async (c, stripe, command) => {
        const contract = latestContracts(c.contracts).find(x => isFounder(x) && x.state === 'pending');
        if (!contract || contract.schedule_id || contract.subscription_id || contract.activated_at || !contract.trial_start || Date.parse(contract.trial_start) >= Date.now() || !c.customer_id) throw Error('founder_activation_not_unbound');
        for await (const schedule of stripe.subscriptionSchedules.list({ customer: c.customer_id, limit: 100 }))
            if (schedule.metadata?.benefitsi_partner_contract === contract.id) throw Error('founder_schedule_found_reconcile_required');
        for await (const subscription of stripe.subscriptions.list({ customer: c.customer_id, status: 'all', limit: 100 }))
            if (subscription.metadata?.benefitsi_partner_contract === contract.id) throw Error('founder_subscription_found_reconcile_required');
        await command('founder_activation_absence', { contract_id: contract.id });
    });
}

async function closedFounderObjects(stripe: Stripe, customer: string, contract: PartnerContract) {
    const objects: string[] = [], subscriptionIds = new Set<string>(); let active = false;
    for await (const schedule of stripe.subscriptionSchedules.list({ customer, limit: 100 })) {
        if (schedule.metadata?.benefitsi_partner_contract !== contract.id) continue;
        if (stripeId(schedule.customer) !== customer || schedule.livemode !== (contract.offer.environment === 'live')) throw Error('founder_closed_object_mismatch');
        objects.push(schedule.id);active ||= ['not_started','active'].includes(schedule.status);
        const id = stripeId(schedule.subscription) || stripeId(schedule.released_subscription); if (id) subscriptionIds.add(id);
    }
    for await (const subscription of stripe.subscriptions.list({ customer, status: 'all', limit: 100 }))
        if (subscription.metadata?.benefitsi_partner_contract === contract.id) subscriptionIds.add(subscription.id);
    for (const id of subscriptionIds) {
        const subscription = await stripe.subscriptions.retrieve(id);
        if (stripeId(subscription.customer) !== customer || subscription.livemode !== (contract.offer.environment === 'live')) throw Error('founder_closed_object_mismatch');
        objects.push(subscription.id);active ||= subscription.status !== 'canceled';
    }
    return { objects, active_objects: active };
}
/** Admin-reviewed provider cancellation is verified before the audit review can close. */
export async function verifyClosedFounderReview(partner: string) {
    return locked(partner, `closed-founder-review:${randomUUID()}`, 'closed-founder-review', async (c, stripe, command) => {
        if (!c.customer_id || !c.closed_founders?.length) throw Error('closed_founder_contract_required');
        for (const contract of c.closed_founders) {
            const evidence = await closedFounderObjects(stripe, c.customer_id, contract);
            if (evidence.active_objects) throw Error('provider_cancellation_unconfirmed');
            await command('founder_closed_objects_checked', { contract_id: contract.id });
        }
    });
}
