import test from 'node:test'
import assert from 'node:assert/strict'
import { getCollectionHealth } from '../lib/seo/collection-health.ts'
const now=new Date('2026-09-28T12:00:00Z')
const data={runtime:{enabled:true,monthly_request_limit:10,free_tier_confirmed:true,last_tick_finished_at:'2026-09-28T11:50:00Z',last_tick_error:null},used:0,scheduler:{active:true,schedule:'*/15 * * * *'},queue:{queued:0,running:0,oldestQueuedAt:null},latest:[]}
test('fresh worker heartbeats cannot hide stale daily and weekly provider observations',()=>{
 const latest=[{target_id:'a',kind:'gsc',status:'completed',last_success_at:'2026-09-26T12:00:00Z'},{target_id:'b',kind:'crawl',status:'completed',last_success_at:'2026-09-27T12:00:00Z'}]
 const issues=getCollectionHealth({...data,latest},now)
 assert.deepEqual(issues.map(i=>[i.code,i.targetId]),[['data_stale','a']])
})
test('scheduler, depleted budget and a stalled queue are separate actionable states',()=>{
 const latest=[{target_id:'a',kind:'rank',status:'completed',last_success_at:'2026-09-28T09:00:00Z'}]
 const issues=getCollectionHealth({...data,scheduler:null,used:10,queue:{queued:3,running:0,oldestQueuedAt:'2026-09-28T07:00:00Z'},latest},now)
 assert.deepEqual(issues.map(i=>i.code),['scheduler_missing','quota_exhausted','queue_backlog'])
})
test('an enabled target without measurements is explicitly missing, not zero or healthy',()=>{
 const issues=getCollectionHealth({...data,latest:[{target_id:'a',kind:'gbp',status:null,last_success_at:null}]},now)
 assert.equal(issues[0].code,'data_missing')
})
