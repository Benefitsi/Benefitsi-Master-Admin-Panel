import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { loadTypescript } from './helpers/load-typescript.mjs'

const partnerId = '926cd331-3c5a-4510-a127-8c48a8ec65ac'
const dealId = '44444444-4444-4444-8444-444444444444'
const settings = {
  partner_id: partnerId,
  enabled: false,
  deal_id: null,
  available_deals: [{ id: dealId, title: '10 % beim nächsten Besuch', description: 'Einmalig für dein Feedback.', terms: 'Ab 10 € Bestellwert.', expires_at: null }],
}
const { readFeedbackSettings, saveFeedbackSettings } = loadTypescript('lib/partners/feedback.ts')
const { PartnerFeedbackSettings } = loadTypescript('components/partner/partner-feedback-settings.tsx', {
  '@/app/partner/feedback-actions': { updateFeedbackReward: async () => ({ ok: true, message: 'Gespeichert.' }) },
})

test('loads only the requested partner settings through the scoped RPC', async () => {
  const calls = []
  const client = { rpc: async (name, params) => { calls.push({ name, params }); return { data: settings, error: null } } }
  const result = await readFeedbackSettings(client, partnerId)
  assert.equal(result.available, true)
  assert.equal(result.settings.enabled, false)
  assert.equal(result.settings.available_deals[0].title, settings.available_deals[0].title)
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ name: 'get_partner_feedback_settings', params: { p_partner_id: partnerId } }])
})

test('missing deployment shows unavailable without pretending the reward is disabled', async () => {
  const result = await readFeedbackSettings({ rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) }, partnerId)
  assert.equal(result.available, false)
  assert.equal(result.settings, null)
})

test('authorization and malformed partner responses remain errors', async () => {
  await assert.rejects(() => readFeedbackSettings({ rpc: async () => ({ error: { code: '42501' } }) }, partnerId), /Berechtigung|geladen/)
  await assert.rejects(() => readFeedbackSettings({ rpc: async () => ({ data: { ...settings, partner_id: dealId }, error: null }) }, partnerId), /geladen/)
})

test('requires a deal when enabled and never calls the RPC with invalid input', async () => {
  let called = false
  const client = { rpc: async () => { called = true; return { data: settings, error: null } } }
  await assert.rejects(() => saveFeedbackSettings(client, { partnerId, enabled: true, dealId: '' }), /Vorteil/)
  assert.equal(called, false)
  await assert.rejects(() => saveFeedbackSettings(client, { partnerId: 'foreign', enabled: false, dealId: null }), /Betrieb/)
  assert.equal(called, false)
})

test('saving disabled state drops the selected deal and uses no elevated client', async () => {
  const calls = []
  await saveFeedbackSettings({ rpc: async (name, params) => { calls.push({ name, params }); return { data: settings, error: null } } }, { partnerId, enabled: false, dealId })
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ name: 'set_partner_feedback_reward', params: { p_partner_id: partnerId, p_enabled: false, p_deal_id: null } }])
})

test('database rejection cannot become a successful configuration save', async () => {
  await assert.rejects(() => saveFeedbackSettings({ rpc: async () => ({ data: null, error: { code: '22023' } }) }, { partnerId, enabled: true, dealId }), /gespeichert|Vorteil/)
})

test('partner card defaults off and explains reward, privacy and unbiased feedback', () => {
  const html = render(h(PartnerFeedbackSettings, { partnerId, initial: { available: true, settings } }))
  assert.match(html, /Feedback belohnen/)
  assert.match(html, /unabhängig.*Bewertung/)
  assert.match(html, /einmalig/i)
  assert.match(html, /zusammengefasst/)
  assert.match(html, /10 % beim nächsten Besuch/)
  assert.doesNotMatch(html, /checked=""/)
})

test('unavailable and empty candidates prevent enabling an unfulfillable gift', () => {
  let html = render(h(PartnerFeedbackSettings, { partnerId, initial: { available: false, settings: null } }))
  assert.match(html, /noch nicht verfügbar/i)
  assert.doesNotMatch(html, /<button[^>]*type="submit"/)
  html = render(h(PartnerFeedbackSettings, { partnerId, initial: { available: true, settings: { ...settings, available_deals: [] } } }))
  assert.match(html, /geeigneten.*Vorteil/i)
  assert.match(html, /disabled=""/)
})

