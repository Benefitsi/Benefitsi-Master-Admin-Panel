import assert from 'node:assert/strict'
import test from 'node:test'
import csv from '../lib/partners/csv.ts'
import {pro} from './helpers/partner-ui-fixtures.mjs'
test('CSV preserves server status, stock and retention/weekly scopes without invented zero',()=>{
 const data=structuredClone(pro);data.metrics.return_30d={status:'suppressed'}
 const text=csv.dashboardCsv(data)
 assert.match(text,/"Rückkehr innerhalb von 30 Tagen \(0–1\)","suppressed","",/)
 assert.match(text,/current_stock/)
 assert.match(text,/latest_completed_iso_week/)
 assert.doesNotMatch(text,/user_id|stripe_customer/)
})
