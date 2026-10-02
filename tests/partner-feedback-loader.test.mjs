import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { loadTypescript } from './helpers/load-typescript.mjs'

const partnerA = '11111111-1111-4111-8111-111111111111'
const partnerB = '22222222-2222-4222-8222-222222222222'
const dealId = '33333333-3333-4333-8333-333333333333'
const response = (partnerId, title) => ({ available: true, settings: {
  partner_id: partnerId, enabled: false, deal_id: null,
  available_deals: [{ id: dealId, title, description: '', terms: '', expires_at: null }],
} })

async function fixture(t, read) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const root = createRoot(document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
    dom.window.close()
  })
  const { PartnerFeedbackSettings: Card } = loadTypescript('components/partner/partner-feedback-settings.tsx', {
    '@/app/partner/feedback-actions': { updateFeedbackReward: async () => ({ ok: false, message: '' }) },
  }, { FormData: dom.window.FormData })
  const { PartnerFeedbackSettingsLoader: Loader } = loadTypescript('components/partner/partner-feedback-settings-loader.tsx', {
    '@/lib/supabase/client': { createClient: () => ({ session: 'owner-cookie' }) },
    '@/lib/partners/feedback': { readFeedbackSettings: read },
    '@/components/partner/partner-feedback-settings': { PartnerFeedbackSettings: Card },
  })
  return { dom, render: (partnerId, dealRevision = 'initial') => act(async () => root.render(h(Loader, { partnerId, dealRevision }))) }
}

test('only the selected shop loads; a late previous-shop response cannot replace it', async t => {
  const calls = [], pending = new Map()
  const ui = await fixture(t, (client, partnerId) => {
    assert.equal(client.session, 'owner-cookie')
    calls.push(partnerId)
    return new Promise(resolve => pending.set(partnerId, resolve))
  })
  await ui.render(partnerA)
  await ui.render(partnerB)
  await act(async () => pending.get(partnerB)(response(partnerB, 'B Kaffee')))
  await act(async () => pending.get(partnerA)(response(partnerA, 'A Kaffee')))
  assert.deepEqual(calls, [partnerA, partnerB])
  assert.equal(document.querySelector('[name="partner_id"]').value, partnerB)
  assert.match(document.body.textContent, /B Kaffee/)
  assert.doesNotMatch(document.body.textContent, /A Kaffee/)
})

test('changing the selected shop discards the previous checkbox and deal draft', async t => {
  const ui = await fixture(t, async (_client, partnerId) => response(partnerId, partnerId === partnerA ? 'A Kaffee' : 'B Kaffee'))
  await ui.render(partnerA)
  await act(async () => document.querySelector('[name="enabled"]').click())
  await act(async () => {
    const select = document.querySelector('[name="deal_id"]')
    select.value = dealId
    select.dispatchEvent(new ui.dom.window.Event('change', { bubbles: true }))
  })
  assert.equal(document.querySelector('[name="enabled"]').checked, true)
  await ui.render(partnerB)
  assert.equal(document.querySelector('[name="partner_id"]').value, partnerB)
  assert.equal(document.querySelector('[name="enabled"]').checked, false)
  assert.equal(document.querySelector('[name="deal_id"]').value, '')
})

test('a failed scoped lookup offers retry and renders the confirmed response', async t => {
  let attempts = 0
  const ui = await fixture(t, async () => {
    if (++attempts === 1) throw new Error('temporarily unavailable')
    return response(partnerA, 'Kaffee nach erneutem Laden')
  })
  await ui.render(partnerA)
  assert.match(document.querySelector('[role="alert"]').textContent, /erneut/i)
  assert.equal(document.querySelector('form'), null)
  await act(async () => document.querySelector('button').click())
  assert.equal(attempts, 2)
  assert.equal(document.querySelector('[role="alert"]'), null)
  assert.equal(document.querySelector('[name="partner_id"]').value, partnerA)
})

test('newly created benefits refresh the same shop without discarding its reward draft', async t => {
  const calls = []
  const ui = await fixture(t, async (_client, partnerId) => {
    calls.push(partnerId)
    return response(partnerId, calls.length === 1 ? 'Vorhandener Kaffee' : 'Aktualisierter Kaffee')
  })
  await ui.render(partnerA, 'before-deal-save')
  await act(async () => document.querySelector('[name="enabled"]').click())
  await act(async () => {
    const select = document.querySelector('[name="deal_id"]')
    select.value = dealId
    select.dispatchEvent(new ui.dom.window.Event('change', { bubbles: true }))
  })
  await ui.render(partnerA, 'after-deal-save')
  assert.deepEqual(calls, [partnerA, partnerA])
  assert.match(document.querySelector('aside').textContent, /Aktualisierter Kaffee/)
  assert.equal(document.querySelector('[name="enabled"]').checked, true)
  assert.equal(document.querySelector('[name="deal_id"]').value, dealId)
})

test('creating the first eligible benefit unlocks the reward setting in the current tab', async t => {
  let reads = 0
  const ui = await fixture(t, async (_client, partnerId) => {
    const loaded = response(partnerId, 'Erster Kaffee')
    if (++reads === 1) loaded.settings.available_deals = []
    return loaded
  })
  await ui.render(partnerA, 'no-deals')
  assert.equal(document.querySelector('[name="enabled"]').disabled, true)
  await ui.render(partnerA, 'first-deal-created')
  assert.equal(document.querySelector('[name="enabled"]').disabled, false)
  assert.match(document.querySelector('select').textContent, /Erster Kaffee/)
})
