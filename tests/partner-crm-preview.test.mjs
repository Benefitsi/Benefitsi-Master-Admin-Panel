import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadTypescript } from './helpers/load-typescript.mjs';
const bytes = readFileSync(new URL('./fixtures/partner-crm/audience-preview-v1.json', import.meta.url));
const fixture = JSON.parse(bytes), id = fixture.partner_id;
const foreign = '00000000-0000-4000-8000-000000000099';
const api = () => loadTypescript('lib/partners/crm.ts');
const copy = () => structuredClone(fixture);
const rights = { schema_version: 1, partner_id: id, role: 'owner', plan_code: 'pro', features: { 'crm.manage': true, 'marketing.manage': false } };
function client(options = {}) {
  const calls = [];
  return { calls, rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'get_partner_entitlements') return { data: options.rights ?? rights };
    return options.error ? { error: options.error } : { data: options.value === undefined ? fixture : options.value };
  }};
}
const plain = value => JSON.parse(JSON.stringify(value));
test('preview fixture is byte-identical and accepts configured groups with exact protected count states', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '6a22454b82f51e73cd3f9b5542e12adc6dde9d829725313256da7d0435d14737');
  assert.equal(typeof api().parseCrmAudiencePreview, 'function', 'configured preview parser must exist');
  for (const [kind, config, definition, reason] of [
    ['second_visit', {}, 'exactly_one_completed_visit_in_window', 'visits_source_error'],
    ['comeback', { inactivity_days: 30 }, 'last_completed_visit_at_least_configured_berlin_days_ago_in_window', 'visits_source_error'],
    ['reward_reminder', { remaining_stamps: 1 }, 'up_to_configured_stamps_before_next_eligible_base_milestone', 'reward_rules_not_established'],
  ]) for (const [status, value] of [['ok', 12], ['empty', 0], ['suppressed', null], ['unavailable', null]]) {
    const d = copy();
    d.audience = { kind, config, definition, status, value, ...(status === 'unavailable' ? { reason } : {}) };
    const result = api().parseCrmAudiencePreview(d, id, kind, config);
    assert.equal(result.audience.value, value);
    assert.deepEqual(plain(result.audience.config), config);
  }
});
test('preview rejects malformed, missing, cross-partner and cross-request envelopes', () => {
  assert.equal(typeof api().parseCrmAudiencePreview, 'function');
  const mutations = [
    d => d.partner_id = foreign, d => d.schema_version = 2, d => d.timezone = ['Europe/Berlin'],
    d => d.as_of = '2026-02-30T10:00:00Z', d => d.window.days = 364,
    d => d.window.from = '2025-10-03T22:00:00Z', d => d.window.to = '2026-10-02T21:00:00Z',
    d => d.window.to = '2026-10-03T22:00:00Z', d => d.window.extra = 1,
    d => d.audience.kind = 'second_visit', d => d.audience.config.inactivity_days = 60,
    d => d.audience.definition = 'last_completed_visit_at_least_45_berlin_days_ago_in_window',
    d => d.audience.status = ['ok'], d => d.audience.value = 9, d => d.audience.value = 12.1,
    d => d.audience.value = Number.MAX_SAFE_INTEGER + 1, d => d.audience.reason = 'visits_source_error',
    d => d.audience = { ...d.audience, status: 'unavailable', value: null },
    d => d.audience = { ...d.audience, status: 'unavailable', value: null, reason: 'reward_source_error' },
    d => d.audience = { ...d.audience, status: 'suppressed', value: 3 },
    d => d.audience = { ...d.audience, status: 'empty', value: null },
    d => d.delivery.status = 'sending', d => d.delivery.reason = null,
    d => d.audience.customer_ids = [], d => d.recipient_count = 12,
    ...['schema_version', 'partner_id', 'as_of', 'timezone', 'window', 'audience', 'delivery'].flatMap(key => [d => delete d[key], d => d[key] = null]),
    ...['kind', 'status', 'value', 'definition', 'config'].flatMap(key => [d => delete d.audience[key], d => d.audience[key] = null]),
  ];
  for (const [index, mutate] of mutations.entries()) {
    const d = copy(); mutate(d);
    assert.throws(() => api().parseCrmAudiencePreview(d, id, 'comeback', { inactivity_days: 30 }), undefined, `invalid envelope ${index}`);
  }
  for (const d of [null, [], 'bad']) assert.throws(() => api().parseCrmAudiencePreview(d, id, 'comeback', { inactivity_days: 30 }));
});
test('preview read rechecks CRM-only rights and sends just the exact canonical read arguments', async () => {
  assert.equal(typeof api().readCrmAudiencePreview, 'function', 'configured preview reader must exist');
  const c = client();
  for (let n = 0; n < 2; n++) {
    const value = await api().readCrmAudiencePreview(c, id, 'comeback', { inactivity_days: 30 });
    assert.equal(value.audience.config.inactivity_days, 30);
    assert.equal(value.audience.value, 12);
  }
  assert.deepEqual(plain(c.calls), Array(2).fill([
    { name: 'get_partner_entitlements', args: { p_partner_id: id } },
    { name: 'get_partner_crm_audience_preview', args: { p_partner_id: id, p_kind: 'comeback', p_config: { inactivity_days: 30 } } },
  ]).flat());
});
test('preview refuses noncanonical input and denied rights before the audience RPC', async () => {
  assert.equal(typeof api().readCrmAudiencePreview, 'function');
  for (const [kind, config] of [
    ['comeback', undefined], ['comeback', null], ['comeback', {}], ['comeback', []],
    ...[true, '30', 30.5, 6, 366].map(value => ['comeback', { inactivity_days: value }]),
    ['comeback', { inactivity_days: 30, extra: 1 }], ['second_visit', { extra: 1 }],
    ['reward_reminder', {}], ...[0, 3, '1'].map(value => ['reward_reminder', { remaining_stamps: value }]),
    ['foreign', {}], [null, {}], [['comeback'], { inactivity_days: 30 }],
  ]) {
    const c = client();
    await assert.rejects(() => api().readCrmAudiencePreview(c, id, kind, config), e => e.code === 'invalid');
    assert.equal(c.calls.length, 0);
  }
  const badId = client();
  await assert.rejects(() => api().readCrmAudiencePreview(badId, 'bad', 'second_visit', {}));
  assert.equal(badId.calls.length, 0);
  for (const r of [{ ...rights, plan_code: 'free' }, { ...rights, role: 'scanner' }, { ...rights, features: { 'crm.manage': false, 'marketing.manage': true } }]) {
    const c = client({ rights: r });
    await assert.rejects(() => api().readCrmAudiencePreview(c, id, 'comeback', { inactivity_days: 30 }), e => e.code === 'denied');
    assert.equal(c.calls.length, 1);
  }
});
test('preview read rejects null/cross-request success and maps raw 42501 to access loss', async () => {
  assert.equal(typeof api().readCrmAudiencePreview, 'function');
  for (const value of [null, { ...copy(), partner_id: foreign }, { ...copy(), audience: { ...copy().audience, config: { inactivity_days: 60 } } }]) {
    await assert.rejects(() => api().readCrmAudiencePreview(client({ value }), id, 'comeback', { inactivity_days: 30 }), e => e.code === 'invalid');
  }
  await assert.rejects(() => api().readCrmAudiencePreview(client({ error: { code: '42501', message: 'SQL private detail' } }), id, 'comeback', { inactivity_days: 30 }), e => e.code === 'denied' && !e.message.includes('SQL private'));
});
test('preview captures config before asynchronous entitlement resolution', async () => {
  assert.equal(typeof api().readCrmAudiencePreview, 'function');
  const c = client(), original = c.rpc;
  let release;
  c.rpc = (name, args) => name === 'get_partner_entitlements' ? new Promise(resolve => { release = () => resolve({ data: rights }); }) : original(name, args);
  const config = { inactivity_days: 30 };
  const result = api().readCrmAudiencePreview(c, id, 'comeback', config);
  config.inactivity_days = 60;
  release();
  assert.equal((await result).audience.config.inactivity_days, 30);
  assert.deepEqual(plain(c.calls[0].args.p_config), { inactivity_days: 30 });
});
function actionHarness(options = {}) {
  const c = client(options);
  const actions = loadTypescript('app/partner/crm-actions.ts', {
    '@/lib/supabase/server': { createClient: async () => c },
    '@/lib/partner-portal': { getPartnerPortalSession: async () => Object.hasOwn(options, 'session') ? options.session : { isAdmin: false, partnerIds: [id], user: { id: 'actor-a' } } },
    '@/lib/admin': { requireAdmin: async () => { throw Error('unused'); } },
  });
  return { actions, c };
}
test('preview action uses current session, preserves strict DTO and CRM-only permission', async () => {
  const { actions, c } = actionHarness();
  assert.equal(typeof actions.previewPartnerCrmAudience, 'function', 'session-scoped preview action must exist');
  const result = await actions.previewPartnerCrmAudience(id, 'comeback', { inactivity_days: 30 });
  assert.equal(result.ok, true);
  assert.equal(result.value.actorId, 'actor-a');
  assert.deepEqual(plain(result.value.preview), fixture);
  assert.equal(Object.hasOwn(result.value.preview, 'actorId'), false);
  assert.equal(c.calls.length, 2);
});
test('preview action blocks foreign/missing session, invalid selection and raw permission loss safely', async () => {
  assert.equal(typeof actionHarness().actions.previewPartnerCrmAudience, 'function');
  for (const session of [null, { isAdmin: false, partnerIds: [], user: { id: 'actor-a' } }]) {
    const { actions, c } = actionHarness({ session });
    assert.equal((await actions.previewPartnerCrmAudience(id, 'comeback', { inactivity_days: 30 })).code, 'denied');
    assert.equal(c.calls.length, 0);
  }
  const bad = actionHarness();
  assert.equal((await bad.actions.previewPartnerCrmAudience(id, 'comeback', {})).code, 'invalid');
  assert.equal(bad.c.calls.length, 0);
  const revoked = actionHarness({ error: { code: '42501', message: 'secret SQL' } });
  const r = await revoked.actions.previewPartnerCrmAudience(id, 'comeback', { inactivity_days: 30 });
  assert.equal(r.code, 'denied');
  assert.doesNotMatch(r.message, /secret SQL/);
});
