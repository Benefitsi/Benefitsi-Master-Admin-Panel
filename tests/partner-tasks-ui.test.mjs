import assert from 'node:assert/strict'
import test from 'node:test'
import { act } from 'react'
import { uiFixture, initial, settings, task, actorId, partnerId, otherPartnerId, preview, summary, token, participationId } from './helpers/partner-tasks-fixtures.mjs'

test('rendered edit requires guest preview and sends actual revision, full form and UTC before saved confirmation', async t => {
  const calls = []
  const ui = await uiFixture(t, { savePartnerTaskAction: async (_previous, form) => {
    calls.push(Object.fromEntries(form))
    return { ok: true, actorId, task: { ...task, title: 'Verkostung vor Ort', revision: 2 }, message: 'Aufgabe gespeichert.' }
  } })
  await ui.render()
  await ui.click('Bearbeiten')
  await ui.input('title', 'Verkostung vor Ort')
  assert.equal(document.querySelector('button[type="submit"]').disabled, true)
  await ui.click('Gästevorschau prüfen')
  assert.match(document.querySelector('[aria-label="Vorschau für deine Gäste"]').textContent, /Verkostung vor Ort|Kaffee/)
  await ui.click('Aufgabe speichern')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].id, task.id)
  assert.equal(calls[0].revision, '1')
  assert.equal(calls[0].title, 'Verkostung vor Ort')
  assert.equal(calls[0].kind, 'partner_confirmed')
  assert.equal(calls[0].starts_at, '2035-10-06T12:00:00.000Z')
  assert.equal(calls[0].ends_at, '2035-12-01T12:00:00.000Z')
  assert.equal(calls[0].max_participants, '10')
  assert.match(document.body.textContent, /gespeichert/)
})

test('save error preserves input; editing after preview invalidates deliberate save', async t => {
  const ui = await uiFixture(t)
  await ui.render()
  await ui.click('Bearbeiten')
  await ui.input('title', 'Mein Entwurf')
  await ui.click('Gästevorschau prüfen')
  await ui.input('description', 'Neue Anweisung')
  assert.equal(document.querySelector('button[type="submit"]').disabled, true)
  await ui.click('Gästevorschau prüfen')
  await ui.click('Aufgabe speichern')
  assert.equal(document.querySelector('[name="title"]').value, 'Mein Entwurf')
  assert.equal(document.querySelector('[name="description"]').value, 'Neue Anweisung')
  assert.match(document.querySelector('[role="alert"]').textContent, /fehlgeschlagen/)
})

test('revision1 conflict reloads actual revision2 preserving draft, requires explicit reconciliation and fresh preview then saves revision2', async t => {
  const revisions = []
  const newer = { ...task, revision: 2, title: 'Serveränderung' }
  const ui = await uiFixture(t, {
    savePartnerTaskAction: async (_previous, form) => {
      revisions.push(form.get('revision'))
      return revisions.length === 1 ? { ok: false, code: 'revision_conflict', message: 'Die Aufgabe wurde inzwischen geändert.' } : { ok: true, actorId, task: { ...newer, title: form.get('title'), revision: 3 }, message: 'Aufgabe gespeichert.' }
    },
    reloadPartnerTaskSettings: async () => ({ ok: true, initial: { ...initial, settings: { ...settings, tasks: [newer], available_deals: [{ ...settings.available_deals[0], terms: 'Aktuelle Bedingungen vom Server' }] } } }),
  })
  await ui.render()
  await ui.click('Bearbeiten')
  await ui.input('title', 'Mein erhaltener Entwurf')
  await ui.click('Gästevorschau prüfen')
  await ui.click('Aufgabe speichern')
  await ui.click('Aktuellen Serverstand laden')
  assert.equal(document.querySelector('[name="title"]').value, 'Mein erhaltener Entwurf')
  assert.equal(document.querySelector('[name="revision"]').value, '1')
  assert.equal(document.querySelector('button[type="submit"]').disabled, true)
  assert.match(document.body.textContent, /Serveränderung/)
  await ui.click('Serverstand abgleichen, Entwurf behalten')
  assert.equal(document.querySelector('[name="revision"]').value, '2')
  assert.equal(document.querySelector('button[type="submit"]').disabled, true)
  assert.equal(document.querySelector('[aria-label="Vorschau für deine Gäste"]'), null)
  await ui.click('Gästevorschau prüfen')
  assert.match(document.querySelector('[aria-label="Vorschau für deine Gäste"]').textContent, /Aktuelle Bedingungen vom Server/)
  await ui.click('Aufgabe speichern')
  assert.deepEqual(revisions, ['1', '2'])
})

