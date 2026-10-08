import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { loadUi, billing, partnerId } from './helpers/partner-ui-fixtures.mjs'
const rich = () =>
  JSON.parse(
    readFileSync(
      new URL('./fixtures/partner-dashboard/rich-pro.json', import.meta.url),
      'utf8',
    ),
  )
const { PartnerStatistics } = loadUi(
  'components/partner/partner-statistics.tsx',
)
const { PartnerDashboard, PartnerOverview } = loadUi(
  'components/partner/partner-dashboard.tsx',
)
test('all seven topics expose rich metrics, overlapping badges and actual offer names', () => {
  const html = render(h(PartnerStatistics, { data: rich() }))
  for (const text of [
    'Gäste-Level',
    'Treue',
    'Wachstum',
    'Erster Besuch',
    'Stammgast',
    'Bronze IV',
    'Diamant',
    'Willkommenskaffee',
    'Tage zwischen Besuchen',
  ])
    assert.ok(html.includes(text), text)
  assert.doesNotMatch(html, /Vorteil 1|Legend/)
})
test('restricted and malformed peak coverage never becomes no visits or fabricated zero', () => {
  const d = rich()
  for (const w of d.breakdowns.weeks)
    w.peak_times = {
      status: 'ok',
      buckets: [
        { weekday: 1, hour: 8, status: 'suppressed', visits: 987654321 },
      ],
    }
  const html = render(h(PartnerStatistics, { data: d }))
  assert.doesNotMatch(html, /987654321/)
  assert.match(html, /Keine freigegebenen Besuchszeitwerte/)
})
test('unknown rich version hides stale values without removing legacy charts', () => {
  const d = rich()
  d.insights.definition_version = 'future'
  d.insights.sections.guest_badges.buckets[0].count = 987654321
  const html = render(h(PartnerStatistics, { data: d }))
  assert.doesNotMatch(html, /987654321/)
  assert.match(html, /Besuchsverlauf/)
  assert.match(html, /Nicht verfügbar/)
})
test('shell keeps actual management routes and one compact account plan', () => {
  const rights = billing(true).entitlements
  const html = render(
    h(PartnerDashboard, {
      partnerId,
      name: 'Shop',
      partners: [],
      rights,
      active: 'overview',
      children: h(PartnerOverview, {
        partnerId,
        name: 'Shop',
        rights,
        data: rich(),
      }),
    }),
  )
  for (const label of [
    'Start',
    'Statistik',
    'Abo',
    'Zeiten bearbeiten',
    'Angebot erstellen',
    'Gäste zurückholen',
  ])
    assert.ok(html.includes(label), label)
  assert.doesNotMatch(
    html,
    /Europe\/Berlin|Alles für deinen Betrieb an einem Ort/,
  )
})

const { PartnerBusinessLinks } = loadUi(
  'components/partner/partner-business-links.tsx',
)
test('business links retain the native menu contract and effective role/team restrictions', () => {
  const rights = billing(false).entitlements
  const html = render(
    h(PartnerBusinessLinks, { partnerId, rights, partnerType: 'restuarant' }),
  )
  assert.ok(
    html.includes(
      `/partner?section=business&amp;tab=menu&amp;partner=${partnerId}`,
    ),
  )
  assert.match(html, /tab=hours/)
  assert.match(html, /partner-media/)
  assert.match(html, /Team &amp; Zugänge/)
  const noTeam = render(
    h(PartnerBusinessLinks, {
      partnerId,
      rights: {
        ...rights,
        features: { ...rights.features, 'team.manage': false },
      },
      partnerType: 'Hotel',
    }),
  )
  assert.doesNotMatch(noTeam, /tab=menu|tab=access/)
  assert.equal(
    render(
      h(PartnerBusinessLinks, {
        partnerId,
        rights: { ...rights, role: 'scanner' },
        partnerType: 'Food & Drink',
      }),
    ),
    '',
  )
})

import { JSDOM } from 'jsdom'
import { loadTypescript } from './helpers/load-typescript.mjs'
test('changing the real period form to Heute issues a fresh canonical one-day request', async (t) => {
  const d = rich(),
    seen = []
  const client = {
    rpc: async (name, args) => {
      seen.push({ name, args })
      return {
        data: { ...d, period: { from: args.p_from, to: args.p_to } },
        error: null,
      }
    },
  }
  const { readDashboard, dashboardWindow } = loadTypescript(
    'lib/partners/analytics.ts',
  )
  const { default: Page } = loadTypescript('app/partner/statistics/page.tsx', {
    '@/components/partner/partner-statistics-toolbar': loadUi(
      'components/partner/partner-statistics-toolbar.tsx',
    ),
    '@/components/partner/partner-dashboard': {
      PartnerDashboard: ({ children }) => h('main', null, children),
    },
    '@/components/partner/partner-statistics': {
      PartnerStatistics: ({ data }) => h('p', null, data.period.from),
    },
    '@/lib/partners/page-context': {
      partnerPageContext: async (id) => ({
        partnerId: id,
        client,
        rights: billing(true).entitlements,
      }),
    },
    '@/lib/partners/analytics': { readDashboard, dashboardWindow },
  })
  const dom = new JSDOM(
    render(
      await Page({
        searchParams: Promise.resolve({
          partner: d.partner_id,
          period: 'last30',
        }),
      }),
    ),
  )
  t.after(() => dom.window.close())
  const form = dom.window.document.querySelector('form')
  form.querySelector('select[name="period"]').value = 'today'
  const next = Object.fromEntries(new dom.window.FormData(form))
  await Page({ searchParams: Promise.resolve(next) })
  assert.equal(seen.length, 2)
  assert.equal(seen[1].name, 'get_partner_dashboard')
  assert.equal(seen[1].args.p_partner_id, d.partner_id)
  assert.equal(seen[1].args.p_timezone, 'Europe/Berlin')
  const span = Date.parse(seen[1].args.p_to) - Date.parse(seen[1].args.p_from)
  assert.ok(span > 0 && span <= 25 * 60 * 60 * 1000)
  assert.notEqual(seen[0].args.p_from, seen[1].args.p_from)
})

