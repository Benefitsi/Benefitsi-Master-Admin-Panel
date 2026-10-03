import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { loadTypescript } from './helpers/load-typescript.mjs';
const requests = JSON.parse(readFileSync(new URL('./fixtures/partner-crm/dashboard-v1.json', import.meta.url))).editorial_requests.map(r => ({
  ...r,
  admin_note: null
}));
test('focused editorial admin shows context and updates current status only after confirmed save', async t => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'http://localhost'
  }),
    previous = new Map();
  for (const [k, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    FormData: dom.window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true
  })) {
    previous.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, {
      configurable: true,
      writable: true,
      value
    });
  }
  const {
    createRoot
  } = await import('react-dom/client'),
    root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    for (const [k, d] of previous) {
      if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
    }
    dom.window.close();
  });
  const calls = [];
  const {
    PartnerEditorialManagement
  } = loadTypescript('components/partner/partner-editorial-management.tsx', {
    '@/app/partner/crm-actions': {
      updatePartnerEditorial: async (...args) => {
        calls.push(args);
        return {
          ok: true,
          message: 'Gespeichert',
          value: {
            ...requests[0],
            status: 'completed',
            admin_note: 'Freigabe geprüft'
          }
        };
      }
    }
  }, {
    FormData: dom.window.FormData
  });
  await act(async () => root.render(h(PartnerEditorialManagement, {
    partnerId: '00000000-0000-4000-8000-000000000013',
    initial: requests
  })));
  assert.match(document.body.textContent, /regionalen Produkte/);
  assert.equal(document.querySelectorAll('form').length, 1);
  document.querySelector('[name="status"]').value = 'completed';
  document.querySelector('[name="note"]').value = 'Freigabe geprüft';
  await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', {
    bubbles: true,
    cancelable: true
  })));
  assert.equal(calls.length, 1);
  assert.match(document.querySelector('[data-admin-editorial="blog_article"]').textContent, /Abgeschlossen/);
  assert.equal(document.querySelector('[name="status"]').value, 'completed');
  assert.equal(document.querySelector('[name="note"]').value, 'Freigabe geprüft');
  await act(async () => root.render(h(PartnerEditorialManagement, {
    partnerId: '00000000-0000-4000-8000-000000000013',
    initial: requests.map(r => r.service_key === 'blog_article' ? {
      ...r,
      status: 'planned',
      admin_note: 'Neuer redaktioneller Termin',
      updated_at: '2026-10-03T18:00:00Z'
    } : r)
  })));
  assert.match(document.querySelector('[data-admin-editorial="blog_article"]').textContent, /Geplant/);
  assert.equal(document.querySelector('[name="status"]').value, 'planned');
  assert.equal(document.querySelector('[name="note"]').value, 'Neuer redaktioneller Termin');
  await act(async () => root.render(h(PartnerEditorialManagement, {
    partnerId: '00000000-0000-4000-8000-000000000013',
    initial: undefined
  })));
  assert.match(document.body.textContent, /nicht verfügbar/);
  assert.equal(document.querySelector('form'), null);
});