test('a rejected Server Action transport keeps typed draft and renders an actionable error', async t => {
  const ui = await uiFixture(t, { savePartnerTaskAction: async () => { throw new Error('network disconnected') } })
  await ui.render()
  await ui.click('Bearbeiten')
  await ui.input('title', 'Entwurf bei Netzfehler')
  await ui.click('Gästevorschau prüfen')
  await ui.click('Aufgabe speichern')
  assert.equal(document.querySelector('[name="title"]').value, 'Entwurf bei Netzfehler')
  assert.match(document.querySelector('[role="alert"]').textContent, /erneut/)
})

test('new task creation and ending emit deliberate previewed status changes with nullable capacity', async t => {
  const payloads = []
  const ui = await uiFixture(t, { savePartnerTaskAction: async (_previous, form) => {
    payloads.push(Object.fromEntries(form))
    return { ok: false, message: 'Testanfrage empfangen.' }
  } })
  await ui.render()
  await ui.click('Aufgabe erstellen')
  await ui.input('title', 'Neue Aufgabe')
  await ui.input('description', 'Vor Ort teilnehmen.')
  await ui.input('reward_deal_id', task.reward_deal_id)
  await ui.input('starts_at', '2035-10-06T14:00')
  await ui.input('ends_at', '2035-12-01T13:00')
  await ui.input('status', 'active')
  await ui.click('Gästevorschau prüfen')
  await ui.click('Aufgabe speichern')
  assert.equal(payloads[0].id, undefined)
  assert.equal(payloads[0].revision, undefined)
  assert.equal(payloads[0].max_participants, '')
  assert.equal(payloads[0].status, 'active')
  await ui.click('Abbrechen')
  await ui.click('Beenden')
  await ui.click('Gästevorschau prüfen')
  await ui.click('Aufgabe speichern')
  assert.equal(payloads[1].status, 'ended')
  assert.equal(payloads[1].revision, '1')
})

test('editing text preserves existing task instants with seconds and an ambiguous local DST offset', async t => {
  let sent
  const timedTask = { ...task, starts_at: '2035-10-28T02:30:17+01:00', ends_at: '2035-12-01T12:00:23Z' }
  const ui = await uiFixture(t, { savePartnerTaskAction: async (_previous, form) => { sent = Object.fromEntries(form); return { ok: false, message: 'Testanfrage empfangen.' } } })
  await ui.render({ initial: { ...initial, settings: { ...settings, tasks: [timedTask] } } })
  await ui.click('Bearbeiten')
  await ui.input('title', 'Neuer Titel, gleicher Zeitraum')
  await ui.click('Gästevorschau prüfen')
  await ui.click('Aufgabe speichern')
  assert.equal(sent.starts_at, '2035-10-28T01:30:17.000Z')
  assert.equal(sent.ends_at, '2035-12-01T12:00:23.000Z')
})

test('loader ignores late partner load, resets draft on partner switch and ignores old save success', async t => {
  const pending = new Map()
  let save
  const ui = await uiFixture(t, { savePartnerTaskAction: () => new Promise(resolve => { save = resolve }) }, (_client, id) => new Promise(resolve => pending.set(id, resolve)))
  await ui.renderLoader()
  await act(async () => pending.get(partnerId)(initial))
  await ui.click('Bearbeiten')
  await ui.input('title', 'Alter Entwurf')
  await ui.click('Gästevorschau prüfen')
  await ui.click('Aufgabe speichern')
  await ui.renderLoader({ partnerId: otherPartnerId })
  await act(async () => pending.get(otherPartnerId)({ ...initial, settings: { ...settings, partner_id: otherPartnerId, tasks: [{ ...task, partner_id: otherPartnerId, title: 'B Aufgabe' }] } }))
  await act(async () => save({ ok: true, actorId, task: { ...task, title: 'A gespeicherte Aufgabe', revision: 2 }, message: 'A gespeichert' }))
  assert.doesNotMatch(document.body.textContent, /Alter Entwurf|A gespeichert/)
  assert.match(document.body.textContent, /B Aufgabe/)
  assert.equal(document.querySelector('[name="title"]'), null)
})

