import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOverviewPriorities } from '../lib/ecosystem/priorities.ts'
const checkedAt='2026-10-13T12:00:00Z'
const id='c368cb6c-aeb2-4cb1-bab8-24ecc1775723'
const source=(items=[])=>({state:'ready',items,truncated:false})
const data=(overrides={})=>({checkedAt,jobs:source(),editorial:source(),workspace:source(),...overrides})
test('concrete workspace tasks and editorial reviews retain context/action and sort actual due dates',()=>{
 const result=buildOverviewPriorities(data({editorial:source([{id,title:'Stadtgeschichte',updated_at:checkedAt}]),workspace:source([{id,title:'Partnergespräch',partner_id:id,status:'open',content:{tasks:[{id:'later',text:'Logo abstimmen',done:false,dueDate:'2026-10-20'},{id:'due',text:'Termin bestätigen',done:false,dueDate:'2026-10-12'},{id:'done',text:'Schon erledigt',done:true,dueDate:'2026-10-01'}]}}])}))
 assert.equal(result.items[0].title,'Termin bestätigen')
 assert.match(result.items[0].href,/workspace\?page=/)
 assert.equal(result.items[0].context,'Partnergespräch')
 assert.ok(result.items.some(item=>item.href===`/editorial/${id}`&&item.action==='Beitrag prüfen'))
 assert.ok(!result.items.some(item=>item.title==='Schon erledigt'))
})
test('pending automation jobs are concrete filtered links; absent data cannot claim everything is done',()=>{
 const result=buildOverviewPriorities(data({jobs:source([{id,job_type:'content_correction',status:'needs_human',priority:2,created_at:checkedAt}]),editorial:{state:'unavailable',items:[],truncated:false}}))
 assert.equal(result.items[0].href,`/automation?status=needs_human#job-${id}`)
 assert.match(result.items[0].title,/Inhaltskorrektur/)
 assert.deepEqual(result.unavailableSources,['Redaktion'])
 assert.equal(result.complete,false)
})
test('unsafe IDs, invalid dates, closed records and unrelated content never form tasks',()=>{
 const result=buildOverviewPriorities(data({jobs:source([{id:'../secret',job_type:'notification',status:'failed'}]),workspace:source([{id,title:'No task',status:'open',content:{questions:[{status:'open',prompt:'No invented action'}],tasks:[{id:'bad',text:'Real task',done:false,dueDate:'2026-02-30'}]}},{id:'unsafe/#',title:'Bad',status:'blocked',content:{tasks:[]}}])}))
 assert.equal(result.items.length,1);assert.equal(result.items[0].dueDate,null)
 assert.equal(result.items[0].title,'Real task')
})

test('native Obsidian tasks retain authored title, real due date and UUID-only note link',()=>{
 const result=buildOverviewPriorities(data({knowledge:source([{id,title:'Ansprechpartner bestätigen',state:'open',dueDate:'2026-10-12',profileId:'ben'},{id:'../bad',title:'Unsafe',state:'open'},{id,title:'Erledigt',state:'done'}])}))
 assert.equal(result.items.length,1);assert.equal(result.items[0].href,`/wissen?note=${id}`)
 assert.equal(result.items[0].rank,0);assert.equal(result.items[0].titleAuthored,true)
 assert.equal(result.items[0].context,'Ben')
 const missing=buildOverviewPriorities(data({knowledge:{state:'unavailable',items:[],truncated:false}}))
 assert.deepEqual(missing.unavailableSources,['Obsidian']);assert.equal(missing.complete,false)
})
