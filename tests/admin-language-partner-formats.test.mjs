import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import test from 'node:test'
import {act, createElement as h} from 'react'
import {renderToStaticMarkup as render} from 'react-dom/server'
import {loadUi, pro, billing, partnerId} from './helpers/partner-ui-fixtures.mjs'
import {loadTypescript} from './helpers/load-typescript.mjs'

const language = loadUi('app/admin-language.tsx')
const {AdminLanguageProvider, AdminLanguageControl} = language
const htmlIn = (locale, child) => render(h(AdminLanguageProvider, {initialLanguage: locale}, child))
const {formatBerlin, formatBerlinRange} = loadTypescript('lib/partners/analytics.ts')
const ui = path => loadTypescript(path, {
  '@/app/admin-language': language,
  '@/lib/partners/benefits-v1.json': JSON.parse(readFileSync(new URL('../lib/partners/benefits-v1.json', import.meta.url))),
  'next/navigation': {useRouter: () => ({refresh: () => {}})},
  '@/app/partner/plan-actions': {updatePartnerPlan: async () => {throw new Error('Unexpected plan action')}},
  '@/app/partner/crm-actions': {updatePartnerEditorial: async () => {throw new Error('Unexpected editorial action')}},
})
const {PartnerPlanSummary, PartnerPlanPanel, PartnerOnboarding} = ui('components/partner/partner-plan-panel.tsx')
const {PartnerStatistics} = ui('components/partner/partner-statistics.tsx')
const {VisitChart, ReturningRing, DistributionBar} = ui('components/partner/partner-charts.tsx')
const {PartnerBillingControls} = loadTypescript('components/partner/partner-billing-controls.tsx', {
  '@/app/admin-language': language,
  '@/app/partner/billing/actions': {partnerBillingAction: async () => {throw new Error('Unexpected billing action')}},
})
const {PartnerCrmWorkspace} = loadTypescript('components/partner/partner-crm-workspace.tsx', {
  '@/app/admin-language': language,
  '@/app/partner/crm-actions': {},
}, {crypto: {randomUUID}})

test('Berlin display helpers honor locale while preserving CSV default and exclusive range end', () => {
  const from = '2026-09-20T22:00:00Z', to = '2026-09-27T22:00:00Z'
  assert.equal(formatBerlin(from), '21.09.2026')
  assert.equal(formatBerlin(from, 'en-GB'), '21 Sept 2026')
  assert.equal(formatBerlinRange(from, to), '21.09.2026 – 27.09.2026')
  assert.equal(formatBerlinRange(from, to, 'en-GB'), '21 Sept 2026 – 27 Sept 2026')
  assert.match(formatBerlinRange(from, '2026-09-27T13:35:00Z', 'en-GB'), /27 Sept 2026, 15:35/)
})

test('plan summary, setup prices, onboarding and audit dates follow the provider locale', () => {
  const data = billing(true)
  data.catalog.offers[0].setup_amount = 123450
  data.subscription = {...data.subscription, source: 'admin_freegrant'}
  for (const [locale, date, amount] of [['en', '30 Sept 2026', '€1,234.50'], ['de', '30.09.2026', '1.234,50']]) {
    assert.ok(htmlIn(locale, h(PartnerPlanSummary, {data})).includes(amount))
    assert.ok(htmlIn(locale, h(PartnerPlanSummary, {data})).includes(date))
    assert.ok(htmlIn(locale, h(PartnerPlanPanel, {partnerId, initialData: data})).includes(date))
    assert.ok(htmlIn(locale, h(PartnerOnboarding, {partnerId, data, onSaved: () => {}})).includes(date))
  }
})

test('statistics and charts format date ranges, counts and percentages in both languages', () => {
  const data = structuredClone(pro)
  data.metrics.visits = {status: 'ok', value: 12345}
  data.metrics.returning_guest_share = {status: 'ok', value: 0.125}
  const series = {status: 'ok', buckets: [{start: '2026-09-30T00:00:00+02:00', visits: 12345}]}
  for (const [locale, date, count, percentage] of [['en', '30 Sept 2026', '12,345', '12.5%'], ['de', '30.09.2026', '12.345', '12,5']]) {
    const statistics = htmlIn(locale, h(PartnerStatistics, {data}))
    for (const expected of [date, count, percentage]) assert.ok(statistics.includes(expected), `${locale}: ${expected}`)
    const chart = htmlIn(locale, h(VisitChart, {series}))
    assert.ok(chart.includes(date)); assert.ok(chart.includes(count))
    assert.ok(htmlIn(locale, h(ReturningRing, {metric: data.metrics.returning_guest_share})).includes(percentage))
    assert.ok(htmlIn(locale, h(DistributionBar, {label: 'Synthetic label', value: 12345, max: 12345})).includes(count))
  }
})

