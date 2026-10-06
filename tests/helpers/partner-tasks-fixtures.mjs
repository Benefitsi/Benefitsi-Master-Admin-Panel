import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { loadTypescript } from './load-typescript.mjs'

export const partnerId = '11111111-1111-4111-8111-111111111111'
export const otherPartnerId = '22222222-2222-4222-8222-222222222222'
export const dealId = '33333333-3333-4333-8333-333333333333'
export const taskId = '44444444-4444-4444-8444-444444444444'
export const actorId = '55555555-5555-4555-8555-555555555555'
export const participationId = '66666666-6666-4666-8666-666666666666'
export const token = 'benefitsi-task:77777777-7777-4777-8777-777777777777'
export const offer = { deal_id: dealId, title: 'Kaffee', description: 'Ein Kaffee', terms: 'Einmal persönlich einlösbar', expires_at: '2035-11-05T12:00:00Z' }
export const candidate = { id: dealId, title: 'Kaffee', description: 'Ein Kaffee', terms: 'Einmal persönlich einlösbar', expires_at: null }
export const task = { id: taskId, partner_id: partnerId, title: 'Probiertag', description: 'Teilnahme vor Ort bestätigen lassen.', kind: 'partner_confirmed', status: 'active', revision: 1, reward_deal_id: dealId, starts_at: '2035-10-06T12:00:00Z', ends_at: '2035-12-01T12:00:00Z', max_participants: 10, remaining_places: 9, reward_offer: offer, participation: null }
export const settings = { available: true, partner_id: partnerId, tasks: [task], available_deals: [candidate], reward_valid_days: 30 }
export const initial = { available: true, reason: null, actorId, canConfirm: true, settings }
export const preview = { partner_id: partnerId, participation_id: participationId, task_title: 'Probiertag', task_description: 'Teilnahme vor Ort bestätigen lassen.', reward_title: 'Kaffee', status: 'started', expires_at: '2035-10-06T12:05:00Z' }
export const summary = { confirmed: true, partner_id: partnerId, participation_id: participationId, task_title: 'Probiertag', reward_title: 'Kaffee' }
export const rights = (role = 'owner', feature = true) => ({ schema_version: 1, partner_id: partnerId, role, plan_code: feature ? 'pro' : 'free', features: { 'feedback.manage': feature } })
export function feature(path, stubs = {}, globals = {}) {
  try { return loadTypescript(path, stubs, globals) }
  catch (error) {
    if (error.code === 'ENOENT') assert.fail(`Missing real task implementation: ${path}`)
    throw error
  }
}
export function form(overrides = {}) {
  const data = new FormData()
  for (const [name, value] of Object.entries({ partner_id: partnerId, actor_id: actorId, id: taskId, revision: '1', title: ' Probiertag ', description: ' Teilnahme vor Ort bestätigen lassen. ', kind: 'partner_confirmed', status: 'active', reward_deal_id: dealId, starts_at: '2035-10-06T14:00:00+02:00', ends_at: '2035-12-01T13:00:00+01:00', max_participants: '10', ...overrides })) data.set(name, value)
  return data
}
export function actionHarness({ session = { user: { id: actorId }, isAdmin: false, partnerIds: [partnerId] }, role = 'owner', featureEnabled = true, user = { id: actorId, is_anonymous: false }, respond } = {}) {
  const calls = [], revalidated = []
  const client = { auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc: async (name, params) => {
    calls.push({ name, params })
    if (name === 'get_partner_entitlements') return { data: rights(role, featureEnabled), error: null }
    if (respond) return respond(name, params)
    if (name === 'save_partner_task') return { data: { ...task, ...params.p_task, title: params.p_task.title, description: params.p_task.description, revision: 2 }, error: null }
    if (name === 'get_partner_task_settings') return { data: settings, error: null }
    if (name === 'preview_partner_task_confirmation') return { data: preview, error: null }
    if (name === 'confirm_partner_task') return { data: summary, error: null }
    throw new Error(`Unexpected RPC ${name}`)
  } }
  const actions = feature('app/partner/task-actions.ts', {
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/partner-portal': { getPartnerPortalSession: async () => session },
    'next/cache': { revalidatePath: path => revalidated.push(path) },
  })
  return { actions, calls, revalidated, client }
}
export async function uiFixture(t, actions = {}, read = async () => initial) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true })
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
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
  const cards = feature('components/partner/partner-task-settings.tsx', {
    '@/app/partner/task-actions': { savePartnerTaskAction: async () => ({ ok: false, code: 'failed', message: 'Speichern fehlgeschlagen.' }), reloadPartnerTaskSettings: async () => ({ ok: true, initial }), previewPartnerTaskAction: async () => ({ ok: true, preview, actorId }), confirmPartnerTaskAction: async () => ({ ok: true, summary, actorId }), ...actions },
  }, { FormData: dom.window.FormData })
  const { PartnerTaskSettingsLoader: Loader } = feature('components/partner/partner-task-settings-loader.tsx', {
    '@/lib/supabase/client': { createClient: () => ({ session: 'same-user' }) },
    '@/lib/partners/tasks': { readPartnerTaskSettings: read },
    '@/components/partner/partner-task-settings': cards,
  }, { window: dom.window })
  return {
    dom,
    render: props => act(async () => root.render(h(cards.PartnerTaskSettings, { partnerId, initial, ...props }))),
    renderLoader: props => act(async () => root.render(h(Loader, { partnerId, ...props }))),
    click: text => act(async () => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text)
      assert.ok(button, `No button: ${text}`)
      button.click()
    }),
    input: (name, value) => act(async () => {
      const control = document.querySelector(`[name="${name}"]`)
      assert.ok(control, `No control: ${name}`)
      const setter = Object.getOwnPropertyDescriptor(control.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : control.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype, 'value').set
      setter.call(control, value)
      control.dispatchEvent(new dom.window.Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    }),
  }
}
