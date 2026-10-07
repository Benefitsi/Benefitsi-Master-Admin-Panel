import assert from 'node:assert/strict'
import test from 'node:test'
import {createClient} from '@supabase/supabase-js'
const partnerId='00000000-0000-4000-8000-000000000011',rowId='00000000-0000-4000-8000-000000000012'
const row={id:partnerId,name:'Bistro',updated_at:'2026-10-07T10:00:00Z'}
function database(reply){const calls=[];return {calls,client:createClient('https://example.test','public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{const url=new URL(input),body=init.body?JSON.parse(init.body):undefined;calls.push({url,method:init.method,body});return Response.json(await reply({url,body,method:init.method}))}}})}}
test('inline name update changes only the selected field and checks the original revision',async()=>{
  const {savePartnerDetail}=await import('../lib/workspace/partner-edit.ts')
  const db=database(()=>[{...row,name:'Neues Bistro',updated_at:'2026-10-07T10:01:00Z'}])
  const result=await savePartnerDetail(db.client,partnerId,{kind:'profile',row,column:'name',value:'Neues Bistro'})
  assert.equal(result.name,'Neues Bistro')
  assert.deepEqual(Object.keys(db.calls[0].body).sort(),['name','updated_at'])
  assert.equal(db.calls[0].url.searchParams.get('id'),`eq.${partnerId}`)
  assert.equal(db.calls[0].url.searchParams.get('updated_at'),'eq.2026-10-07T10:00:00Z')
  assert.ok(!db.calls[0].url.searchParams.get('select').includes('pin'))
})
test('stale or unauthorized zero-row updates cannot report success',async()=>{
  const {savePartnerDetail}=await import('../lib/workspace/partner-edit.ts')
  await assert.rejects(()=>savePartnerDetail(database(()=>[]).client,partnerId,{kind:'profile',row,column:'name',value:'Neu'}),/inzwischen|erneut|geändert/)
})
test('social edits use partner and row scope with original values, never replace the collection',async()=>{
  const {savePartnerDetail}=await import('../lib/workspace/partner-edit.ts')
  const social={id:rowId,partner_id:partnerId,platform:'instagram',url:'https://instagram.com/old',handle:'old',sort_order:0}
  const db=database(()=>[{...social,url:'https://instagram.com/new',handle:null}])
  await savePartnerDetail(db.client,partnerId,{kind:'social',row:social,column:'url',value:'https://instagram.com/new'})
  const request=db.calls[0]
  assert.equal(request.method,'PATCH')
  assert.equal(request.url.searchParams.get('partner_id'),`eq.${partnerId}`)
  assert.equal(request.url.searchParams.get('id'),`eq.${rowId}`)
  assert.equal(request.url.searchParams.get('url'),'eq.https://instagram.com/old')
  assert.deepEqual(request.body,{url:'https://instagram.com/new',handle:null})
})
test('unrelated fields, unsafe links and foreign rows are rejected before transport',async()=>{
  const {savePartnerDetail}=await import('../lib/workspace/partner-edit.ts')
  const db=database(()=>{throw new Error('No request allowed')})
  for(const input of [{kind:'profile',row,column:'owner_id',value:rowId},{kind:'profile',row,column:'website',value:'javascript:alert(1)'},{kind:'social',row:{id:rowId,partner_id:rowId},column:'url',value:'https://example.test'}])await assert.rejects(()=>savePartnerDetail(db.client,partnerId,input))
  assert.equal(db.calls.length,0)
})
test('new links insert only the specified partner row and preserve identity on a retry',async()=>{
  const {addPartnerDetail}=await import('../lib/workspace/partner-edit.ts')
  const values={platform:'instagram',url:'https://instagram.com/new',handle:null,sort_order:1}
  const saved={id:rowId,partner_id:partnerId,...values}
  const db=database(({body})=>[body])
  assert.deepEqual(await addPartnerDetail(db.client,partnerId,{kind:'social',id:rowId,values}),saved)
  assert.equal(db.calls[0].method,'POST')
  assert.deepEqual(db.calls[0].body,saved)
  const calls=[]
  const client=createClient('https://example.test','public-key',{auth:{persistSession:false},global:{fetch:async(input,init)=>{
    calls.push({url:new URL(input),method:init.method})
    return init.method==='POST'?Response.json({code:'23505',message:'duplicate key'},{status:409}):Response.json([saved])
  }}})
  assert.deepEqual(await addPartnerDetail(client,partnerId,{kind:'social',id:rowId,values}),saved)
  assert.equal(calls[1].url.searchParams.get('id'),`eq.${rowId}`)
  assert.equal(calls[1].url.searchParams.get('partner_id'),`eq.${partnerId}`)
})
test('incomplete opening times and unrecognized additions cannot reach transport',async()=>{
  const {addPartnerDetail,savePartnerDetail}=await import('../lib/workspace/partner-edit.ts')
  const db=database(()=>{throw new Error('No request allowed')})
  await assert.rejects(()=>addPartnerDetail(db.client,partnerId,{kind:'hour',id:rowId,values:{weekday:1,is_closed:false,opens_at:'09:00',closes_at:'',label:'',sort_order:0}}))
  await assert.rejects(()=>addPartnerDetail(db.client,partnerId,{kind:'social',id:rowId,values:{platform:'invalid',url:'https://example.test',sort_order:0}}))
  await assert.rejects(()=>savePartnerDetail(db.client,partnerId,{kind:'hour',row:{id:rowId,partner_id:partnerId,weekday:1,is_closed:false,opens_at:'09:00',closes_at:'17:00',label:null,sort_order:0},column:'closes_at',value:''}))
  assert.equal(db.calls.length,0)
})
test('classification saves normalize categories and enforce type/category consistency atomically',async()=>{
  const {savePartnerDetail}=await import('../lib/workspace/partner-edit.ts')
  const profile={...row,type:'Food & Drink',category:['Pizza']}
  const db=database(({body})=>[{...profile,...body}])
  const saved=await savePartnerDetail(db.client,partnerId,{kind:'profile',row:profile,column:'classification',value:{type:'Food & Drink',category:['Café','cafe']}})
  assert.deepEqual(saved.category,['Cafe'])
  assert.deepEqual(Object.keys(db.calls[0].body).sort(),['category','type','updated_at'])
  assert.equal(db.calls[0].url.searchParams.get('updated_at'),'eq.2026-10-07T10:00:00Z')
  const blocked=database(()=>{throw new Error('No request allowed')})
  for(const input of [{column:'classification',value:{type:'Wellness',category:['Pizza']}},{column:'classification',value:{type:'Food & Drink',category:[]}},{column:'type',value:'Wellness'},{column:'category',value:[]},{column:'classification',value:{type:'anything',category:['Pizza']}}])await assert.rejects(()=>savePartnerDetail(blocked.client,partnerId,{kind:'profile',row:profile,...input}))
  assert.equal(blocked.calls.length,0)
})
