import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { webcrypto } from 'node:crypto'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { loadTypescript } from './helpers/load-typescript.mjs'
const require = createRequire(import.meta.url)
const fixture = JSON.parse(readFileSync(new URL('./fixtures/corporate/company-contract.json', import.meta.url)))
const request = { request_id: fixture.detail.company.source_request_id, company_name: 'Example Company', seats: 24, updated_at: '2026-10-04T12:27:43.572243+02:00' }
const common = () => loadTypescript('components/corporate/company-ui.tsx')
function component(file, actions = {}) {
  return loadTypescript(`components/corporate/${file}.tsx`, {
    '@/app/companies/actions': actions,
    '@/components/corporate/company-ui': common(),
  }, { crypto: webcrypto, FormData, Uint8Array })
}
async function withDom(run) {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://localhost/companies' })
  const values = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLFormElement: dom.window.HTMLFormElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = Object.fromEntries(Object.keys(values).map(k => [k, globalThis[k]])); Object.assign(globalThis, values)
  const root = require('react-dom/client').createRoot(document.getElementById('root'))
  try { await run(root, dom.window) } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close() }
}
function edit(window, element, value) {
  const prototype = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
  element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
}
test('setup previews 24 and 25 seat quotes from live catalog and disables unavailable catalog', async () => {
  const { CorporateCompanySetup: Setup } = component('company-setup')
  const unavailable = renderToStaticMarkup(React.createElement(Setup, { request, catalog: null, today: '2026-10-04', latestStart: '2027-10-04' }))
  assert.match(unavailable, /Katalog.*nicht verfügbar/); assert.doesNotMatch(unavailable, /597,60/)
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(Setup, { request, catalog: fixture.catalog, today: '2026-10-04', latestStart: '2027-10-04' })))
    assert.match(document.body.textContent, /597,60/)
    await act(async () => edit(window, document.querySelector('[name="seats"]'), '25'))
    assert.match(document.body.textContent, /497,50/)
  })
})
test('failed setup keeps changed fields and replay sends original timestamp, seats and catalog after server refresh', async () => {
  const calls = []
  const { CorporateCompanySetup: Setup } = component('company-setup', { createCorporateCompany: async data => {
    calls.push(Object.fromEntries(data)); return calls.length === 1 ? { status: 'error', message: 'Bitte unverändert erneut versuchen' } : { status: 'created', companyId: fixture.detail.company.company_id, message: 'Vorbereitet' }
  } })
  await withDom(async (root, window) => {
    const props = { request, catalog: fixture.catalog, today: '2026-10-04', latestStart: '2027-10-04' }
    await act(async () => root.render(React.createElement(Setup, props)))
    await act(async () => { edit(window, document.querySelector('[name="seats"]'), '25'); edit(window, document.querySelector('[name="startsOn"]'), '2026-11-01') })
    await act(async () => document.querySelector('form').requestSubmit())
    assert.equal(document.querySelector('[name="seats"]').value, '25')
    await act(async () => root.render(React.createElement(Setup, { ...props, request: { ...request, updated_at: '2026-10-04T12:30:00.123456Z' } })))
    await act(async () => document.querySelector('form').requestSubmit())
    assert.deepEqual(calls[1], calls[0]); assert.equal(calls[0].expectedUpdatedAt, request.updated_at)
    assert.equal(calls[0].catalogVersion, '2026-10-04.2'); assert.match(document.body.textContent, /Vorbereitet/)
  })
})
test('invitation waits for confirmation, retries same WebCrypto identity after lost response and clears for new action', async () => {
  const calls = []
  const { CorporateCompanyInvitation: Invite } = component('company-invitation', { issueCorporateInvitation: async data => {
    calls.push(Object.fromEntries(data)); if (calls.length === 1) throw new Error('response lost')
    return { status: 'issued', invitationId: data.get('invitationId'), expiresAt: '2026-10-11T18:46:05.102408+00:00', message: 'Einladung erstellt' }
  } })
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(Invite, { company: fixture.detail.company })))
    await act(async () => { edit(window, document.querySelector('[name="email"]'), ' Owner@Example.test '); edit(window, document.querySelector('[name="role"]'), 'owner') })
    await act(async () => document.querySelector('form').requestSubmit())
    assert.equal(document.querySelector('[aria-label="Einladungslink"]'), null)
    assert.match(calls[0].token, /^[0-9a-f]{64}$/); assert.match(calls[0].invitationId, /^[0-9a-f-]{36}$/)
    assert.equal(document.querySelector('[name="email"]').value, 'Owner@Example.test')
    await act(async () => document.querySelector('form').requestSubmit())
    assert.deepEqual(calls[1], calls[0])
    const link = document.querySelector('[aria-label="Einladungslink"]').value
    assert.equal(link, `https://benefitsi.de/firmen/einladung#token=${calls[0].token}`)
    assert.equal(new URL(link).search, ''); assert.doesNotMatch(document.querySelector('form').outerHTML, /name="token"/)
    await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Neue Einladung')).click())
    assert.equal(document.querySelector('[aria-label="Einladungslink"]'), null)
    await act(async () => edit(window, document.querySelector('[name="email"]'), 'next@example.test'))
    await act(async () => document.querySelector('form').requestSubmit())
    assert.notEqual(calls[2].token, calls[0].token); assert.notEqual(calls[2].invitationId, calls[0].invitationId)
  })
})
test('company edit conflict retains draft and cannot overwrite after blind retry', async () => {
  let calls = 0
  const { CorporateCompanyEditor: Editor } = component('company-detail', { updateCorporateCompany: async () => { calls++; return { status: 'conflict', message: 'Bitte neu laden' } } })
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(Editor, { company: fixture.detail.company })))
    await act(async () => { edit(window, document.querySelector('[name="status"]'), 'paused'); edit(window, document.querySelector('[name="invoiceReference"]'), 'Entwurf 43') })
    await act(async () => document.querySelector('form').requestSubmit())
    assert.equal(document.querySelector('[name="invoiceReference"]').value, 'Entwurf 43')
    assert.equal(document.querySelector('[name="status"]').value, 'paused')
    assert.equal(document.querySelector('button[type="submit"]').disabled, true); assert.equal(calls, 1)
  })
})
test('roster remove and revoke require explicit confirmation and preserve per-role microseconds', async () => {
  const calls = []
  const { CorporateRoster: Roster } = component('company-detail', {
    revokeCorporateInvitation: async data => { calls.push(Object.fromEntries(data)); return { status: 'conflict', message: 'Bitte neu laden' } },
    removeCorporateMember: async data => { calls.push(Object.fromEntries(data)); return { status: 'removed', message: 'Entfernt' } },
  })
  await withDom(async root => {
    await act(async () => root.render(React.createElement(Roster, { detail: fixture.next_page })))
    assert.ok(document.querySelector('a[href$="offset=0"]'))
    const rows = document.querySelectorAll('tbody tr')
    await act(async () => rows[0].querySelector('button').click()); assert.equal(calls.length, 0)
    await act(async () => [...rows[0].querySelectorAll('button')].find(b => b.textContent.includes('bestätigen')).click())
    assert.equal(calls[0].invitationId, fixture.next_page.roster[0].id); assert.equal(calls[0].expectedUpdatedAt, fixture.next_page.roster[0].updated_at)
    assert.equal(rows[0].querySelector('button').disabled, true)
    await act(async () => rows[2].querySelector('button').click()); assert.equal(calls.length, 1)
    await act(async () => [...rows[2].querySelectorAll('button')].find(b => b.textContent.includes('bestätigen')).click())
    assert.equal(calls[1].role, 'owner'); assert.equal(calls[1].expectedUpdatedAt, fixture.next_page.roster[2].updated_at)
  })
})
test('pending invitation suppresses duplicates; rejected issue keeps draft and never renders a secret link', async () => {
  let finish, calls = 0
  const { CorporateCompanyInvitation: Invite } = component('company-invitation', { issueCorporateInvitation: async () => { calls++; return await new Promise(resolve => { finish = resolve }) } })
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(Invite, { company: fixture.detail.company })))
    await act(async () => edit(window, document.querySelector('[name="email"]'), 'team@example.test'))
    const form = document.querySelector('form')
    await act(async () => { form.requestSubmit(); form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })) })
    assert.equal(calls, 1); assert.equal(form.querySelector('fieldset').disabled, true)
    await act(async () => finish({ status: 'full', message: 'Alle Plätze sind belegt. Bitte neu laden.' }))
    assert.equal(document.querySelector('[name="email"]').value, 'team@example.test')
    assert.equal(document.querySelector('[aria-label="Einladungslink"]'), null)
    assert.match(document.querySelector('[role="alert"]').textContent, /Plätze/)
  })
})
test('failed company edit retains changed invoice reference and next save uses returned microsecond token', async () => {
  const calls = [], advanced = '2026-10-04T19:00:00.654321+00:00'
  const { CorporateCompanyEditor: Editor } = component('company-detail', { updateCorporateCompany: async data => {
    calls.push(Object.fromEntries(data)); return calls.length === 1 ? { status: 'updated', updatedAt: advanced, message: 'Gespeichert' } : { status: 'error', message: 'Bitte erneut versuchen' }
  } })
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(Editor, { company: fixture.detail.company })))
    await act(async () => edit(window, document.querySelector('[name="invoiceReference"]'), 'Beleg Entwurf'))
    await act(async () => document.querySelector('form').requestSubmit())
    await act(async () => document.querySelector('form').requestSubmit())
    assert.equal(calls[1].expectedUpdatedAt, advanced)
    assert.equal(document.querySelector('[name="invoiceReference"]').value, 'Beleg Entwurf')
    assert.equal(document.querySelector('button[type="submit"]').disabled, false)
  })
})
test('frozen company list and roster pagination render counts without implying premium activation', () => {
  const { CorporateCompanyIndex: Index } = loadTypescript('components/corporate/company-index.tsx', { '@/components/corporate/company-ui': common() })
  const html = renderToStaticMarkup(React.createElement(Index, { result: { status: 'loaded', ...fixture.companies, total: 65 }, selectedStatus: 'proposal' }))
  for (const text of ['1.194,00', '60', '51', '8']) assert.ok(html.includes(text), text)
  assert.match(html, /companyOffset=50&amp;status=proposal/)
  assert.match(html, /Nicht freigegeben/)
  assert.match(html, /04\.10\.2027/)
})
test('a roster page made empty by removal offers previous page without an inverted count', () => {
  const { CompanyPagination } = common()
  const html = renderToStaticMarkup(React.createElement(CompanyPagination, { offset: 50, total: 50, href: offset => `/companies/id?offset=${offset}` }))
  assert.doesNotMatch(html, /51–50/)
  assert.match(html, /Seite leer/)
  assert.match(html, /offset=0/)
})
test('a source inquiry refreshed by company creation retains a failed note draft and blocks stale editing', async () => {
  const { CorporateRequestWorkspace: Workspace } = loadTypescript('components/corporate/request-workspace.tsx', {
    '@/app/companies/actions': { updateCorporateRequest: async () => ({ status: 'error', message: 'Bitte erneut versuchen' }) },
  }, { FormData })
  const row = { ...request, contact_name: 'Example Contact', email: 'contact@example.test', city: 'Annweiler', interests: [], catalog_version: null, unit_amount_cents: null, total_amount_cents: null, status: 'new', note: 'Mein Entwurf', created_at: request.updated_at }
  await withDom(async root => {
    await act(async () => root.render(React.createElement(Workspace, { result: { status: 'loaded', requests: [row] }, selectedStatus: null })))
    const editor = document.querySelector('form[aria-label$="bearbeiten"]')
    await act(async () => editor.requestSubmit())
    await act(async () => root.render(React.createElement(Workspace, { result: { status: 'loaded', requests: [{ ...row, status: 'proposal', note: '', updated_at: '2026-10-04T13:00:00.123456Z' }] }, selectedStatus: null })))
    const current = document.querySelector('form[aria-label$="bearbeiten"]')
    assert.equal(current.elements.note.value, 'Mein Entwurf')
    assert.equal(current.querySelector('button[type="submit"]').disabled, true)
    assert.match(current.textContent, /neu laden/)
  })
})
for (const filter of ['new', 'contacted', 'closed']) test(`failed note survives provisioning when the refreshed ${filter} filter omits the source`, async () => {
  let finish, noteSaves = 0, creations = 0
  const { CorporateRequestWorkspace: Workspace } = loadTypescript('components/corporate/request-workspace.tsx', {
    '@/app/companies/actions': {
      updateCorporateRequest: async () => { noteSaves++; return { status: 'error', message: 'Bitte erneut versuchen' } },
      createCorporateCompany: async () => { creations++; return await new Promise(resolve => { finish = resolve }) },
    },
  }, { FormData })
  const row = { ...request, contact_name: 'Example Contact', email: 'contact@example.test', city: 'Annweiler', interests: [], catalog_version: null, unit_amount_cents: null, total_amount_cents: null, status: filter, note: '', created_at: request.updated_at }
  await withDom(async (root, window) => {
    const props = { selectedStatus: filter, catalog: fixture.catalog, today: '2026-10-04', latestStart: '2027-10-04' }
    await act(async () => root.render(React.createElement(Workspace, { ...props, result: { status: 'loaded', requests: [row] } })))
    const editor = document.querySelector('form[aria-label$="bearbeiten"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(editor.elements.note, 'Nicht gespeicherter Rückruf')
      editor.elements.note.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    await act(async () => editor.requestSubmit())
    await act(async () => document.querySelector('form[aria-label^="Firmenkonto für"]').requestSubmit())
    assert.equal(creations, 1)
    // The action's RSC refresh arrives before its confirmed result; the source
    // has transitioned to proposal and is genuinely absent from this filter.
    await act(async () => root.render(React.createElement(Workspace, { ...props, result: { status: 'loaded', requests: [] } })))
    const retained = document.querySelector('form[aria-label$="bearbeiten"]')
    assert.ok(retained, 'automatic filter refresh must retain the failed source editor')
    assert.equal(retained.elements.note.value, 'Nicht gespeicherter Rückruf')
    assert.equal(retained.elements.expectedUpdatedAt.value, request.updated_at)
    assert.equal(retained.querySelector('button[type="submit"]').disabled, true)
    await act(async () => finish({ status: 'created', companyId: fixture.detail.company.company_id, message: 'Firmenkonto vorbereitet' }))
    assert.match(document.body.textContent, /nicht mehr.*(?:Filter|Filterliste)/i)
    assert.match(document.body.textContent, /Anfragestatus.*Angebot in Abstimmung/i)
    assert.match(document.body.textContent, /Entwurf.*neu laden|neu laden.*Entwurf/i)
    assert.ok(document.querySelector(`a[href="/companies/${fixture.detail.company.company_id}"]`))
    await act(async () => retained.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(noteSaves, 1, 'stale retained draft must not write')
    // A deliberate full reload starts a fresh workspace and drops the in-memory draft.
    await act(async () => root.render(React.createElement(Workspace, { ...props, key: 'deliberate-reload', result: { status: 'loaded', requests: [] } })))
    assert.equal(document.querySelector('form[aria-label$="bearbeiten"]'), null)
  })
})
test('filtered refresh retains only edited or failed cards and a lost setup response remains retryable', async () => {
  const calls = []
  const { CorporateRequestWorkspace: Workspace } = loadTypescript('components/corporate/request-workspace.tsx', {
    '@/app/companies/actions': { createCorporateCompany: async data => { calls.push(Object.fromEntries(data)); return calls.length === 1 ? { status: 'error', message: 'Antwort nicht bestätigt' } : { status: 'created', companyId: fixture.detail.company.company_id, message: 'Vorbereitet' } } },
  }, { FormData })
  const row = { ...request, contact_name: 'Example Contact', email: 'contact@example.test', city: 'Annweiler', interests: [], catalog_version: null, unit_amount_cents: null, total_amount_cents: null, status: 'new', note: '', created_at: request.updated_at }
  const clean = { ...row, request_id: fixture.companies.companies[1].source_request_id, company_name: 'Unbearbeitete Firma' }
  await withDom(async root => {
    const props = { selectedStatus: 'new', catalog: fixture.catalog, today: '2026-10-04', latestStart: '2027-10-04' }
    await act(async () => root.render(React.createElement(Workspace, { ...props, result: { status: 'loaded', requests: [row, clean] } })))
    await act(async () => document.querySelector('form[aria-label^="Firmenkonto für"]').requestSubmit())
    await act(async () => root.render(React.createElement(Workspace, { ...props, result: { status: 'loaded', requests: [] } })))
    assert.equal(document.querySelectorAll('article').length, 1)
    assert.doesNotMatch(document.body.textContent, /Unbearbeitete Firma/)
    const retainedSetup = document.querySelector('form[aria-label^="Firmenkonto für"]')
    assert.ok(retainedSetup); assert.equal(retainedSetup.querySelector('button[type="submit"]').disabled, false)
    assert.equal(document.querySelector('form[aria-label$="bearbeiten"]').querySelector('button[type="submit"]').disabled, true)
    await act(async () => retainedSetup.requestSubmit())
    assert.deepEqual(calls[1], calls[0])
    assert.equal(document.querySelectorAll('article').length, 0, 'confirmed setup with no unsaved inquiry draft follows the fresh filter')
    assert.equal(window.localStorage.length, 0); assert.equal(window.sessionStorage.length, 0)
  })
})

const premiumFixture = JSON.parse(readFileSync(new URL('./fixtures/corporate-premium-contract.json', import.meta.url)))
test('company summary renders the five executed premium states with invoice and retained payment evidence', () => {
  const { CorporateCompanySummary: Summary } = component('company-detail')
  for (const [key, label] of [['inactive', 'Nicht freigegeben'], ['scheduled', 'Geplant'], ['active', 'Aktiv'], ['suspended', 'Gesperrt'], ['expired', 'Abgelaufen']]) {
    const markup = renderToStaticMarkup(React.createElement(Summary, { company: premiumFixture[key] }))
    assert.match(markup, new RegExp(label), key)
    assert.match(markup, /Invoice 42/)
    if (key !== 'inactive') assert.match(markup, /PAY-EXAMPLE-42/)
  }
})
test('premium form requires reference plus payment checkbox and submits the original precise company token', async () => {
  const calls = []
  const { CorporateCompanyPremium: Premium } = component('company-premium', { setCorporatePremium: async data => { calls.push(Object.fromEntries(data)); return { status: 'error', message: 'Antwort nicht bestätigt' } } })
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(Premium, { company: premiumFixture.inactive, adminIdentity: 'admin-a' })))
    const button = () => document.querySelector('button[type="submit"]')
    assert.equal(button().disabled, true)
    await act(async () => edit(window, document.querySelector('[name="paymentReference"]'), ' PAY-42 '))
    assert.equal(button().disabled, true)
    await act(async () => document.querySelector('[name="paymentConfirmed"]').click())
    assert.equal(button().disabled, false)
    await act(async () => document.querySelector('form').requestSubmit())
    assert.deepEqual(calls[0], { companyId: premiumFixture.inactive.company_id, expectedUpdatedAt: premiumFixture.inactive.updated_at, enabled: 'true', paymentReference: ' PAY-42 ', paymentConfirmed: 'true' })
    assert.equal(document.querySelector('[name="paymentReference"]').value, ' PAY-42 ')
    assert.equal(document.querySelector('[name="paymentConfirmed"]').checked, true)
    assert.match(document.body.textContent, /497,50/); assert.match(document.body.textContent, /2027/)
    assert.match(document.querySelector('[role="alert"]').textContent, /nicht bestätigt/)
  })
})
test('premium conflict preserves draft through RSC refresh and prevents stale or repeated pending submissions', async () => {
  let finish, calls = 0
  const { CorporateCompanyPremium: Premium } = component('company-premium', { setCorporatePremium: async () => { calls++; return new Promise(resolve => { finish = resolve }) } })
  await withDom(async (root, window) => {
    const props = { company: premiumFixture.inactive, adminIdentity: 'admin-a' }
    await act(async () => root.render(React.createElement(Premium, props)))
    await act(async () => { edit(window, document.querySelector('[name="paymentReference"]'), 'PAY-42'); document.querySelector('[name="paymentConfirmed"]').click() })
    const submit = () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    await act(async () => { submit(); submit() })
    assert.equal(calls, 1); assert.equal(document.querySelector('fieldset').disabled, true)
    await act(async () => finish({ status: 'conflict', message: 'Bitte neu laden' }))
    await act(async () => root.render(React.createElement(Premium, { ...props, company: { ...premiumFixture.inactive, updated_at: premiumFixture.active.updated_at } })))
    assert.equal(document.querySelector('[name="paymentReference"]').value, 'PAY-42')
    assert.equal(document.querySelector('[name="paymentConfirmed"]').checked, true)
    assert.equal(document.querySelector('button[type="submit"]').disabled, true)
    assert.ok(document.querySelector(`a[href="/companies/${premiumFixture.inactive.company_id}"]`))
    await act(async () => submit()); assert.equal(calls, 1)
  })
})
test('premium state clears when admin or company identity changes; stale completion cannot overwrite the new form', async () => {
  let finish
  const { CorporateCompanyPremium: Premium } = component('company-premium', { setCorporatePremium: async () => new Promise(resolve => { finish = resolve }) })
  await withDom(async (root, window) => {
    const render = props => root.render(React.createElement(Premium, props))
    const props = { company: premiumFixture.inactive, adminIdentity: 'admin-a' }
    await act(async () => render(props))
    await act(async () => { edit(window, document.querySelector('[name="paymentReference"]'), 'Old private draft'); document.querySelector('[name="paymentConfirmed"]').click() })
    await act(async () => document.querySelector('form').requestSubmit())
    await act(async () => render({ ...props, adminIdentity: 'admin-b' }))
    assert.equal(document.querySelector('[name="paymentReference"]').value, '')
    await act(async () => finish({ status: 'conflict', message: 'Stale conflict' }))
    assert.doesNotMatch(document.body.textContent, /Stale conflict/)
    await act(async () => edit(window, document.querySelector('[name="paymentReference"]'), 'Another draft'))
    await act(async () => render({ ...props, adminIdentity: 'admin-b', company: { ...props.company, company_id: '4c99bd37-aeee-4c36-aee6-012b4619a521' } }))
    assert.equal(document.querySelector('[name="paymentReference"]').value, '')
    assert.equal(document.querySelector('[name="paymentConfirmed"]').checked, false)
    assert.equal(window.localStorage.length, 0); assert.equal(window.sessionStorage.length, 0)
  })
})
test('premium suspension uses a separate confirmation and a successful refresh advances the full lock', async () => {
  const calls = []
  const { CorporateCompanyPremium: Premium } = component('company-premium', { setCorporatePremium: async data => { calls.push(Object.fromEntries(data)); return { status: 'updated', updatedAt: premiumFixture.suspended.updated_at, message: 'Gesperrt' } } })
  await withDom(async (root, window) => {
    const props = { company: premiumFixture.active, adminIdentity: 'admin-a' }
    await act(async () => root.render(React.createElement(Premium, props)))
    assert.equal(document.querySelector('[name="paymentConfirmed"]'), null)
    assert.equal(document.querySelector('button[type="submit"]').disabled, true)
    await act(async () => document.querySelector('[name="suspensionConfirmed"]').click())
    await act(async () => document.querySelector('form').requestSubmit())
    assert.deepEqual(calls[0], { companyId: premiumFixture.active.company_id, expectedUpdatedAt: premiumFixture.active.updated_at, enabled: 'false', paymentReference: '', suspensionConfirmed: 'true' })
    assert.equal(document.querySelector('[name="suspensionConfirmed"]').checked, false)
    await act(async () => root.render(React.createElement(Premium, { ...props, company: { ...premiumFixture.active, updated_at: premiumFixture.suspended.updated_at, premium_enabled: false, entitlement_status: 'not_enabled' } })))
    assert.match(document.body.textContent, /Private Abos/)
    await act(async () => { edit(window, document.querySelector('[name="paymentReference"]'), 'PAY-NEW'); document.querySelector('[name="paymentConfirmed"]').click() })
    await act(async () => document.querySelector('form').requestSubmit())
    assert.equal(calls[1].expectedUpdatedAt, premiumFixture.suspended.updated_at)
  })
})


