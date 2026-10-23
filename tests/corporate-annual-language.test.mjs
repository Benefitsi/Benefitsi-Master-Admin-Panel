import assert from 'node:assert/strict'
import test from 'node:test'
import { translateValue, isTranslationVariant } from '../app/admin-language.tsx'

test('Corporate navigation, annual actions and payment states use the current Admin DE/EN translator', () => {
 for (const [de, en] of [
  ['Unternehmen', 'Companies'], ['Jahresabrechnung', 'Annual billing'], ['Zusätzliche Mitarbeiterplätze', 'Additional employee seats'],
  ['Angefragt', 'Requested'], ['Angebot offen', 'Offer pending'], ['Angebot angenommen · Zahlung offen', 'Offer accepted · Payment pending'],
  ['Zahlung bestätigt · Plätze freigegeben', 'Payment confirmed · Seats activated'], ['Nettoangebot speichern', 'Save net quote'],
  ['Zahlung bestätigen und Plätze freigeben', 'Confirm payment and activate seats'], ['Privaten Rechnungsbeleg abrufen', 'Retrieve private invoice'],
  ['Rechnungsbeleg unveränderlich zuordnen', 'Attach immutable invoice document'], ['Vom Ansprechpartner angenommen:', 'Accepted by company owner:'],
  ['Aktuelle bezahlte Kapazität:', 'Current paid capacity:'], ['Aktuelle gebuchte Kapazität · nicht bezahlt:', 'Current booked capacity · Unpaid:'],
  ['Gebuchte Kapazität · nicht bezahlt:', 'Booked capacity · Unpaid:'], ['Gemeinsames Ende (exklusive Grenze):', 'Common end date (exclusive boundary):'],
  ['Nicht freigegeben', 'Not enabled'], ['Firma freigegeben', 'Company approved'], ['Firma unterbrochen (inkl. Firmen-Premium)', 'Company suspended (including company Premium)'],
 ]) {
  assert.equal(translateValue(de, 'en'), en)
  assert.equal(translateValue(en, 'de'), de)
  assert.equal(isTranslationVariant(en, de), true)
 }
})

test('rendered annual billing toggles through the existing provider and hydration boundary, preserving invoice data', async () => {
 const React = await import('react'), { act } = React
 const { JSDOM } = await import('jsdom')
 const { createRoot } = await import('react-dom/client')
 const language = await import('../app/admin-language.tsx')
 const { AdminTranslationBoundary } = await import('../components/admin-translation-boundary.tsx')
 const { loadTypescript } = await import('./helpers/load-typescript.mjs')
 const { readFileSync } = await import('node:fs')
 const { webcrypto } = await import('node:crypto')
 const base = JSON.parse(readFileSync(new URL('./fixtures/corporate-premium-contract.json', import.meta.url))).active
 const company = { ...base, capacity_seats: base.seats, invoice_reference: 'Wissen', invoice_document: null, annual_accepted_at: null }
 const { CorporateAnnualBilling: Billing } = loadTypescript('components/corporate/CorporateAnnualBilling.tsx', { '@/app/companies/actions': {} }, { crypto: webcrypto })
 const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
 const names = ['window', 'document', 'Element', 'Text', 'Node', 'NodeFilter', 'MutationObserver', 'IS_REACT_ACT_ENVIRONMENT']
 const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
 for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
 const root = createRoot(document.getElementById('root'))
 let changeLanguage
 function Switch() { changeLanguage = language.useAdminLanguage().setLanguage; return null }
 const settle = () => new Promise(resolve => setTimeout(resolve, 15))
 try {
  await act(async () => { root.render(React.createElement(language.AdminLanguageProvider, { initialLanguage: 'de', storageKey: 'synthetic-corporate-language' }, React.createElement(Switch), React.createElement(AdminTranslationBoundary, null, React.createElement(Billing, { billing: { status: 'ok', agreement: company, extensions: [] }, adminIdentity: 'admin' })))); await settle() })
  await act(settle)
  assert.match(document.body.textContent, /Jahresabrechnung/)
  assert.match(document.body.textContent, /05\.10\.2026 bis 04\.10\.2027/)
  for (const next of ['en', 'de', 'en']) {
   await act(async () => { changeLanguage(next); await settle() })
   assert.match(document.body.textContent, next === 'en' ? /Annual billing/ : /Jahresabrechnung/)
   assert.match(document.body.textContent, next === 'en' ? /Additional employee seats/ : /Zusätzliche Mitarbeiterplätze/)
   assert.match(document.body.textContent, next === 'en' ? /5 Oct 2026 to 4 Oct 2027/ : /05\.10\.2026 bis 04\.10\.2027/)
   if (next === 'en') assert.doesNotMatch(document.body.textContent, /2026 bis/)
   assert.match(document.body.textContent, /Wissen/)
   assert.doesNotMatch(document.body.textContent, /Knowledge/)
   assert.equal(document.querySelector('input[type="file"]').getAttribute('accept'), 'application/pdf,.pdf')
  }
 } finally {
  await act(async () => root.unmount())
  for (const name of names) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else delete globalThis[name] }
  dom.window.close()
 }
})

test('only exact valid Corporate date ranges translate and the exclusive end stays subtracted', async () => {
 const { loadTypescript } = await import('./helpers/load-typescript.mjs')
 const { period } = loadTypescript('lib/corporate/companies.ts')
 const range = period('2024-02-28', '2024-03-01')
 assert.equal(range, '28.02.2024 bis 29.02.2024')
 assert.equal(translateValue(range, 'en'), '28 Feb 2024 to 29 Feb 2024')
 assert.equal(translateValue('28 Feb 2024 to 29 Feb 2024', 'de'), range)
 assert.equal(translateValue('01.09.2026 bis 02.09.2026', 'en'), '1 Sept 2026 to 2 Sept 2026')
 assert.equal(translateValue('1 Sept 2026 to 2 Sept 2026', 'de'), '01.09.2026 bis 02.09.2026')
 for (const opaque of ['Firma bis Angebot', 'Offer to Company', '31.02.2026 bis 04.10.2027']) assert.equal(translateValue(opaque, 'en'), opaque)
})
