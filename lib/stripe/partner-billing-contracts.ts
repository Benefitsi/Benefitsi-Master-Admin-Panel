import type Stripe from 'stripe';
export type BillingEnvironment = 'test' | 'live';
export type PartnerOffer = {
    offer_code: string;
    version: number;
    environment: BillingEnvironment;
    stripe_price_id: string;
    stripe_setup_price_id: string | null;
    unit_amount: number;
    setup_amount: number;
    currency: string;
    billing_interval: string;
    tax_behavior: string;
    addon_code: string | null;
};
export type PartnerContract = {
    id: string;
    created_at: string;
    partner_id: string;
    offer: PartnerOffer;
    state: string;
    checkout_id: string | null;
    subscription_id: string | null;
    expires_at: string;
    trial_start: string | null;
    trial_end: string | null;
    agreement: Record<string, string>;
};
export type PreviousBilling = {
    state: string;
    paid_through: string | null;
    past_due_since: string | null;
};
export function validatePartnerPrice(price: Stripe.Price, offer: PartnerOffer, setup = false, requireActive = true) {
    if (price.id !== (setup ? offer.stripe_setup_price_id : offer.stripe_price_id) || (requireActive && !price.active) || price.livemode !== (offer.environment === 'live') || price.currency !== offer.currency || price.unit_amount !== (setup ? offer.setup_amount : offer.unit_amount) || price.tax_behavior !== offer.tax_behavior ||
        (setup ? price.type !== 'one_time' : price.type !== 'recurring' || price.recurring?.interval !== offer.billing_interval || price.recurring?.interval_count !== 1 || price.recurring?.usage_type !== 'licensed'))
        throw Error('billing_price_mismatch');
    return price;
}
export function validatePartnerPortal(config: Stripe.BillingPortal.Configuration, id: string, env: BillingEnvironment) {
    if (config.id !== id || !config.active || config.livemode !== (env === 'live') || config.features.subscription_update.enabled ||
        (config.features.subscription_cancel.enabled && config.features.subscription_cancel.mode !== 'at_period_end') || !config.features.invoice_history.enabled || !config.features.payment_method_update.enabled)
        throw Error('billing_portal_policy_mismatch');
}
export function billingState(current: {
    status: string;
    paidThrough: string | null;
    periodEnd: number;
    periodStart?: number;
    failureAt?: number;
    trialAccepted: boolean;
}, previous: PreviousBilling | null, now = Date.now()): PreviousBilling {
    const paid = current.paidThrough && Date.parse(current.paidThrough) >= current.periodEnd;
    if (current.status === 'active' && paid && current.periodEnd > now)
        return { state: 'active', paid_through: current.paidThrough, past_due_since: null };
    if (current.status === 'trialing' && current.trialAccepted && current.periodEnd > now)
        return { state: 'trialing', paid_through: null, past_due_since: null };
    const existing = previous?.paid_through && ['active', 'past_due'].includes(previous.state) && (previous.past_due_since || !current.periodStart || Date.parse(previous.paid_through) >= current.periodStart);
    if (current.status === 'past_due' && existing)
        return { state: 'past_due', paid_through: previous!.paid_through, past_due_since: previous!.past_due_since || new Date(Math.min(now, current.failureAt || now)).toISOString() };
    return { state: current.status === 'incomplete_expired' ? 'canceled' : ['canceled', 'unpaid', 'paused'].includes(current.status) ? current.status : 'incomplete', paid_through: previous?.paid_through || null, past_due_since: previous?.past_due_since || null };
}
export async function runFenced<T, R>(store: {
    claim(): Promise<number>;
    apply(fence: number, snapshot: T): Promise<R>;
    fail(fence: number): Promise<unknown>;
}, read: () => Promise<T>): Promise<R> {
    const fence = await store.claim();
    try {
        return await store.apply(fence, await read());
    }
    catch (error) {
        await store.fail(fence).catch(() => { });
        throw error;
    }
}
export function stripeId(value: string | {
    id: string;
} | null | undefined) { return typeof value === 'string' ? value : value?.id || null; }
export function partnerEventCustomer(event: Stripe.Event) {
    if (event.account)
        return null;
    const object = event.data.object as unknown as {
        customer?: string | {
            id: string;
        };
        metadata?: Record<string, string>;
    };
    if (object.metadata?.benefitsi_billing_provider_id)
        return null;
    return stripeId(object.customer);
}