test('company index displays current five-state access instead of calling every company inactive', () => {
  const { CorporateCompanyIndex: Index } = component('company-index')
  const html = renderToStaticMarkup(React.createElement(Index, { result: { status: 'loaded', companies: Object.values(premiumFixture).filter(company => company.company_id), total: 5, offset: 0, page_size: 50 }, selectedStatus: null }))
  for (const label of ['Nicht freigegeben', 'Geplant', 'Aktiv', 'Gesperrt', 'Abgelaufen']) assert.match(html, new RegExp(label))
  assert.doesNotMatch(html, /Premium-Zugang ist noch nicht aktiviert/)
})

test('invitation issuance for an already active company confirms a link without making a payment or access claim', async () => {
  const { CorporateCompanyInvitation: Invite } = component('company-invitation', { issueCorporateInvitation: async data => ({ status: 'issued', invitationId: data.get('invitationId'), expiresAt: '2026-10-11T18:46:05.102408+00:00', message: 'Einladung erstellt' }) })
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(Invite, { company: premiumFixture.active })))
    await act(async () => { edit(window, document.querySelector('[name="email"]'), 'owner@example.test'); edit(window, document.querySelector('[name="role"]'), 'owner') })
    await act(async () => document.querySelector('form').requestSubmit())
    assert.ok(document.querySelector('[aria-label="Einladungslink"]'))
    assert.doesNotMatch(document.body.textContent, /Premium-Zugang ist noch nicht aktiviert/)
    assert.match(document.body.textContent, /Einladung.*allein.*keinen.*Premium/i)
  })
})

