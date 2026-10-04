import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { loadTypescript } from './helpers/load-typescript.mjs'

const require = createRequire(import.meta.url)
const timestamp = '2026-10-04T12:27:43.572243+02:00'
const request = {
  request_id: 'c26632f0-b279-4bd6-9965-066a0b387738', company_name: 'Example Company', contact_name: 'Example Contact',
  email: 'contact@example.test', city: 'Annweiler', seats: 100, interests: ['membership', 'team_challenges'],
  catalog_version: '2026-10-04.1', unit_amount_cents: 1990, total_amount_cents: 199000,
  status: 'new', note: '', created_at: timestamp, updated_at: timestamp,
}
function editor(action) {
  return loadTypescript('components/corporate/request-editor.tsx', { '@/app/companies/actions': { updateCorporateRequest: action } }).CorporateRequestEditor
}
function workspace(result) {
  const Editor = editor(async () => ({ status: 'updated', message: 'Gespeichert', updatedAt: timestamp }))
  const Workspace = loadTypescript('components/corporate/request-workspace.tsx', {
    '@/components/corporate/request-editor': { CorporateRequestEditor: Editor },
  }).CorporateRequestWorkspace
  return renderToStaticMarkup(React.createElement(Workspace, { result, selectedStatus: null }))
}
test('the queue renders contact details, stored annual gross estimate and interests with exact save token', () => {
  const html = workspace({ status: 'loaded', requests: [request] })
  for (const text of ['Example Company', 'Example Contact', 'contact@example.test', 'Annweiler', '100', '1.990,00', '19,90', 'inklusive Umsatzsteuer', 'Team-Challenges', '2026-10-04.1']) assert.ok(html.includes(text), text)
  assert.ok(html.includes(`value="${timestamp}"`))
  assert.match(html, /keine.*Premium|keinen.*Premium/i)
})
test('no quote, no inquiries and data failure have visibly distinct presentations', () => {
  const noQuote = workspace({ status: 'loaded', requests: [{ ...request, catalog_version: null, unit_amount_cents: null, total_amount_cents: null }] })
  assert.match(noQuote, /Keine Preisorientierung/)
  assert.doesNotMatch(noQuote, /1\.990,00|0,00/)
  const empty = workspace({ status: 'loaded', requests: [] })
  assert.match(empty, /Keine Anfragen/)
  const failed = workspace({ status: 'error', message: 'Firmenanfragen konnten nicht geladen werden.' })
  assert.match(failed, /role="alert"/)
  assert.doesNotMatch(failed, /Keine Anfragen/)
})

async function withDom(run) {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://localhost/companies' })
  const values = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLFormElement: dom.window.HTMLFormElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, globalThis[key]]))
  Object.assign(globalThis, values)
  const root = require('react-dom/client').createRoot(document.getElementById('root'))
  try { await run(root, dom.window) } finally {
    await act(async () => root.unmount())
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}
test('conflict preserves a note draft, shows refresh guidance and blocks blind resubmission', async () => {
  const Editor = editor(async () => ({ status: 'conflict', message: 'Inzwischen geändert. Seite neu laden.' }))
  await withDom(async root => {
    await act(async () => root.render(React.createElement(Editor, { request: { ...request, note: 'Mein Entwurf' } })))
    const form = document.querySelector('form')
    await act(async () => form.requestSubmit())
    assert.equal(form.elements.note.value, 'Mein Entwurf')
    assert.equal(form.elements.expectedUpdatedAt.value, timestamp)
    assert.match(document.querySelector('[role="alert"]').textContent, /neu laden/)
    assert.ok(document.querySelector('a[href="/companies"]').textContent.includes('neu laden'))
    assert.equal(form.querySelector('button[type="submit"]').disabled, true)
  })
})
test('edited status and note are submitted and survive a failed save', async () => {
  let submitted
  const Editor = editor(async (_previous, data) => {
    submitted = new Map(data)
    return { status: 'error', message: 'Bitte erneut versuchen' }
  })
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(Editor, { request })))
    const form = document.querySelector('form')
    const textarea = form.elements.note
    await act(async () => {
      form.elements.status.value = 'proposal'
      form.elements.status.dispatchEvent(new window.Event('change', { bubbles: true }))
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Rückruf am Montag')
      textarea.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    await act(async () => form.requestSubmit())
    assert.equal(submitted.get('status'), 'proposal')
    assert.equal(submitted.get('note'), 'Rückruf am Montag')
    assert.equal(form.elements.status.value, 'proposal')
    assert.equal(form.elements.note.value, 'Rückruf am Montag')
    assert.equal(form.elements.expectedUpdatedAt.value, timestamp)
  })
})
test('successful save advances the full timestamp for the next edit and a later error retains that lock', async () => {
  const newTimestamp = '2026-10-04T12:29:43.572244+02:00'
  const calls = []
  const Editor = editor(async (_previous, data) => {
    calls.push(new Map(data))
    return calls.length === 1 ? { status: 'updated', message: 'Gespeichert', updatedAt: newTimestamp } : { status: 'error', message: 'Bitte erneut versuchen' }
  })
  await withDom(async root => {
    await act(async () => root.render(React.createElement(Editor, { request })))
    const form = document.querySelector('form')
    await act(async () => form.requestSubmit())
    assert.equal(form.elements.expectedUpdatedAt.value, newTimestamp)
    assert.match(document.querySelector('[role="status"]').textContent, /Gespeichert/)
    await act(async () => form.requestSubmit())
    assert.equal(calls[1].get('expectedUpdatedAt'), newTimestamp)
    assert.equal(form.elements.expectedUpdatedAt.value, newTimestamp)
    assert.equal(form.querySelector('button[type="submit"]').disabled, false)
  })
})
test('pending saves suppress duplicate form submissions and disable editing', async () => {
  let finish, calls = 0
  const Editor = editor(async () => { calls++; return await new Promise(resolve => { finish = resolve }) })
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(Editor, { request })))
    const form = document.querySelector('form')
    await act(async () => { form.requestSubmit(); form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })) })
    assert.equal(calls, 1)
    assert.equal(form.querySelector('fieldset').disabled, true)
    assert.equal(form.querySelector('button[type="submit"]').disabled, true)
    await act(async () => finish({ status: 'error', message: 'Erneut versuchen' }))
  })
})
