/** Narrow normal-auth Stripe CLI boundary. No SDK keys, arbitrary paths or raw output artifacts. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
// Root ruling before any Task12 provider effect: fixed cap, no reset/dynamic expansion.
export const cliBudget = Object.freeze({
    total: 1500, cleanupReserve: 200, execution: 1300
});
const dates = {
    frozen: '2026-01-31T10:50:00Z', activation: '2026-01-31T11:00:00Z', trialEnd: '2026-07-31T10:00:00Z', paidMinimumEnd: '2027-07-31T10:00:00Z', trialExit: '2026-02-28T11:00:00Z'
};
export const boundary = Object.freeze({
    account: 'acct_1T3ZuLH0Ev7iKGq0', api: '2026-06-24.dahlia', cli: '1.44.0', release: 'partner-dashboard-task12-2026-10-01', scope: 'isolated_sandbox_lifecycle', ...dates, seconds: Object.freeze(Object.fromEntries(Object.entries(dates).map(([k, v]) => [k, Date.parse(v) / 1000]))), cards: Object.freeze(['pm_card_visa', 'pm_card_chargeCustomerFail']), maximum: Object.freeze({
        clocks: 2, customers: 6, schedules: 6, setupIntents: 7
    }), prices: Object.freeze({ month: 'price_1ULmg4H0Ev7iKGq0RLhEADeI', year: 'price_1ULmg6H0Ev7iKGq021h3wOpB' }), clockNames: Object.freeze({ month: 'Benefitsi Task12 Founder/month 2026-10-01 NONLIVE', year: 'Benefitsi Task12 Founder/year 2026-10-01 NONLIVE' }), hostedDb: false, signedWebhook: false, realAgreement: false, livePayment: false
});
const fail = code => {
    throw Error(code);
};
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(x) {
    return Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
}
export const requestHash = x => createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const id = (x, prefix) => {
    if (typeof x !== 'string' || !new RegExp(`^${prefix}_[a-zA-Z0-9]+$`).test(x))
        fail('invalid_id');
    return x;
};
const keys = (x, allowed) => {
    if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some(k => !allowed.includes(k)))
        fail('unapproved_body_field');
};
const role = o => {
    if (!o || !/^(month|year)\/(continue|trial_exit|late_exit)$/.test(o.role) || o.contract !== `task12-${o.role.replace('/', '-')}`)
        fail('invalid_owner_role');
    id(o.clock, 'clock');
    if (o.customer)
        id(o.customer, 'cus');
    return o;
};
export const marker = o => ({
    benefitsi_release: boundary.release, benefitsi_scope: boundary.scope, benefitsi_role: role(o).role, benefitsi_partner_contract: o.contract
});
export function encodeForm(body) {
    const rows = [];
    function walk(v, key) {
        if (Array.isArray(v)) {
            if (!v.length)
                rows.push([key, '']);
            else
                v.forEach((value, i) => walk(value, `${key}[${i}]`));
        }
        else if (v && typeof v === 'object') {
            for (const k of Object.keys(v).sort())
                walk(v[k], key ? `${key}[${k}]` : k);
        }
        else {
            if (!['string', 'number', 'boolean'].includes(typeof v) || String(v).includes('\0'))
                fail('invalid_form');
            rows.push([key, String(v)]);
        }
    }
    walk(body, '');
    return rows.sort(([a], [b]) => a.localeCompare(b, 'en'));
}
export function cliEnvironment(inherited = process.env) {
    return {
        ...Object.fromEntries(Object.entries(inherited).filter(([k]) => !k.startsWith('STRIPE_'))), NO_COLOR: '1', STRIPE_CLI_TELEMETRY_OPTOUT: '1'
    };
}
function cancelParams(params) {
    if (!same(params, { invoice_now: false, prorate: false }))
        fail('unsafe_cancellation');
}
function scheduleBody(params, o, update = false) {
    keys(params, update ? ['end_behavior', 'proration_behavior', 'phases'] : ['customer', 'start_date', 'end_behavior', 'billing_mode', 'metadata', 'default_settings', 'phases']);
    if (!update && (params.customer !== o.customer || params.start_date !== boundary.seconds.activation || params.end_behavior !== 'release' || !same(params.billing_mode, { type: 'flexible' }) || !same(params.metadata, marker(o))))
        fail('schedule_identity_mismatch');
    if (update && (params.end_behavior !== 'cancel' || params.proration_behavior !== 'none'))
        fail('unsafe_schedule_update');
    if (!Array.isArray(params.phases) || params.phases.length !== 1)
        fail('schedule_phase_count');
    const p = params.phases[0];
    keys(p, ['items', 'end_date', 'trial_end', 'proration_behavior', 'metadata', ...(update ? ['start_date', 'currency', 'add_invoice_items', 'discounts', 'default_tax_rates', 'invoice_settings', 'default_payment_method', 'collection_method', 'billing_cycle_anchor', 'automatic_tax', 'description'] : [])]);
    if (p.proration_behavior !== 'none' || !same(p.metadata, marker(o)) || p.end_date !== p.trial_end || ![boundary.seconds.trialEnd, boundary.seconds.trialExit].includes(p.end_date))
        fail('unsafe_schedule_phase');
    if (!Array.isArray(p.items) || p.items.length !== 1)
        fail('schedule_item_count');
    const i = p.items[0];
    keys(i, ['price', 'quantity', ...(update ? ['metadata'] : [])]);
    if (i.price !== boundary.prices[o.role.split('/')[0]] || i.quantity !== 1 || (i.metadata && !same(i.metadata, {})))
        fail('schedule_price_mismatch');
    if (update) {
        if (p.start_date !== boundary.seconds.activation || p.currency !== 'eur' || !same(p.add_invoice_items, []) || !same(p.discounts, []) || !same(p.default_tax_rates, []))
            fail('unsafe_schedule_update');
        if (p.default_payment_method && p.default_payment_method !== o.paymentMethod)
            fail('schedule_payment_mismatch');
        if (p.collection_method && p.collection_method !== 'charge_automatically')
            fail('unsafe_collection');
        if (p.billing_cycle_anchor && p.billing_cycle_anchor !== 'automatic')
            fail('unsafe_anchor');
        if (p.automatic_tax && ![{ enabled: false }, { enabled: false, liability: { type: 'self' } }].some(value => same(p.automatic_tax, value)))
            fail('unsafe_tax');
        if (p.invoice_settings) {
            keys(p.invoice_settings, ['account_tax_ids', 'issuer']);
            if (p.invoice_settings.account_tax_ids && !same(p.invoice_settings.account_tax_ids, []))
                fail('unsafe_invoice_settings');
            if (p.invoice_settings.issuer && !same(p.invoice_settings.issuer, { type: 'self' }))
                fail('unsafe_invoice_settings');
        }
        if (p.description)
            fail('unapproved_description');
    }
    else if (!same(params.default_settings, { default_payment_method: o.paymentMethod, collection_method: 'charge_automatically' }))
        fail('schedule_payment_mismatch');
}
/** Every operation owns its path and allowed request shape; callers cannot supply CLI flags. */
export function buildRequest(op, args = {}, key) {
    let method = 'get', path, body = {};
    keys(args, ['owner', 'id', 'interval', 'params', 'payment_method', 'target', 'starting_after']);
    const o = args.owner;
    if (o)
        role(o);
    const page = () => {
        body.limit = 100;
        if (args.starting_after) {
            if (!/^[a-z]+_[a-zA-Z0-9]+$/.test(args.starting_after))
                fail('invalid_cursor');
            body.starting_after = args.starting_after;
        }
    };
    switch (op) {
        case 'account.read':
            path = '/v1/account';
            break;
        case 'balance.read':
            path = '/v1/balance';
            break;
        case 'clock.list':
            path = '/v1/test_helpers/test_clocks';
            page();
            break;
        case 'clock.read':
            path = `/v1/test_helpers/test_clocks/${id(args.id, 'clock')}`;
            break;
        case 'clock.create':
            if (!['month', 'year'].includes(args.interval))
                fail('invalid_interval');
            method = 'post';
            path = '/v1/test_helpers/test_clocks';
            body = { name: boundary.clockNames[args.interval], frozen_time: boundary.seconds.frozen };
            break;
        case 'clock.advance':
            id(args.id, 'clock');
            if (!o || args.id !== o.clock || !Number.isInteger(args.target) || args.target <= boundary.seconds.frozen || args.target > Date.parse('2028-08-31T10:00:01Z') / 1000)
                fail('unsafe_clock_target');
            method = 'post';
            path = `/v1/test_helpers/test_clocks/${args.id}/advance`;
            body = { frozen_time: args.target };
            break;
        case 'clock.delete':
            if (!o || args.id !== o.clock)
                fail('foreign_clock');
            method = 'delete';
            path = `/v1/test_helpers/test_clocks/${id(args.id, 'clock')}`;
            break;
        case 'price.read':
            if (!Object.values(boundary.prices).includes(args.id))
                fail('foreign_price');
            path = `/v1/prices/${args.id}`;
            break;
        case 'customer.list':
            path = '/v1/customers';
            page();
            break;
        case 'customer.read':
            path = `/v1/customers/${id(args.id, 'cus')}`;
            break;
        case 'customer.create':
            if (!o || o.customer)
                fail('customer_owner_required');
            method = 'post';
            path = '/v1/customers';
            body = { test_clock: o.clock, metadata: marker(o) };
            break;
        case 'setup.list':
            if (!o?.customer)
                fail('owner_required');
            path = '/v1/setup_intents';
            body.customer = o.customer;
            page();
            break;
        case 'setup.read':
            path = `/v1/setup_intents/${id(args.id, 'seti')}`;
            break;
        case 'setup.create':
            if (!o?.customer || !boundary.cards.includes(args.payment_method))
                fail('unsafe_test_card');
            method = 'post';
            path = '/v1/setup_intents';
            body = {
                customer: o.customer, payment_method: args.payment_method, confirm: true, usage: 'off_session', payment_method_types: ['card'], metadata: marker(o)
            };
            break;
        case 'schedule.list':
            path = '/v1/subscription_schedules';
            if (o)
                body.customer = o.customer;
            page();
            break;
        case 'schedule.read':
            path = `/v1/subscription_schedules/${id(args.id, 'sub_sched')}`;
            break;
        case 'schedule.create':
            if (!o?.customer || !o.paymentMethod)
                fail('owner_required');
            scheduleBody(args.params, o);
            method = 'post';
            path = '/v1/subscription_schedules';
            body = args.params;
            break;
        case 'schedule.update':
            if (!o || o.schedule !== args.id)
                fail('foreign_schedule');
            scheduleBody(args.params, o, true);
            method = 'post';
            path = `/v1/subscription_schedules/${id(args.id, 'sub_sched')}`;
            body = args.params;
            break;
        case 'schedule.cancel':
            if (!o || o.schedule !== args.id)
                fail('foreign_schedule');
            cancelParams(args.params);
            method = 'post';
            path = `/v1/subscription_schedules/${id(args.id, 'sub_sched')}/cancel`;
            body = args.params;
            break;
        case 'subscription.list':
            path = '/v1/subscriptions';
            body.status = 'all';
            if (o)
                body.customer = o.customer;
            page();
            break;
        case 'subscription.read':
            path = `/v1/subscriptions/${id(args.id, 'sub')}`;
            break;
        case 'subscription.cancel':
            if (!o || o.subscription !== args.id)
                fail('foreign_subscription');
            cancelParams(args.params);
            method = 'delete';
            path = `/v1/subscriptions/${id(args.id, 'sub')}`;
            body = args.params;
            break;
        case 'subscription.update':
            if (!o || o.subscription !== args.id)
                fail('foreign_subscription');
            keys(args.params, ['cancel_at', 'proration_behavior', 'default_payment_method']);
            if (args.params.default_payment_method) {
                if (![o.paymentMethod, o.declineMethod].filter(Boolean).includes(args.params.default_payment_method) || Object.keys(args.params).length !== 1)
                    fail('foreign_payment_method');
            }
            else if (args.params.proration_behavior !== 'none' || !Number.isInteger(args.params.cancel_at) || args.params.cancel_at < boundary.seconds.paidMinimumEnd || args.params.cancel_at > Date.parse('2028-08-31T10:00:00Z') / 1000)
                fail('unsafe_paid_cancel');
            method = 'post';
            path = `/v1/subscriptions/${id(args.id, 'sub')}`;
            body = args.params;
            break;
        case 'invoice.list':
            if (!o?.customer)
                fail('owner_required');
            path = '/v1/invoices';
            body.customer = o.customer;
            page();
            break;
        case 'invoice.read':
            path = `/v1/invoices/${id(args.id, 'in')}`;
            break;
        case 'invoice.lines':
            path = `/v1/invoices/${id(args.id, 'in')}/lines`;
            page();
            break;
        case 'invoice.payments':
            path = '/v1/invoice_payments';
            body = { invoice: id(args.id, 'in'), status: 'paid' };
            page();
            break;
        case 'invoice.pay':
            if (!o || !o.invoices?.includes(args.id) || args.payment_method !== o.paymentMethod)
                fail('foreign_invoice_payment');
            method = 'post';
            path = `/v1/invoices/${id(args.id, 'in')}/pay`;
            body = { payment_method: args.payment_method, off_session: true };
            break;
        case 'intent.read':
            path = `/v1/payment_intents/${id(args.id, 'pi')}`;
            break;
        case 'charge.read':
            path = `/v1/charges/${id(args.id, 'ch')}`;
            break;
        default: fail('operation_not_whitelisted');
    }
    if (method !== 'get' && !key)
        fail('idempotency_required');
    if (key && !/^[a-zA-Z0-9:._\/-]{1,200}$/.test(key))
        fail('invalid_idempotency_key');
    // Accepted generic args are narrowed per operation, so an ignored flag/body cannot be smuggled in.
    const readArguments = {
        'clock.list': ['starting_after'], 'customer.list': ['starting_after'], 'setup.list': ['owner', 'starting_after'], 'schedule.list': ['owner', 'starting_after'], 'subscription.list': ['owner', 'starting_after'], 'invoice.list': ['owner', 'starting_after'], 'invoice.lines': ['id', 'starting_after'], 'invoice.payments': ['id', 'starting_after']
    };
    const allowed = {
        'clock.create': ['interval'], 'clock.advance': ['owner', 'id', 'target'], 'clock.delete': ['owner', 'id'], 'customer.create': ['owner'], 'setup.create': ['owner', 'payment_method'], 'schedule.create': ['owner', 'params'], 'schedule.update': ['owner', 'id', 'params'], 'schedule.cancel': ['owner', 'id', 'params'], 'subscription.cancel': ['owner', 'id', 'params'], 'subscription.update': ['owner', 'id', 'params'], 'invoice.pay': ['owner', 'id', 'payment_method']
    };
    keys(args, allowed[op] || (['account.read', 'balance.read'].includes(op) ? [] : readArguments[op] || ['id']));
    const argv = [method, path, '--stripe-version', boundary.api];
    if (method === 'delete')
        argv.push('--confirm');
    if (key)
        argv.push('--idempotency', key);
    for (const [field, value] of encodeForm(body))
        argv.push('-d', `${field}=${value}`);
    return argv;
}
export function assertOwned(kind, obj, o) {
    if (!obj || obj.deleted || obj.livemode === true)
        fail('not_owned');
    if (kind === 'clock') {
        if (obj.id !== o.clock || obj.name !== boundary.clockNames[o.interval || o.role?.split('/')[0]])
            fail('not_owned_clock');
        return obj;
    }
    role(o);
    if (obj.livemode !== false || !same(obj.metadata && Object.fromEntries(Object.keys(marker(o)).map(k => [k, obj.metadata[k]])), marker(o)))
        fail('not_owned_marker');
    if (kind === 'customer') {
        if (obj.id !== o.customer || obj.test_clock !== o.clock)
            fail('not_owned_customer');
    }
    else if (obj.customer !== o.customer)
        fail('not_owned_customer');
    if (kind === 'schedule' && o.schedule && obj.id !== o.schedule)
        fail('not_owned_schedule');
    if (kind === 'subscription' && o.subscription && obj.id !== o.subscription)
        fail('not_owned_subscription');
    return obj;
}
async function invokeCli(argv) {
    return new Promise((resolve, reject) => {
        const child = execFile('stripe', argv, {
            env: cliEnvironment(), timeout: 40000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8', shell: false
        }, (error, stdout) => {
            if (error) {
                reject(Error('cli_request_failed'));
                return;
            }
            if (argv[0] === '--version') {
                resolve(stdout.trim());
                return;
            }
            try {
                const data = JSON.parse(stdout);
                if (data.error)
                    reject(Error('provider_request_failed'));
                else
                    resolve(data);
            }
            catch {
                reject(Error('cli_response_invalid'));
            }
        });
        child.stdin.end();
    });
}
export async function waitReady(read, target, previous, { now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), timeout = 120000 } = {}) {
    const start = now();
    for (;;) {
        const c = await read();
        if (c.frozen_time < previous)
            fail('clock_reversed');
        if (c.status === 'ready') {
            if (c.frozen_time !== target)
                fail('clock_time_mismatch');
            return c;
        }
        if (c.status !== 'advancing')
            fail('clock_status_invalid');
        if (now() - start >= timeout)
            fail('clock_not_ready');
        await sleep(Math.min(2000, timeout));
    }
}
export class SandboxTransport {
    static async open({ work, mode = 'inspect', invoke = invokeCli, now = Date.now }) {
        if (!['inspect', 'execute', 'cleanup'].includes(mode))
            fail('invalid_mode');
        const t = new SandboxTransport();
        Object.assign(t, {
            work, mode, invoke, now, calls: 0
        });
        if (mode === 'inspect') {
            try {
                t.state = JSON.parse(await readFile(join(work, 'journal.json'), 'utf8'));
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    throw e;
                t.state = t.empty();
            }
            return t;
        }
        await mkdir(work, { recursive: true, mode: 0o700 });
        try {
            t.lock = await open(join(work, 'lock'), 'wx', 0o600);
        }
        catch (e) {
            if (e.code === 'EEXIST')
                fail('sandbox_locked');
            throw e;
        }
        try {
            await t.lock.writeFile(JSON.stringify({
                pid: process.pid, started: now(), release: boundary.release
            }));
            await t.lock.sync();
            try {
                t.state = JSON.parse(await readFile(join(work, 'journal.json'), 'utf8'));
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    throw e;
                t.state = t.empty();
            }
            if (t.state.release !== boundary.release)
                fail('journal_scope_mismatch');
            await t.save();
            return t;
        }
        catch (e) {
            await t.close();
            throw e;
        }
    }
    empty() {
        return {
            schema: 1, release: boundary.release, requests: {}, owners: {}, clocks: {}, checkpoints: {}, fixtures: {}, proofs: [], status: 'pending', calls: 0
        };
    }
    async save() {
        if (this.mode === 'inspect')
            fail('read_only');
        const file = join(this.work, 'journal.json'), temporary = file + '.next';
        const fd = await open(temporary, 'w', 0o600);
        try {
            await fd.writeFile(JSON.stringify(this.state, null, 2) + '\n');
            await fd.sync();
        }
        finally {
            await fd.close();
        }
        await rename(temporary, file);
        const dir = await open(this.work, 'r');
        try {
            await dir.sync();
        }
        finally {
            await dir.close();
        }
    }
    async close() {
        if (this.lock) {
            await this.lock.close();
            this.lock = null;
            await unlink(join(this.work, 'lock'));
        }
    }
    async call(argv) {
        if (++this.calls > cliBudget.total || (this.mode !== 'inspect' && (this.state.calls || 0) >= cliBudget.total))
            fail('cli_budget_exhausted');
        if (this.mode === 'execute' && (this.state.calls || 0) >= cliBudget.execution)
            fail('cleanup_budget_reserved');
        if (this.mode !== 'inspect') {
            this.state.calls = (this.state.calls || 0) + 1;
            await this.save();
        }
        return this.invoke(argv);
    }
    async attest() {
        if (await this.call(['--version']) !== `stripe version ${boundary.cli}`)
            fail('cli_version_mismatch');
        const a = await this.read('account.read'), b = await this.read('balance.read');
        if (a.id !== boundary.account || a.charges_enabled !== false || b.livemode !== false)
            fail('provider_boundary_mismatch');
        return {
            account: a.id, charges_enabled: a.charges_enabled, livemode: b.livemode
        };
    }
    async read(op, args = {}) {
        const argv = buildRequest(op, args);
        if (argv[0] !== 'get')
            fail('read_only');
        return this.call(argv);
    }
    async list(op, args = {}) {
        const objects = [];
        let cursor;
        for (let page = 0; page < 5; page++) {
            const response = await this.read(op, { ...args, ...(cursor ? { starting_after: cursor } : {}) });
            if (!Array.isArray(response.data) || response.data.length > 100)
                fail('invalid_inventory');
            objects.push(...response.data);
            if (!response.has_more)
                return objects;
            if (!response.data.length)
                fail('invalid_inventory_cursor');
            cursor = response.data.at(-1).id;
        }
        fail('inventory_budget_exhausted');
    }
    async ownership(o) {
        const interval = role(o).role.split('/')[0];
        if (this.state.clocks[interval] !== o.clock)
            fail('unconfirmed_clock_owner');
        const registered = this.state.owners[o.role];
        if (o.customer) {
            if (!registered || registered.customer !== o.customer || registered.clock !== o.clock || registered.contract !== o.contract)
                fail('unconfirmed_customer_owner');
            for (const field of ['paymentMethod', 'declineMethod', 'schedule', 'subscription', 'setup', 'declineSetup']) {
                if (o[field] && o[field] !== registered[field])
                    fail('unconfirmed_owner_field');
            }
        }
        else if (registered?.customer)
            fail('customer_role_already_bound');
        assertOwned('clock', await this.read('clock.read', { id: o.clock }), o);
        if (o.customer)
            assertOwned('customer', await this.read('customer.read', { id: o.customer }), o);
    }
    // Dispatch-boundary guard, shared by initial DELETE and every still-present retry.
    async assertClockDeletionOwnership(interval) {
        const clock = this.state.clocks[interval];
        assert.ok(clock, 'cleanup_confirmed_clock_required');
        const owners = Object.values(this.state.owners).filter(o => o.clock === clock);
        assert.ok(owners.length <= 3, 'cleanup_customer_budget');
        const attached = (await this.list('customer.list')).filter(c => c.test_clock === clock);
        assert.deepEqual(attached.map(c => c.id).sort(), owners.map(o => o.customer).sort(), 'foreign_customer_on_owned_clock');
        for (const owner of owners) {
            await this.ownership(owner);
            const schedules = await this.list('schedule.list', { owner }), subscriptions = await this.list('subscription.list', { owner });
            for (const schedule of schedules) {
                assertOwned('schedule', schedule, owner);
                assert.equal(schedule.id, owner.schedule);
            }
            for (const sub of subscriptions) {
                assertOwned('subscription', sub, owner);
                if (!owner.subscription) {
                    assert.ok(schedules.some(schedule => schedule.id === owner.schedule && [schedule.subscription, schedule.released_subscription].includes(sub.id)), 'cleanup_subscription_binding_required');
                    owner.subscription = sub.id;
                    await this.save();
                }
                assert.equal(sub.id, owner.subscription);
            }
        }
        return owners;
    }
    budget(op, args, record) {
        const mappings = {
            'clock.create': ['clocks', args.interval, 2], 'customer.create': ['owners', args.owner?.role, 6], 'schedule.create': ['schedules', args.owner?.role, 6], 'setup.create': ['setups', `${args.owner?.role}:${args.payment_method}`, 7]
        };
        const spec = mappings[op];
        if (!spec)
            return;
        const [type, target, max] = spec;
        const requests = Object.values(this.state.requests).filter(r => r.op === op);
        if (requests.some(r => r.target === target && r !== record))
            fail('duplicate_resource_target');
        if (!record && requests.length >= max)
            fail('resource_budget_exhausted');
        if (op === 'setup.create' && args.payment_method === boundary.cards[1] && requests.some(r => r.target !== target && r.target?.endsWith(boundary.cards[1])))
            fail('decline_budget_exhausted');
        return target;
    }
    async resolve(op, args) {
        const o = args.owner;
        let matches;
        if (op === 'clock.create') {
            matches = (await this.list('clock.list')).filter(c => c.name === boundary.clockNames[args.interval]);
            if (matches.length > 1)
                fail('ownership_conflict');
            return matches[0] || null;
        }
        if (op === 'customer.create') {
            matches = (await this.list('customer.list')).filter(c => c.test_clock === o.clock && same(c.metadata && Object.fromEntries(Object.keys(marker(o)).map(k => [k, c.metadata[k]])), marker(o)));
            if (matches.length > 1)
                fail('ownership_conflict');
            return matches[0] || null;
        }
        if (op === 'setup.create') {
            matches = (await this.list('setup.list', { owner: o })).filter(c => c.metadata?.benefitsi_role === o.role && c.metadata?.benefitsi_partner_contract === o.contract && c.metadata?.benefitsi_release === boundary.release && c.metadata?.benefitsi_scope === boundary.scope);
            const expectedCard = args.payment_method === boundary.cards[1] ? 'decline' : 'visa';
            matches = matches.filter(c => this.state.requests && (!this.state.owners[o.role]?.setup || c.id !== this.state.owners[o.role].setup) || expectedCard === 'visa');
            if (matches.length > 1)
                fail('ownership_conflict');
            return matches.find(x => x.status === 'succeeded') || null;
        }
        if (op === 'schedule.create') {
            matches = (await this.list('schedule.list', { owner: o })).filter(c => c.metadata?.benefitsi_partner_contract === o.contract);
            if (matches.length > 1)
                fail('ownership_conflict');
            return matches[0] || null;
        }
        if (op === 'clock.advance') {
            const c = await this.read('clock.read', { id: args.id });
            return c.frozen_time === args.target ? await waitReady(() => this.read('clock.read', { id: args.id }), args.target, args.target) : null;
        }
        if (op === 'clock.delete') {
            const clocks = await this.list('clock.list');
            return clocks.some(c => c.id === args.id) ? null : { id: args.id, deleted: true };
        }
        const readOp = op.startsWith('subscription.') ? 'subscription.read' : op.startsWith('schedule.') ? 'schedule.read' : 'invoice.read';
        const fresh = await this.read(readOp, { id: args.id });
        if (op === 'subscription.cancel' || op === 'schedule.cancel')
            return fresh.status === 'canceled' ? fresh : null;
        if (op === 'subscription.update')
            return Object.entries(args.params).filter(([k]) => k !== 'proration_behavior').every(([k, v]) => fresh[k] === v) ? fresh : null;
        if (op === 'schedule.update')
            return fresh.end_behavior === 'cancel' && fresh.phases?.[0]?.end_date === args.params.phases[0].end_date ? fresh : null;
        if (op === 'invoice.pay')
            return fresh.status === 'paid' ? fresh : null;
        fail('resolution_not_whitelisted');
    }
    async confirm(op, args, result) {
        const o = args.owner;
        if (op === 'clock.create') {
            assertOwned('clock', result, { clock: result.id, interval: args.interval });
            this.state.clocks[args.interval] = result.id;
        }
        else if (op === 'customer.create') {
            assertOwned('customer', result, { ...o, customer: result.id });
            this.state.owners[o.role] = {
                ...o, customer: result.id, invoices: []
            };
        }
        else if (op === 'setup.create') {
            assertOwned('setup', result, o);
            if (result.status !== 'succeeded' || !result.payment_method?.startsWith('pm_'))
                fail('setup_unconfirmed');
            const owned = this.state.owners[o.role];
            if (args.payment_method === boundary.cards[0]) {
                owned.setup = result.id;
                owned.paymentMethod = result.payment_method;
            }
            else {
                owned.declineSetup = result.id;
                owned.declineMethod = result.payment_method;
            }
        }
        else if (op === 'schedule.create') {
            assertOwned('schedule', result, o);
            this.state.owners[o.role].schedule = result.id;
        }
        else if (op === 'clock.delete') {
            if (result.id !== args.id || result.deleted !== true)
                fail('clock_delete_unconfirmed');
            this.state.clocks[o.role.split('/')[0]] = null;
        }
        else if (op === 'clock.advance') {
            assertOwned('clock', result, o);
            if (result.frozen_time !== args.target || !['ready', 'advancing'].includes(result.status))
                fail('clock_advance_unconfirmed');
        }
        else if (op.startsWith('subscription.')) {
            assertOwned('subscription', result, o);
            if (op === 'subscription.cancel' && result.status !== 'canceled')
                fail('subscription_cancel_unconfirmed');
            if (op === 'subscription.update' && !Object.entries(args.params).filter(([k]) => k !== 'proration_behavior').every(([k, v]) => result[k] === v))
                fail('subscription_update_unconfirmed');
        }
        else if (op.startsWith('schedule.')) {
            assertOwned('schedule', result, o);
            if (op === 'schedule.cancel' && result.status !== 'canceled')
                fail('schedule_cancel_unconfirmed');
            if (op === 'schedule.update' && (result.end_behavior !== 'cancel' || result.phases?.[0]?.end_date !== args.params.phases[0].end_date || result.phases?.[0]?.trial_end !== args.params.phases[0].trial_end))
                fail('schedule_update_unconfirmed');
        }
        else if (op === 'invoice.pay') {
            if (result.id !== args.id || result.customer !== o.customer || result.livemode !== false || result.status !== 'paid')
                fail('invoice_pay_unconfirmed');
        }
    }
    async mutate(op, args, semanticKey) {
        if (this.mode === 'inspect')
            fail('read_only');
        if (this.mode === 'cleanup' && op !== 'clock.delete')
            fail('cleanup_operation_denied');
        if (op === 'clock.delete' && this.mode !== 'cleanup')
            fail('teardown_only');
        const key = `task12:${semanticKey}`, argv = buildRequest(op, args, key);
        const hash = requestHash(argv), record = this.state.requests[semanticKey];
        if (record && record.hash !== hash)
            fail('request_changed');
        const target = this.budget(op, args, record);
        if (record) {
            if (record.status !== 'confirmed' && this.now() - record.started >= 23 * 3600000)
                fail('uncertainty_expired');
            const resolved = await this.resolve(op, args);
            if (resolved) {
                await this.confirm(op, args, resolved);
                record.status = 'confirmed';
                record.confirmed = this.now();
                record.id = resolved.id;
                await this.save();
                return resolved;
            }
            if (record.status === 'confirmed')
                fail('confirmed_result_missing');
            if (record.attempts >= 3)
                fail('retry_budget_exhausted');
        }
        await this.attest();
        if (args.owner)
            await this.ownership(args.owner);
        if (op === 'subscription.update' || op === 'subscription.cancel')
            assertOwned('subscription', await this.read('subscription.read', { id: args.id }), args.owner);
        if (op === 'schedule.update' || op === 'schedule.cancel')
            assertOwned('schedule', await this.read('schedule.read', { id: args.id }), args.owner);
        let previousClockTime;
        if (op === 'clock.advance') {
            const c = await this.read('clock.read', { id: args.id });
            assertOwned('clock', c, args.owner);
            if (c.status !== 'ready' || !Number.isInteger(c.frozen_time) || c.frozen_time >= args.target)
                fail('unsafe_clock_advance');
            previousClockTime = c.frozen_time;
            const longAnnual = args.owner.role === 'year/continue' && c.frozen_time >= boundary.seconds.trialEnd + 1 && this.state.checkpoints['year:first-paid'];
            if (args.target - c.frozen_time > (longAnnual ? 2 * 366 : 62) * 86400)
                fail('unsafe_clock_advance');
            if (longAnnual) {
                for (const caseId of ['trial_exit', 'late_exit']) {
                    const owned = this.state.owners[`year/${caseId}`];
                    if (!owned?.subscription)
                        fail('annual_clock_isolation_unconfirmed');
                    const sub = await this.read('subscription.read', { id: owned.subscription });
                    assertOwned('subscription', sub, owned);
                    if (sub.status !== 'canceled')
                        fail('annual_clock_isolation_unconfirmed');
                }
            }
        }
        if (op === 'invoice.pay') {
            if (!this.state.owners[args.owner.role]?.invoices?.includes(args.id))
                fail('unconfirmed_invoice_owner');
            const i = await this.read('invoice.read', { id: args.id });
            if (i.customer !== args.owner.customer || i.livemode !== false || i.parent?.subscription_details?.subscription !== args.owner.subscription || i.status !== 'open')
                fail('foreign_invoice');
        }
        if (op === 'clock.delete')
            await this.assertClockDeletionOwnership(args.owner.role.split('/')[0]);
        const r = record || {
            op, role: args.owner?.role || args.interval, target, hash, key, descriptor: structuredClone(args), objectId: args.id || args.owner?.customer || args.owner?.clock || null, clockTarget: args.target || null, started: this.now(), attempts: 0
        };
        this.state.requests[semanticKey] = r;
        r.attempts++;
        r.status = 'dispatching';
        r.dispatched = this.now();
        r.checkpoint = Object.keys(this.state.checkpoints).at(-1) || null;
        await this.save();
        try {
            let result = await this.call(argv);
            if (op === 'clock.advance' && result.status === 'advancing') {
                assertOwned('clock', result, args.owner);
                if (!Number.isInteger(result.frozen_time) || result.frozen_time < previousClockTime || result.frozen_time > args.target)
                    fail('clock_ack_time_mismatch');
                r.clockAcknowledgement = {
                    id: result.id, name: result.name, livemode: result.livemode, status: result.status,
                    frozen_time: result.frozen_time, previous_time: previousClockTime, target: args.target, observedAt: this.now()
                };
                await this.save();
                let observedTime = result.frozen_time;
                result = await waitReady(async () => {
                    const fresh = await this.read('clock.read', { id: args.id });
                    assertOwned('clock', fresh, args.owner);
                    if (!Number.isInteger(fresh.frozen_time) || fresh.frozen_time > args.target)
                        fail('clock_time_mismatch');
                    if (fresh.frozen_time < observedTime)
                        fail('clock_reversed');
                    observedTime = fresh.frozen_time;
                    return fresh;
                }, args.target, previousClockTime, { now: this.now });
            }
            await this.confirm(op, args, result);
            r.status = 'confirmed';
            r.id = result.id;
            r.confirmed = this.now();
            await this.save();
            return result;
        }
        catch {
            r.status = 'unknown';
            r.failed = this.now();
            await this.save();
            fail('mutation_outcome_unknown');
        }
    }
    async recoverRequests() {
        for (const [semanticKey, record] of Object.entries(this.state.requests)) {
            if (record.status === 'confirmed' || record.cleanupAbsent)
                continue;
            if (!record.descriptor)
                fail('saved_request_descriptor_required');
            const args = structuredClone(record.descriptor);
            const resolved = await this.resolve(record.op, args);
            if (resolved) {
                await this.confirm(record.op, args, resolved);
                record.status = 'confirmed';
                record.id = resolved.id;
                record.confirmed = this.now();
                await this.save();
                continue;
            }
            if (this.now() - record.started >= 23 * 3600000)
                fail('uncertainty_expired');
            const creation = ['clock.create', 'customer.create', 'setup.create', 'schedule.create'].includes(record.op);
            if (this.mode === 'cleanup') {
                record.cleanupAbsent = creation;
                await this.save();
            }
            else if (creation)
                await this.mutate(record.op, args, semanticKey);
            // Other unresolved operations stay pending until the exact source order is retried.
        }
    }
    async checkpoint(name, data) {
        if (this.state.checkpoints[name])
            fail('checkpoint_already_saved');
        this.state.checkpoints[name] = data;
        await this.save();
    }
}