test('conflicting external activation retains the draft until deliberate reload adopts a fresh agreement and consent', async () => {
  const calls = []
  const { CorporateCompanyPremium: Premium } = component('company-premium', { setCorporatePremium: async data => { calls.push(Object.fromEntries(data)); return { status: 'conflict', message: 'Bitte neu laden' } } })
  await withDom(async (root, window) => {
    const props = { company: premiumFixture.inactive, adminIdentity: 'admin-a' }
    await act(async () => root.render(React.createElement(Premium, props)))
    await act(async () => { edit(window, document.querySelector('[name="paymentReference"]'), 'My payment draft'); document.querySelector('[name="paymentConfirmed"]').click() })
    await act(async () => document.querySelector('form').requestSubmit())
    await act(async () => root.render(React.createElement(Premium, { ...props, company: premiumFixture.active })))
    const reference = document.querySelector('[name="paymentReference"]')
    assert.ok(reference, 'an external release must not hide the failed activation draft')
    assert.equal(reference.value, 'My payment draft')
    assert.equal(document.querySelector('[name="paymentConfirmed"]').checked, true)
    assert.equal(document.querySelector('[name="suspensionConfirmed"]'), null)
    assert.equal(document.querySelector('button[type="submit"]').disabled, true)
    const reload = document.querySelector(`a[href="/companies/${premiumFixture.active.company_id}"]`)
    assert.ok(reload); assert.match(reload.textContent, /neu laden/)
    // The deliberate document reload replaces the mounted component; unlike an
    // automatic RSC refresh it intentionally discards the prior local draft.
    await act(async () => root.render(React.createElement(Premium, { ...props, key: 'deliberate-document-reload', company: premiumFixture.active })))
    assert.equal(document.querySelector('[name="paymentReference"]'), null)
    assert.equal(document.querySelector('[name="suspensionConfirmed"]').checked, false)
    assert.equal(document.querySelector('button[type="submit"]').disabled, true)
    await act(async () => document.querySelector('[name="suspensionConfirmed"]').click())
    await act(async () => document.querySelector('form').requestSubmit())
    assert.equal(calls.length, 2)
    assert.equal(calls[1].expectedUpdatedAt, premiumFixture.active.updated_at)
    assert.equal(calls[1].enabled, 'false'); assert.equal(calls[1].suspensionConfirmed, 'true')
    assert.equal(calls[1].paymentReference, '')
  })
})
