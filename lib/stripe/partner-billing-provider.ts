import type Stripe from 'stripe';
import { billingState, stripeId, validatePartnerPrice, type PartnerContract, type PreviousBilling } from './partner-billing-contracts';
export type BillingSnapshot = Record<string, unknown> & {
    state: string;
    period_end: string;
    cancel_at_period_end: boolean;
};
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
/** Full provider reads use the installed dahlia item-period / invoice-parent contract. */
export async function readPartnerSubscription(stripe: Stripe, contract: PartnerContract, customerId: string, previous: PreviousBilling | null): Promise<BillingSnapshot> {
    const checkout = contract.checkout_id ? await stripe.checkout.sessions.retrieve(contract.checkout_id) : null;
    if (checkout && (checkout.livemode !== (contract.offer.environment === 'live') || stripeId(checkout.customer) !== customerId || checkout.mode !== 'subscription'))
        throw Error('billing_checkout_mismatch');
    const subscriptionId = contract.subscription_id || stripeId(checkout?.subscription);
    if (!subscriptionId || (contract.state !== 'accepted' && checkout?.status !== 'complete'))
        throw Error('billing_checkout_pending');
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.livemode !== (contract.offer.environment === 'live') || stripeId(subscription.customer) !== customerId || subscription.metadata.benefitsi_billing_provider_id || subscription.items.has_more || subscription.items.data.length !== 1)
        throw Error('billing_subscription_mismatch');
    const item = subscription.items.data[0];
    validatePartnerPrice(item.price, contract.offer, false, false);
    if (item.quantity !== 1 || subscription.discounts.length || subscription.pause_collection || subscription.schedule)
        throw Error('billing_unapproved_subscription_change');
    const trialAccepted = contract.offer.offer_code === 'founder' && !!contract.trial_start && !!contract.trial_end && subscription.trial_end === Date.parse(contract.trial_end) / 1000;
    const start = subscription.status === 'trialing' && trialAccepted ? Date.parse(contract.trial_start!) / 1000 : item.current_period_start;
    const end = subscription.status === 'trialing' && trialAccepted ? subscription.trial_end! : Math.min(item.current_period_end, subscription.cancel_at || Infinity);
    let paidThrough: string | null = null, risk: string | null = null, failureAt: number | undefined, firstPayment: string | null = null;
    const invoiceId = stripeId(subscription.latest_invoice);
    if (invoiceId) {
        const invoice = await stripe.invoices.retrieve(invoiceId);
        failureAt = (invoice.status_transitions?.finalized_at || invoice.created) * 1000;
        if (stripeId(invoice.customer) !== customerId || invoice.livemode !== subscription.livemode || stripeId(invoice.parent?.subscription_details?.subscription) !== subscription.id)
            throw Error('billing_invoice_mismatch');
        if (invoice.status_transitions?.paid_at)
            firstPayment = iso(invoice.status_transitions.paid_at);
        const lines = [];
        for await (const line of stripe.invoices.listLineItems(invoiceId, { limit: 100 }))
            lines.push(line);
        const line = lines.find(l => l.pricing?.price_details?.price === contract.offer.stripe_price_id && l.period.start <= start && l.period.end >= end && l.quantity === 1);
        let verifiedAmount = 0;
        for await (const payment of stripe.invoicePayments.list({ invoice: invoiceId, status: 'paid', limit: 100 })) {
            if (payment.livemode !== subscription.livemode || stripeId(payment.invoice) !== invoiceId)
                throw Error('billing_payment_mismatch');
            let chargeId = stripeId(payment.payment.charge);
            if (payment.payment.payment_intent) {
                const intent = await stripe.paymentIntents.retrieve(stripeId(payment.payment.payment_intent)!);
                if (stripeId(intent.customer) !== customerId || intent.status !== 'succeeded')
                    continue;
                chargeId = stripeId(intent.latest_charge);
            }
            if (!chargeId)
                continue; // No manual/out-of-band payment can silently grant rights.
            const charge = await stripe.charges.retrieve(chargeId);
            if (stripeId(charge.customer) !== customerId || charge.livemode !== subscription.livemode)
                throw Error('billing_charge_mismatch');
            if (charge.disputed || charge.amount_refunded > 0) {
                risk = charge.disputed ? 'disputed' : 'refunded';
                continue;
            }
            if (charge.paid)
                verifiedAmount += payment.amount_paid || 0;
        }
        if (!risk && invoice.status === 'paid' && invoice.amount_due > 0 && verifiedAmount >= invoice.amount_due && line)
            paidThrough = iso(end);
    }
    const state = billingState({ status: risk ? 'unpaid' : subscription.status, paidThrough, periodEnd: end * 1000, periodStart: start * 1000, failureAt, trialAccepted }, previous);
    return { ...state, first_payment_at: firstPayment, contract_id: contract.id, subscription_id: subscription.id, customer_id: customerId, environment: contract.offer.environment, price_id: item.price.id, item_id: item.id, period_start: iso(start), period_end: iso(end), checkout_complete: checkout?.status === 'complete', cancel_at_period_end: subscription.cancel_at_period_end || !!subscription.cancel_at, risk };
}
export async function assertDedicatedCustomer(stripe: Stripe, customerId: string, contracts: PartnerContract[]) {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted)
        throw Error('billing_customer_deleted');
    const known = new Set(contracts.map(c => c.subscription_id).filter(Boolean));
    for (const contract of contracts.filter(c => c.checkout_id && !c.subscription_id)) {
        const checkout = await stripe.checkout.sessions.retrieve(contract.checkout_id!);
        if (stripeId(checkout.customer) !== customerId)
            throw Error('billing_customer_conflict');
        const id = stripeId(checkout.subscription);
        if (id)
            known.add(id);
    }
    for await (const subscription of stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 }))
        if (!known.has(subscription.id))
            throw Error('billing_customer_not_dedicated');
    for await (const invoice of stripe.invoices.list({ customer: customerId, limit: 100 }))
        if (!known.has(stripeId(invoice.parent?.subscription_details?.subscription)))
            throw Error('billing_customer_not_dedicated');
}
