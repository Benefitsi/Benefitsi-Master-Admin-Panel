/** Actual billing TS engine; only Checkout completion, contract/owner and RPC storage are fixtures. */
import assert from 'node:assert/strict';
import { loadTypescript } from '../tests/helpers/load-typescript.mjs';
import { boundary, marker } from './partner-billing-sandbox-transport.mjs';
const iso = s => new Date(s * 1000).toISOString();
export function assertProjection(snapshot, invoice, { positive, historicalPaid = false }) {
    if (snapshot.first_payment_at && !positive)
        throw Error('unverified_first_payment');
    if ((snapshot.state === 'active' && !positive) || (snapshot.paid_through && !positive && !historicalPaid))
        throw Error('unverified_paid_rights');
    if (positive)
        assert.ok(invoice?.amount_due > 0, 'positive_invoice_required');
    return snapshot;
}
export function createEngine({ interval, caseId, customer, setup, stripe, now, saved, onSave = async () => {
} }) {
    assert.ok(['month', 'year'].includes(interval) && ['continue', 'trial_exit', 'late_exit'].includes(caseId));
    let frozen = now;
    class ClockDate extends Date {
        constructor(...args) {
            super(...(args.length ? args : [frozen * 1000]));
        }
        static now() {
            return frozen * 1000;
        }
    }
    const sourceContracts = loadTypescript('lib/stripe/partner-billing-contracts.ts', {}, { Date: ClockDate });
    const founder = loadTypescript('lib/stripe/partner-founder.ts', { './partner-billing-contracts': sourceContracts }, { Date: ClockDate });
    const provider = loadTypescript('lib/stripe/partner-billing-provider.ts', { './partner-billing-contracts': sourceContracts, './partner-founder': founder }, { Date: ClockDate });
    const contract = saved?.contract || {
        id: `task12-${interval}-${caseId}`, partner_id: `fixture-${interval}-${caseId}`, created_at: boundary.frozen, state: 'pending', checkout_id: `fixture_cs_${interval}_${caseId}`, subscription_id: null, expires_at: iso(boundary.seconds.activation + 3600), trial_start: boundary.activation, trial_end: boundary.trialEnd, paid_minimum_end: null, schedule_id: null, setup_intent_id: null, payment_method_id: null, activated_at: null, cancellation_at: null, cancellation_requested_at: null, agreement: { fixture: 'synthetic contract; no real acceptance' }, offer: {
            offer_code: interval === 'year' ? 'founder_annual' : 'founder', version: 1, environment: 'test', stripe_price_id: boundary.prices[interval], stripe_setup_price_id: null, unit_amount: interval === 'year' ? 19900 : 1990, setup_amount: 0, currency: 'eur', billing_interval: interval, tax_behavior: 'exclusive', addon_code: null
        }
    };
    const state = {
        contract, subscription: saved?.subscription || null, mutation: saved?.mutation || null, fence: saved?.fence || 0, held: false, actions: saved?.actions || [], reviews: saved?.reviews || [], enteredPaidTerm: saved?.enteredPaidTerm || false, cancellation: saved?.cancellation || null
    };
    const context = {
        partner_id: contract.partner_id, environment: 'test', customer_id: customer, contracts: [contract], subscription: state.subscription, closed_founders: [], trial_quota_window: null, configuration: { enabled: true, portal_configuration_id: null }
    };
    const persist = async () => onSave({
        contract, state: undefined, subscription: state.subscription, mutation: state.mutation, fence: state.fence, actions: state.actions, reviews: state.reviews, enteredPaidTerm: state.enteredPaidTerm, cancellation: state.cancellation
    });
    const command = async (action, data) => {
        state.actions.push({ action, at: iso(frozen) });
        switch (action) {
            case 'founder_schedule_prepare':
                Object.assign(contract, {
                    setup_intent_id: data.setup_intent_id, payment_method_id: data.payment_method_id, paid_minimum_end: boundary.paidMinimumEnd
                });
                break;
            case 'founder_schedule_bind':
                contract.schedule_id = data.schedule_id;
                break;
            case 'founder_schedule_confirm':
                Object.assign(contract, {
                    subscription_id: data.subscription_id, activated_at: contract.trial_start, state: 'accepted'
                });
                break;
            case 'bind_subscription':
                contract.subscription_id = data.subscription_id;
                break;
            case 'mutation_begin':
                if (state.mutation)
                    throw Error('fixture_mutation_already_pending');
                assert.equal(data.contract_id, contract.id);
                assert.equal(data.subscription_id, contract.subscription_id);
                assert.ok(data.subscription_id);
                state.mutation = {
                    id: `fixture-mutation-${state.fence}`, contract_id: contract.id, subscription_id: contract.subscription_id, operation: null, params: null, idempotency_key: `fixture:${contract.id}:${state.fence}`
                };
                await persist();
                return structuredClone(state.mutation);
            case 'mutation_plan':
                assert.equal(data.id, state.mutation?.id);
                if (state.mutation.operation)
                    assert.deepEqual(structuredClone(state.mutation.params), structuredClone(data.params));
                Object.assign(state.mutation, { operation: data.operation, params: structuredClone(data.params) });
                await persist();
                return structuredClone(state.mutation);
            case 'mutation_finish':
                assert.equal(data.id, state.mutation?.id);
                state.mutation = null;
                break;
            case 'founder_cancel_terms':
                if (!contract.cancellation_at) {
                    assert.ok(state.cancellation, 'fixture_cancellation_plan_required');
                    Object.assign(contract, state.cancellation);
                }
                break;
            case 'founder_late_exit_review':
                state.reviews.push({
                    kind: 'late_exit_invoice_review', contract: contract.id, at: iso(frozen), refund: false
                });
                break;
            case 'batch':
                for (const row of data.commands) {
                    if (row.action !== 'apply')
                        throw Error('fixture_unexpected_batch');
                    state.subscription = structuredClone(row.data);
                    context.subscription = state.subscription;
                    if (row.data.state === 'active' && row.data.paid_through && row.data.first_payment_at && !(contract.cancellation_at && Date.parse(contract.cancellation_at) <= Date.parse(contract.trial_end)))
                        state.enteredPaidTerm = true;
                }
                state.held = false;
                break;
            case 'complete':
            case 'failed':
                state.held = false;
                break;
            default: throw Error(`fixture_unexpected_command:${action}`);
        }
        await persist();
        return action.startsWith('founder_') ? structuredClone(contract) : { ok: true };
    };
    const checkout = {
        id: contract.checkout_id, mode: 'setup', status: 'complete', customer, livemode: false, setup_intent: setup, client_reference_id: contract.id, fixture: true
    };
    const adapter = { ...stripe, checkout: { sessions: { retrieve: async (id) => {
                    assert.equal(id, contract.checkout_id, 'fixture_checkout_identity');
                    return checkout;
                }, list: () => ({ async *[Symbol.asyncIterator]() {
                        yield checkout;
                    } }) } } };
    const api = loadTypescript('lib/stripe/partner-billing.ts', {
        stripe: class {
            constructor(key) {
                assert.equal(key, 'sk_test_task12_PROCESS_ONLY_FIXTURE');
                return adapter;
            }
        },
        '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => {
                    if (name === 'partner_billing_context') {
                        assert.equal(args.p_partner_id, contract.partner_id);
                        return { data: context };
                    }
                    if (name === 'partner_billing_claim') {
                        if (state.held)
                            throw Error('fixture_billing_busy');
                        state.held = true;
                        state.fence++;
                        await persist();
                        return { data: { fence: state.fence, recovery: state.mutation ? structuredClone(state.mutation) : undefined } };
                    }
                    if (name === 'partner_billing_command') {
                        assert.equal(args.p_fence, state.fence, 'fixture_stale_fence');
                        assert.equal(state.held, true, 'fixture_fence_released');
                        return { data: await command(args.p_action, args.p_data) };
                    }
                    throw Error(`fixture_unexpected_rpc:${name}`);
                } }) },
        '@/lib/supabase/server': { createClient: async () => ({ rpc: async (name, args) => {
                    assert.equal(name, 'get_partner_billing_readiness');
                    assert.equal(args.p_partner_id, contract.partner_id);
                    return { data: { enabled: true, fixture: true } };
                } }) },
        '@/lib/stripe/config': { requirePartnerBaseUrl: () => {
                throw Error('fixture_checkout_creation_excluded');
            } },
        './partner-billing-contracts': sourceContracts, './partner-founder': founder, './partner-billing-provider': provider,
    }, { Date: ClockDate });
    let running = false;
    return {
        contract, state, observations: stripe.observations, source: {
            ...sourceContracts, ...founder, ...provider
        }, setTime: s => {
            assert.ok(s >= frozen, 'fixture_clock_reversed');
            frozen = s;
        }, setCancellation: async (at) => {
            if (contract.cancellation_at && contract.cancellation_at !== at)
                throw Error('fixture_cancellation_changed');
            state.cancellation = { cancellation_at: at, cancellation_requested_at: iso(frozen) };
            Object.assign(contract, state.cancellation);
            await persist();
        },
        async readOnlySnapshot() {
            return provider.readPartnerSubscription(adapter, contract, customer, state.subscription);
        },
        async run(action) {
            if (running)
                throw Error('fixture_expected_serial_execution');
            running = true;
            const env = {
                BENEFITSI_PARTNER_BILLING_ENABLED: 'true', BENEFITSI_PARTNER_BILLING_ENVIRONMENT: 'test', BENEFITSI_PARTNER_STRIPE_SECRET_KEY: 'sk_test_task12_PROCESS_ONLY_FIXTURE'
            };
            const savedEnv = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
            Object.assign(process.env, env);
            try {
                if (!stripe.subscriptions)
                    throw Error('fixture_expected_provider_adapter');
                if (action === 'reconcile')
                    return await api.reconcilePartnerBilling(contract.partner_id);
                if (action === 'recover')
                    return await api.recoverPartnerBilling(contract.partner_id);
                if (action === 'cancel')
                    return await api.cancelPartnerSubscription(contract.partner_id, contract.offer.offer_code);
                throw Error('fixture_unknown_engine_action');
            }
            finally {
                for (const [k, v] of Object.entries(savedEnv))
                    if (v === undefined)
                        delete process.env[k];
                    else
                        process.env[k] = v;
                running = false;
            }
        }, persist
    };
}
/** SDK-shaped surface delegates every provider read/write to the fixed CLI transport. */
export function providerAdapter(transport, owner, { loseCancellation = false, failFirstSubscriptionRead = false, onLoss = async () => {
} } = {}) {
    let lose = loseCancellation, failRead = failFirstSubscriptionRead;
    const observations = {
        invoices: new Map(), subscriptions: new Map(), payments: new Map(), intents: new Map(), charges: new Map()
    };
    const iter = (op, args, check) => ({ async *[Symbol.asyncIterator]() {
            for (const x of await transport.list(op, args)) {
                if (check)
                    await check(x);
                yield x;
            }
        } });
    const invoiceOwned = i => {
        assert.equal(i.customer, owner.customer);
        assert.equal(i.livemode, false);
        assert.equal(typeof i.parent?.subscription_details?.subscription === 'string' ? i.parent.subscription_details.subscription : i.parent?.subscription_details?.subscription?.id, owner.subscription);
        if (!owner.invoices.includes(i.id))
            owner.invoices.push(i.id);
        return i;
    };
    const write = async (op, id, params, options) => {
        const semantic = `engine:${options?.idempotencyKey}`;
        const value = await transport.mutate(op, {
            owner, ...(id ? { id } : {}), params
        }, semantic);
        if (lose && op === 'subscription.cancel') {
            lose = false;
            await onLoss();
            throw Error('fixture_response_lost_after_confirmed_cancellation');
        }
        return value;
    };
    return {
        observations,
        prices: { retrieve: id => transport.read('price.read', { id }) },
        setupIntents: { retrieve: async (id) => {
                assert.equal(id, owner.setup);
                return transport.read('setup.read', { id });
            } },
        customers: { retrieve: async (id) => {
                assert.equal(id, owner.customer);
                return transport.read('customer.read', { id });
            } },
        subscriptionSchedules: {
            list: () => iter('schedule.list', { owner }), retrieve: async (id) => {
                assert.equal(id, owner.schedule);
                return transport.read('schedule.read', { id });
            }, create: async (params, options) => {
                const tagged = {
                    ...structuredClone(params), metadata: marker(owner), phases: params.phases.map(p => ({ ...structuredClone(p), metadata: marker(owner) }))
                };
                const s = await write('schedule.create', null, tagged, options);
                owner.schedule = s.id;
                return s;
            }, update: (id, params, options) => write('schedule.update', id, structuredClone(params), options), cancel: (id, params, options) => write('schedule.cancel', id, structuredClone(params), options)
        },
        subscriptions: {
            list: () => iter('subscription.list', { owner }), retrieve: async (id) => {
                if (failRead) {
                    failRead = false;
                    throw Error('fixture_pre_dispatch_read_unavailable');
                }
                if (owner.subscription)
                    assert.equal(id, owner.subscription);
                const sub = await transport.read('subscription.read', { id });
                assert.equal(sub.customer, owner.customer);
                assert.equal(sub.livemode, false);
                assert.equal(sub.metadata?.benefitsi_partner_contract, owner.contract);
                owner.subscription = id;
                observations.subscriptions.set(id, sub);
                await transport.save();
                return sub;
            }, update: (id, params, options) => write('subscription.update', id, structuredClone(params), options), cancel: (id, params, options) => write('subscription.cancel', id, structuredClone(params), options)
        },
        invoices: {
            retrieve: async (id) => {
                const invoice = invoiceOwned(await transport.read('invoice.read', { id }));
                observations.invoices.set(id, invoice);
                return invoice;
            }, list: () => iter('invoice.list', { owner }, invoiceOwned), listLineItems: id => {
                assert.ok(owner.invoices.includes(id));
                return iter('invoice.lines', { id });
            }
        },
        invoicePayments: { list: ({ invoice }) => {
                assert.ok(owner.invoices.includes(invoice));
                observations.payments.set(invoice, []);
                return iter('invoice.payments', { id: invoice }, p => {
                    assert.equal(p.invoice, invoice);
                    assert.equal(p.livemode, false);
                    const pi = typeof p.payment?.payment_intent === 'string' ? p.payment.payment_intent : p.payment?.payment_intent?.id;
                    const ch = typeof p.payment?.charge === 'string' ? p.payment.charge : p.payment?.charge?.id;
                    if (pi)
                        (owner.intents ||= []).push(pi);
                    if (ch)
                        (owner.charges ||= []).push(ch);
                    const rows = observations.payments.get(invoice) || [];
                    rows.push(p);
                    observations.payments.set(invoice, rows);
                });
            } },
        paymentIntents: { retrieve: async (id) => {
                assert.ok(owner.intents?.includes(id));
                const pi = await transport.read('intent.read', { id });
                assert.equal(pi.customer, owner.customer);
                assert.equal(pi.livemode, false);
                observations.intents.set(id, pi);
                if (pi.latest_charge)
                    (owner.charges ||= []).push(typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge.id);
                return pi;
            } },
        charges: { retrieve: async (id) => {
                assert.ok(owner.charges?.includes(id));
                const charge = await transport.read('charge.read', { id });
                assert.equal(charge.customer, owner.customer);
                assert.equal(charge.livemode, false);
                observations.charges.set(id, charge);
                return charge;
            } },
    };
}
