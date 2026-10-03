import assert from 'node:assert/strict'
import test from 'node:test'
import {prepareDealCreate, recoverDealCreate} from '../lib/deal-save-guard.ts'

const partner = '11111111-1111-4111-8111-111111111111'
const request = '22222222-2222-4222-8222-222222222222'
const secondRequest = '33333333-3333-4333-8333-333333333333'
const payload = {partner_id: partner, type: 'happy_hour', active: true, discount_type: 'fixed', discount_value: 2,
  benefit_category: 'direct_selectable', audience: 'all', happy_hour_start: '15:00', happy_hour_end: '17:00',
  valid_weekdays: [], timezone: 'Europe/Berlin', metadata: {}, reward_item: null}
function database() {
  const rows = new Map()
  return {rows, client: {from(table) {
    assert.equal(table, 'deals')
    const filters = []
    const query = {
      select() {return query}, eq(key, value) {filters.push([key, value]); return query},
      maybeSingle() {return Promise.resolve({data: [...rows.values()].find(row => filters.every(([key,value]) => row[key] === value)) ?? null, error: null})},
      then(resolve, reject) {return Promise.resolve({data: [...rows.values()].filter(row => filters.every(([key,value]) => row[key] === value)), error: null}).then(resolve,reject)},
    }
    return query
  }}}
}
test('a repeated create request resolves the saved row instead of creating another benefit', async () => {
  const db = database()
  const first = await prepareDealCreate(db.client, payload, request, 'admin-a')
  assert.equal(first.error, undefined)
  db.rows.set(first.id, {...payload, id: first.id, metadata: first.metadata})
  const retry = await prepareDealCreate(db.client, payload, request, 'admin-a')
  assert.equal(retry.replayed, true)
  assert.equal(retry.id, request)
  assert.equal(db.rows.size, 1)
})
test('the primary-key conflict from simultaneous identical retries is recovered as one successful save', async () => {
  const db = database()
  const [first, second] = await Promise.all([prepareDealCreate(db.client, payload, request, 'admin-a'), prepareDealCreate(db.client, payload, request, 'admin-a')])
  assert.equal(first.id, second.id)
  db.rows.set(first.id, {...payload, id: first.id, metadata: first.metadata})
  const recovered = await recoverDealCreate(db.client, second.id, partner, second.fingerprint, 'admin-a')
  assert.equal(recovered, true)
  assert.equal(db.rows.size, 1)
})
test('a fresh form rejects an identical Happy Hour despite storage time/weekday aliases', async () => {
  const db = database()
  db.rows.set('old', {...payload, id: 'old', happy_hour_start: '15:00:00', happy_hour_end: '17:00:00', valid_weekdays: [7,6,5,4,3,2,1]})
  const duplicate = await prepareDealCreate(db.client, payload, secondRequest, 'admin-a')
  assert.ok(duplicate.error)
  const different = await prepareDealCreate(db.client, {...payload, discount_value: 3}, secondRequest, 'admin-a')
  assert.equal(different.error, undefined)
})
test('a create key cannot acknowledge another partner, another editor, or changed content', async () => {
  const db = database()
  const first = await prepareDealCreate(db.client, payload, request, 'admin-a')
  db.rows.set(request, {...payload, id: request, metadata: first.metadata})
  for (const [record, editor] of [[{...payload, discount_value: 9}, 'admin-a'], [payload, 'admin-b'], [{...payload, partner_id: secondRequest}, 'admin-a']]) {
    assert.ok((await prepareDealCreate(db.client, record, request, editor)).error)
  }
})
test('Happy Hour comparison ignores creation priority and consumption but retains different conditions', async () => {
  const db = database()
  db.rows.set('old', {...payload, id: 'old', trigger_key: 'visit', priority: 9, stock_remaining: 4})
  const duplicate = await prepareDealCreate(db.client, {...payload, trigger_key: 'visit_window', priority: 10, stock_remaining: 3}, secondRequest, 'admin-a')
  assert.ok(duplicate.error)
  for (const changed of [{terms: 'Only selected items'}, {metadata: {minimum_age: 18}}, {min_spend: 10}, {active: false}]) {
    assert.equal((await prepareDealCreate(db.client, {...payload, ...changed}, secondRequest, 'admin-a')).error, undefined)
  }
})
test('an original save completing between the retry lookup and HH query is acknowledged as the same request', async () => {
  const db = database()
  const original = await prepareDealCreate(db.client, payload, request, 'admin-a')
  let firstLookup = true
  const client = { from(table) {
    const query = db.client.from(table), read = query.maybeSingle
    query.maybeSingle = () => {
      const result = read()
      if (firstLookup) {
        firstLookup = false
        db.rows.set(request, { ...payload, id: request, metadata: original.metadata })
      }
      return result
    }
    return query
  } }
  const retry = await prepareDealCreate(client, payload, request, 'admin-a')
  assert.equal(retry.replayed, true)
  assert.equal(retry.error, undefined)
  assert.equal(db.rows.size, 1)
})