test('candidate reload preserves draft but invalidates old guest preview and unavailable reward', async t => {
  let reads = 0
  const ui = await uiFixture(t, {}, async () => ++reads === 1 ? initial : { ...initial, settings: { ...settings, available_deals: [] } })
  await ui.renderLoader({ dealRevision: 'before' })
  await ui.click('Bearbeiten')
  await ui.input('title', 'Erhaltener Entwurf')
  await ui.click('Gästevorschau prüfen')
  await ui.renderLoader({ dealRevision: 'after' })
  assert.equal(reads, 2)
  assert.equal(document.querySelector('[name="title"]').value, 'Erhaltener Entwurf')
  assert.equal(document.querySelector('button[type="submit"]').disabled, true)
  assert.equal(document.querySelector('[aria-label="Vorschau für deine Gäste"]'), null)
})

test('a lost reward permits deliberate pause with the saved source and revision', async t => {
  const payloads = []
  const ui = await uiFixture(t, { savePartnerTaskAction: async (_previous, form) => {
    payloads.push(Object.fromEntries(form))
    return { ok: true, actorId, task: { ...task, status: form.get('status'), revision: 2, reward_offer: null }, message: 'Aufgabe gespeichert.' }
  } })
  await ui.render({ initial: { ...initial, settings: { ...settings, available_deals: [], tasks: [{ ...task, reward_offer: null }] } } })
  await ui.click('Pausieren')
  await ui.click('Gästevorschau prüfen')
  await ui.click('Aufgabe speichern')
  assert.equal(payloads[0].status, 'paused')
  assert.equal(payloads[0].reward_deal_id, task.reward_deal_id)
  assert.equal(payloads[0].revision, '1')
})

test('missing RPC and denied management render distinctly while promised confirmation stays reachable', async t => {
  let loaded = { ...initial, available: false, reason: 'backend_missing', settings: null }
  const ui = await uiFixture(t, {}, async () => loaded)
  await ui.renderLoader()
  assert.match(document.body.textContent, /noch nicht verfügbar/)
  assert.equal(document.querySelector('[name="title"]'), null)
  loaded = { ...initial, available: false, reason: 'access_denied', settings: null }
  await ui.renderLoader({ dealRevision: 'denied' })
  assert.match(document.body.textContent, /Verwaltungsrecht/)
  assert.ok(document.querySelector('[name="token"]'), 'promise confirmation remains reachable')
})

test('confirmation UI separates preview from deliberate grant and token change discards preview', async t => {
  let confirms = 0, previews = 0
  const ui = await uiFixture(t, {
    previewPartnerTaskAction: async () => { previews++; return { ok: true, actorId, preview } },
    confirmPartnerTaskAction: async (_previous, form) => { confirms++; assert.equal(form.get('token'), token); assert.equal(form.get('participation_id'), participationId); return { ok: true, actorId, summary, message: 'Erfüllung bestätigt.' } },
  })
  await ui.render({ confirmationOnly: true })
  await ui.input('token', token)
  await ui.click('Bestätigung prüfen')
  assert.equal(previews, 1)
  assert.equal(confirms, 0)
  assert.match(document.body.textContent, /Teilnahme vor Ort bestätigen lassen/)
  await ui.input('token', token.replace('77777777', '88888888'))
  assert.equal(document.querySelector('[data-task-confirm]'), null)
  await ui.input('token', token)
  await ui.click('Bestätigung prüfen')
  await ui.click('Erfüllung bestätigen')
  assert.equal(confirms, 1)
  assert.match(document.body.textContent, /bestätigt/)
})

test('a late confirmation preview after actor switch cannot render or enable a grant', async t => {
  let resolve
  let current = initial
  const ui = await uiFixture(t, { previewPartnerTaskAction: () => new Promise(r => { resolve = r }) }, async () => current)
  await ui.renderLoader({ confirmationOnly: true })
  await ui.input('token', token)
  await ui.click('Bestätigung prüfen')
  current = { ...initial, actorId: otherPartnerId }
  await act(async () => ui.dom.window.dispatchEvent(new ui.dom.window.Event('focus')))
  await act(async () => resolve({ ok: true, actorId, preview }))
  assert.equal(document.querySelector('[data-task-confirm]'), null)
  assert.equal(document.querySelector('[name="token"]').value, '')
})
