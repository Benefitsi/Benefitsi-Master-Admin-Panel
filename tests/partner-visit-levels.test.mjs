import assert from 'node:assert/strict'
import test from 'node:test'
import { getVisitLevelCategories, summarizeCategoryFrequencies, frequencyForValue, levelRanges, visitLevelsHref } from '../lib/partner-visit-levels.ts'

test('category references retain mixed configurations, aliases and unassigned values', () => {
  const partners = [
    { id: '1', name: 'A', category: ['Döner', 'Doner Kebab'], level_frequency: 'low' },
    { id: '2', name: 'B', category: ['Doner Kebab'], level_frequency: 'medium' },
    { id: '3', name: 'C', category: ['Doner Kebab'], level_frequency: null },
    { id: '4', name: 'D', category: ['Doner Kebab'], level_frequency: 'unknown' },
  ]
  const summary = summarizeCategoryFrequencies(partners, 'Doner Kebab')
  assert.deepEqual(summary.map(group => [group.frequency, group.partners.length, group.fallbackCount]), [['high', 2, 2], ['medium', 1, 0], ['low', 1, 0]])
  assert.deepEqual(summarizeCategoryFrequencies(partners, 'Zoo'), [])
  assert.equal(getVisitLevelCategories(partners).filter(c => c === 'Doner Kebab').length, 1)
  assert.ok(getVisitLevelCategories(partners).includes('Zoo'))
})

test('missing category remains visible and never acquires a made-up default', () => {
  const partners = [{ id: '1', name: 'A', category: [], level_frequency: 'low' }]
  assert.ok(getVisitLevelCategories(partners).includes(''))
  assert.equal(summarizeCategoryFrequencies(partners, '')[0].frequency, 'low')
})

test('frequency parser follows the App aliases and fallback', () => {
  for (const value of ['mittel', ' MEDIUM_FREQUENCY ', 'medium']) assert.equal(frequencyForValue(value), 'medium')
  for (const value of ['niedrig', 'low_frequency']) assert.equal(frequencyForValue(value), 'low')
  for (const value of [null, '', 'unknown']) assert.equal(frequencyForValue(value), 'high')
})

test('all three scales contain contiguous zero through diamond visit ranges', () => {
  for (const frequency of ['high', 'medium', 'low']) {
    const ranges = levelRanges(frequency)
    assert.equal(ranges.length, 14)
    assert.deepEqual([ranges[0].code, ranges[0].minimumVisits, ranges[0].maximumVisits], ['B4', 0, 0])
    assert.equal(ranges[1].minimumVisits, 1)
    assert.equal(ranges.at(-1).maximumVisits, null)
    for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i-1].maximumVisits + 1, ranges[i].minimumVisits)
  }
  assert.deepEqual(['high', 'medium', 'low'].map(f => levelRanges(f).at(-1).minimumVisits), [250, 150, 40])
})

test('category and optional frequency have stable shareable URLs', () => {
  assert.equal(visitLevelsHref('Doner Kebab'), '/partners/visit-levels?category=Doner+Kebab')
  assert.equal(new URL(visitLevelsHref('Food & Drink', 'low'), 'https://admin.benefitsi.de').searchParams.get('category'), 'Food & Drink')
  assert.equal(visitLevelsHref(''), '/partners/visit-levels?category=')
})