import { act } from 'react'
import { createRoot } from 'react-dom/client'
test('existing admin override expiry is required in allowance mode and absent for clearing to tariff standard', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const keys = [
      'window',
      'document',
      'HTMLElement',
      'MutationObserver',
      'IS_REACT_ACT_ENVIRONMENT',
    ],
    previous = Object.fromEntries(keys.map((k) => [k, globalThis[k]]))
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  const root = createRoot(document.getElementById('root'))
  try {
    const { PartnerPlanPanel } = loadUi(
      'components/partner/partner-plan-panel.tsx',
    )
    await act(async () =>
      root.render(
        h(PartnerPlanPanel, { partnerId, initialData: billing(true) }),
      ),
    )
    const mode = document.querySelector('select[name="mode"]')
    assert.ok(mode)
    assert.equal(document.querySelector('input[name="valid_until"]'), null)
    mode.value = 'allow'
    await act(async () =>
      mode.dispatchEvent(new dom.window.Event('change', { bubbles: true })),
    )
    const expiry = document.querySelector('input[name="valid_until"]')
    assert.ok(expiry)
    assert.equal(expiry.type, 'date')
    assert.equal(expiry.required, true)
    mode.value = 'standard'
    await act(async () =>
      mode.dispatchEvent(new dom.window.Event('change', { bubbles: true })),
    )
    assert.equal(document.querySelector('input[name="valid_until"]'), null)
  } finally {
    await act(async () => root.unmount())
    for (const k of keys) {
      if (previous[k] === undefined) delete globalThis[k]
      else globalThis[k] = previous[k]
    }
    dom.window.close()
  }
})

