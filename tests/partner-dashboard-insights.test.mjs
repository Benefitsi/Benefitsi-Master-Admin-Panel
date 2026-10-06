import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import csv from '../lib/partners/csv.ts'
const { dashboardCsv } = csv
export const rich = (plan) =>
  JSON.parse(
    readFileSync(
      new URL(
        `./fixtures/partner-dashboard/rich-${plan}.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  )
for (const plan of ['free', 'pro'])
  test(`canonical ${plan} export matches independently produced native CSV byte for byte`, () => {
    assert.equal(
      dashboardCsv(rich(plan)),
      readFileSync(
        new URL(
          `./fixtures/partner-dashboard/native-rich-${plan}.csv`,
          import.meta.url,
        ),
        'utf8',
      ),
    )
  })
test('unknown insight versions and restricted ancestors never export stale descendant values', () => {
  for (const change of [
    (d) => (d.insights.definition_version = 'future'),
    (d) => (d.insights.sections.offers.definition_version = 'future'),
    (d) => (d.insights.sections.offers.status = 'suppressed'),
    (d) =>
      d.insights.sections.offers.weeks.forEach((w) => (w.status = 'locked')),
  ]) {
    const d = rich('pro')
    for (const w of d.insights.sections.offers.weeks)
      for (const b of w.buckets ?? []) b.redemptions = 987654321
    change(d)
    assert.doesNotMatch(dashboardCsv(d), /987654321/)
  }
  const d = rich('pro'),
    w = d.insights.sections.offers.weeks.find((w) => w.buckets?.length)
  w.buckets[0].status = 'suppressed'
  w.buckets[0].redemptions = 987654321
  assert.doesNotMatch(dashboardCsv(d), /987654321/)
})
test('CSV protects catalogue formula text but preserves typed negative comparisons', () => {
  const d = rich('pro'),
    w = d.insights.sections.offers.weeks.find((w) => w.buckets?.length)
  w.buckets[0].name = ' =HYPERLINK("bad")'
  w.buckets[0].name_status = 'ok'
  d.comparison.visits = {
    status: 'ok',
    previous: 9,
    absolute_change: -5,
    relative_change: -0.5,
  }
  const text = dashboardCsv(d)
  assert.ok(text.includes('"\' =HYPERLINK(""bad"") · Einlösungen"'))
  assert.match(text, /Besuche · Absolute Änderung","ok","-5"/)
})
test('restricted legacy weeks and malformed values do not enter export', () => {
  const d = rich('pro')
  d.breakdowns.weeks[0].status = 'suppressed'
  d.breakdowns.weeks[0].peak_times.buckets = [
    { weekday: 1, hour: 1, visits: 987654321 },
  ]
  d.metrics.visits.sample_size = '987654321'
  d.metrics.feedback = {
    status: 'ok',
    average_rating: Infinity,
    sample_size: -123,
  }
  assert.doesNotMatch(dashboardCsv(d), /987654321|Infinity|-123/)
})

test('feedback rating outside the defined one-to-five range never exports as a measured rating', () => {
  for (const value of [0, 0.9, 5.1, 6, 999, NaN, Infinity, '4']) {
    const d = rich('pro')
    d.metrics.feedback = {
      status: 'ok',
      average_rating: value,
      sample_size: 10,
    }
    const line = dashboardCsv(d)
      .split('\r\n')
      .find((l) => l.startsWith('"Feedback (Bewertung'))
    assert.match(line, /","ok","","10",/)
  }
})

test('integral averages and large signed numbers use one central numeric representation', () => {
  const d = rich('pro')
  d.metrics.feedback = { status: 'ok', average_rating: 5.0, sample_size: 10 }
  d.insights.sections.period_aggregates.metrics.mean_visit_gap_days = {
    status: 'ok',
    value: 7.0,
  }
  d.comparison.visits = {
    status: 'ok',
    previous: 1e21,
    absolute_change: -1e21,
    relative_change: -0.5,
  }
  const text = dashboardCsv(d)
  assert.match(text, /Feedback \(Bewertung 1–5\)","ok","5",/)
  assert.match(text, /Tage zwischen Besuchen","ok","7",/)
  assert.match(text, /Besuche · Vorher","ok","1000000000000000000000",/)
  assert.match(
    text,
    /Besuche · Absolute Änderung","ok","-1000000000000000000000",/,
  )
  assert.match(text, /Besuche · Relative Änderung \(0–1\)","ok","-0.5",/)
})

test('unknown group codes cannot resolve inherited JavaScript property names', () => {
  const d = rich('pro')
  d.insights.sections.guest_badges.buckets[0].code = 'constructor'
  const text = dashboardCsv(d)
  assert.match(text, /Gastabzeichen · Unbekannte Gruppe/)
  assert.doesNotMatch(text, /function Object|native code/)
})
