import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boundary, encodeForm, buildRequest, cliEnvironment, SandboxTransport, assertOwned, waitReady, requestHash } from '../scripts/partner-billing-sandbox-transport.mjs';
import { offlinePlan, main, advance, assertTeardownOwnership, assertActivationSnapshot, proveLateCancellationLoss } from '../scripts/partner-billing-sandbox.mjs';
import { createEngine, providerAdapter, assertProjection } from '../scripts/partner-billing-sandbox-engine.mjs';
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
test('fixed role-bearing bootstrap and actual Sourceadapter keys remain exact argv values with strict ASCII/length bounds', () => temporary(async (work) => {
    const customers = new Map(), setups = new Map(), schedules = new Map(), dispatchedKeys = [];
    let t;
    const invoke = async (argv) => {
        if (argv[0] === '--version')
            return 'stripe version 1.44.0';
        if (argv[1] === '/v1/account')
            return { id: boundary.account, charges_enabled: false };
        if (argv[1] === '/v1/balance')
            return { livemode: false };
        if (argv[1].startsWith('/v1/test_helpers/test_clocks/')) {
            const interval = argv[1].endsWith('clock_month') ? 'month' : 'year';
            return {
                ...clock, id: `clock_${interval}`, name: boundary.clockNames[interval]
            };
        }
        if (argv[0] === 'post') {
            const key = argv[argv.indexOf('--idempotency') + 1];
            dispatchedKeys.push(key);
            const record = Object.values(t.state.requests).find(r => r.key === key);
            assert.equal(record.status, 'dispatching');
            const o = record.descriptor.owner, suffix = o.role.replace(/[^a-z]/g, '');
            const metadata = {
                benefitsi_release: boundary.release, benefitsi_scope: boundary.scope, benefitsi_role: o.role, benefitsi_partner_contract: o.contract
            };
            if (record.op === 'customer.create') {
                const value = {
                    id: `cus_${suffix}`, test_clock: o.clock, livemode: false, metadata
                };
                customers.set(value.id, value);
                return value;
            }
            if (record.op === 'setup.create') {
                const value = {
                    id: `seti_${suffix}`, customer: o.customer, livemode: false, metadata, status: 'succeeded', payment_method: `pm_${suffix}`
                };
                setups.set(value.id, value);
                return value;
            }
            if (record.op === 'schedule.create') {
                const params = structuredClone(record.descriptor.params);
                const value = {
                    ...params, id: `sub_sched_${suffix}`, livemode: false, subscription: null, status: 'not_started', phases: [{ ...params.phases[0], start_date: params.start_date }]
                };
                schedules.set(value.id, value);
                return value;
            }
            throw Error('offline_unexpected_mutation');
        }
        const objectId = argv[1].split('/').at(-1);
        if (customers.has(objectId))
            return customers.get(objectId);
        if (setups.has(objectId))
            return setups.get(objectId);
        if (schedules.has(objectId))
            return schedules.get(objectId);
        if (argv[1] === '/v1/subscription_schedules')
            return { data: [], has_more: false };
        throw Error('offline_unexpected_read');
    };
    t = await SandboxTransport.open({
        work, mode: 'execute', invoke
    });
    try {
        t.state.clocks = { month: 'clock_month', year: 'clock_year' };
        for (const interval of ['month', 'year'])
            for (const caseId of ['continue', 'trial_exit', 'late_exit']) {
                const role = `${interval}/${caseId}`, contract = `task12-${interval}-${caseId}`;
                await t.mutate('customer.create', { owner: {
                        role, contract, clock: t.state.clocks[interval]
                    } }, `customer:${role}`);
                const owned = t.state.owners[role];
                await t.mutate('setup.create', { owner: owned, payment_method: boundary.cards[0] }, `setup:${role}:visa`);
                const engine = createEngine({
                    interval, caseId, customer: owned.customer, setup: owned.setup, stripe: providerAdapter(t, owned), now: boundary.seconds.frozen
                });
                await engine.run('reconcile');
                assert.ok(owned.schedule);
                assert.ok(dispatchedKeys.includes(`task12:customer:${role}`));
                assert.ok(dispatchedKeys.includes(`task12:setup:${role}:visa`));
                assert.ok(dispatchedKeys.includes(`task12:engine:partner-founder-activation:${contract}`));
                assert.equal(t.state.requests[`customer:${role}`].key, `task12:customer:${role}`);
                assert.equal(t.state.requests[`setup:${role}:visa`].key, `task12:setup:${role}:visa`);
            }
        assert.equal(dispatchedKeys.length, 18);
        const args = { owner: { ...owner, customer: undefined } };
        const maximumKey = 'x'.repeat(199) + '/';
        const argv = buildRequest('customer.create', args, maximumKey);
        assert.equal(argv[argv.indexOf('--idempotency') + 1], maximumKey);
        for (const bad of [maximumKey + 'x', 'task12:customer:month/continue\n', 'task12:customer:month/continue\r', 'task12:customer:month/continue\t', 'task12:customer:month/continue\0', 'task12:customer:month/continue --live', 'task12:customer:month/continue;stripe', 'task12:customer:month/continue$(x)'])
            assert.throws(() => buildRequest('customer.create', args, bad), /invalid_idempotency_key/);
    }
    finally {
        await t.close();
    }
}));
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
test('acknowledged advancing clock with old frozen time waits freshly for the same target; failures retain unknown', async () => {
    for (const outcome of ['ready', 'mismatch', 'timeout', 'reverse', 'foreign'])
        await temporary(async (work) => {
            let posted = false, posts = 0, polls = 0, wall = 0, providerOutcome = outcome;
            const target = boundary.seconds.activation, semantic = 'advance:month:month:activation';
            const invoke = async (argv) => {
                if (argv[0] === '--version')
                    return 'stripe version 1.44.0';
                if (argv[1] === '/v1/account')
                    return { id: boundary.account, charges_enabled: false };
                if (argv[1] === '/v1/balance')
                    return { livemode: false };
                if (argv[1] === '/v1/customers/cus_owned')
                    return customer;
                if (argv[0] === 'post') {
                    posted = true;
                    posts++;
                    assert.equal(argv[argv.indexOf('--idempotency') + 1], `task12:${semantic}`);
                    return {
                        ...clock, status: 'advancing', frozen_time: boundary.seconds.frozen
                    };
                }
                if (argv[1] === '/v1/test_helpers/test_clocks/clock_owned') {
                    if (!posted)
                        return clock;
                    polls++;
                    if (providerOutcome === 'timeout') {
                        wall += 120001;
                        return { ...clock, status: 'advancing' };
                    }
                    if (providerOutcome === 'reverse')
                        return {
                            ...clock, status: 'advancing', frozen_time: boundary.seconds.frozen - 1
                        };
                    if (providerOutcome === 'foreign')
                        return {
                            ...clock, id: 'clock_foreign', status: 'ready', frozen_time: target
                        };
                    return {
                        ...clock, status: 'ready', frozen_time: providerOutcome === 'mismatch' ? target + 1 : target
                    };
                }
                throw Error('offline_unexpected_read');
            };
            let t = await SandboxTransport.open({
                work, mode: 'execute', invoke, now: () => wall
            });
            try {
                t.state.clocks.month = clock.id;
                t.state.owners[owner.role] = owner;
                const request = () => t.mutate('clock.advance', {
                    owner, id: clock.id, target
                }, semantic);
                if (outcome === 'ready') {
                    const result = await request();
                    assert.equal(result.status, 'ready');
                    assert.equal(result.frozen_time, target);
                    assert.equal(t.state.requests[semantic].status, 'confirmed');
                }
                else {
                    await assert.rejects(request, /mutation_outcome_unknown/);
                    assert.equal(t.state.requests[semantic].status, 'unknown');
                }
                assert.equal(posts, 1);
                assert.equal(polls, 1);
                assert.equal(t.state.requests[semantic].attempts, 1);
                assert.equal(t.state.requests[semantic].clockTarget, target);
                assert.equal(t.state.requests[semantic].key, `task12:${semantic}`);
                assert.equal(t.state.requests[semantic].descriptor.target, target);
                assert.equal(t.state.requests[semantic].clockAcknowledgement.frozen_time, boundary.seconds.frozen);
                assert.deepEqual(t.state.checkpoints, {});
                const savedHash = t.state.requests[semantic].hash;
                if (outcome !== 'ready') {
                    providerOutcome = 'ready';
                    await t.close();
                    t = await SandboxTransport.open({
                        work, mode: 'execute', invoke, now: () => wall
                    });
                    const result = await t.mutate('clock.advance', {
                        owner, id: clock.id, target
                    }, semantic);
                    assert.equal(result.frozen_time, target);
                    assert.equal(t.state.requests[semantic].status, 'confirmed');
                    assert.equal(t.state.requests[semantic].attempts, 1);
                    assert.equal(t.state.requests[semantic].hash, savedHash);
                    assert.equal(posts, 1);
                    assert.deepEqual(t.state.checkpoints, {});
                }
            }
            finally {
                await t.close();
            }
        });
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
    const logicalParams = structuredClone(canceled);
    const update = buildRequest('schedule.update', {
        owner: owned, id: owned.schedule, params: canceled
    }, 'key');
    assert.ok(update.includes('phases[0][discounts]='));
    assert.ok(update.includes('phases[0][default_tax_rates]='));
    assert.equal(update.includes('phases[0][add_invoice_items]='), false);
    assert.deepEqual(structuredClone(canceled), logicalParams);
    const actualFields = update.filter((_, index) => update[index - 1] === '-d');
    assert.deepEqual(actualFields, [
        'end_behavior=cancel', 'proration_behavior=none',
        `phases[0][start_date]=${boundary.seconds.activation}`,
        `phases[0][end_date]=${boundary.seconds.trialExit}`,
        `phases[0][trial_end]=${boundary.seconds.trialExit}`,
        `phases[0][items][0][price]=${boundary.prices.month}`, 'phases[0][items][0][quantity]=1',
        'phases[0][currency]=eur', 'phases[0][discounts]=', 'phases[0][default_tax_rates]=',
        'phases[0][proration_behavior]=none',
        ...Object.entries(metadata).map(([name, value]) => `phases[0][metadata][${name}]=${value}`)
    ].sort((a, b) => a.localeCompare(b, 'en')));
});
test('activation replay accepts shortened trial only with original full proof and exact confirmed Source cancellation', () => {
    for (const interval of ['month', 'year']) {
        const activation = new Date(boundary.seconds.activation * 1000).toISOString();
        const fullEnd = new Date(boundary.seconds.trialEnd * 1000).toISOString();
        const exitEnd = new Date(boundary.seconds.trialExit * 1000).toISOString();
        const owned = { ...owner, role: `${interval}/trial_exit`, contract: `task12-${interval}-trial_exit`, schedule: 'sub_sched_owned', subscription: 'sub_owned', setup: 'seti_owned', paymentMethod: 'pm_owned' };
        const e = createEngine({ interval, caseId: 'trial_exit', customer: owned.customer, setup: owned.setup, stripe: {}, now: boundary.seconds.activation });
        Object.assign(e.contract, { state: 'accepted', schedule_id: owned.schedule, subscription_id: owned.subscription, payment_method_id: owned.paymentMethod, activated_at: boundary.activation, cancellation_at: boundary.trialExit });
        const schedule = { ...e.source.founderScheduleParams(e.contract, owned.customer), id: owned.schedule, livemode: false,
            metadata: { ...metadata, benefitsi_role: owned.role, benefitsi_partner_contract: owned.contract },
            phases: [{ ...e.source.founderScheduleParams(e.contract, owned.customer).phases[0], start_date: boundary.seconds.activation,
                metadata: { ...metadata, benefitsi_role: owned.role, benefitsi_partner_contract: owned.contract } }] };
        const params = e.source.founderTrialCancellation(schedule, e.contract, owned.customer);
        const descriptor = { owner: owned, id: owned.schedule, params };
        const key = `engine:fixture:${owned.contract}:3`;
        const full = { label: 'activation', role: owned.role, clock: owned.clock, frozen: activation, subscription: owned.subscription,
            providerStatus: 'trialing', trialStart: activation, trialEnd: fullEnd, periodStart: activation, periodEnd: fullEnd,
            projection: { state: 'trialing', paidThrough: null, firstPaymentAt: null, pastDueSince: null },
            invoice: { amountDue: 0, amountPaid: 0, positiveChargeVerified: false }, invoiceSummary: [{ amountDue: 0, amountPaid: 0 }],
            fixtureSql: true, readOnlySourceReader: false, fixturePaidTermEntered: false, hosted: false };
        const shortened = { ...structuredClone(full), trialEnd: exitEnd, periodEnd: exitEnd };
        const fixture = { contract: e.contract };
        const record = { op: 'schedule.update', role: owned.role, status: 'confirmed', key: `task12:${key}`, descriptor,
            hash: requestHash(buildRequest('schedule.update', descriptor, `task12:${key}`)),
            objectId: owned.schedule, id: owned.schedule, attempts: 3, checkpoint: `${interval}:planned` };
        const state = { owners: { [owned.role]: owned }, clocks: { [interval]: owned.clock }, fixtures: { [owned.role]: fixture }, proofs: [full, shortened], requests: { [key]: record } };
        e.state.subscription = { state: 'trialing', paid_through: null, first_payment_at: null, past_due_since: null,
            provider_status: 'trialing', contract_id: owned.contract, subscription_id: owned.subscription, customer_id: owned.customer,
            environment: 'test', period_start: activation, period_end: exitEnd };
        assert.doesNotThrow(() => assertActivationSnapshot(state, owned, shortened, e, 1));
        for (const change of [
            s => { s.proofs[0].trialEnd = exitEnd; }, s => { s.proofs[0].clock = 'clock_foreign'; },
            s => { s.requests[key].status = 'unknown'; }, s => { s.requests[key].role = `${interval}/continue`; },
            s => { s.requests[key].descriptor.id = 'sub_sched_foreign'; },
            s => { s.requests[key].descriptor.params.phases[0].end_date = boundary.seconds.trialEnd; },
            s => { s.requests[key].descriptor.params.phases[0].trial_end--; },
            s => {
                s.requests[key].descriptor.params.phases[0].end_date = boundary.seconds.trialEnd;
                s.requests[key].descriptor.params.phases[0].trial_end = boundary.seconds.trialEnd;
                s.requests[key].hash = requestHash(buildRequest('schedule.update', s.requests[key].descriptor, s.requests[key].key));
            },
            s => { s.requests[key].checkpoint = `${interval}:later`; },
            s => { s.fixtures[owned.role].contract.cancellation_at = boundary.trialEnd; },
            s => { s.proofs[1].frozen = fullEnd; }, s => { s.proofs[1].trialStart = exitEnd; }
        ]) {
            const bad = structuredClone(state); change(bad);
            assert.throws(() => assertActivationSnapshot(bad, owned, bad.proofs[1], { contract: bad.fixtures[owned.role].contract, state: e.state }, 1));
        }
        const missing = structuredClone(state); missing.proofs = [missing.proofs[1]];
        assert.throws(() => assertActivationSnapshot(missing, owned, missing.proofs[0], e, 0));
        const wrongCase = { ...owned, role: `${interval}/late_exit`, contract: `task12-${interval}-late_exit` };
        const wrongCaseProofs = state.proofs.map(p => ({ ...p, role: wrongCase.role }));
        const wrongCaseState = { ...state, owners: { [wrongCase.role]: wrongCase }, proofs: wrongCaseProofs };
        const wrongCaseEngine = { contract: e.contract, state: { ...e.state, subscription: { ...e.state.subscription, contract_id: wrongCase.contract } } };
        assert.throws(() => assertActivationSnapshot(wrongCaseState, wrongCase, wrongCaseProofs[1], wrongCaseEngine, 1), /activation_trial_exit_replay_only/);
        const stale = { ...e.state, subscription: { ...e.state.subscription, period_end: fullEnd } };
        assert.throws(() => assertActivationSnapshot(state, owned, shortened, { contract: e.contract, state: stale }, 1));
        e.state.subscription.period_end = fullEnd;
        const first = { ...state, proofs: [full], requests: {} };
        assert.doesNotThrow(() => assertActivationSnapshot(first, owned, full, e, 0));
        const wrongFull = { ...structuredClone(full), trialEnd: exitEnd, periodEnd: exitEnd };
        assert.throws(() => assertActivationSnapshot({ ...first, proofs: [wrongFull] }, owned, wrongFull, e, 0));
    }
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
        if (['/v1/subscription_schedules', '/v1/subscriptions'].includes(argv[1]))
            return { data: [], has_more: false };
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
test('late cancellation loss uses original paid proof and fresh unknown resolution, including startup recovery and intentional annual fixture', async () => {
    async function fixture(interval, run) {
        await temporary(async work => {
            const o = { ...owner, role: `${interval}/late_exit`, contract: `task12-${interval}-late_exit`, schedule: 'sub_sched_owned', subscription: 'sub_owned', setup: 'seti_owned', paymentMethod: 'pm_owned', invoices: ['in_owned'] };
            const semantic = `engine:fixture:${o.contract}:4:late-exit`, params = { invoice_now: false, prorate: false }, args = { owner: o, id: o.subscription, params };
            const now = boundary.seconds.trialEnd + 7200, wall = now * 1000 + 1000, amount = interval === 'month' ? 1990 : 19900;
            let canceled = true, deletes = 0, unknownDelete = false;
            const sub = () => ({ id: o.subscription, customer: o.customer, livemode: false, metadata: { ...metadata, benefitsi_role: o.role, benefitsi_partner_contract: o.contract }, status: canceled ? 'canceled' : 'active' });
            const invoke = async argv => {
                if (argv[0] === '--version') return 'stripe version 1.44.0';
                if (argv[1] === '/v1/account') return { id: boundary.account, charges_enabled: false };
                if (argv[1] === '/v1/balance') return { livemode: false };
                if (argv[1] === `/v1/test_helpers/test_clocks/${o.clock}`) return { ...clock, name: boundary.clockNames[interval], frozen_time: now };
                if (argv[1] === `/v1/customers/${o.customer}`) return { ...customer, metadata: sub().metadata };
                if (argv[0] === 'delete') { deletes++; canceled = true; if (unknownDelete) throw Error('synthetic_cli_response_unknown'); return sub(); }
                assert.equal(argv[0], 'get'); assert.equal(argv[1], `/v1/subscriptions/${o.subscription}`); return sub();
            };
            const t = await SandboxTransport.open({ work, mode: 'execute', invoke, now: () => wall });
            try {
                const receipt = new Date((boundary.seconds.trialEnd - 1) * 1000).toISOString();
                t.state.calls = 515; t.state.owners[o.role] = o; t.state.clocks[interval] = o.clock;
                t.state.checkpoints[`${interval}:late-receipt`] = { at: receipt, savedExactBarrier: true, receipt };
                t.state.checkpoints[`${interval}:first-paid:boundary`] = { at: boundary.trialEnd };
                const engine = createEngine({ interval, caseId: 'late_exit', customer: o.customer, setup: o.setup, stripe: {}, now });
                Object.assign(engine.contract, { state: 'accepted', subscription_id: o.subscription, schedule_id: o.schedule, payment_method_id: o.paymentMethod, cancellation_at: boundary.trialEnd, cancellation_requested_at: receipt });
                const original = engine.source.founderScheduleParams(engine.contract, o.customer);
                const update = engine.source.founderTrialCancellation({ ...original, id: o.schedule, livemode: false, phases: [{ ...original.phases[0], start_date: boundary.seconds.activation }] }, engine.contract, o.customer);
                t.state.fixtures[o.role] = { contract: engine.contract, cancellation: { cancellation_at: boundary.trialEnd, cancellation_requested_at: receipt },
                    mutation: { operation: 'schedule_trial_cancel', contract_id: o.contract, subscription_id: o.subscription, idempotency_key: `fixture:${o.contract}:4`, params: { schedule_id: o.schedule, update } } };
                t.state.proofs.push({ label: 'late exit first invoice settled before processing', role: o.role, clock: o.clock, subscription: o.subscription,
                    frozen: new Date(now * 1000).toISOString(), providerStatus: 'active', readOnlySourceReader: true, fixtureSql: true, hosted: false, fixturePaidTermEntered: false,
                    trialStart: new Date(boundary.seconds.activation * 1000).toISOString(), trialEnd: new Date(boundary.seconds.trialEnd * 1000).toISOString(), periodStart: new Date(boundary.seconds.trialEnd * 1000).toISOString(), periodEnd: interval === 'month' ? '2026-08-31T10:00:00.000Z' : '2027-07-31T10:00:00.000Z',
                    invoice: { id: 'in_owned', status: 'paid', amountDue: amount, amountPaid: amount, positiveChargeVerified: true, paidAt: new Date((boundary.seconds.trialEnd + 3600) * 1000).toISOString() },
                    projection: { firstPaymentAt: new Date((boundary.seconds.trialEnd + 3600) * 1000).toISOString() } });
                t.state.requests[semantic] = { op: 'subscription.cancel', role: o.role, descriptor: structuredClone(args), objectId: o.subscription,
                    key: `task12:${semantic}`, hash: requestHash(buildRequest('subscription.cancel', args, `task12:${semantic}`)), status: 'unknown', attempts: 1,
                    started: wall - 1000, failed: wall - 100, checkpoint: `${interval}:first-paid:boundary` };
                await t.save();
                await run({ t, o, now, semantic, params, sub, setCanceled: value => { canceled = value; }, loseDelete: () => { unknownDelete = true; }, deletes: () => deletes, work });
            } finally { await t.close(); }
        });
    }
    for (const startup of [false, true]) await fixture('month', async f => {
        const r = f.t.state.requests[f.semantic], failure = r.failed, proof = structuredClone(f.t.state.proofs[0]);
        if (startup) await f.t.recoverRequests();
        const signal = await proveLateCancellationLoss(f.t, f.o, f.now);
        assert.equal(signal.lineage, 'genuine_unknown_cancellation_resolved'); assert.equal(signal.failedAt, failure);
        assert.equal(r.status, 'confirmed'); assert.equal(r.attempts, 1); assert.equal(r.failed, failure); assert.equal(f.deletes(), 0);
        assert.equal(f.t.state.calls, startup ? 517 : 516); assert.deepEqual(f.t.state.proofs[0], proof);
        const saved = JSON.parse(await readFile(join(f.work, 'journal.json'), 'utf8'));
        assert.equal(saved.fixtureSignals['month:lost-cancellation'].originalOutcome.failed, failure);
        f.t.state.fixtures[f.o.role].mutation = null;
        assert.deepEqual(await proveLateCancellationLoss(f.t, f.o, f.now), signal);
        assert.equal(f.deletes(), 0);
        r.failed++;
        await assert.rejects(() => proveLateCancellationLoss(f.t, f.o, f.now), /late_loss_failure_history_changed/);
        r.failed = failure;
    });
    for (const interval of ['month', 'year']) await fixture(interval, async f => {
        delete f.t.state.requests[f.semantic]; f.loseDelete();
        const adapter = providerAdapter(f.t, f.o, { loseCancellation: true, onLoss: () => proveLateCancellationLoss(f.t, f.o, f.now, { intentional: true }) });
        // The original runner's marker-only assertion fails on an actual transport unknown.
        await assert.rejects(() => assert.rejects(() => adapter.subscriptions.cancel(f.o.subscription, f.params, { idempotencyKey: `fixture:${f.o.contract}:4:late-exit` }), /fixture_response_lost_after_confirmed_cancellation/), /did not match/);
        assert.equal(f.deletes(), 1); assert.equal(f.t.state.requests[f.semantic].status, 'unknown');
        await proveLateCancellationLoss(f.t, f.o, f.now);
        assert.equal(f.deletes(), 1); assert.equal(f.t.state.requests[f.semantic].attempts, 1);
        assert.equal(f.t.state.fixtureSignals[`${interval}:lost-cancellation`].lineage, 'genuine_unknown_cancellation_resolved');
    });
    for (const change of [
        f => { f.t.state.proofs = []; },
        f => { f.t.state.proofs[0].providerStatus = 'canceled'; },
        f => { f.t.state.proofs[0].invoice.positiveChargeVerified = false; },
        f => { f.t.state.requests[f.semantic].descriptor.params.invoice_now = true; },
        f => { f.t.state.requests[f.semantic].descriptor.owner.customer = 'cus_foreign'; },
        f => { f.setCanceled(false); }
    ]) await fixture('month', async f => {
        change(f); await assert.rejects(() => proveLateCancellationLoss(f.t, f.o, f.now));
        assert.equal(f.deletes(), 0); assert.equal(f.t.state.requests[f.semantic].status, 'unknown'); assert.equal(f.t.state.fixtureSignals, undefined);
    });
    await fixture('year', async f => {
        delete f.t.state.requests[f.semantic];
        const adapter = providerAdapter(f.t, f.o, { loseCancellation: true, onLoss: () => proveLateCancellationLoss(f.t, f.o, f.now, { intentional: true }) });
        await assert.rejects(() => adapter.subscriptions.cancel(f.o.subscription, f.params, { idempotencyKey: `fixture:${f.o.contract}:4:late-exit` }), /fixture_response_lost_after_confirmed_cancellation/);
        assert.equal(f.deletes(), 1); assert.equal(f.t.state.fixtureSignals['year:lost-cancellation'].lineage, 'intentional_fixture_after_confirmed_cancellation');
        assert.equal(f.t.state.requests[f.semantic].attempts, 1);
        await proveLateCancellationLoss(f.t, f.o, f.now); assert.equal(f.deletes(), 1);
    });
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
test('I2: pending still-present DELETE freshly rejects foreign schedule or subscription before retry', async () => {
    for (const foreignKind of ['schedule', 'subscription'])
        await temporary(async (work) => {
            let deletes = 0, scopeReads = 0, foreign = false;
            const owned = {
                ...owner, schedule: 'sub_sched_owned', subscription: 'sub_owned'
            };
            const schedule = {
                id: owned.schedule, customer: owned.customer, livemode: false, metadata, subscription: owned.subscription
            };
            const sub = {
                id: owned.subscription, customer: owned.customer, livemode: false, metadata
            };
            const invoke = async (argv) => {
                if (argv[0] === '--version')
                    return 'stripe version 1.44.0';
                if (argv[1] === '/v1/account')
                    return { id: boundary.account, charges_enabled: false };
                if (argv[1] === '/v1/balance')
                    return { livemode: false };
                if (argv[0] === 'get' && argv[1] === '/v1/test_helpers/test_clocks/clock_owned')
                    return clock;
                if (argv[1] === '/v1/test_helpers/test_clocks')
                    return { data: [clock], has_more: false };
                if (argv[1] === '/v1/customers')
                    return { data: [customer], has_more: false };
                if (argv[1] === '/v1/customers/cus_owned')
                    return customer;
                if (argv[1] === '/v1/subscription_schedules') {
                    scopeReads++;
                    return { data: foreign && foreignKind === 'schedule' ? [{ ...schedule, metadata: {} }] : [schedule], has_more: false };
                }
                if (argv[1] === '/v1/subscriptions') {
                    scopeReads++;
                    return { data: foreign && foreignKind === 'subscription' ? [{ ...sub, metadata: {} }] : [sub], has_more: false };
                }
                if (argv[0] === 'delete') {
                    deletes++;
                    throw Error('unknown still present');
                }
                throw Error('unexpected');
            };
            const t = await SandboxTransport.open({
                work, mode: 'cleanup', invoke
            });
            try {
                t.state.clocks.month = clock.id;
                t.state.owners[owner.role] = owned;
                await assert.rejects(() => t.mutate('clock.delete', { owner: owned, id: clock.id }, 'cleanup:month'), /outcome_unknown/);
                foreign = true;
                scopeReads = 0;
                await assert.rejects(() => t.mutate('clock.delete', { owner: owned, id: clock.id }, 'cleanup:month'), /not_owned_marker/);
                assert.equal(deletes, 1);
                assert.ok(scopeReads > 0);
            }
            finally {
                await t.close();
            }
        });
});
test('I1: ready clock with draft invoice advances only to immutable approved settlement; unknown resumes unchanged', async () => {
    for (const settledStatus of ['paid', 'open'])
        await temporary(async (work) => {
            const module = await import('../scripts/partner-billing-sandbox.mjs');
            assert.equal(typeof module.settledInvoiceCheckpoint, 'function');
            let frozen = boundary.seconds.trialEnd - 1, lose = true, settlementPosts = 0;
            const settled = boundary.seconds.trialEnd + 7200, owned = { ...owner, subscription: 'sub_owned' };
            const invoke = async (argv) => {
                if (argv[0] === '--version')
                    return 'stripe version 1.44.0';
                if (argv[1] === '/v1/account')
                    return { id: boundary.account, charges_enabled: false };
                if (argv[1] === '/v1/balance')
                    return { livemode: false };
                if (argv[1] === '/v1/customers/cus_owned')
                    return customer;
                if (argv[1] === '/v1/subscriptions/sub_owned')
                    return {
                        id: 'sub_owned', customer: customer.id, metadata, livemode: false, latest_invoice: 'in_owned'
                    };
                if (argv[1] === '/v1/invoices/in_owned')
                    return {
                        id: 'in_owned', customer: customer.id, livemode: false, parent: { subscription_details: { subscription: 'sub_owned' } }, status: frozen < settled ? 'draft' : settledStatus, amount_due: 1990
                    };
                if (argv[0] === 'post') {
                    frozen = Number(argv.find(x => x.startsWith('frozen_time=')).split('=')[1]);
                    if (frozen === settled) {
                        settlementPosts++;
                        if (lose) {
                            lose = false;
                            throw Error('unknown advance');
                        }
                    }
                    return { ...clock, frozen_time: frozen };
                }
                if (argv[1] === '/v1/test_helpers/test_clocks/clock_owned')
                    return {
                        ...clock, frozen_time: frozen, status: 'ready'
                    };
                throw Error('unexpected');
            };
            let t = await SandboxTransport.open({
                work, mode: 'execute', invoke
            });
            try {
                t.state.clocks.month = clock.id;
                t.state.owners[owner.role] = owned;
                const plan = {
                    interval: 'month', key: 'month:first-paid', boundaryAt: boundary.seconds.trialEnd, settledAt: settled
                };
                let paidReads = 0;
                const paid = async () => {
                    paidReads++;
                    assert.equal((await t.read('invoice.read', { id: 'in_owned' })).status, settledStatus);
                    return { settledProof: settledStatus };
                };
                await assert.rejects(() => module.settledInvoiceCheckpoint(t, plan, paid), /outcome_unknown/);
                await t.close();
                t = await SandboxTransport.open({
                    work, mode: 'execute', invoke
                });
                assert.equal(t.state.checkpoints['month:first-paid:boundary'].invoiceStatus, 'draft');
                assert.equal(paidReads, 0);
                await assert.rejects(() => module.settledInvoiceCheckpoint(t, {
                    ...plan, boundaryAt: plan.boundaryAt + 1, settledAt: settled + 1
                }, paid), /settlement_plan_changed/);
                await module.settledInvoiceCheckpoint(t, plan, paid);
                assert.equal(settlementPosts, 1);
                assert.equal(paidReads, 1);
                assert.equal(t.state.checkpoints['month:first-paid'].settledProof, settledStatus);
            }
            finally {
                await t.close();
            }
        });
});
test('offline budget measures unchanged actual Source groups, historical infeasibility and Root-approved bounded margin', async () => {
    const { measureSourceGroups, workflowBudget } = await import('../scripts/partner-billing-sandbox-budget.mjs');
    const measured = await measureSourceGroups();
    assert.deepEqual(Object.fromEntries(Object.entries(measured).map(([name, group]) => [name, group.calls])), {
        planned: 4, reconcileTrial: 7, readerPaid: 7, reconcilePaid: 9, reconcileFailed: 7, cancelTrial: 24, reconcileCanceledTrial: 12, lateRecoveryLost: 11, lateRecoveryConfirmed: 18, reconcileCanceledPaid: 16, cancelPaid: 26
    });
    const budget = workflowBudget(measured);
    assert.equal(budget.executionMinimum, 1119);
    assert.equal(budget.cleanupMinimum, 47);
    assert.equal(budget.pollingMargin, 66);
    assert.equal(budget.executionWithPolling, 1185);
    assert.equal(budget.historicalBudget.repairedExecutionWithPollingOverCap, 252);
    assert.equal(budget.originalExecutionMinimum, 956);
    assert.equal(budget.historicalBudget.currentExecutionWithPollingOverOldCap, 285);
    assert.equal(budget.historicalBudget.firstSettlementFixExecutionMinimum, 1086);
    assert.equal(budget.historicalBudget.firstSettlementFixExecutionWithPolling, 1152);
    assert.equal(budget.historicalBudget.feasible, false);
    assert.equal(budget.feasible, true);
    assert.equal(budget.totalCap, 1500);
    assert.equal(budget.executionCap, 1300);
    assert.equal(budget.cleanupReserve, 200);
    assert.equal(budget.executionMargin, 115);
    assert.equal(budget.cleanupThreePassMargin, 59);
    assert.equal(budget.originalPostReconcileReaderCalls, 0);
    assert.equal(budget.repairedPostReconcileReaderCalls, 0);
});
test('Root fixed 1500-call cap reserves 200 cleanup calls and durable resume never resets the counter', () => temporary(async (work) => {
    let dispatched = 0;
    const invoke = async () => {
        dispatched++;
        return 'offline-only';
    };
    let t = await SandboxTransport.open({
        work, mode: 'execute', invoke
    });
    try {
        t.state.calls = 1299;
        await t.save();
        await t.call(['--version']);
        assert.equal(t.state.calls, 1300);
        await assert.rejects(() => t.call(['--version']), /cleanup_budget_reserved/);
        assert.equal(dispatched, 1);
        await t.close();
        t = await SandboxTransport.open({
            work, mode: 'cleanup', invoke
        });
        assert.equal(t.state.calls, 1300);
        // Fixture represents previously consumed cleanup calls; no actual CLI loop is needed.
        t.state.calls = 1499;
        await t.save();
        await t.call(['--version']);
        assert.equal(t.state.calls, 1500);
        await assert.rejects(() => t.call(['--version']), /cli_budget_exhausted/);
        assert.equal(dispatched, 2);
        await t.close();
        t = await SandboxTransport.open({
            work, mode: 'cleanup', invoke
        });
        assert.equal(t.state.calls, 1500);
        await assert.rejects(() => t.call(['--version']), /cli_budget_exhausted/);
        assert.equal(dispatched, 2);
    }
    finally {
        await t.close();
    }
}));
