/** Offline by default. Remote execution is opt-in after independent safety review. */
import assert from 'node:assert/strict';
import { readFile, mkdir, open, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { boundary, cliBudget, marker, requestHash, assertOwned, SandboxTransport, waitReady } from './partner-billing-sandbox-transport.mjs';
import { createEngine, providerAdapter, assertProjection } from './partner-billing-sandbox-engine.mjs';
const directory = fileURLToPath(new URL('../docs/partners/task12/', import.meta.url));
const iso = n => new Date(n * 1000).toISOString();
const seconds = v => Date.parse(v) / 1000;
export const invoiceSettlementSeconds = 7200;
export function invoiceCheckpointPlans(interval) {
    const entries = [['first-paid', boundary.seconds.trialEnd], ...(interval === 'month' ? [['failed', seconds('2026-08-31T10:00:00Z')], ...['2026-10-31', '2026-12-31', '2027-02-28', '2027-04-30', '2027-06-30'].map((day, index) => [`paid-month-${[9, 11, 13, 15, 17][index]}`, seconds(`${day}T10:00:00Z`)])] : []), ['minimum-complete', boundary.seconds.paidMinimumEnd]];
    return entries.map(([suffix, boundaryAt]) => ({
        interval, key: `${interval}:${suffix}`, boundaryAt, settledAt: boundaryAt + invoiceSettlementSeconds
    }));
}
async function registerSettlementPlan(t, plan) {
    assert.ok(['month', 'year'].includes(plan.interval));
    assert.equal(plan.settledAt, plan.boundaryAt + invoiceSettlementSeconds, 'unapproved_settlement_target');
    const saved = (t.state.invoicePlans ||= {})[plan.key];
    if (saved)
        assert.equal(requestHash(saved), requestHash(plan), 'settlement_plan_changed');
    else {
        t.state.invoicePlans[plan.key] = structuredClone(plan);
        await t.save();
    }
}
export async function settledInvoiceCheckpoint(t, plan, onSettled) {
    await registerSettlementPlan(t, plan);
    await step(t, `${plan.key}:boundary`, plan.interval, plan.boundaryAt, async (now) => {
        const owner = t.state.owners[`${plan.interval}/continue`];
        const sub = await t.read('subscription.read', { id: owner.subscription });
        assertOwned('subscription', sub, owner);
        const invoiceId = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice?.id;
        const invoice = invoiceId ? await t.read('invoice.read', { id: invoiceId }) : null;
        if (invoice) {
            assert.equal(invoice.customer, owner.customer);
            assert.equal(invoice.livemode, false);
            assert.equal(invoice.parent?.subscription_details?.subscription, owner.subscription);
        }
        return {
            boundaryObserved: true, settled: false, projectionApplied: false, subscriptionStatus: sub.status, invoice: invoiceId || null, invoiceStatus: invoice?.status || null, frozen: iso(now)
        };
    });
    return step(t, plan.key, plan.interval, plan.settledAt, onSettled);
}
export function offlinePlan() {
    return {
        status: 'pending', mode: 'offline', providerExecuted: false, ...boundary, cliBudget, invoiceSettlement: {
            delaySeconds: invoiceSettlementSeconds, plans: ['month', 'year'].flatMap(invoiceCheckpointPlans), graceTarget: 'recorded actual past_due_since + seven days'
        }, scenarios: ['month/continue', 'month/trial_exit', 'month/late_exit', 'year/continue', 'year/trial_exit', 'year/late_exit'], proofGates: {
            providerLifecycle: 'pending', sourceEngineWithFixtureSql: 'pending', hostedDb: false, hostedCheckout: false, signedWebhook: false, realAgreement: false, operations: false, production: false
        }, commands: ['node scripts/partner-billing-sandbox.mjs', 'node scripts/partner-billing-sandbox.mjs inspect', 'node scripts/partner-billing-sandbox.mjs execute --reviewed=partner-dashboard-task12-2026-10-01', 'node scripts/partner-billing-sandbox.mjs cleanup --reviewed=partner-dashboard-task12-2026-10-01']
    };
}
async function output(resources) {
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'lifecycle-resources.json'), fd = await open(path + '.next', 'w', 0o600);
    try {
        await fd.writeFile(JSON.stringify(resources, null, 2) + '\n');
        await fd.sync();
    }
    finally {
        await fd.close();
    }
    await rename(path + '.next', path);
}
async function inspect(t) {
    const before = JSON.parse(await readFile(join(directory, 'preflight.json'), 'utf8'));
    const attestation = await t.attest();
    const clocks = await t.list('clock.list'), customers = await t.list('customer.list'), schedules = await t.list('schedule.list'), subscriptions = await t.list('subscription.list');
    const foreignCustomers = customers.filter(c => c.metadata?.benefitsi_release !== boundary.release);
    assert.equal(requestHash(foreignCustomers.map(c => c.id).sort()), before.provider.inventory.customers.ids_sha256, 'foreign_customer_inventory_changed');
    const ownedClocks = clocks.filter(c => Object.values(boundary.clockNames).includes(c.name));
    assert.ok(ownedClocks.length <= 2);
    for (const clock of ownedClocks) {
        const interval = Object.keys(boundary.clockNames).find(k => boundary.clockNames[k] === clock.name);
        if (t.state.clocks[interval] !== clock.id)
            assert.ok(Object.values(t.state.requests).some(r => r.op === 'clock.create' && r.role === interval && r.status !== 'confirmed'), 'unregistered_task12_clock');
    }
    for (const customer of customers.filter(c => c.metadata?.benefitsi_release === boundary.release)) {
        const o = t.state.owners[customer.metadata.benefitsi_role];
        if (o)
            assertOwned('customer', customer, o);
        else {
            const request = Object.values(t.state.requests).find(r => r.op === 'customer.create' && r.role === customer.metadata.benefitsi_role && r.status !== 'confirmed');
            assert.ok(request?.descriptor?.owner, 'unregistered_task12_customer');
            assertOwned('customer', customer, { ...request.descriptor.owner, customer: customer.id });
        }
    }
    for (const [kind, objects] of [['schedule', schedules], ['subscription', subscriptions]]) {
        const owned = objects.filter(x => x.metadata?.benefitsi_release === boundary.release);
        assert.ok(owned.length <= 6);
        for (const obj of owned) {
            const o = t.state.owners[obj.metadata.benefitsi_role];
            assert.ok(o, 'unregistered_task12_resource');
            assertOwned(kind, obj, o);
        }
        assert.equal(requestHash(objects.filter(x => x.metadata?.benefitsi_release !== boundary.release).map(x => x.id).sort()), before.provider.inventory[kind === 'schedule' ? 'schedules' : 'subscriptions'].ids_sha256, 'foreign_inventory_changed');
    }
    assert.equal(requestHash(clocks.filter(c => !Object.values(boundary.clockNames).includes(c.name)).map(c => c.id).sort()), before.provider.inventory.clocks.ids_sha256, 'foreign_clock_inventory_changed');
    return {
        mode: 'inspect', readOnly: true, attestation, counts: {
            clocks: clocks.length, customers: customers.length, schedules: schedules.length, subscriptions: subscriptions.length
        }, foreignCustomerIdsUnchanged: true, stageFingerprintVerification: 'Root must repeat genuine Stage reads; fixture has no Stage connector'
    };
}
async function freshTime(t, interval) {
    const id = t.state.clocks[interval];
    const c = await t.read('clock.read', { id });
    assertOwned('clock', c, { clock: id, interval });
    assert.equal(c.status, 'ready', 'clock_not_ready');
    return c.frozen_time;
}
export async function advance(t, interval, target, key) {
    const owner = t.state.owners[`${interval}/continue`], id = owner.clock;
    const fresh = await t.read('clock.read', { id });
    assertOwned('clock', fresh, owner);
    const current = fresh.frozen_time;
    if (current > target)
        throw Error('checkpoint_clock_already_passed');
    const semantic = `advance:${interval}:${key}`;
    const pending = t.state.requests[semantic];
    if (pending && pending.status !== 'confirmed')
        await t.mutate('clock.advance', {
            owner, id, target
        }, semantic);
    else if (current < target) {
        if (fresh.status !== 'ready')
            throw Error('clock_not_ready');
        await t.mutate('clock.advance', {
            owner, id, target
        }, semantic);
    }
    const c = await waitReady(() => t.read('clock.read', { id }), target, current);
    return c.frozen_time;
}
function engineFor(t, interval, caseId, now, options) {
    const o = t.state.owners[`${interval}/${caseId}`];
    const e = createEngine({
        interval, caseId, customer: o.customer, setup: o.setup, stripe: providerAdapter(t, o, options), now, saved: t.state.fixtures[o.role], onSave: async (value) => {
            t.state.fixtures[o.role] = value;
            await t.save();
        }
    });
    return e;
}
async function step(t, key, interval, at, run) {
    if (t.state.checkpoints[key])
        return t.state.checkpoints[key];
    const now = await advance(t, interval, at, key);
    const result = await run(now);
    await t.checkpoint(key, { at: iso(now), ...result });
    return result;
}
async function snapshot(t, e, o, label, { expect, amount, positive = false, readOnly = false } = {}) {
    const time = await freshTime(t, o.role.split('/')[0]);
    e.setTime(time);
    for (const data of Object.values(e.observations))
        data.clear();
    const readOnlyState = readOnly ? await e.readOnlySnapshot() : null;
    if (!readOnly)
        await e.run('reconcile');
    const sub = e.observations.subscriptions.get(o.subscription);
    assertOwned('subscription', sub, o);
    const invoiceId = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice?.id;
    const invoice = invoiceId ? e.observations.invoices.get(invoiceId) : null;
    const invoices = await t.list('invoice.list', { owner: o });
    let verified = false;
    if (invoice?.amount_due > 0) {
        const payments = e.observations.payments.get(invoice.id) || [];
        let paid = 0;
        for (const p of payments) {
            assert.equal(p.invoice, invoice.id);
            assert.equal(p.livemode, false);
            let charge = p.payment?.charge;
            if (p.payment?.payment_intent) {
                const pi = e.observations.intents.get(typeof p.payment.payment_intent === 'string' ? p.payment.payment_intent : p.payment.payment_intent.id);
                assert.equal(pi.customer, o.customer);
                assert.equal(pi.livemode, false);
                if (pi.status !== 'succeeded')
                    continue;
                charge = pi.latest_charge;
            }
            if (!charge)
                continue;
            const ch = e.observations.charges.get(typeof charge === 'string' ? charge : charge.id);
            assert.equal(ch.customer, o.customer);
            assert.equal(ch.livemode, false);
            if (ch.paid && !ch.disputed && !ch.amount_refunded)
                paid += p.amount_paid || 0;
        }
        verified = invoice.status === 'paid' && paid >= invoice.amount_due;
    }
    const s = readOnlyState || e.state.subscription;
    const proof = {
        label, role: o.role, clock: o.clock, frozen: iso(time), subscription: o.subscription, providerStatus: sub.status, trialStart: sub.trial_start ? iso(sub.trial_start) : null, trialEnd: sub.trial_end ? iso(sub.trial_end) : null, periodStart: s?.period_start, periodEnd: s?.period_end, projection: s ? {
            state: s.state, paidThrough: s.paid_through, firstPaymentAt: s.first_payment_at, pastDueSince: s.past_due_since
        } : null, invoice: invoice ? {
            id: invoice.id, status: invoice.status, amountDue: invoice.amount_due, amountPaid: invoice.amount_paid, paidAt: invoice.status_transitions?.paid_at ? iso(invoice.status_transitions.paid_at) : null, positiveChargeVerified: verified
        } : null, invoiceSummary: invoices.map(i => ({
            id: i.id, status: i.status, amountDue: i.amount_due, amountPaid: i.amount_paid
        })), fixtureSql: true, readOnlySourceReader: readOnly, fixturePaidTermEntered: e.state.enteredPaidTerm, hosted: false
    };
    t.state.proofs.push(proof);
    await t.save();
    assert.ok(s, 'fixture_snapshot_missing');
    const historicalPaid = t.state.proofs.some(p => p.role === o.role && p.invoice?.positiveChargeVerified && p.projection?.paidThrough === s.paid_through);
    assertProjection(s, invoice, { positive: verified, historicalPaid });
    if (time < boundary.seconds.trialEnd) {
        assert.ok(invoices.every(i => i.amount_due === 0), 'positive_invoice_before_trial_end');
        assert.equal(s.paid_through, null);
        assert.equal(s.first_payment_at, null);
    }
    if (expect)
        assert.equal(s.state, expect);
    if (amount !== undefined) {
        assert.equal(invoice?.amount_due, amount);
        assert.equal(verified, positive);
    }
    return proof;
}
async function bootstrap(t) {
    for (const interval of ['month', 'year']) {
        if (!t.state.clocks[interval]) {
            const c = await t.mutate('clock.create', { interval }, `clock:${interval}`);
            assert.equal(c.frozen_time, boundary.seconds.frozen);
        }
        for (const caseId of ['continue', 'trial_exit', 'late_exit']) {
            const role = `${interval}/${caseId}`;
            if (!t.state.owners[role])
                await t.mutate('customer.create', { owner: {
                        clock: t.state.clocks[interval], role, contract: `task12-${interval}-${caseId}`
                    } }, `customer:${role}`);
            const o = t.state.owners[role];
            if (!o.setup)
                await t.mutate('setup.create', { owner: o, payment_method: boundary.cards[0] }, `setup:${role}:visa`);
        }
    }
}
async function lifecycle(t, interval) {
    const plans = Object.fromEntries(invoiceCheckpointPlans(interval).map(plan => [plan.key, plan]));
    const b = boundary.seconds, cont = t.state.owners[`${interval}/continue`], trial = t.state.owners[`${interval}/trial_exit`], late = t.state.owners[`${interval}/late_exit`];
    await step(t, `${interval}:planned`, interval, b.frozen, async (now) => {
        for (const caseId of ['continue', 'trial_exit', 'late_exit']) {
            const e = engineFor(t, interval, caseId, now);
            const price = await t.read('price.read', { id: e.contract.offer.stripe_price_id });
            e.source.validatePartnerPrice(price, e.contract.offer);
            await e.run('reconcile');
            const o = t.state.owners[`${interval}/${caseId}`];
            const s = await t.read('schedule.read', { id: o.schedule });
            e.source.validateFounderSchedule(s, e.contract, o.customer);
            assert.equal(s.subscription, null, 'subscription_before_activation');
            assert.equal(e.contract.activated_at, null);
            assert.equal(e.state.subscription, null);
        }
        return { noSubscriptionBeforeActivation: true };
    });
    await step(t, `${interval}:activation`, interval, b.activation, async (now) => {
        for (const caseId of ['continue', 'trial_exit', 'late_exit']) {
            const e = engineFor(t, interval, caseId, now);
            const o = t.state.owners[`${interval}/${caseId}`];
            const p = await snapshot(t, e, o, 'activation', { expect: 'trialing' });
            assert.equal(p.trialStart, iso(b.activation));
            assert.equal(p.trialEnd, iso(b.trialEnd));
        }
        const e = engineFor(t, interval, 'trial_exit', now);
        await e.setCancellation(boundary.trialExit);
        await e.run('cancel');
        return { trialOnly: true, trialExitScheduled: true };
    });
    await step(t, `${interval}:february`, interval, b.trialExit, async (now) => {
        const exited = await snapshot(t, engineFor(t, interval, 'trial_exit', now), trial, 'timely trial exit', { expect: 'canceled' });
        assert.equal(exited.providerStatus, 'canceled');
        assert.ok(exited.invoiceSummary.every(i => i.amountDue === 0));
        assert.equal(exited.projection.paidThrough, null);
        assert.equal(t.state.fixtures[trial.role].contract.paid_minimum_end, boundary.paidMinimumEnd);
        assert.equal(exited.fixturePaidTermEntered, false);
        await snapshot(t, engineFor(t, interval, 'continue', now), cont, 'February28', { expect: 'trialing' });
        return { providerTrialExitConfirmed: true };
    });
    await step(t, `${interval}:march`, interval, seconds('2026-03-31T10:00:00Z'), async (now) => {
        await snapshot(t, engineFor(t, interval, 'continue', now), cont, 'March31/DST', { expect: 'trialing' });
        return { calendarSource: 'Root immutable Stage quota windows', hostedQuotaExecution: false };
    });
    for (const [label, at] of [['may', seconds('2026-05-31T10:00:00Z')], ['july', b.trialEnd - 1]])
        await step(t, `${interval}:${label}`, interval, at, async (now) => {
            await snapshot(t, engineFor(t, interval, 'continue', now), cont, label, { expect: 'trialing' });
            return { positivePayment: false };
        });
    // Timely receipt strictly before the exclusive end, deliberately failed before provider planning.
    await step(t, `${interval}:late-receipt`, interval, b.trialEnd - 1, async (now) => {
        const e = engineFor(t, interval, 'late_exit', now, { failFirstSubscriptionRead: true });
        await e.setCancellation(boundary.trialEnd);
        if (!e.state.mutation)
            await assert.rejects(() => e.run('cancel'), /fixture_pre_dispatch_read_unavailable/);
        assert.equal(e.state.mutation.operation, null);
        assert.equal(e.state.cancellation.cancellation_at, boundary.trialEnd);
        return { savedExactBarrier: true, receipt: iso(now) };
    });
    await settledInvoiceCheckpoint(t, plans[`${interval}:first-paid`], async (now) => {
        const p = await snapshot(t, engineFor(t, interval, 'continue', now), cont, 'first positive invoice', {
            expect: 'active', amount: interval === 'month' ? 1990 : 19900, positive: true
        });
        assert.ok(seconds(p.invoice.paidAt) >= b.trialEnd);
        const signal = `${interval}:lost-cancellation`;
        const signaled = !!t.state.fixtureSignals?.[signal];
        const e = engineFor(t, interval, 'late_exit', now, { loseCancellation: !signaled, onLoss: async () => {
                (t.state.fixtureSignals ||= {})[signal] = { at: iso(now), knownSubscription: late.subscription };
                await t.save();
            } });
        if (!signaled) {
            await snapshot(t, e, late, 'late exit first invoice settled before processing', {
                readOnly: true, amount: interval === 'month' ? 1990 : 19900, positive: true
            });
            await assert.rejects(() => e.run('recover'), /fixture_response_lost_after_confirmed_cancellation/);
        }
        assert.ok(t.state.fixtureSignals?.[signal], 'lost_response_fixture_not_proven');
        const before = Object.values(t.state.requests).filter(r => r.op === 'subscription.cancel' && r.role === late.role).reduce((n, r) => n + r.attempts, 0);
        await e.run('recover');
        const after = Object.values(t.state.requests).filter(r => r.op === 'subscription.cancel' && r.role === late.role).reduce((n, r) => n + r.attempts, 0);
        assert.equal(before, after, 'lost_cancel_response_repeated');
        assert.equal((await t.read('subscription.read', { id: late.subscription })).status, 'canceled');
        assert.ok(e.state.reviews.length);
        assert.equal(e.state.enteredPaidTerm, false);
        assert.equal(e.contract.cancellation_at, boundary.trialEnd);
        await snapshot(t, e, late, 'late exit after first invoice', { expect: 'canceled' });
        return {
            positiveChargeConfirmed: true, lateExitProviderCanceled: true, lateExitInvoiceReview: true, automaticRefund: false
        };
    });
    if (interval === 'month') {
        await step(t, 'month:decline-default', interval, plans['month:first-paid'].settledAt, async () => {
            if (!cont.declineSetup)
                await t.mutate('setup.create', { owner: cont, payment_method: boundary.cards[1] }, 'setup:month/continue:decline');
            await t.mutate('subscription.update', {
                owner: cont, id: cont.subscription, params: { default_payment_method: cont.declineMethod }
            }, 'decline:month/continue');
            return { declineDefaultOwned: true };
        });
        await settledInvoiceCheckpoint(t, plans['month:failed'], async (now) => {
            const e = engineFor(t, interval, 'continue', now);
            const p = await snapshot(t, e, cont, 'failed renewal', {
                expect: 'past_due', amount: 1990, positive: false
            });
            assert.equal(p.invoice.status, 'open');
            const since = p.projection.pastDueSince;
            await snapshot(t, e, cont, 'repeat failed renewal', { expect: 'past_due' });
            assert.equal(e.state.subscription.past_due_since, since);
            return { pastDueSince: since, invoice: p.invoice.id };
        });
        const failure = seconds(t.state.checkpoints['month:failed'].pastDueSince);
        assert.ok(Number.isFinite(failure) && failure <= plans['month:failed'].settledAt, 'fixed_failure_timestamp_required');
        const graceAt = failure + 7 * 86400;
        await step(t, 'month:grace-seven-days', interval, graceAt, async (now) => {
            const e = engineFor(t, interval, 'continue', now);
            const p = await snapshot(t, e, cont, 'seven days overdue', { expect: 'past_due' });
            assert.equal(p.projection.pastDueSince, t.state.checkpoints['month:failed'].pastDueSince);
            assert.ok(seconds(iso(now)) - seconds(p.projection.pastDueSince) >= 7 * 86400);
            return { fixedGraceObserved: true, hostedRightsAcceptance: false };
        });
        await step(t, 'month:recovered', interval, graceAt, async (now) => {
            await t.mutate('subscription.update', {
                owner: cont, id: cont.subscription, params: { default_payment_method: cont.paymentMethod }
            }, 'recover-default:month/continue');
            const invoice = t.state.checkpoints['month:failed'].invoice;
            await t.mutate('invoice.pay', {
                owner: cont, id: invoice, payment_method: cont.paymentMethod
            }, 'recover-pay:month/continue');
            const p = await snapshot(t, engineFor(t, interval, 'continue', now), cont, 'payment recovered', {
                expect: 'active', amount: 1990, positive: true
            });
            assert.equal(p.projection.pastDueSince, null);
            return { providerRecovery: true };
        });
    }
    // Fixed sample boundaries; actual source/provider periods remain authoritative.
    if (interval === 'month')
        for (const plan of invoiceCheckpointPlans(interval).filter(p => p.key.includes(':paid-month-'))) {
            await settledInvoiceCheckpoint(t, plan, async (now) => {
                await snapshot(t, engineFor(t, interval, 'continue', now), cont, `paid continuation ${iso(now)}`, { expect: 'active', positive: true });
                return { providerPaidContinuation: true };
            });
        }
    await settledInvoiceCheckpoint(t, plans[`${interval}:minimum-complete`], async (now) => {
        const e = engineFor(t, interval, 'continue', now);
        const p = await snapshot(t, e, cont, 'paid twelve months complete', {
            expect: 'active', amount: interval === 'month' ? 1990 : 19900, positive: true
        });
        assert.ok(seconds(p.periodEnd) > b.paidMinimumEnd);
        assert.equal(e.contract.paid_minimum_end, boundary.paidMinimumEnd);
        const positiveInvoices = p.invoiceSummary.filter(i => i.amountDue > 0);
        assert.equal(positiveInvoices.length, interval === 'month' ? 13 : 2, 'renewal_invoice_count');
        assert.ok(positiveInvoices.every(i => i.amountDue === e.contract.offer.unit_amount && i.status === 'paid'));
        await e.setCancellation(p.periodEnd);
        await e.run('cancel');
        return {
            paidMinimumComplete: true, cancelAt: p.periodEnd, annualRenewal: interval === 'year' ? 19900 : null
        };
    });
    const cancelAt = seconds(t.state.checkpoints[`${interval}:minimum-complete`].cancelAt);
    await step(t, `${interval}:terminated`, interval, cancelAt + 1, async (now) => {
        const p = await snapshot(t, engineFor(t, interval, 'continue', now), cont, 'period end terminated', { expect: 'canceled' });
        assert.equal(p.providerStatus, 'canceled');
        const open = p.invoiceSummary.filter(i => i.amountDue > 0 && i.status === 'open');
        assert.equal(open.length, 0);
        assert.equal(p.invoiceSummary.length, t.state.proofs.findLast(x => x.role === cont.role && x.label === 'paid twelve months complete').invoiceSummary.length, 'unexpected_final_renewal_invoice');
        return { providerTerminationConfirmed: true, invoiceCount: p.invoiceSummary.length };
    });
}
async function execute(t) {
    await inspect(t);
    await t.recoverRequests();
    for (const interval of ['month', 'year'])
        for (const plan of invoiceCheckpointPlans(interval))
            await registerSettlementPlan(t, plan);
    await bootstrap(t);
    for (const interval of ['month', 'year'])
        await lifecycle(t, interval);
    assert.ok(Object.values(t.state.requests).every(r => r.status === 'confirmed'), 'unresolved_journal_intents');
    t.state.status = 'provider_lifecycle_passed_fixture_sql';
    await t.save();
    const resources = {
        ...offlinePlan(), status: t.state.status, providerExecuted: true, ownedClocks: t.state.clocks, ownedResources: Object.values(t.state.owners).map(o => ({
            role: o.role, clock: o.clock, customer: o.customer, schedule: o.schedule, subscription: o.subscription, setup: o.setup, declineSetup: o.declineSetup
        })), checkpoints: t.state.checkpoints, proofs: t.state.proofs, proofGates: {
            ...offlinePlan().proofGates, providerLifecycle: 'passed', sourceEngineWithFixtureSql: 'passed'
        }
    };
    await output(resources);
    return resources;
}
export async function assertTeardownOwnership(t, interval) {
    return SandboxTransport.prototype.assertClockDeletionOwnership.call(t, interval);
}
async function cleanup(t) {
    await inspect(t);
    await t.recoverRequests();
    for (const interval of ['month', 'year']) {
        const clock = t.state.clocks[interval];
        if (!clock)
            continue;
        const key = `cleanup:${interval}`, record = t.state.requests[key];
        const saved = Object.values(t.state.owners).filter(o => o.clock === clock);
        if (record && record.status !== 'confirmed') {
            const clockOwner = saved[0] || {
                clock, role: `${interval}/continue`, contract: `task12-${interval}-continue`
            };
            await t.mutate('clock.delete', { owner: clockOwner, id: clock }, key);
            continue;
        }
        const owners = Object.values(t.state.owners).filter(o => o.clock === clock);
        const clockOwner = owners[0] || {
            clock, role: `${interval}/continue`, contract: `task12-${interval}-continue`
        };
        await t.mutate('clock.delete', { owner: clockOwner, id: clock }, key);
    }
    const clocks = await t.list('clock.list'), customers = await t.list('customer.list');
    assert.ok(!clocks.some(c => Object.values(boundary.clockNames).includes(c.name)));
    assert.ok(!customers.some(c => c.metadata?.benefitsi_release === boundary.release));
    t.state.cleanup = { confirmed: true, at: new Date().toISOString() };
    await t.save();
    const prior = JSON.parse(await readFile(join(directory, 'lifecycle-resources.json'), 'utf8'));
    prior.cleanup = t.state.cleanup;
    await output(prior);
    return { cleanup: 'confirmed', status: t.state.status };
}
export async function main(args = process.argv.slice(2), options = {}) {
    if (!args.length || sameArguments(args, ['plan']) || sameArguments(args, ['--dry-run']))
        return offlinePlan();
    const mode = args[0];
    if (!['inspect', 'execute', 'cleanup'].includes(mode))
        throw Error('invalid_mode');
    if (mode === 'inspect') {
        if (args.length !== 1)
            throw Error('unapproved_arguments');
    }
    else if (args.length !== 2 || args[1] !== `--reviewed=${boundary.release}`)
        throw Error('independent_review_required');
    const factory = options.transport || SandboxTransport.open;
    const t = await factory({ work: join(directory, 'work'), mode });
    try {
        if (mode === 'inspect')
            return await inspect(t);
        if (mode === 'cleanup')
            return await cleanup(t);
        if (t.state.cleanup?.confirmed)
            throw Error('sandbox_already_cleaned');
        return await execute(t);
    }
    catch (error) {
        if (mode !== 'inspect') {
            t.state.status = 'failed_or_unknown';
            t.state.failure = { code: /^[a-zA-Z0-9_:]+$/.test(error.message) ? error.message : 'assertion_failed', at: new Date().toISOString() };
            await t.save();
            await output({
                ...offlinePlan(), status: 'failed_or_unknown', providerExecuted: true, proofs: t.state.proofs, ownedResources: Object.values(t.state.owners).map(o => ({
                    role: o.role, clock: o.clock, customer: o.customer, schedule: o.schedule, subscription: o.subscription
                })), failure: t.state.failure
            });
        }
        throw error;
    }
    finally {
        await t.close();
    }
}
function sameArguments(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
        console.error(`Task12 stopped: ${/^[a-zA-Z0-9_:]+$/.test(error.message) ? error.message : 'assertion_failed'}; review the sanitized journal/proofs.`);
        process.exitCode = 1;
    });
}
