import type Stripe from 'stripe';
import { stripeId, type PartnerContract } from './partner-billing-contracts';
export const isFounder = (contract: PartnerContract) => ['founder', 'founder_annual'].includes(contract.offer.offer_code);
const seconds = (value: string | null | undefined) => Math.floor(Date.parse(value || '') / 1000);
export function founderScheduleParams(contract: PartnerContract, customer: string): Stripe.SubscriptionScheduleCreateParams {
    if (!contract.trial_start || !contract.trial_end || !contract.payment_method_id) throw Error('founder_activation_plan_required');
    return { customer, start_date: seconds(contract.trial_start), end_behavior: 'release', billing_mode: { type: 'flexible' },
        metadata: { benefitsi_partner_contract: contract.id },
        default_settings: { default_payment_method: contract.payment_method_id, collection_method: 'charge_automatically' },
        phases: [{ items: [{ price: contract.offer.stripe_price_id, quantity: 1 }], end_date: seconds(contract.trial_end), trial_end: seconds(contract.trial_end), proration_behavior: 'none', metadata: { benefitsi_partner_contract: contract.id } }] };
}
export function validateFounderSchedule(schedule: Stripe.SubscriptionSchedule, contract: PartnerContract, customer: string) {
    const phase = schedule.phases[0];
    const allowedEnd = contract.cancellation_at && seconds(contract.cancellation_at) <= seconds(contract.trial_end) ? seconds(contract.cancellation_at) : seconds(contract.trial_end);
    if (schedule.id !== contract.schedule_id || stripeId(schedule.customer) !== customer || schedule.livemode !== (contract.offer.environment === 'live') || schedule.metadata?.benefitsi_partner_contract !== contract.id || schedule.phases.length !== 1 || !phase || phase.start_date !== seconds(contract.trial_start) || ![seconds(contract.trial_end), allowedEnd].includes(phase.end_date) || phase.trial_end !== phase.end_date || !['release', 'cancel'].includes(schedule.end_behavior) || (schedule.end_behavior === 'cancel' && phase.end_date !== allowedEnd)) throw Error('founder_schedule_mismatch');
    if ((phase.currency && phase.currency !== contract.offer.currency) || (phase.billing_cycle_anchor && phase.billing_cycle_anchor !== 'automatic') || phase.proration_behavior !== 'none' || phase.automatic_tax?.liability?.type === 'account' || phase.invoice_settings?.issuer?.type === 'account' || schedule.default_settings.automatic_tax?.liability?.type === 'account' || schedule.default_settings.invoice_settings?.issuer?.type === 'account' || (schedule.billing_mode && schedule.billing_mode.type !== 'flexible')) throw Error('founder_schedule_unapproved_change');
    const item = phase.items[0];
    if (phase.items.length !== 1 || stripeId(item.price) !== contract.offer.stripe_price_id || item.quantity !== 1 || phase.discounts?.length || phase.add_invoice_items?.length || phase.default_tax_rates?.length || phase.application_fee_percent || phase.transfer_data || phase.on_behalf_of || phase.billing_thresholds || phase.invoice_settings?.days_until_due || phase.collection_method === 'send_invoice' || (phase.default_payment_method && stripeId(phase.default_payment_method) !== contract.payment_method_id) || item.discounts?.length || item.tax_rates?.length || item.billing_thresholds) throw Error('founder_schedule_unapproved_change');
    if (schedule.default_settings.collection_method !== 'charge_automatically' || stripeId(schedule.default_settings.default_payment_method) !== contract.payment_method_id || schedule.default_settings.transfer_data || schedule.default_settings.on_behalf_of || schedule.default_settings.application_fee_percent) throw Error('founder_schedule_unapproved_change');
    return schedule;
}
export function founderTrialCancellation(schedule: Stripe.SubscriptionSchedule, contract: PartnerContract, customer: string): Stripe.SubscriptionScheduleUpdateParams {
    validateFounderSchedule(schedule, contract, customer);
    const end = seconds(contract.cancellation_at);
    if (!Number.isFinite(end) || end > seconds(contract.trial_end) || end <= seconds(contract.trial_start)) throw Error('founder_cancellation_date_required');
    // Every supported current phase value is copied; unsupported changes above fail closed.
    const phase = schedule.phases[0];
    return { end_behavior: 'cancel', proration_behavior: 'none', phases: [{ start_date: phase.start_date, end_date: end, trial_end: end,
        items: [{ price: contract.offer.stripe_price_id, quantity: 1, metadata: phase.items[0].metadata || {} }],
        metadata: phase.metadata || {}, proration_behavior: 'none', currency: phase.currency || contract.offer.currency,
        add_invoice_items: [], discounts: [], default_tax_rates: [],
        ...(phase.invoice_settings ? { invoice_settings: { ...(phase.invoice_settings.account_tax_ids ? { account_tax_ids: phase.invoice_settings.account_tax_ids.map(x => stripeId(x)!) } : {}), ...(phase.invoice_settings.issuer ? { issuer: { type: 'self' as const } } : {}) } } : {}),
        ...(phase.default_payment_method ? { default_payment_method: stripeId(phase.default_payment_method)! } : {}),
        ...(phase.collection_method ? { collection_method: phase.collection_method } : {}),
        ...(phase.billing_cycle_anchor ? { billing_cycle_anchor: phase.billing_cycle_anchor } : {}),
        ...(phase.automatic_tax ? { automatic_tax: { enabled: phase.automatic_tax.enabled, ...(phase.automatic_tax.liability ? { liability: { type: 'self' as const } } : {}) } } : {}),
        ...(phase.description ? { description: phase.description } : {}),
    }] };
}
export async function ensureFounderSubscription(stripe: Stripe, contract: PartnerContract, customer: string, command: (action: string, data: Record<string, unknown>) => Promise<unknown>) {
    if (!contract.checkout_id) return false;
    const checkout = await stripe.checkout.sessions.retrieve(contract.checkout_id);
    if (checkout.mode !== 'setup' || checkout.status !== 'complete' || stripeId(checkout.customer) !== customer || checkout.livemode !== (contract.offer.environment === 'live')) return false;
    if (!contract.setup_intent_id) {
        const setupId = stripeId(checkout.setup_intent);
        if (!setupId) throw Error('founder_setup_required');
        const setup = await stripe.setupIntents.retrieve(setupId);
        if (setup.status !== 'succeeded' || stripeId(setup.customer) !== customer || setup.livemode !== (contract.offer.environment === 'live') || !stripeId(setup.payment_method)) throw Error('founder_setup_unconfirmed');
        Object.assign(contract, await command('founder_schedule_prepare', { contract_id: contract.id, checkout_id: checkout.id, setup_intent_id: setup.id, payment_method_id: stripeId(setup.payment_method) }));
    }
    if (!contract.schedule_id) {
        const matches: Stripe.SubscriptionSchedule[] = [];
        for await (const schedule of stripe.subscriptionSchedules.list({ customer, limit: 100 })) if (schedule.metadata?.benefitsi_partner_contract === contract.id) matches.push(schedule);
        if (matches.length > 1) throw Error('founder_schedule_identity_conflict');
        let schedule = matches[0];
        if (!schedule) {
            // Never backdate or move an already saved activation after a delayed worker/retry.
            if (seconds(contract.trial_start) <= Date.now() / 1000) throw Error('founder_activation_recovery_required');
            schedule = await stripe.subscriptionSchedules.create(founderScheduleParams(contract, customer), { idempotencyKey: `partner-founder-activation:${contract.id}` });
        }
        Object.assign(contract, await command('founder_schedule_bind', { contract_id: contract.id, schedule_id: schedule.id }));
    }
    const schedule = validateFounderSchedule(await stripe.subscriptionSchedules.retrieve(contract.schedule_id!), contract, customer);
    const id = stripeId(schedule.subscription) || stripeId(schedule.released_subscription) || contract.subscription_id;
    if (!id) return false;
    const subscription = await stripe.subscriptions.retrieve(id);
    const originalEnd = seconds(contract.trial_end);
    const expectedEnd = contract.cancellation_at && seconds(contract.cancellation_at) <= originalEnd ? seconds(contract.cancellation_at) : originalEnd;
    if (subscription.trial_start !== seconds(contract.trial_start) || ![originalEnd, expectedEnd].includes(subscription.trial_end || 0) || stripeId(subscription.customer) !== customer || subscription.livemode !== (contract.offer.environment === 'live') || seconds(contract.trial_start) > Date.now() / 1000) throw Error('founder_activation_unconfirmed');
    if (!contract.activated_at) Object.assign(contract, await command('founder_schedule_confirm', { contract_id: contract.id, schedule_id: schedule.id, subscription_id: id, trial_start: contract.trial_start, trial_end: contract.trial_end }));
    return true;
}
