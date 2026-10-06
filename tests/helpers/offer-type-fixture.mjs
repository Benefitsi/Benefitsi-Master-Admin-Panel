import { readFileSync } from 'node:fs'

// SQL-emitted vocabulary, retained aliases, and unknown/malformed input.
// Literal product expectations are independent of the production label map.
export const offerTypeCases = [
  ['welcome', 'Willkommensangebot'],
  ['comeback', 'Comeback'],
  ['happy_hour', 'Happy Hour'],
  ['permanent_discount', 'Dauerrabatt'],
  ['limited_drop', 'Deal Drop'],
  ['birthday', 'Geburtstag'],
  ['free_item', 'Gratisartikel'],
  ['discount', 'Rabatt'],
  ['bonus_stamp', 'Bonusstempel'],
  ['streak', 'Besuchsserie'],
  ['challenge', 'Challenge'],
  ['2for1', '2 für 1'],
  ['premium_reward', 'Premium-Prämie'],
  ['stamp_card', 'Stempelprogramm'],
  ['unknown', 'Unbekannter Angebotstyp'],
  ['two_for_one', '2 für 1'],
  ['deal_drop', 'Deal Drop'],
  ['future_offer', 'Unbekannter Angebotstyp'],
  ['constructor', 'Unbekannter Angebotstyp'],
  [null, 'Unbekannter Angebotstyp'],
]
export function allOfferTypesFixture() {
  const data = JSON.parse(
    readFileSync(
      new URL('../fixtures/partner-dashboard/rich-pro.json', import.meta.url),
      'utf8',
    ),
  )
  const offers = data.insights.sections.offers
  const week = offers.weeks.at(-1)
  const bucket = week.types.buckets[0]
  week.buckets = []
  week.types.buckets = offerTypeCases.map(([code], i) => ({
    ...bucket,
    code,
    redemptions: 200 + i,
  }))
  offers.weeks = [week]
  return data
}
