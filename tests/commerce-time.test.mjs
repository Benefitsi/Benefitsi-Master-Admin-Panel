import assert from 'node:assert/strict'
import test from 'node:test'
import { berlinDateTime } from '../lib/commerce/time.ts'
test('Berlin dates use winter and summer offset rather than host timezone',()=>{
 assert.equal(berlinDateTime('2027-01-15T12:00'),'2027-01-15T11:00:00.000Z')
 assert.equal(berlinDateTime('2027-07-15T12:00'),'2027-07-15T10:00:00.000Z')
})
test('nonexistent and ambiguous daylight saving slots are rejected',()=>{
 assert.throws(()=>berlinDateTime('2027-03-28T02:30'))
 assert.throws(()=>berlinDateTime('2027-10-31T02:30'))
 assert.throws(()=>berlinDateTime('2027-02-30T12:00'))
})
