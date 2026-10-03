import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { loadTypescript } from './helpers/load-typescript.mjs';
const dashboard = JSON.parse(readFileSync(new URL('./fixtures/partner-crm/dashboard-v1.json', import.meta.url)));
const preview = JSON.parse(readFileSync(new URL('./fixtures/partner-crm/audience-preview-v1.json', import.meta.url)));
const partnerId = dashboard.partner_id, foreign = '00000000-0000-4000-8000-000000000099';
const ready = { actorId: 'actor-a', initial: { status: 'ready', dashboard, writable: true }, deals: { status: 'ready', deals: [] } };
function success(request, value = 12) {
  const definition = { second_visit: 'exactly_one_completed_visit_in_window', comeback: 'last_completed_visit_at_least_configured_berlin_days_ago_in_window', reward_reminder: 'up_to_configured_stamps_before_next_eligible_base_milestone' }[request.kind];
  return { ok: true, value: { actorId: 'actor-a', preview: { ...structuredClone(preview), partner_id: request.partnerId, audience: { kind: request.kind, config: request.config, definition, status: 'ok', value } } }, message: '' };
}
async function ui(t, options = {}) {
  // Keep the existing real-component / loadTypescript / JSDOM harness pattern; only network actions and auth transport are controlled.
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true }), previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client'), root = createRoot(document.getElementById('root'));
  let mounted = true, auth;
  const requests = [], saves = [];
  const actions = {
    previewPartnerCrmAudience: (id, kind, config) => new Promise((resolve, reject) => requests.push({ partnerId: id, kind, config, resolve, reject })),
    savePartnerCrm: async (id, input) => { saves.push({ id, input }); return { ok: false, code: 'failed', message: 'Speichern erneut möglich' }; },
    requestPartnerEditorial: async () => { throw Error('unexpected editorial mutation'); },
    loadPartnerCrm: options.load ?? (async () => ({ ok: true, value: ready, message: '' })),
  };
  const { PartnerCrmWorkspace } = loadTypescript('components/partner/partner-crm-workspace.tsx', { '@/app/partner/crm-actions': actions }, { crypto: { randomUUID }, FormData: dom.window.FormData });
  const { PartnerCrmLoader } = loadTypescript('components/partner/partner-crm-loader.tsx', {
    '@/app/partner/crm-actions': actions,
    '@/components/partner/partner-crm-workspace': { PartnerCrmWorkspace },
    '@/lib/supabase/client': { createClient: () => ({ auth: { onAuthStateChange: callback => {
      auth = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    } } }) },
  }, { window: dom.window });
  const unmount = async () => { if (mounted) { await act(async () => root.unmount()); mounted = false; } };
  t.after(async () => {
    await unmount();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    dom.window.close();
  });
  const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
  return {
    requests, saves, button, unmount,
    render: (props = {}) => act(async () => root.render(h(PartnerCrmLoader, {
      key: `${props.partnerId ?? partnerId}:${props.actorId ?? 'actor-a'}`,
      partnerId, actorId: 'actor-a', initial: ready.initial, deals: ready.deals, ...props,
    }))),
    select: async (name, value) => {
      const select = document.querySelector(`[name="${name}"]`);
      assert.ok(select, `${name} selection must exist`);
      await act(async () => { select.value = String(value); select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    },
    check: async () => {
      const b = button('Zielgruppe prüfen');
      assert.ok(b, 'explicit configured audience check must exist');
      await act(async () => b.click());
    },
    settle: (request, result = success(request)) => act(async () => request.resolve(result)),
    reject: (request, error) => act(async () => request.reject(error)),
    auth: id => act(async () => auth(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null)),
    focus: () => act(async () => dom.window.dispatchEvent(new dom.window.Event('focus'))),
    submit: () => act(async () => document.querySelector('[data-campaign-form]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))),
    preview: () => document.querySelector('[data-recipient-preview]'),
  };
}
test('configured 30→60 preview ignores late30, preserves text/channel and never saves on check', async t => {
  const f = await ui(t);
  await f.render();
  await f.select('kind', 'comeback');
  await f.select('inactivity_days', 30);
  assert.match(f.preview().textContent, /Zielgruppe noch nicht geprüft/);
  assert.doesNotMatch(f.preview().textContent, /Standardauswahl|128/);
  document.querySelector('[name="title"]').value = 'Ungespeicherter Titel';
  document.querySelector('[name="body"]').value = 'Ungespeicherte Nachricht';
  await f.select('channel', 'push_and_in_app');
  await f.check();
  const old = f.requests[0];
  assert.equal(old.kind, 'comeback');
  assert.equal(old.config.inactivity_days, 30);
  assert.match(f.preview().textContent, /Zielgruppe wird geprüft/);
  assert.equal(f.saves.length, 0);
  await f.select('inactivity_days', 60);
  assert.match(f.preview().textContent, /Zielgruppe noch nicht geprüft/);
  await f.check();
  const current = f.requests[1];
  assert.equal(current.config.inactivity_days, 60);
  await f.settle(current, success(current, 22));
  assert.match(f.preview().textContent, /Potenzielle Besuchsgruppe.*22/);
  assert.match(f.preview().textContent, /60 Berliner Tage/);
  assert.match(f.preview().textContent, /03.10.2026.*12:00/);
  await f.settle(old, success(old, 12));
  assert.match(f.preview().textContent, /Potenzielle Besuchsgruppe.*22/);
  assert.doesNotMatch(f.preview().textContent, /30 Berliner Tage/);
  assert.equal(document.querySelector('[name="title"]').value, 'Ungespeicherter Titel');
  assert.equal(document.querySelector('[name="body"]').value, 'Ungespeicherte Nachricht');
  assert.equal(document.querySelector('[name="channel"]').value, 'push_and_in_app');
  assert.equal(f.saves.length, 0);
  assert.match(document.querySelector('[data-audience="comeback"]').textContent, /45 Berliner Tage/);
  await f.select('kind', 'reward_reminder');
  assert.match(f.preview().textContent, /Zielgruppe noch nicht geprüft/);
  assert.doesNotMatch(f.preview().textContent, /Potenzielle Besuchsgruppe.*22/);
});
test('one explicit request per selection; failures and invalid schema release retry, save is independent', async t => {
  const f = await ui(t);
  await f.render();
  await f.check();
  await f.check();
  assert.equal(f.requests.length, 1);
  assert.equal(f.button('Zielgruppe prüfen').disabled, true);
  assert.equal(f.button('Entwurf speichern').disabled, false);
  await f.submit();
  assert.equal(f.saves.length, 1);
  await f.settle(f.requests[0], { ok: false, code: 'failed', message: 'Bitte erneut prüfen' });
  assert.match(f.preview().textContent, /Bitte erneut prüfen/);
  assert.equal(f.button('Zielgruppe prüfen').disabled, false);
  await f.check();
  const bad = success(f.requests[1]); bad.value.preview.audience.value = 3;
  await f.settle(f.requests[1], bad);
  assert.equal(f.button('Zielgruppe prüfen').disabled, false);
  assert.doesNotMatch(f.preview().textContent, /Potenzielle Besuchsgruppe: 3/);
  await f.check();
  await f.settle(f.requests[2]);
  assert.match(f.preview().textContent, /Potenzielle Besuchsgruppe.*12/);
});
test('CRM-only partner can select and read suppressed, empty and unavailable groups without marketing rights', async t => {
  const f = await ui(t);
  await f.render({ initial: { ...ready.initial, writable: false } });
  assert.equal(f.button('Entwurf speichern'), undefined);
  await f.select('kind', 'reward_reminder');
  await f.select('remaining_stamps', 1);
  for (const [status, value, reason, label] of [
    ['suppressed', null, undefined, /Aus Datenschutzgründen verborgen/],
    ['empty', 0, undefined, /Potenzielle Besuchsgruppe.*0/],
    ['unavailable', null, 'reward_source_error', /Noch nicht ermittelbar/],
  ]) {
    await f.check();
    const request = f.requests.at(-1), result = success(request);
    result.value.preview.audience = { ...result.value.preview.audience, status, value, ...(reason ? { reason } : {}) };
    await f.settle(request, result);
    assert.match(f.preview().textContent, label);
    assert.match(f.preview().textContent, /Ein Stempel/);
    assert.match(f.preview().textContent, /Das ist keine Empfängerliste. Einwilligung und Erreichbarkeit sind noch nicht geprüft/);
  }
  assert.equal(f.saves.length, 0);
});
test('opening another draft invalidates in-flight preview and removes old success even with same filters', async t => {
  const f = await ui(t);
  await f.render();
  await f.check();
  const old = f.requests[0];
  await act(async () => f.button('Neuer Entwurf').click());
  await f.settle(old);
  assert.match(f.preview().textContent, /Zielgruppe noch nicht geprüft/);
  await f.check();
  await f.settle(f.requests[1]);
  await act(async () => f.button('Neuer Entwurf').click());
  assert.match(f.preview().textContent, /Zielgruppe noch nicht geprüft/);
});
for (const [label, props] of [['partner', { partnerId: foreign }], ['actor', { actorId: 'actor-b' }]]) test(`${label} scope change ignores late private preview`, async t => {
  const f = await ui(t);
  await f.render();
  await f.check();
  const old = f.requests[0];
  await f.render(props);
  await f.settle(old, success(old, 12345));
  assert.doesNotMatch(f.preview().textContent, /12.345/);
  assert.match(f.preview().textContent, /Zielgruppe noch nicht geprüft/);
});
test('sign-out and unmount invalidate pending preview including its late denied response', async t => {
  const f = await ui(t);
  await f.render();
  await f.check();
  const old = f.requests[0];
  await f.auth(null);
  assert.equal(f.preview(), null);
  await f.settle(old, success(old, 12345));
  assert.doesNotMatch(document.body.textContent, /12.345/);
  await f.render({ actorId: 'actor-b' });
  await f.check();
  const other = f.requests[1];
  await f.unmount();
  await f.settle(other, { ok: false, code: 'denied', message: 'late denied' });
  assert.equal(document.body.textContent, '');
});
test('current raw42501 clears private workspace through loader access-loss path', async t => {
  const f = await ui(t, { load: () => new Promise(() => {}) });
  await f.render();
  await f.check();
  await f.reject(f.requests[0], { code: '42501', message: 'SQL secret' });
  assert.equal(f.preview(), null);
  assert.equal(document.querySelector('[data-campaign-form]'), null);
  assert.doesNotMatch(document.body.textContent, /128|SQL secret/);
  assert.match(document.body.textContent, /Zugriff.*aktualisieren/);
});
test('foreign actor or permission refresh cannot publish a preview in the current account', async t => {
  let loaded = { ok: true, value: ready };
  const f = await ui(t, { load: async () => loaded });
  await f.render();
  await f.check();
  const result = success(f.requests[0]); result.value.actorId = 'actor-b';
  await f.settle(f.requests[0], result);
  assert.doesNotMatch(document.body.textContent, /Potenzielle Besuchsgruppe: 12/);
  // Scope mismatch clears the private workspace; reload must reestablish the actor before checking again.
  await act(async () => f.button('Zugriff und Daten erneut laden')?.click());
  await f.check();
  const pending = f.requests[1];
  loaded = { ok: true, value: { ...ready, initial: { status: 'locked', message: 'Pro erforderlich' } } };
  await f.focus();
  await f.settle(pending, success(pending, 12345));
  assert.equal(f.preview(), null);
  assert.doesNotMatch(document.body.textContent, /12.345/);
});
