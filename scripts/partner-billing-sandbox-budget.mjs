/** Offline cost/timing proof only. Canned provider objects do not prove provider or Hosted acceptance. */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createEngine } from './partner-billing-sandbox-engine.mjs';
import { boundary, cliBudget } from './partner-billing-sandbox-transport.mjs';
function fixture() {
    let schedule, sub, invoice, payments = [], calls = [];
    const invoke = (name, fn) => (...args) => {
        calls.push(name);
        return fn(...args);
    };
    const iterable = data => ({ async *[Symbol.asyncIterator]() {
            yield* data;
        } });
    const price = {
        id: boundary.prices.month, active: true, livemode: false, currency: 'eur', unit_amount: 1990, tax_behavior: 'exclusive', type: 'recurring', recurring: {
            interval: 'month', interval_count: 1, usage_type: 'licensed'
        }
    };
    const stripe = {
        setupIntents: { retrieve: invoke('setup.read', async () => ({
                id: 'seti_cost', customer: 'cus_cost', livemode: false, status: 'succeeded', payment_method: 'pm_cost'
            })) },
        subscriptionSchedules: {
            list: invoke('schedule.list', () => iterable(schedule ? [schedule] : [])),
            create: invoke('schedule.create', async (params) => schedule = {
                ...structuredClone(params), id: 'sub_sched_cost', livemode: false, subscription: null, status: 'not_started', phases: [{ ...structuredClone(params.phases[0]), start_date: params.start_date }]
            }),
            retrieve: invoke('schedule.read', async () => schedule),
            update: invoke('schedule.update', async (id, params) => {
                Object.assign(schedule, structuredClone(params));
                return schedule;
            })
        },
        subscriptions: {
            retrieve: invoke('subscription.read', async () => sub),
            update: invoke('subscription.update', async (id, params) => {
                Object.assign(sub, structuredClone(params));
                return sub;
            }),
            cancel: invoke('subscription.cancel', async () => {
                sub.status = 'canceled';
                throw Error('cost_fixture_lost_response');
            })
        },
        invoices: { retrieve: invoke('invoice.read', async () => invoice), listLineItems: invoke('invoice.lines', () => iterable([{
                    pricing: { price_details: { price: price.id } }, quantity: 1, period: { start: sub.items.data[0].current_period_start, end: sub.items.data[0].current_period_end }
                }])) },
        invoicePayments: { list: invoke('invoice.payments', () => iterable(payments)) },
        paymentIntents: { retrieve: invoke('intent.read', async () => ({
                id: 'pi_cost', customer: 'cus_cost', livemode: false, status: 'succeeded', latest_charge: 'ch_cost'
            })) },
        charges: { retrieve: invoke('charge.read', async () => ({
                id: 'ch_cost', customer: 'cus_cost', livemode: false, paid: true, disputed: false, amount_refunded: 0
            })) }
    };
    const engine = createEngine({
        interval: 'month', caseId: 'continue', customer: 'cus_cost', setup: 'seti_cost', stripe, now: boundary.seconds.frozen
    });
    return {
        engine,
        set(kind, now) {
            engine.setTime(now);
            const paid = kind.includes('paid'), canceled = kind.includes('canceled');
            schedule.status = paid ? 'released' : canceled ? 'canceled' : 'active';
            schedule.subscription = paid ? null : 'sub_cost';
            schedule.released_subscription = paid ? 'sub_cost' : null;
            sub = {
                id: 'sub_cost', customer: 'cus_cost', livemode: false, status: canceled ? 'canceled' : paid ? 'active' : kind === 'failed' ? 'past_due' : 'trialing', metadata: { benefitsi_partner_contract: engine.contract.id }, schedule: paid ? null : schedule.id, trial_start: boundary.seconds.activation, trial_end: boundary.seconds.trialEnd, discounts: [], items: { has_more: false, data: [{
                            id: 'si_cost', price, quantity: 1, current_period_start: paid ? boundary.seconds.trialEnd : boundary.seconds.activation, current_period_end: paid ? Date.parse('2026-08-31T10:00:00Z') / 1000 : boundary.seconds.trialEnd
                        }] }, latest_invoice: 'in_cost', cancel_at_period_end: false
            };
            invoice = {
                id: 'in_cost', customer: 'cus_cost', livemode: false, parent: { subscription_details: { subscription: 'sub_cost' } }, status: kind === 'failed' ? 'open' : 'paid', amount_due: paid || kind === 'failed' ? 1990 : 0, created: now, status_transitions: paid ? { paid_at: now, finalized_at: now } : { finalized_at: now }
            };
            payments = paid ? [{
                    id: 'inpay_cost', invoice: 'in_cost', livemode: false, amount_paid: 1990, payment: { payment_intent: 'pi_cost' }
                }] : [];
        },
        async measure(action) {
            calls = [];
            try {
                if (action === 'reader')
                    await engine.readOnlySnapshot();
                else
                    await engine.run(action);
            }
            catch (error) {
                if (error.message !== 'cost_fixture_lost_response')
                    throw error;
            }
            return { calls: calls.length, operations: Object.fromEntries([...new Set(calls)].map(name => [name, calls.filter(x => x === name).length])) };
        }
    };
}
export async function measureSourceGroups() {
    const normal = fixture(), trial = fixture(), late = fixture(), paid = fixture();
    const groups = {};
    groups.planned = await normal.measure('reconcile');
    normal.set('trial', boundary.seconds.activation);
    groups.reconcileTrial = await normal.measure('reconcile');
    normal.set('paid', boundary.seconds.trialEnd + 7200);
    groups.readerPaid = await normal.measure('reader');
    groups.reconcilePaid = await normal.measure('reconcile');
    normal.set('failed', boundary.seconds.trialEnd + 7201);
    groups.reconcileFailed = await normal.measure('reconcile');
    await trial.measure('reconcile');
    trial.set('trial', boundary.seconds.activation);
    await trial.measure('reconcile');
    await trial.engine.setCancellation(boundary.trialExit);
    groups.cancelTrial = await trial.measure('cancel');
    trial.set('canceled-trial', boundary.seconds.trialExit);
    groups.reconcileCanceledTrial = await trial.measure('reconcile');
    await late.measure('reconcile');
    late.set('trial', boundary.seconds.activation);
    await late.measure('reconcile');
    late.set('trial', boundary.seconds.trialEnd - 1);
    await late.engine.setCancellation(boundary.trialEnd);
    // The real run persists mutation_begin then deliberately fails before any Source provider read.
    late.engine.state.mutation = {
        id: 'fixture-cost-late', contract_id: late.engine.contract.id, subscription_id: 'sub_cost', operation: null, params: null, idempotency_key: 'fixture:cost:late'
    };
    late.set('paid', boundary.seconds.trialEnd + 7200);
    groups.lateRecoveryLost = await late.measure('recover');
    groups.lateRecoveryConfirmed = await late.measure('recover');
    groups.reconcileCanceledPaid = await late.measure('reconcile');
    await paid.measure('reconcile');
    paid.set('trial', boundary.seconds.activation);
    await paid.measure('reconcile');
    paid.set('paid', boundary.seconds.paidMinimumEnd + 7200);
    await paid.measure('reconcile');
    await paid.engine.setCancellation('2027-08-31T10:00:00.000Z');
    groups.cancelPaid = await paid.measure('cancel');
    return groups;
}
export function workflowBudget(groups) {
    // SDK mutations already count their dispatch; add only transport attestation and fresh ownership reads.
    const sdk = (name, overhead = 0) => groups[name].calls + overhead;
    const changedTargets = 23 + 7 + 3 + 1; // One approved technical bridge; no billing checkpoint.
    const rows = [
        ['Inspect (version/account/balance + four inventories)', 7],
        ['Bootstrap (two clocks, six customers, six SetupIntents)', 2 * 4 + 6 * 5 + 6 * 6],
        ['Planned schedules (six Source runs + create ownership + price/schedule proofs)', 6 * (sdk('planned', 5) + 2)],
        ['Clock control month (23 changed targets, four same-time steps)', 23 * 9 + 4 * 2],
        ['Clock control year (seven ordinary changes, three isolated annual changes, two same-time steps)', 7 * 9 + 3 * 11 + 2 * 2],
        ['Transport fresh ready proof after advancing acknowledgement (original 33 changed targets)', changedTargets - 1],
        ['Approved April technical bridge (six fresh guards, ten clock-control calls, one ready evidence GET)', 17],
        ['Activation/FEB/MAR/MAY/JUL trial reconciles (six activation, eight continuation)', 14 * (sdk('reconcileTrial') + 2)],
        ['Trial cancellation (two Source commands)', 2 * sdk('cancelTrial', 6)],
        ['Timely canceled trial Source proofs (two)', 2 * (sdk('reconcileCanceledTrial') + 2)],
        ['Boundary observations (ten subscription/latest-invoice pairs)', 10 * 2],
        ['Settled positive Source proofs (two first, five samples, two minimum, one recovery)', 10 * (sdk('reconcilePaid') + 2)],
        ['Late settled invoice SourceReader proofs (two)', 2 * (sdk('readerPaid') + 2)],
        ['Late Source loss/recovery (two pairs + fresh cancellation ownership + direct subscription proof)', 2 * (sdk('lateRecoveryLost', 6) + sdk('lateRecoveryConfirmed') + 1)],
        ['Canceled paid Source proofs (two late, two termination)', 4 * (sdk('reconcileCanceledPaid') + 2)],
        ['Decline and fixed-grace Source proofs (three)', 3 * (sdk('reconcileFailed') + 2)],
        ['Decline/recovery SetupIntent, defaults and invoice pay', 6 + 7 + 7 + 7],
        ['Paid cancellation (two Source commands)', 2 * sdk('cancelPaid', 6)]
    ];
    const executionMinimum = rows.reduce((sum, [, calls]) => sum + calls, 0);
    // Each clock DELETE includes attestation3, initial owner2, full gate13, dispatch1; inspect7/final lists2.
    const cleanupMinimum = 7 + 2 * (3 + 2 + 13 + 1) + 2;
    const pollingMargin = changedTargets * 2; // two additional ready reads per advancement
    return {
        label: 'offline Source call-shape and fixed-checkpoint cost proof; NOT provider or Hosted acceptance',
        assumptions: ['one page per bounded list', 'one InvoicePayment via PaymentIntent/Charge for each paid invoice', 'all nominal mutations confirmed on first dispatch', 'includes deliberately lost Source cancellation response, whose CLI dispatch is already confirmed', 'nominal settlement target is boundary+7200 seconds', 'each changed target acknowledges advancing before one fresh ready confirmation; further polling consumes margin', 'one approved March period-end bridge adds 17 calls and no Source projection or billing checkpoint'],
        groups, rows: rows.map(([operation, calls]) => ({ operation, calls })),
        originalExecutionMinimum: 956, // Immutable historical estimate before settlement/acknowledgement repairs.
        originalPostReconcileReaderCalls: 0, repairedPostReconcileReaderCalls: 0,
        historicalBudget: {
            totalCap: 1000, cleanupReserve: 100, executionCap: 900, originalExecutionOverCap: 56, firstSettlementFixExecutionMinimum: 1086, firstSettlementFixExecutionWithPolling: 1152, repairedExecutionWithPollingOverCap: 252, currentExecutionWithPollingOverOldCap: 285, preBridgeExecutionMinimum: 1119, preBridgeExecutionWithPolling: 1185, bridgeExecutionWithPollingOverOldCap: executionMinimum + pollingMargin - 900, feasible: false
        },
        executionMinimum, cleanupMinimum, totalMinimum: executionMinimum + cleanupMinimum,
        pollingMargin, executionWithPolling: executionMinimum + pollingMargin,
        cleanupReserve: cliBudget.cleanupReserve, totalCap: cliBudget.total, executionCap: cliBudget.execution,
        executionMargin: cliBudget.execution - executionMinimum - pollingMargin,
        cleanupThreePassMargin: cliBudget.cleanupReserve - 3 * cleanupMinimum,
        feasible: executionMinimum + pollingMargin <= cliBudget.execution && cleanupMinimum <= cliBudget.cleanupReserve,
        extraPaginationOrUnknownTransportOutcome: 'additional cost, never resets or enlarges journal cap',
        cleanupSupersededRecovery: 'existing one list GET to resolve each pending clock DELETE, plus one additional fresh clock.list GET per archived unknown advance on each cleanup recovery pass; no nominal workflow addition',
        rootPostCleanupAbsenceProof: 'nine additional counted read calls: attestation three plus six known customer absence reads',
        runnerOnlyRedundancy: 'Clock.advance reads the clock before ownership, again within ownership, again for mutation validation, then for ready proof. Snapshot adds a fresh clock and invoice-list proof; no duplicate post-reconcile SourceReader.'
    };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    measureSourceGroups().then(groups => console.log(JSON.stringify(workflowBudget(groups), null, 2))).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
