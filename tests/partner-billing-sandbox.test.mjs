import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boundary, encodeForm, buildRequest, cliEnvironment, SandboxTransport, assertOwned, waitReady } from '../scripts/partner-billing-sandbox-transport.mjs';
import { offlinePlan, main, advance, assertTeardownOwnership } from '../scripts/partner-billing-sandbox.mjs';
import { createEngine, assertProjection } from '../scripts/partner-billing-sandbox-engine.mjs';
const metadata = {
    benefitsi_release: boundary.release, benefitsi_scope: boundary.scope, benefitsi_role: 'month/continue', benefitsi_partner_contract: 'task12-month-continue'
};
const clock = {
    id: 'clock_owned', object: 'test_helpers.test_clock', name: boundary.clockNames.month, frozen_time: boundary.seconds.frozen, status: 'ready', livemode: false
};
const customer = {
    id: 'cus_owned', object: 'customer', livemode: false, test_clock: clock.id, metadata
};
const owner = {
    clock: clock.id, role: 'month/continue', contract: metadata.benefitsi_partner_contract, customer: customer.id
};
async function temporary(run) {
    const directory = await mkdtemp(join(tmpdir(), 'task12-test-'));
    try {
        return await run(directory);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
}
test('offline default and dry-run never invoke transport or write', async () => {
    let used = false;
    const options = { transport: () => {
            used = true;
            throw Error('remote');
        } };
    assert.equal((await main([], options)).status, 'pending');
    assert.equal((await main(['--dry-run'], options)).status, 'pending');
    assert.equal(used, false);
    assert.deepEqual(offlinePlan().maximum, {
        clocks: 2, customers: 6, schedules: 6, setupIntents: 7
    });
});
test('deep form uses Stripe array indices and explicit empty arrays', () => {
    assert.deepEqual(encodeForm({ phases: [{ items: [{ price: 'price_a', quantity: 1 }], discounts: [] }], prorate: false }), [['phases[0][discounts]', ''], ['phases[0][items][0][price]', 'price_a'], ['phases[0][items][0][quantity]', '1'], ['prorate', 'false']]);
});
test('exact argv rejects arbitrary routes, flags, metadata, cards, target changes and live fields', () => {
    assert.deepEqual(buildRequest('clock.read', { id: clock.id }).slice(0, 4), ['get', '/v1/test_helpers/test_clocks/clock_owned', '--stripe-version', boundary.api]);
    for (const [op, args] of [['/v1/products', {}], ['clock.read', { id: 'clock_owned --live' }], ['clock.create', { interval: 'month', livemode: true }], ['setup.create', { owner, payment_method: 'pm_real' }], ['subscription.cancel', {
                owner, id: 'sub_other', params: { invoice_now: true, prorate: false }
            }]])
        assert.throws(() => buildRequest(op, args));
    const env = cliEnvironment({
        PATH: '/usr/bin', STRIPE_API_KEY: 'secret', STRIPE_ACCOUNT: 'acct_bad', OTHER: 'okay'
    });
    assert.equal(env.STRIPE_API_KEY, undefined);
    assert.equal(env.OTHER, 'okay');
    assert.equal(env.STRIPE_CLI_TELEMETRY_OPTOUT, '1');
});
test('ownership excludes foreign clocks, customers, contract markers, live and deleted objects', () => {
    assertOwned('clock', clock, { interval: 'month', clock: clock.id });
    assertOwned('customer', customer, owner);
    for (const patch of [{ test_clock: 'clock_foreign' }, { livemode: true }, { deleted: true }, { metadata: { ...metadata, benefitsi_partner_contract: 'other' } }, { metadata: { ...metadata, benefitsi_scope: 'other' } }])
        assert.throws(() => assertOwned('customer', { ...customer, ...patch }, owner));
});
test('durable mutation intent precedes dispatch; unknown creation resolves before repeat', () => temporary(async (work) => {
    let creates = 0;
    const calls = [];
    const invoke = async (argv) => {
        calls.push(argv);
        if (argv[0] === '--version')
            return 'stripe version 1.44.0';
        const path = argv[1];
        if (path === '/v1/account')
            return { id: boundary.account, charges_enabled: false };
        if (path === '/v1/balance')
            return { livemode: false };
        if (argv[0] === 'post') {
            const saved = JSON.parse(await readFile(join(work, 'journal.json'), 'utf8'));
            assert.equal(saved.requests['clock:month'].status, 'dispatching');
            creates++;
            throw Error('response secret lost');
        }
        if (path === '/v1/test_helpers/test_clocks')
            return { data: [clock], has_more: false };
        throw Error('unexpected');
    };
    const transport = await SandboxTransport.open({
        work, invoke, mode: 'execute'
    });
    try {
        await assert.rejects(() => transport.mutate('clock.create', { interval: 'month' }, 'clock:month'), /outcome_unknown/);
        const recovered = await transport.mutate('clock.create', { interval: 'month' }, 'clock:month');
        assert.equal(recovered.id, clock.id);
        assert.equal(creates, 1);
        const journal = await readFile(join(work, 'journal.json'), 'utf8');
        assert.doesNotMatch(journal, /response secret|client_secret/);
        assert.equal(JSON.parse(journal).requests['clock:month'].status, 'confirmed');
    }
    finally {
        await transport.close();
    }
}));
test('immutable semantic key, old uncertainty, locks and inspect mutation deny', () => temporary(async (work) => {
    const t = await SandboxTransport.open({
        work, mode: 'execute', invoke: async () => {
            throw Error('unused');
        }
    });
    try {
        await assert.rejects(() => SandboxTransport.open({ work, mode: 'execute' }), /locked/);
        t.state.requests.key = {
            hash: 'different', status: 'unknown', started: Date.now() - 24 * 3600000, attempts: 1
        };
        await assert.rejects(() => t.mutate('clock.create', { interval: 'month' }, 'key'), /request_changed/);
        t.mode = 'inspect';
        await assert.rejects(() => t.mutate('clock.create', { interval: 'month' }, 'new'), /read_only/);
    }
    finally {
        await t.close();
    }
}));
test('clock readiness must be fresh, monotone and bounded; advancing is no checkpoint', async () => {
    let now = 0, reads = 0;
    const result = await waitReady(async () => {
        reads++;
        return {
            ...clock, status: reads === 1 ? 'advancing' : 'ready', frozen_time: 200
        };
    }, 200, 100, { now: () => now, sleep: async (ms) => {
            now += ms;
        } });
    assert.equal(result.status, 'ready');
    assert.equal(reads, 2);
    await assert.rejects(() => waitReady(async () => ({
        ...clock, status: 'ready', frozen_time: 199
    }), 200, 100), /clock_time_mismatch/);
    await assert.rejects(() => waitReady(async () => ({
        ...clock, status: 'advancing', frozen_time: 200
    }), 200, 100, {
        now: () => now, sleep: async (ms) => {
            now += ms;
        }, timeout: 2
    }), /clock_not_ready/);
});
test('projection rejects provisional zero/manual first payment and incomplete paid rights', () => {
    assert.throws(() => assertProjection({
        state: 'trialing', paid_through: null, first_payment_at: '2026-01-31'
    }, { amount_due: 0 }, { positive: false }), /unverified_first_payment/);
    assert.throws(() => assertProjection({
        state: 'active', paid_through: '2026-08-31', first_payment_at: null
    }, { amount_due: 1990 }, { positive: false }), /unverified_paid_rights/);
    assertProjection({
        state: 'trialing', paid_through: null, first_payment_at: null
    }, { amount_due: 0 }, { positive: false });
});
test('fixture engine restores only its own process configuration and uses source activation plan', async () => {
    const saved = process.env.BENEFITSI_PARTNER_BILLING_ENABLED;
    const e = createEngine({
        interval: 'month', caseId: 'continue', customer: 'cus_owned', setup: 'seti_owned', stripe: {}, now: boundary.seconds.frozen
    });
    e.contract.payment_method_id = 'pm_owned';
    assert.equal(e.contract.trial_start, boundary.activation);
    assert.equal(e.contract.offer.stripe_price_id, boundary.prices.month);
    assert.equal(e.source.founderScheduleParams(e.contract, 'cus_owned').start_date, boundary.seconds.activation);
    await assert.rejects(() => e.run('reconcile'), /fixture_expected/);
    assert.equal(process.env.BENEFITSI_PARTNER_BILLING_ENABLED, saved);
});
test('unknown identical dispatches retry at most three and block uncertainty after23hours', () => temporary(async (work) => {
    let now = 1000, creates = 0;
    const invoke = async (argv) => {
        if (argv[0] === '--version')
            return 'stripe version 1.44.0';
        if (argv[1] === '/v1/account')
            return { id: boundary.account, charges_enabled: false };
        if (argv[1] === '/v1/balance')
            return { livemode: false };
        if (argv[0] === 'get')
            return { data: [], has_more: false };
        creates++;
        throw Error('timeout');
    };
    const t = await SandboxTransport.open({
        work, invoke, mode: 'execute', now: () => now
    });
    try {
        for (let i = 0; i < 3; i++)
            await assert.rejects(() => t.mutate('clock.create', { interval: 'month' }, 'clock:month'), /outcome_unknown/);
        await assert.rejects(() => t.mutate('clock.create', { interval: 'month' }, 'clock:month'), /retry_budget_exhausted/);
        assert.equal(creates, 3);
        now += 23 * 3600000;
        await assert.rejects(() => t.mutate('clock.create', { interval: 'month' }, 'clock:month'), /uncertainty_expired/);
        assert.equal(creates, 3);
    }
    finally {
        await t.close();
    }
}));
test('resource budgets reject a second semantic key for the same case and a second decline case', () => temporary(async (work) => {
    const t = await SandboxTransport.open({
        work, mode: 'execute', invoke: async () => {
            throw Error('offline_unexpected_dispatch');
        }
    });
    try {
        t.state.requests.first = {
            op: 'customer.create', target: owner.role, hash: 'original'
        };
        await assert.rejects(() => t.mutate('customer.create', { owner: { ...owner, customer: undefined } }, 'second'), /duplicate_resource_target/);
        t.state.requests.decline = { op: 'setup.create', target: `month/continue:${boundary.cards[1]}` };
        assert.throws(() => t.budget('setup.create', { owner: {
                ...owner, role: 'year/continue', contract: 'task12-year-continue'
            }, payment_method: boundary.cards[1] }), /decline_budget_exhausted/);
    }
    finally {
        await t.close();
    }
}));
test('ready clocks past an unrecorded checkpoint cannot fabricate historical success', async () => {
    await assert.rejects(() => waitReady(async () => ({
        ...clock, frozen_time: boundary.seconds.trialEnd, status: 'ready'
    }), boundary.seconds.trialExit, boundary.seconds.activation), /clock_time_mismatch/);
});
test('strict schedule bodies accept actual source empty-array cancellation and reject altered amount metadata', () => {
    const e = createEngine({
        interval: 'month', caseId: 'continue', customer: 'cus_owned', setup: 'seti_owned', stripe: {}, now: boundary.seconds.frozen
    });
    e.contract.payment_method_id = 'pm_owned';
    const owned = {
        ...owner, paymentMethod: 'pm_owned', schedule: 'sub_sched_owned'
    };
    const params = e.source.founderScheduleParams(e.contract, owned.customer);
    params.metadata = metadata;
    params.phases[0].metadata = metadata;
    const argv = buildRequest('schedule.create', { owner: owned, params }, 'key');
    assert.ok(argv.includes(`phases[0][metadata][benefitsi_scope]=${boundary.scope}`));
    assert.throws(() => buildRequest('schedule.create', { owner: owned, params: { ...params, phases: [{ ...params.phases[0], items: [{ price: 'price_foreign', quantity: 1 }] }] } }, 'key'));
    e.contract.schedule_id = owned.schedule;
    e.contract.cancellation_at = boundary.trialExit;
    const schedule = {
        ...params, id: owned.schedule, livemode: false, default_settings: params.default_settings, phases: [{ ...params.phases[0], start_date: boundary.seconds.activation }]
    };
    const canceled = e.source.founderTrialCancellation(schedule, e.contract, owned.customer);
    const update = buildRequest('schedule.update', {
        owner: owned, id: owned.schedule, params: canceled
    }, 'key');
    assert.ok(update.includes('phases[0][discounts]='));
});
test('resume of advancing clock resolves the exact intent, never dispatches twice', () => temporary(async (work) => {
    const key = 'advance:month:activation';
    let polls = 0, posts = 0;
    const invoke = async (argv) => {
        if (argv[0] === 'post') {
            posts++;
            throw Error('unexpected');
        }
        ;
        if (argv[1]?.includes('/test_clocks/clock_owned'))
            return {
                ...clock, frozen_time: boundary.seconds.activation, status: ++polls < 3 ? 'advancing' : 'ready'
            };
        throw Error('unexpected');
    };
    const t = await SandboxTransport.open({
        work, mode: 'execute', invoke
    });
    try {
        t.state.clocks.month = clock.id;
        t.state.owners[owner.role] = owner;
        const args = {
            owner, id: clock.id, target: boundary.seconds.activation
        };
        t.state.requests[key] = {
            op: 'clock.advance', hash: (await import('../scripts/partner-billing-sandbox-transport.mjs')).requestHash(buildRequest('clock.advance', args, `task12:${key}`)), status: 'unknown', started: Date.now(), attempts: 1
        };
        assert.equal(await advance(t, 'month', boundary.seconds.activation, 'activation'), boundary.seconds.activation);
        assert.equal(posts, 0);
        assert.equal(t.state.requests[key].status, 'confirmed');
    }
    finally {
        await t.close();
    }
}));
test('teardown rejects a foreign customer even if own clock name and own IDs all match', async () => {
    const owners = Object.fromEntries(['continue', 'trial_exit', 'late_exit'].map((caseId, i) => [`month/${caseId}`, {
            ...owner, role: `month/${caseId}`, contract: `task12-month-${caseId}`, customer: `cus_own${i}`
        }]));
    const t = { state: { clocks: { month: clock.id }, owners }, list: async () => [...Object.values(owners).map(o => ({
                ...customer, id: o.customer, metadata: {
                    ...metadata, benefitsi_role: o.role, benefitsi_partner_contract: o.contract
                }
            })), {
                ...customer, id: 'cus_foreign', metadata: {}
            }] };
    await assert.rejects(() => assertTeardownOwnership(t, 'month'), /foreign_customer_on_owned_clock/);
});
test('lost owned clock DELETE response resolves absence without a second DELETE', () => temporary(async (work) => {
    let exists = true, deletes = 0;
    const invoke = async (argv) => {
        if (argv[0] === '--version')
            return 'stripe version 1.44.0';
        if (argv[1] === '/v1/account')
            return { id: boundary.account, charges_enabled: false };
        if (argv[1] === '/v1/balance')
            return { livemode: false };
        if (argv[1] === '/v1/customers')
            return { data: exists ? [customer] : [], has_more: false };
        if (argv[1] === '/v1/customers/cus_owned')
            return customer;
        if (argv[0] === 'delete') {
            exists = false;
            deletes++;
            throw Error('lost');
        }
        ;
        if (argv[1] === '/v1/test_helpers/test_clocks')
            return { data: exists ? [clock] : [], has_more: false };
        if (argv[1] === '/v1/test_helpers/test_clocks/clock_owned')
            return clock;
        throw Error('unexpected');
    };
    const t = await SandboxTransport.open({
        work, mode: 'cleanup', invoke
    });
    try {
        t.state.clocks.month = clock.id;
        t.state.owners[owner.role] = owner;
        await assert.rejects(() => t.mutate('clock.delete', { owner, id: clock.id }, 'cleanup:month'), /outcome_unknown/);
        const result = await t.mutate('clock.delete', { owner, id: clock.id }, 'cleanup:month');
        assert.equal(result.deleted, true);
        assert.equal(deletes, 1);
        assert.equal(t.state.clocks.month, null);
    }
    finally {
        await t.close();
    }
}));
test('actual source engine activates only at exact clock time and preserves a late barrier after lost cancellation', async () => {
    const iterable = data => ({ async *[Symbol.asyncIterator]() {
            yield* data;
        } });
    let schedule, sub, cancelDispatches = 0, lose = true, latePaid = false, failRead = false;
    const price = {
        id: boundary.prices.month, active: true, livemode: false, currency: 'eur', unit_amount: 1990, tax_behavior: 'exclusive', type: 'recurring', recurring: {
            interval: 'month', interval_count: 1, usage_type: 'licensed'
        }
    };
    const stripe = {
        setupIntents: { retrieve: async () => ({
                id: 'seti_owned', customer: 'cus_owned', livemode: false, status: 'succeeded', payment_method: 'pm_owned'
            }) }, subscriptionSchedules: {
            list: () => iterable(schedule ? [schedule] : []), create: async (p) => {
                schedule = {
                    ...structuredClone(p), id: 'sub_sched_owned', livemode: false, subscription: null, status: 'not_started', phases: [{ ...structuredClone(p.phases[0]), start_date: p.start_date }]
                };
                return schedule;
            }, retrieve: async () => schedule, update: async () => {
                throw Error('must_not_backdate');
            }, cancel: async () => {
                throw Error('released_schedule_must_not_cancel');
            }
        }, subscriptions: { retrieve: async () => {
                if (failRead) {
                    failRead = false;
                    throw Error('synthetic_read_failure');
                }
                ;
                return sub;
            }, cancel: async (id, p) => {
                assert.equal(id, 'sub_owned');
                assert.deepEqual(structuredClone(p), { invoice_now: false, prorate: false });
                cancelDispatches++;
                sub.status = 'canceled';
                if (lose) {
                    lose = false;
                    throw Error('synthetic_response_lost');
                }
                ;
                return sub;
            } }, invoices: { retrieve: async () => ({
                id: 'in_owned', customer: 'cus_owned', livemode: false, parent: { subscription_details: { subscription: 'sub_owned' } }, status: 'paid', amount_due: latePaid ? 1990 : 0, status_transitions: latePaid ? { paid_at: boundary.seconds.trialEnd } : {}
            }), listLineItems: () => iterable([{
                    pricing: { price_details: { price: price.id } }, quantity: 1, period: { start: boundary.seconds.trialEnd, end: Date.parse('2026-08-31T10:00:00Z') / 1000 }
                }]) }, invoicePayments: { list: () => iterable(latePaid ? [{
                    id: 'inpay_owned', invoice: 'in_owned', livemode: false, amount_paid: 1990, payment: { charge: 'ch_owned' }
                }] : []) }, charges: { retrieve: async () => ({
                id: 'ch_owned', customer: 'cus_owned', livemode: false, paid: true, amount_refunded: 0, disputed: false
            }) }
    };
    const e = createEngine({
        interval: 'month', caseId: 'late_exit', customer: 'cus_owned', setup: 'seti_owned', stripe, now: boundary.seconds.frozen
    });
    await e.run('reconcile');
    assert.equal(schedule.subscription, null);
    assert.equal(e.contract.activated_at, null);
    assert.equal(e.state.subscription, null);
    schedule.status = 'active';
    schedule.subscription = 'sub_owned';
    sub = {
        id: 'sub_owned', customer: 'cus_owned', livemode: false, status: 'trialing', metadata: { benefitsi_partner_contract: e.contract.id }, schedule: schedule.id, trial_start: boundary.seconds.activation, trial_end: boundary.seconds.trialEnd, discounts: [], items: { has_more: false, data: [{
                    id: 'si_owned', price, quantity: 1, current_period_start: boundary.seconds.activation, current_period_end: boundary.seconds.trialEnd
                }] }, latest_invoice: 'in_owned', cancel_at_period_end: false
    };
    e.setTime(boundary.seconds.activation);
    await e.run('reconcile');
    assert.equal(e.state.subscription.state, 'trialing');
    assert.equal(e.contract.activated_at, boundary.activation);
    assert.equal(e.contract.paid_minimum_end, boundary.paidMinimumEnd);
    assert.equal(e.state.enteredPaidTerm, false);
    e.setTime(boundary.seconds.trialEnd - 1);
    await e.setCancellation(boundary.trialEnd);
    failRead = true;
    await assert.rejects(() => e.run('cancel'), /synthetic_read_failure/);
    assert.equal(e.state.mutation.operation, null);
    e.setTime(boundary.seconds.trialEnd + 1);
    latePaid = true;
    schedule.status = 'released';
    schedule.subscription = null;
    schedule.released_subscription = 'sub_owned';
    sub.status = 'active';
    sub.schedule = null;
    sub.items.data[0].current_period_start = boundary.seconds.trialEnd;
    sub.items.data[0].current_period_end = Date.parse('2026-08-31T10:00:00Z') / 1000;
    await assert.rejects(() => e.run('recover'), /synthetic_response_lost/);
    assert.equal(e.state.mutation.operation, 'schedule_trial_cancel');
    assert.ok(e.state.reviews.length);
    await e.run('recover');
    assert.equal(cancelDispatches, 1);
    assert.equal(e.state.subscription.provider_status, 'canceled');
    assert.equal(e.contract.cancellation_at, boundary.trialEnd);
    assert.equal(e.contract.paid_minimum_end, boundary.paidMinimumEnd);
    assert.equal(e.state.enteredPaidTerm, false);
    assert.equal(e.state.mutation, null);
});
test('request ownership requires confirmed registry IDs and rejects a supplied foreign payment method', () => temporary(async (work) => {
    const t = await SandboxTransport.open({
        work, mode: 'execute', invoke: async () => {
            throw Error('offline_unexpected_dispatch');
        }
    });
    try {
        await assert.rejects(() => t.ownership(owner), /unconfirmed_clock_owner/);
        t.state.clocks.month = clock.id;
        await assert.rejects(() => t.ownership(owner), /unconfirmed_customer_owner/);
        t.state.owners[owner.role] = { ...owner, paymentMethod: 'pm_owned' };
        await assert.rejects(() => t.ownership({ ...owner, paymentMethod: 'pm_foreign' }), /unconfirmed_owner_field/);
    }
    finally {
        await t.close();
    }
}));
