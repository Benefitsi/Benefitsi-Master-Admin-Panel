import assert from 'node:assert/strict'
import test from 'node:test'
import {createElement as h} from 'react'
import {renderToStaticMarkup as render} from 'react-dom/server'
import {JSDOM} from 'jsdom'
import {billing, loadUi} from './helpers/partner-ui-fixtures.mjs'

const {PartnerPlanSummary} = loadUi('components/partner/partner-plan-panel.tsx')

for (const code of ['standard', 'founder', 'founder_annual']) {
  for (const setup of [4900, 0, undefined]) {
    test(`${code} comparison discloses only positive catalog setup fee (${setup})`, () => {
      const data = billing(true)
      const offer = {...data.catalog.offers[0], offer_code: code,
        billing_interval: code === 'founder_annual' ? 'year' : 'month'}
      if (setup === undefined) delete offer.setup_amount
      else offer.setup_amount = setup
      data.catalog.offers = [offer]
      const document = new JSDOM(render(h(PartnerPlanSummary, {data}))).window.document
      const card = [...document.querySelectorAll('article')]
        .find(element => element.querySelector('h4')?.textContent.startsWith('Pro '))
      assert.ok(card, 'published plan comparison card')
      const text = card.textContent.replace(/\s+/g, ' ')
      const currency = amount => new Intl.NumberFormat('de-DE', {
        style: 'currency', currency: offer.currency,
      }).format(amount / 100).replace(/\s+/g, ' ')
      assert.ok(text.includes(currency(offer.unit_amount)), 'recurring price remains catalog-driven')
      assert.ok(text.includes(code === 'founder_annual' ? 'Jahr im Voraus' : 'Monat'))
      if (setup > 0) assert.ok(text.includes(`${currency(setup)} Einrichtung`), text)
      else assert.doesNotMatch(text, /Einrichtung/)
    })
  }
}
