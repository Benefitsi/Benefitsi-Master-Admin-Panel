import assert from 'node:assert/strict'
import test from 'node:test'
import { loadVisitLevelPartners } from '../lib/partner-visit-level-data.ts'

test('all partner pages are loaded with a minimal projection', async () => {
  const pages = []
  const client = { from(table) {
    assert.equal(table, 'partners')
    return { select(columns) {
      assert.equal(columns, 'id,name,category,level_frequency')
      return { order(column) {
        assert.equal(column, 'id')
        return { async range(start, end) {
          pages.push([start, end])
          return { data: Array.from({ length: start === 0 ? 500 : 3 }, (_, i) => ({ id: `${start + i}` })), error: null }
        } }
      } }
    } }
  } }
  assert.equal((await loadVisitLevelPartners(client)).length, 503)
  assert.deepEqual(pages, [[0, 499], [500, 999]])
})

test('a failed read is never presented as an empty category configuration', async () => {
  const client = { from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: null, error: new Error('unavailable') }) }) }) }) }
  await assert.rejects(loadVisitLevelPartners(client), /unavailable/)
})