test('CRM audience totals, reporting windows and editorial dates follow locale', () => {
  const dashboard = JSON.parse(readFileSync(new URL('./fixtures/partner-crm/dashboard-v1.json', import.meta.url)))
  dashboard.audiences.second_visit.value = 12345
  dashboard.editorial_requests[0].status = 'requested'
  dashboard.editorial_requests[0].requested_at = '2026-09-30T10:00:00Z'
  for (const [locale, date, count] of [['en', '30/09/2026', '12,345'], ['de', '30.09.2026', '12.345']]) {
    const html = htmlIn(locale, h(PartnerCrmWorkspace, {partnerId, actorId: 'actor', initial: {status: 'ready', writable: true, dashboard}, deals: {status: 'ready', deals: []}}))
    assert.ok(html.includes(date)); assert.ok(html.includes(count))
  }
})

test('billing price strings keep their numeric amount and follow locale', () => {
  const offer = {...billing(true).catalog.offers[0], unit_amount: 123450, setup_amount: 567890}
  const props = {partner: partnerId, offers: [offer], currentOffers: [], error: false, readiness: {enabled: true, terms: {version: 'v1'}}}
  const en = htmlIn('en', h(PartnerBillingControls, props)), de = htmlIn('de', h(PartnerBillingControls, props))
  assert.ok(en.includes('€1,234.50')); assert.ok(en.includes('€5,678.90'))
  assert.ok(de.includes('1.234,50')); assert.ok(de.includes('5.678,90'))
})

test('the async bookings page renders locale-aware gross totals and booking amounts', async () => {
  const {default: Page} = loadTypescript('app/partner/bookings/page.tsx', {
    '@/app/admin-language': language,
    '@/lib/bookings/provider-data': {requireProviderBookingContext: async () => ({session: {profile: {display_name: 'Author name'}, user: {}}, providers: [], bookings: [{id: 'booking', state: 'confirmed', totalAmount: 123450, quantity: 2, publicReference: 'B-123', offerTitle: 'Authored offer'}]})},
    './actions': {requestProviderCancellation: async () => {throw new Error('Unexpected booking action')}},
  })
  const page = await Page({searchParams: Promise.resolve({})})
  assert.equal((htmlIn('en', page).match(/€1,234\.50/g) ?? []).length, 2)
  assert.equal((htmlIn('de', page).match(/1\.234,50/g) ?? []).length, 2)
})

test('the live language toggle updates formatted values repeatedly without changing the data', async t => {
  const {JSDOM} = await import('jsdom')
  const dom = new JSDOM('<div id="root"></div>', {url: 'https://benefitsi.test'})
  const previous = new Map()
  for (const [key, value] of Object.entries({window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Text: dom.window.Text, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {configurable: true, writable: true, value})
  }
  const {createRoot} = await import('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
    dom.window.close()
  })
  const data = billing(true), saved = structuredClone(data)
  data.catalog.offers[0].setup_amount = 123450
  saved.catalog.offers[0].setup_amount = 123450
  const chart = {status: 'ok', buckets: [{start: '2026-09-30T00:00:00+02:00', visits: 12345}]}
  const statistics = structuredClone(pro)
  statistics.metrics.visits = {status: 'ok', value: 12345}
  const crm = JSON.parse(readFileSync(new URL('./fixtures/partner-crm/dashboard-v1.json', import.meta.url)))
  crm.audiences.second_visit.value = 12345
  await act(async () => root.render(h(AdminLanguageProvider, {initialLanguage: 'en', storageKey: 'partner-format-toggle'},
    h(AdminLanguageControl), h(PartnerPlanSummary, {data}),
    h('div', {'data-format-view': 'chart'}, h(VisitChart, {series: chart})),
    h('div', {'data-format-view': 'distribution'}, h(DistributionBar, {label: 'Synthetic', value: 12345, max: 12345})),
    h('div', {'data-format-view': 'statistics'}, h(PartnerStatistics, {data: statistics, compact: true})),
    h('div', {'data-format-view': 'crm'}, h(PartnerCrmWorkspace, {partnerId, actorId: 'actor', initial: {status: 'ready', writable: true, dashboard: crm}, deals: {status: 'ready', deals: []}})),
    h(ReturningRing, {metric: {status: 'ok', value: 0.125}}))))
  for (const [locale, date, count, amount, percentage] of [['en', '30 Sept 2026', '12,345', '€1,234.50', '12.5%'], ['de', '30.09.2026', '12.345', '1.234,50', '12,5'], ['en', '30 Sept 2026', '12,345', '€1,234.50', '12.5%']]) {
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === locale.toUpperCase()).click())
    for (const value of [date, count, amount, percentage]) assert.ok(document.body.textContent.includes(value), `${locale}: ${value}`)
    assert.equal(document.querySelector('[data-format-view="chart"] tbody td:nth-child(1)').textContent, date)
    assert.equal(document.querySelector('[data-format-view="chart"] tbody td:nth-child(2)').textContent, count)
    assert.equal(document.querySelector('[data-format-view="distribution"] dd').textContent, count)
    assert.equal(document.querySelector('[data-format-view="statistics"] article p').textContent, count)
    assert.equal(document.querySelector('[data-format-view="crm"] p.text-4xl').textContent, count)
    assert.deepEqual(data, saved)
  }
})