function actionHarness({ session, role = 'owner', plan = 'free', fail = false, legacy = false }) {
  const calls = []
  let revalidated = false
  const client = { rpc: async (name, params) => {
    calls.push({ name, params })
    if (name === 'get_partner_entitlements') return legacy
      ? { data: null, error: { code: 'PGRST202' } }
      : { data: { schema_version: 1, partner_id: partnerId, role, plan_code: plan }, error: null }
    if (role === 'cashier' || (role === 'admin' && plan !== 'pro'))
      return { data: null, error: { code: '42501' } }
    return fail ? { data: null, error: { code: '22023' } } : { data: { ...settings, enabled: params.p_enabled, deal_id: params.p_deal_id }, error: null }
  } }
  const actions = loadTypescript('app/partner/feedback-actions.ts', {
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/partner-portal': { getPartnerPortalSession: async () => session },
    'next/cache': { revalidatePath: () => { revalidated = true } },
  })
  const form = new FormData()
  form.set('partner_id', partnerId)
  form.set('enabled', 'on')
  form.set('deal_id', dealId)
  return { calls, form, action: () => actions.updateFeedbackReward({ ok: false, message: '' }, form), revalidated: () => revalidated }
}

test('direct server-action requests deny missing and foreign partner sessions', async () => {
  for (const session of [null, { isAdmin: false, partnerIds: [dealId] }]) {
    const fixture = actionHarness({ session })
    const result = await fixture.action()
    assert.equal(result.ok, false)
    assert.equal(fixture.calls.length, 0)
    assert.equal(fixture.revalidated(), false)
  }
})

test('the authoritative reward RPC denies cashier and Free team-admin direct posts', async () => {
  for (const role of ['cashier', 'admin']) {
    const fixture = actionHarness({ session: { isAdmin: false, partnerIds: [partnerId] }, role })
    assert.equal((await fixture.action()).ok, false)
    assert.equal(fixture.calls.filter(call => call.name === 'set_partner_feedback_reward').length, 1)
    assert.equal(fixture.revalidated(), false)
  }
})

test('owner and global admin can save on the Production schema without the new entitlement API', async () => {
  for (const isAdmin of [false, true]) {
    const fixture = actionHarness({ session: { isAdmin, partnerIds: isAdmin ? [] : [partnerId] }, legacy: true })
    assert.equal((await fixture.action()).ok, true)
    assert.deepEqual(fixture.calls.map(call => call.name), ['set_partner_feedback_reward'])
  }
})

test('owner saves reward using their session RPC and receives confirmed state', async () => {
  const fixture = actionHarness({ session: { isAdmin: false, partnerIds: [partnerId] } })
  const result = await fixture.action()
  assert.equal(result.ok, true)
  assert.equal(result.settings.enabled, true)
  assert.equal(result.settings.deal_id, dealId)
  assert.equal(fixture.revalidated(), true)
  assert.equal(fixture.calls.filter(call => call.name === 'set_partner_feedback_reward').length, 1)
})

test('configuration failure returns an actionable error and no saved confirmation', async () => {
  const fixture = actionHarness({ session: { isAdmin: false, partnerIds: [partnerId] }, fail: true })
  const result = await fixture.action()
  assert.equal(result.ok, false)
  assert.match(result.message, /erneut versuchen/)
  assert.equal(fixture.revalidated(), false)
})

test('successful form action keeps the saved checkbox and deal consistent with the preview', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const { PartnerFeedbackSettings: Card } = loadTypescript('components/partner/partner-feedback-settings.tsx', {
    '@/app/partner/feedback-actions': { updateFeedbackReward: async (_previous, form) => {
      assert.equal(form.get('enabled'), 'on')
      assert.equal(form.get('deal_id'), dealId)
      return { ok: true, message: 'Feedback-Belohnung ist aktiviert.', settings: { ...settings, enabled: true, deal_id: dealId } }
    } },
  }, { FormData: dom.window.FormData })
  const root = createRoot(document.getElementById('root'))
  try {
    await act(async () => root.render(h(Card, { partnerId, initial: { available: true, settings } })))
    const checkbox = document.querySelector('[name="enabled"]')
    const select = document.querySelector('[name="deal_id"]')
    await act(async () => checkbox.click())
    await act(async () => { select.value = dealId; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    await act(async () => document.querySelector('button[type="submit"]').click())
    assert.match(document.querySelector('[role="status"]').textContent, /aktiviert/)
    assert.match(document.querySelector('aside').textContent, /10 % beim nächsten Besuch/)
    assert.equal(checkbox.checked, true, 'a completed action must not reset the controlled checkbox')
    assert.equal(select.value, dealId, 'a completed action must not reset the controlled deal selector')
  } finally {
    await act(async () => root.unmount())
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
    dom.window.close()
  }
})
