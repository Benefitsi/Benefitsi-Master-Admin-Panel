import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'
import { loadTypescript } from './helpers/load-typescript.mjs'
const helperPath = new URL('../lib/microsite-opening-hours.ts', import.meta.url)
const helper = existsSync(helperPath) ? loadTypescript('lib/microsite-opening-hours.ts') : {}
const status = (hours, instant, holidays = []) => {
  assert.equal(typeof helper.micrositeOpeningStatus, 'function', 'shared real-time opening helper must exist')
  return helper.micrositeOpeningStatus(hours, holidays, new Date(instant))
}
const row = (weekday, opens_at, closes_at, is_closed = false) => ({ weekday, opens_at, closes_at, is_closed })
const week = (opens = '09:00', closes = '18:00') => Array.from({ length: 7 }, (_, i) => row(i + 1, opens, closes))
test('Berlin opening is inclusive and closing exclusive, independent of host timezone', () => {
  assert.equal(status(week(), '2026-10-16T06:59:59Z').state, 'closed')
  assert.equal(status(week(), '2026-10-16T07:00:00Z').state, 'open')
  assert.equal(status(week(), '2026-10-16T16:00:00Z').state, 'closed')
  assert.equal(status(week(), '2026-10-16T07:00:00Z').nextChange, '2026-10-16T16:00:00.000Z')
})
test('split shifts report the next actual opening', () => {
  const hours = [...week('09:00', '12:00'), ...week('14:00', '18:00')]
  const result = status(hours, '2026-10-16T10:00:00Z')
  assert.equal(result.state, 'closed')
  assert.equal(result.nextChange, '2026-10-16T12:00:00.000Z')
})
test('Sunday overnight reaches Monday and stops at exact closing', () => {
  assert.equal(status([row(7, '22:00', '02:00'), row(1, null, null, true)], '2026-10-18T23:59:59Z').state, 'open')
  assert.equal(status([row(7, '22:00', '02:00'), row(1, null, null, true)], '2026-10-19T00:00:00Z').state, 'closed')
})
test('continuous intervals merge and midnight-to-midnight represents full day', () => {
  const result = status(week('00:00', '00:00'), '2026-10-16T21:00:00Z')
  assert.equal(result.state, 'open')
  assert.equal(result.nextChange, null, 'do not invent a closure at the search horizon')
})
test('dated holiday replaces weekly slots and cancels previous overnight carry', () => {
  const holiday = { holiday_date: '2026-10-19', is_closed: true }
  assert.equal(status(week('22:00', '02:00'), '2026-10-18T23:00:00Z', [holiday]).state, 'closed')
  const special = { holiday_date: '2026-10-16', is_closed: false, opens_at: '13:00', closes_at: '15:00' }
  assert.equal(status(week(), '2026-10-16T08:00:00Z', [special]).state, 'closed')
  assert.equal(status(week(), '2026-10-16T11:00:00Z', [special]).state, 'open')
})
test('annual holidays recur; exact dated exception wins and multiple special intervals survive', () => {
  const holidays = [{ holiday_date: '2020-10-16', repeats_yearly: true, is_closed: true }]
  assert.equal(status(week(), '2026-10-16T08:00:00Z', holidays).state, 'closed')
  holidays.push({ holiday_date: '2026-10-16', opens_at: '09:00', closes_at: '10:00', is_closed: false }, { holiday_date: '2026-10-16', opens_at: '14:00', closes_at: '16:00', is_closed: false })
  assert.equal(status(week(), '2026-10-16T12:00:00Z', holidays).state, 'open')
})
test('missing, invalid, contradictory or label-only hours stay unknown', () => {
  for (const hours of [[], [row(5, null, null)], [row(5, 'oops', '18:00')], [row(5, '09:00', '09:00')], [row(5, '09:00', '18:00'), row(5, null, null, true)]]) {
    assert.equal(status(hours, '2026-10-16T08:00:00Z').state, 'unknown')
  }
  assert.equal(status(week(), '2026-10-16T08:00:00Z', null).state, 'unknown', 'failed holiday read must not become no exceptions')
})
test('DST spring and autumn use actual Berlin offsets for overnight intervals', () => {
  assert.equal(status(week('22:00', '04:00'), '2026-03-29T00:30:00Z').nextChange, '2026-03-29T02:00:00.000Z')
  assert.equal(status(week('22:00', '04:00'), '2026-10-25T00:30:00Z').nextChange, '2026-10-25T03:00:00.000Z')
  assert.equal(status(week('22:00', '04:00'), '2026-10-25T01:30:00Z').state, 'open')
})
test('nonexistent DST boundary is uncertain; repeated clock time uses full interval', () => {
  assert.equal(status(week('02:30', '04:00'), '2026-03-29T01:10:00Z').state, 'unknown')
  assert.equal(status(week('02:30', '03:30'), '2026-10-25T00:45:00Z').state, 'open')
  assert.equal(status(week('02:30', '03:30'), '2026-10-25T01:15:00Z').state, 'open')
})
test('a known future special opening is reported even beyond the weekly horizon', () => {
  const hours = week().map(row => ({...row, is_closed: true}))
  const special = [{ holiday_date: '2026-12-24', opens_at: '10:00', closes_at: '12:00', is_closed: false }]
  assert.equal(status(hours, '2026-10-16T08:00:00Z', special).nextChange, '2026-12-24T09:00:00.000Z')
})
test('malformed exception dates cannot silently restore the ordinary weekly schedule', () => {
  assert.equal(status(week(), '2026-10-16T08:00:00Z', [{holiday_date: null, is_closed: true}]).state, 'unknown')
})
