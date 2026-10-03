import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadTypescript } from './helpers/load-typescript.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/partner-crm/dashboard-v1.json', import.meta.url)));
const id = fixture.partner_id,
  foreign = '00000000-0000-4000-8000-000000000099';
const crm = () => loadTypescript('lib/partners/crm.ts');
const copy = () => structuredClone(fixture);
const rights = {
  schema_version: 1,
  partner_id: id,
  role: 'owner',
  plan_code: 'pro',
  features: {
    'crm.manage': true,
    'marketing.manage': true
  }
};
const input = () => {
  const c = {
    ...fixture.campaigns[0],
    expected_revision: 1
  };
  delete c.partner_id;
  delete c.revision;
  delete c.created_at;
  delete c.updated_at;
  return c;
};
function client(options = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, params) => {
      calls.push({
        name,
        params
      });
      if (name === 'get_partner_entitlements') return {
        data: options.rights ?? rights
      };
      if (options.error) return {
        error: options.error
      };
      return {
        data: name === 'get_partner_crm_dashboard' ? fixture : name === 'request_partner_editorial_service' ? fixture.editorial_requests[0] : {
          ...fixture.campaigns[0],
          revision: 2,
          ...options.response
        }
      };
    }
  };
}
test('shared synthetic fixture parses and never turns suppressed/unavailable into zero', () => {
  const d = crm().parseCrmDashboard(fixture, id);
  assert.equal(d.audiences.second_visit.value, 128);
  assert.equal(d.audiences.comeback.value, null);
  assert.equal(d.audiences.reward_reminder.status, 'unavailable');
  const d0 = copy();
  d0.audiences.second_visit = {
    ...d0.audiences.second_visit,
    status: 'empty',
    value: 0
  };
  assert.equal(crm().parseCrmDashboard(d0, id).audiences.second_visit.value, 0);
});
test('foreign, malformed, contradictory and private fields fail closed', () => {
  for (const mutate of [d => d.partner_id = foreign, d => d.schema_version = 2, d => d.audiences.comeback.value = 3, d => d.audiences.second_visit.value = 2, d => d.campaigns[0].revision = 0, d => d.campaigns[0].partner_id = foreign, d => d.campaigns[0].status = 'sending', d => d.window.to = '2026-10-02T12:00:00Z', d => d.window.from = '2025-02-30T00:00:00Z', d => d.editorial_requests[0].admin_note = 'private', d => d.audiences.reward_reminder.config.remaining_stamps = 1]) {
    const d = copy();
    mutate(d);
    assert.throws(() => crm().parseCrmDashboard(d, id));
  }
});
test('exact campaign RPC keeps UUID and expected revision for identical retries', async () => {
  const c = client();
  for (let n = 0; n < 2; n++) await crm().saveCrmCampaign(c, id, input());
  assert.deepEqual(JSON.parse(JSON.stringify(c.calls.filter(c => c.name === 'save_partner_crm_campaign'))), Array(2).fill({
    name: 'save_partner_crm_campaign',
    params: {
      p_partner_id: id,
      p_campaign: input()
    }
  }));
  assert.equal(c.calls.filter(c => c.name === 'get_partner_entitlements').length, 2);
});
test('identical canonical content may confirm the current revision without incrementing it', async () => {
  const saved = await crm().saveCrmCampaign(client({
    response: {
      revision: 1
    }
  }), id, input());
  assert.equal(saved.revision, 1);
  assert.equal(saved.id, input().id);
});
test('each save rechecks rights and rejects scanner, Free, missing flags and foreign save identity', async () => {
  for (const r of [{
    ...rights,
    role: 'scanner'
  }, {
    ...rights,
    plan_code: 'free'
  }, {
    ...rights,
    features: {
      'crm.manage': true
    }
  }, {
    ...rights,
    features: {
      'crm.manage': false,
      'marketing.manage': true
    }
  }]) {
    const c = client({
      rights: r
    });
    await assert.rejects(() => crm().saveCrmCampaign(c, id, input()));
    assert.equal(c.calls.some(c => c.name === 'save_partner_crm_campaign'), false);
  }
  await assert.rejects(() => crm().saveCrmCampaign(client({
    response: {
      id: foreign
    }
  }), id, input()));
});
test('known backend errors are useful German messages without backend details', async () => {
  for (const [error, expected] of [[{
    code: '40001',
    message: 'crm_revision_conflict'
  }, /gespeicherte Version.*laden/], [{
    code: 'PGRST202',
    message: 'secret SQL'
  }, /Backend.*verfügbar/], [{
    code: '42501',
    message: 'secret SQL'
  }, /Zugriff.*aktualisieren/]]) await assert.rejects(() => crm().saveCrmCampaign(client({
    error
  }), id, input()), expected);
});
test('read lock skips private RPC and missing deployment is distinct from empty', async () => {
  const c = client({
    rights: {
      ...rights,
      plan_code: 'free'
    }
  });
  assert.equal((await crm().readCrmDashboard(c, id)).status, 'locked');
  assert.equal(c.calls.length, 1);
  const unavailable = await crm().readCrmDashboard(client({
    error: {
      code: 'PGRST202'
    }
  }), id);
  assert.equal(unavailable.status, 'unavailable');
});
test('editorial repeated request displays persisted planned status and sends exact fields', async () => {
  const c = client();
  const r = await crm().requestEditorialService(c, id, 'blog_article', ' Unser Brief ');
  assert.equal(r.status, 'planned');
  assert.deepEqual(JSON.parse(JSON.stringify(c.calls.at(-1))), {
    name: 'request_partner_editorial_service',
    params: {
      p_partner_id: id,
      p_service_key: 'blog_article',
      p_note: 'Unser Brief'
    }
  });
});
test('invalid config, sending status, overlong text and invalid deal are rejected before save', async () => {
  for (const change of [{
    config: {
      inactivity_days: 45,
      extra: true
    }
  }, {
    config: {
      inactivity_days: 6
    }
  }, {
    status: 'scheduled'
  }, {
    title: 'x'.repeat(121)
  }, {
    deal_id: 'no'
  }]) {
    const c = client();
    await assert.rejects(() => crm().saveCrmCampaign(c, id, {
      ...input(),
      ...change
    }));
    assert.equal(c.calls.length, 0);
  }
});
test('expired or foreign linked deals reject save until explicit removal, including archive', async () => {
  const labelFields = {
    display_title: null, type: null, reward_format: null, discount_type: null,
    discount_value: null, reward_item: null, benefit_count: null, trigger_key: null,
    campaign_type: null, activation_mode: null, metadata: null,
  };
  for (const deal of [{
    id: foreign,
    partner_id: id,
    active: true,
    valid_from: null,
    valid_until: '2025-01-01T00:00:00Z'
  }, {
    id: foreign,
    partner_id: foreign,
    active: true,
    valid_from: null,
    valid_until: null
  }]) {
    const c = client();
    c.from = () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      then(resolve) {
        return Promise.resolve({
          data: [{...labelFields, ...deal}],
          error: null
        }).then(resolve);
      }
    });
    const source = await crm().readCrmDeals(c, id);
    assert.equal(source.status, deal.partner_id === id ? 'ready' : 'unavailable');
    if (source.status === 'ready') assert.equal(source.deals.length, 0);
    await assert.rejects(() => crm().saveCrmCampaign(c, id, {
      ...input(),
      deal_id: foreign,
      status: 'archived'
    }), /Vorteil.*nicht mehr gültig|gehört nicht/);
    assert.equal(c.calls.some(call => call.name === 'save_partner_crm_campaign'), false);
  }
});
test('active deal source selects existing columns and derives labels from nullable display fields', async () => {
  const columns = ['id', 'partner_id', 'active', 'valid_from', 'valid_until', 'display_title', 'type', 'reward_format', 'discount_type', 'discount_value', 'reward_item', 'benefit_count', 'trigger_key', 'campaign_type', 'activation_mode', 'metadata'];
  let projection,
    filters = [];
  const rows = [{
    id: foreign,
    partner_id: id,
    active: true,
    valid_from: null,
    valid_until: null,
    display_title: 'Kaffee am Nachmittag',
    type: null,
    reward_format: null,
    discount_type: null,
    discount_value: null,
    reward_item: null,
    benefit_count: null,
    trigger_key: null,
    campaign_type: null,
    activation_mode: null,
    metadata: null
  }, {
    id: '00000000-0000-4000-8000-000000000098',
    partner_id: id,
    active: true,
    valid_from: null,
    valid_until: null,
    display_title: null,
    type: 'discount',
    reward_format: 'discount',
    discount_type: 'percent',
    discount_value: 15,
    reward_item: null,
    benefit_count: null,
    trigger_key: null,
    campaign_type: null,
    activation_mode: null,
    metadata: null
  }];
  rows.push({...rows[0], id: '00000000-0000-4000-8000-000000000097', display_title: null});
  const c = client();
  c.from = table => {
    assert.equal(table, 'deals');
    return {
      select(value) {
        projection = value;
        return this;
      },
      eq(key, value) {
        filters.push([key, value]);
        return this;
      },
      then(resolve) {
        const valid = projection.split(',').every(name => columns.includes(name));
        return Promise.resolve(valid ? {
          data: rows,
          error: null
        } : {
          data: null,
          error: {
            message: 'column does not exist'
          }
        }).then(resolve);
      }
    };
  };
  const result = await crm().readCrmDeals(c, id);
  assert.equal(result.status, 'ready');
  assert.deepEqual(JSON.parse(JSON.stringify(result.deals)), [{
    id: foreign,
    title: 'Kaffee am Nachmittag'
  }, {
    id: '00000000-0000-4000-8000-000000000098',
    title: '15 % Rabatt'
  }, {
    id: '00000000-0000-4000-8000-000000000097',
    title: 'Vorteil'
  }]);
  assert.deepEqual(projection.split(',').sort(), columns.sort());
  assert.deepEqual(filters, [['partner_id', id], ['active', true]]);
  const saved = await crm().saveCrmCampaign({
    ...c,
    rpc: async (name, params) => {
      if (name === 'get_partner_entitlements') return {
        data: rights
      };
      assert.equal(name, 'save_partner_crm_campaign');
      return {
        data: {
          ...fixture.campaigns[0],
          deal_id: params.p_campaign.deal_id,
          revision: 2
        }
      };
    }
  }, id, {
    ...input(),
    deal_id: foreign
  });
  assert.equal(saved.deal_id, foreign);
});
for (const [label, path, value] of [['timezone', ['timezone'], 'Europe/Berlin'], ['campaign kind', ['campaigns', 0, 'kind'], 'comeback'], ['campaign channel', ['campaigns', 0, 'channel'], 'in_app'], ['campaign status', ['campaigns', 0, 'status'], 'draft'], ['editorial service key', ['editorial_requests', 0, 'service_key'], 'blog_article'], ['editorial status', ['editorial_requests', 0, 'status'], 'planned'], ['audience kind', ['audiences', 'second_visit', 'kind'], 'second_visit'], ['audience status', ['audiences', 'second_visit', 'status'], 'ok'], ['audience definition', ['audiences', 'second_visit', 'definition'], 'exactly_one_completed_visit_in_window'], ['delivery status', ['delivery', 'status'], 'draft_only'], ['delivery reason', ['delivery', 'reason'], 'marketing_delivery_not_enabled'], ['metrics status', ['metrics', 'status'], 'unavailable'], ['metrics reason', ['metrics', 'reason'], 'marketing_delivery_not_enabled']]) test(`dashboard rejects non-string ${label} enum values`, () => {
  for (const malformed of [[value], {
    value
  }]) {
    const d = copy();
    let target = d;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path.at(-1)] = malformed;
    if (label === 'audience status') d.audiences.second_visit.value = null;
    assert.throws(() => crm().parseCrmDashboard(d, id), undefined, `${label}: ${JSON.stringify(malformed)}`);
  }
});
test('campaign and editorial input enums reject arrays and objects before any RPC', async () => {
  const api = crm();
  for (const [field, value] of [['kind', 'comeback'], ['channel', 'in_app'], ['status', 'draft']]) for (const malformed of [[value], {
    value
  }]) assert.throws(() => api.parseCampaignInput({
    ...input(),
    [field]: malformed
  }));
  for (const malformed of [['blog_article'], {
    value: 'blog_article'
  }]) {
    const c = client();
    await assert.rejects(() => api.requestEditorialService(c, id, malformed, ''));
    assert.equal(c.calls.length, 0);
  }
  for (const malformed of [['completed'], {
    value: 'completed'
  }]) {
    const c = client();
    await assert.rejects(() => api.updateEditorialService(c, id, 'blog_article', malformed, 'Reason'));
    assert.equal(c.calls.length, 0);
  }
});
