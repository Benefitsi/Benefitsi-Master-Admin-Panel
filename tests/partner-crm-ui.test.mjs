import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { loadTypescript } from './helpers/load-typescript.mjs';
const dashboard = JSON.parse(readFileSync(new URL('./fixtures/partner-crm/dashboard-v1.json', import.meta.url)));
const partnerId = dashboard.partner_id;
const initial = {
  status: 'ready',
  dashboard,
  writable: true
},
  deals = {
    status: 'ready',
    deals: []
  };
async function ui(t, actions = {}) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'http://localhost',
    pretendToBeVisual: true
  }),
    previous = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    FormData: dom.window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value
    });
  }
  const {
    createRoot
  } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    for (const [key, d] of previous) {
      if (d) Object.defineProperty(globalThis, key, d); else delete globalThis[key];
    }
    dom.window.close();
  });
  const exported = loadTypescript('components/partner/partner-crm-workspace.tsx', {
    '@/app/partner/crm-actions': {
      savePartnerCrm: async () => ({
        ok: false,
        message: 'Fehler',
        code: 'failed'
      }),
      requestPartnerEditorial: async () => ({
        ok: true,
        value: dashboard.editorial_requests[0],
        message: 'Gespeichert'
      }),
      ...actions
    }
  }, {
    crypto: {
      randomUUID
    },
    FormData: dom.window.FormData
  });
  return {
    dom,
    ...exported,
    render: (props = {}) => act(async () => root.render(h(exported.PartnerCrmWorkspace, {
      partnerId,
      actorId: 'actor-a',
      initial,
      deals,
      ...props
    }))),
    button: text => [...document.querySelectorAll('button')].find(b => b.textContent === text),
    submit: () => act(async () => document.querySelector('[data-campaign-form]').dispatchEvent(new dom.window.Event('submit', {
      bubbles: true,
      cancelable: true
    })))
  };
}
test('real workspace differentiates three audience states and truthful draft-only copy', async t => {
  const f = await ui(t);
  await f.render();
  assert.match(document.body.textContent, /128/);
  assert.match(document.body.textContent, /Aus Datenschutzgründen/);
  assert.match(document.body.textContent, /Noch nicht ermittelbar/);
  assert.match(document.body.textContent, /365 abgeschlossene/);
  assert.match(document.body.textContent, /keine erreichbaren/);
  assert.match(document.body.textContent, /Nachrichtenversand wird vorbereitet/);
  assert.equal(f.button('Senden'), undefined);
  assert.equal(document.querySelectorAll('[data-audience]').length, 3);
});
test('normal save, failure and identical retry preserve stable UUID/revision and unsaved fields', async t => {
  const calls = [];
  const f = await ui(t, {
    savePartnerCrm: async (id, input) => {
      calls.push({
        id,
        input
      });
      return calls.length === 1 ? {
        ok: false,
        code: 'failed',
        message: 'Bitte erneut versuchen.'
      } : {
        ok: true,
        message: 'Entwurf gespeichert.',
        value: {
          ...input,
          partner_id: id,
          revision: 1,
          created_at: dashboard.as_of,
          updated_at: dashboard.as_of
        }
      };
    }
  });
  await f.render();
  document.querySelector('[name="title"]').value = 'QA Entwurf';
  document.querySelector('[name="body"]').value = 'Besuche uns wieder.';
  await f.submit();
  assert.match(document.querySelector('[role="alert"]').textContent, /erneut/);
  await f.submit();
  assert.equal(calls[0].input.id, calls[1].input.id);
  assert.equal(calls[0].input.expected_revision, 0);
  assert.equal(calls[1].input.expected_revision, 0);
  assert.match(document.body.textContent, /Entwurf gespeichert/);
  assert.equal(document.querySelector('[name="title"]').value, 'QA Entwurf');
});
test('incidental rights refresh preserves editing while revoked access removes private controls', async t => {
  const f = await ui(t);
  await f.render();
  document.querySelector('[name="title"]').value = 'Ungespeicherte Änderung';
  await f.render({
    initial: {
      ...initial,
      dashboard: structuredClone(dashboard)
    }
  });
  assert.equal(document.querySelector('[name="title"]').value, 'Ungespeicherte Änderung');
  await f.render({
    initial: {
      status: 'locked',
      message: 'Pro erforderlich'
    }
  });
  assert.equal(document.querySelector('form'), null);
  assert.doesNotMatch(document.body.textContent, /128|Ungespeicherte/);
  assert.match(document.body.textContent, /Pro|Tarif/);
  await f.render();
  assert.equal(document.querySelector('[name="title"]').value, '');
});
test('custom inactivity/reminder remains unchecked instead of relabelling fixed dashboard audience', async t => {
  const f = await ui(t);
  await f.render();
  await act(async () => document.querySelector('[data-audience="comeback"] button').click());
  const select = document.querySelector('[name="inactivity_days"]');
  select.value = '60';
  await act(async () => select.dispatchEvent(new f.dom.window.Event('change', {
    bubbles: true
  })));
  assert.match(document.querySelector('[data-recipient-preview]').textContent, /Zielgruppe noch nicht geprüft/);
  assert.doesNotMatch(document.querySelector('[data-recipient-preview]').textContent, /Standardauswahl|45 Tage/);
  assert.match(document.querySelector('[data-audience="comeback"]').textContent, /45 Berliner Tage/);
  await act(async () => document.querySelector('[data-audience="reward_reminder"] button').click());
  const reminder = document.querySelector('[name="remaining_stamps"]');
  reminder.value = '1';
  await act(async () => reminder.dispatchEvent(new f.dom.window.Event('change', {
    bubbles: true
  })));
  assert.match(document.querySelector('[data-recipient-preview]').textContent, /Zielgruppe noch nicht geprüft/);
});
test('editing and archiving use current revision and allow restoration', async t => {
  let sent;
  const f = await ui(t, {
    savePartnerCrm: async (id, input) => {
      sent = input;
      return {
        ok: true,
        message: 'Gespeichert',
        value: {
          ...dashboard.campaigns[0],
          ...input,
          partner_id: id,
          revision: 2
        }
      };
    }
  });
  await f.render();
  await act(async () => f.button('Bearbeiten').click());
  await act(async () => f.button('Archivieren').click());
  assert.equal(sent.expected_revision, 1);
  assert.equal(sent.status, 'archived');
  assert.ok(f.button('Wiederherstellen'));
});
test('planned editorial service retains status, never offers repeated request or internal note', async t => {
  const f = await ui(t);
  await f.render();
  assert.match(document.querySelector('[data-editorial="blog_article"]').textContent, /Geplant/);
  assert.equal(document.querySelector('[data-editorial="blog_article"] button'), null);
  assert.match(document.querySelector('[data-editorial="founder_interview"]').textContent, /Nicht angefragt/);
  assert.doesNotMatch(document.body.textContent, /admin_note/);
  const fresh = {
    ...initial,
    dashboard: {
      ...dashboard,
      editorial_requests: dashboard.editorial_requests.map(r => ({
        ...r,
        status: 'not_requested',
        partner_note: null,
        requested_at: null,
        updated_at: null
      }))
    }
  };
  await f.render({
    initial: fresh
  });
  const form = document.querySelector('[data-editorial="blog_article"] form');
  await act(async () => form.dispatchEvent(new f.dom.window.Event('submit', {
    bubbles: true,
    cancelable: true
  })));
  assert.match(document.querySelector('[data-editorial="blog_article"]').textContent, /Geplant/);
  assert.equal(document.querySelector('[data-editorial="blog_article"] button'), null);
});
test('Free overview and backend outage expose neither fixture counts nor editable forms', async t => {
  const f = await ui(t);
  for (const state of [{
    status: 'locked',
    message: 'Pro erforderlich'
  }, {
    status: 'unavailable',
    message: 'Aktuell noch nicht verfügbar'
  }]) {
    await f.render({
      initial: state
    });
    assert.equal(document.querySelector('form'), null);
    assert.doesNotMatch(document.body.textContent, /128|regionalen Produkte/);
    assert.match(document.body.textContent, /Pro|verfügbar/);
  }
});
test('unknown deal source has an unavailable explanation, not a fake empty state', async t => {
  const f = await ui(t);
  await f.render({
    deals: {
      status: 'unavailable',
      message: 'Aktive Vorteile konnten nicht geladen werden.'
    }
  });
  assert.match(document.body.textContent, /Vorteile konnten nicht geladen/);
  assert.doesNotMatch(document.body.textContent, /Keine aktiven Vorteile vorhanden/);
  assert.equal(document.querySelector('[name="deal_id"]').disabled, true);
});
test('unavailable deal source preserves an existing link through save until explicitly removed', async t => {
  const linked = '00000000-0000-4000-8000-000000000099',
    calls = [];
  const f = await ui(t, {
    savePartnerCrm: async (_id, input) => {
      calls.push(input);
      return {
        ok: false,
        code: 'invalid',
        message: 'Bitte die Verknüpfung entfernen oder ersetzen.'
      };
    }
  });
  const current = {
    ...initial,
    dashboard: {
      ...dashboard,
      campaigns: [{
        ...dashboard.campaigns[0],
        deal_id: linked
      }]
    }
  };
  await f.render({
    initial: current,
    deals: {
      status: 'unavailable',
      message: 'Vorteile konnten nicht geladen werden.'
    }
  });
  await act(async () => f.button('Bearbeiten').click());
  await f.submit();
  assert.equal(calls[0].deal_id, linked);
  assert.match(document.body.textContent, /entfernen oder ersetzen/);
  await act(async () => f.button('Verknüpfung entfernen').click());
  await f.submit();
  assert.equal(calls[1].deal_id, null);
  assert.equal(calls[0].id, calls[1].id);
  assert.equal(calls[0].expected_revision, calls[1].expected_revision);
});
test('expired saved link stays selected and exposes explicit removal before archive', async t => {
  const linked = '00000000-0000-4000-8000-000000000099',
    calls = [];
  const f = await ui(t, {
    savePartnerCrm: async (_id, input) => {
      calls.push(input);
      return {
        ok: false,
        code: 'invalid',
        message: 'Der Vorteil ist nicht mehr gültig.'
      };
    }
  });
  await f.render({
    initial: {
      ...initial,
      dashboard: {
        ...dashboard,
        campaigns: [{
          ...dashboard.campaigns[0],
          deal_id: linked
        }]
      }
    }
  });
  await act(async () => f.button('Bearbeiten').click());
  assert.equal(document.querySelector('[name="deal_id"]').value, linked);
  assert.match(document.body.textContent, /Verknüpfung entfernen oder.*Vorteil auswählen/);
  await act(async () => f.button('Archivieren').click());
  assert.equal(calls[0].deal_id, linked);
  const select = document.querySelector('[name="deal_id"]');
  select.value = '';
  await act(async () => select.dispatchEvent(new f.dom.window.Event('change', {
    bubbles: true
  })));
  await f.submit();
  assert.equal(calls[1].deal_id, null);
});
test('conflict keeps local content until saved revision is explicitly loaded', async t => {
  const canonical = {
    ...dashboard.campaigns[0],
    revision: 3,
    title: 'Gespeicherte Änderung'
  };
  const f = await ui(t, {
    savePartnerCrm: async () => ({
      ok: false,
      code: 'conflict',
      message: 'Bitte gespeicherte Version laden.'
    }),
    loadPartnerCrm: async () => ({
      ok: true,
      value: {
        initial: {
          ...initial,
          dashboard: {
            ...dashboard,
            campaigns: [canonical]
          }
        },
        deals
      },
      message: ''
    })
  });
  await f.render();
  await act(async () => f.button('Bearbeiten').click());
  document.querySelector('[name="title"]').value = 'Lokale Änderung';
  await f.submit();
  assert.equal(document.querySelector('[name="title"]').value, 'Lokale Änderung');
  await act(async () => f.button('Gespeicherte Version laden').click());
  assert.equal(document.querySelector('[name="title"]').value, 'Gespeicherte Änderung');
  assert.match(document.body.textContent, /Version 3/);
});
test('late save response cannot publish private content after workspace access is removed', async t => {
  let resolve;
  const f = await ui(t, {
    savePartnerCrm: (_id, input) => new Promise(r => {
      resolve = () => r({
        ok: true,
        value: {
          ...dashboard.campaigns[0],
          ...input,
          revision: 1
        },
        message: 'Private saved response'
      });
    })
  });
  await f.render();
  document.querySelector('[name="title"]').value = 'Privater neuer Entwurf';
  document.querySelector('[name="body"]').value = 'Private Nachricht';
  await f.submit();
  await f.render({
    initial: {
      status: 'locked',
      message: 'Zugriff aktualisieren'
    }
  });
  await act(async () => resolve());
  assert.equal(document.querySelector('form'), null);
  assert.doesNotMatch(document.body.textContent, /Privater neuer Entwurf|Private saved response/);
});