const legacyOffers = () =>
  JSON.parse(
    readFileSync(
      new URL(
        './fixtures/partner-dashboard/legacy-offers.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )
test('released legacy v1 offer counts stay visible without supported additive insights and without identities', () => {
  for (const versions of [
    null,
    ['future', 'future'],
    ['partner-dashboard-insights-v1', 'future'],
    ['future', 'partner-dashboard-insights-v1'],
    ['partner-dashboard-insights-v1', undefined],
  ]) {
    const d = legacyOffers()
    if (versions)
      d.insights = {
        definition_version: versions[0],
        sections: { offers: { status: 'ok', definition_version: versions[1] } },
      }
    const html = render(h(PartnerStatistics, { data: d }))
    assert.match(html, /7654321/)
    assert.match(html, /Name nicht verfügbar/)
    assert.match(html, /21\.09\.2026/)
    assert.doesNotMatch(
      html,
      /cd919814|Vorteil 1|Keine freigegebenen Angebotswerte verfügbar/,
    )
  }
})
test('legacy offer fallback respects every ancestor and bucket restriction and malformed count', () => {
  const changes = [
    (d) => (d.definition_version = 'future'),
    (d) => (d.breakdowns.status = 'suppressed'),
    (d) => (d.breakdowns.weeks[0].status = 'locked'),
    (d) => (d.breakdowns.weeks[0].offers.status = 'unavailable'),
    (d) => (d.breakdowns.weeks[0].offers.buckets[0].status = 'suppressed'),
  ]
  for (const change of changes) {
    const d = legacyOffers()
    change(d)
    assert.doesNotMatch(
      render(h(PartnerStatistics, { data: d })),
      /7654321|cd919814/,
    )
  }
  for (const redemptions of [
    null,
    undefined,
    '7654321',
    -7654321,
    NaN,
    Infinity,
    0.5,
  ]) {
    const d = legacyOffers()
    d.breakdowns.weeks[0].offers.buckets[0].redemptions = redemptions
    assert.doesNotMatch(
      render(h(PartnerStatistics, { data: d })),
      /7654321|Infinity|NaN|Name nicht verfügbar/,
    )
  }
  const d = legacyOffers()
  d.breakdowns.weeks[0].offers.buckets[0].redemptions = 0
  const dom = new JSDOM(render(h(PartnerStatistics, { data: d })))
  try {
    const heading = [
      ...dom.window.document.querySelectorAll('#offers h3'),
    ].find((node) => node.textContent === 'Einlösungen je Angebot')
    assert.ok(heading, 'legacy offers panel is present')
    const panel = heading.parentElement
    assert.equal(panel.querySelector('dt')?.textContent, 'Name nicht verfügbar')
    assert.equal(panel.querySelector('dd')?.textContent, '0')
  } finally {
    dom.window.close()
  }
})
test('supported locked or unavailable rich offers never bypass their state through legacy rows', () => {
  for (const state of ['locked', 'suppressed', 'unavailable']) {
    const d = legacyOffers()
    d.insights = {
      definition_version: 'partner-dashboard-insights-v1',
      sections: {
        offers: {
          definition_version: 'partner-dashboard-insights-v1',
          status: state,
          reason: 'unsupported_or_missing_insights',
        },
      },
    }
    assert.doesNotMatch(render(h(PartnerStatistics, { data: d })), /7654321/)
  }
})

import {
  allOfferTypesFixture,
  offerTypeCases,
} from './helpers/offer-type-fixture.mjs'
test('all canonical offer types show meaningful labels with their distinct values in the actual table', () => {
  const dom = new JSDOM(
    render(h(PartnerStatistics, { data: allOfferTypesFixture() })),
  )
  try {
    const rows = [...dom.window.document.querySelectorAll('tr')]
    offerTypeCases.forEach(([code, label], i) => {
      if (code === 'streak') { assert.ok(!rows.some(r => r.cells[0]?.textContent?.includes(label))); return }
      assert.ok(
        rows.some(
          (r) =>
            r.cells[0]?.textContent === `${label} · Einlösungen` &&
            r.cells[1]?.textContent === String(200 + i),
        ),
        String(code),
      )
    })
    assert.doesNotMatch(
      dom.window.document.body.textContent,
      /future_offer|constructor/,
    )
  } finally {
    dom.window.close()
  }
})
test('known type names do not reveal restricted type buckets in the actual table', () => {
  for (const restricted of ['dimension', 'bucket']) {
    const d = allOfferTypesFixture(),
      types = d.insights.sections.offers.weeks[0].types
    if (restricted === 'dimension') types.status = 'suppressed'
    else types.buckets[12].status = 'suppressed'
    types.buckets[12].redemptions = 918273
    const html = render(h(PartnerStatistics, { data: d }))
    assert.doesNotMatch(html, /Premium-Prämie|918273/)
  }
})

function sectionCaption(data, headingText) {
  const dom = new JSDOM(render(h(PartnerStatistics, { data })))
  try {
    const heading = [...dom.window.document.querySelectorAll('h3')].find(
      (node) => node.textContent === headingText,
    )
    assert.ok(heading, headingText)
    return heading.nextElementSibling.textContent
  } finally {
    dom.window.close()
  }
}
test('canonical weekly offer and Premium captions distinguish historical weeks from current and recorded stock', () => {
  const d = rich()
  for (const heading of ['Angebote im Vergleich', 'Consumer-Premium']) {
    const caption = sectionCaption(d, heading)
    assert.equal(caption, 'Abgeschlossene Wochen · Stand 06.10.2026')
    assert.doesNotMatch(caption, /Bestand/)
  }
  assert.equal(
    sectionCaption(d, 'Deine Gäste nach Treuestufe'),
    'Bestand am 06.10.2026',
  )
  assert.doesNotMatch(render(h(PartnerStatistics, { data: d })), /Gespeicherte Besuchsserien|Kalenderserien/)
  assert.equal(
    sectionCaption(d, 'Besuche im Zeitraum'),
    '07.09.2026 – 06.10.2026, 17:21',
  )
})
test('scope captions validate dates and never infer stock from an unknown or selected-period scope', () => {
  for (const [scope, period, asOf, expected] of [
    [
      'selected_period',
      { from: 'not-a-date', to: '2026-10-06' },
      '2026-10-06',
      'Bezugszeitraum nicht verfügbar',
    ],
    [
      'selected_period',
      { from: '2026-10-06', to: 'not-a-date' },
      '2026-10-06',
      'Bezugszeitraum nicht verfügbar',
    ],
    [
      'selected_period',
      { from: '2026-10-07', to: '2026-10-06' },
      '2026-10-06',
      'Bezugszeitraum nicht verfügbar',
    ],
    ['future_scope', null, '2026-10-06', 'Bezugszeitraum nicht verfügbar'],
    [
      'whole_completed_iso_weeks',
      null,
      'invalid',
      'Abgeschlossene Wochen · Stand nicht verfügbar',
    ],
    [
      'current_stock',
      null,
      'invalid',
      'Aktueller Bestand · Stichtag nicht verfügbar',
    ],
    [
      'recorded_current_stock',
      null,
      'invalid',
      'Gespeicherter Bestand · Stand nicht verfügbar',
    ],
  ]) {
    const d = rich()
    Object.assign(d.insights.sections.offers, { scope, period, as_of: asOf })
    assert.equal(sectionCaption(d, 'Angebote im Vergleich'), expected)
  }
})
