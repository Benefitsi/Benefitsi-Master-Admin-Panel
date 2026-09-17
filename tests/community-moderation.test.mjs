import assert from 'node:assert/strict'
import test from 'node:test'
import { meetupApprovalBlockers, pendingNativeMeetups } from '../lib/city-pages/community-moderation.ts'
const now = new Date('2026-09-17T10:00:00Z')
const valid = {hostUserId:'743d7d74-5856-4ccd-b91a-907a8cecab90',startsAt:'2026-09-18T10:00:00Z',endsAt:null,meetingPoint:'Rathausplatz'}
test('legacy meetups need a verified host, valid future start and public meeting point', () => {
 assert.deepEqual(meetupApprovalBlockers(valid,now),[])
 assert.equal(meetupApprovalBlockers({...valid,hostUserId:null},now).length,1)
 assert.equal(meetupApprovalBlockers({...valid,startsAt:null},now).length,1)
 assert.equal(meetupApprovalBlockers({...valid,meetingPoint:' '},now).length,1)
 assert.equal(meetupApprovalBlockers({...valid,hostUserId:'anonymous'},now).length,1)
})
test('invalid end and closed or ended native meetups cannot be approved', () => {
 assert.ok(meetupApprovalBlockers({...valid,endsAt:'2026-09-16T10:00:00Z'},now).length)
 assert.ok(meetupApprovalBlockers({...valid,startsAt:'2026-09-16T10:00:00Z'},now).length)
 for(const lifecycleStatus of ['CANCELLED','COMPLETED','ENDED']) assert.ok(meetupApprovalBlockers({...valid,lifecycleStatus},now).length)
 assert.deepEqual(meetupApprovalBlockers({...valid,lifecycleStatus:'DRAFT'},now),[])
 assert.deepEqual(meetupApprovalBlockers({...valid,startsAt:'2026-09-17T08:00:00Z'},now),[])
 assert.deepEqual(meetupApprovalBlockers({...valid,startsAt:'2026-09-16T10:00:00Z',endsAt:'2026-09-18T10:00:00Z'},now),[])
})
test('pending native queue excludes approved records and submission-linked duplicates', () => {
 const rows=[{id:'a',moderationStatus:'PENDING'},{id:'b',moderationStatus:'FLAGGED'},{id:'c',moderationStatus:'APPROVED'},{id:'d',moderationStatus:'REJECTED'}]
 assert.deepEqual(pendingNativeMeetups(rows,['a']).map(row=>row.id),['b'])
 assert.deepEqual(pendingNativeMeetups(rows,[]).map(row=>row.id),['a','b'])
})

test('unknown-end approval follows the Berlin day at midnight and DST boundaries', () => {
 assert.deepEqual(meetupApprovalBlockers({...valid,startsAt:'2026-09-17T22:05:00Z'},new Date('2026-09-17T22:10:00Z')),[])
 assert.ok(meetupApprovalBlockers({...valid,startsAt:'2026-09-17T21:50:00Z'},new Date('2026-09-17T22:10:00Z')).length)
 assert.deepEqual(meetupApprovalBlockers({...valid,startsAt:'2026-10-25T00:30:00Z'},new Date('2026-10-25T01:30:00Z')),[])
 assert.ok(meetupApprovalBlockers({...valid,startsAt:'2026-10-24T21:30:00Z'},new Date('2026-10-25T01:30:00Z')).length)
})
