import assert from 'node:assert/strict'
import test from 'node:test'
import { deliverNotifications } from '../lib/commerce/delivery.ts'
test('delivery acknowledges only accepted messages and preserves lease on failures',async()=>{
 const ack=[]
 const summary=await deliverNotifications([{id:'1',lease_token:'lease1',payload:{a:1}},{id:'2',lease_token:'lease2',payload:{a:2}}],async message=>{if(message.id==='2')throw Error('private upstream response')},async(id,ok,lease,error)=>ack.push({id,ok,lease,error}))
 assert.deepEqual(summary,{sent:1,failed:1});assert.deepEqual(ack,[{id:'1',ok:true,lease:'lease1',error:null},{id:'2',ok:false,lease:'lease2',error:'delivery_failed'}])
})
test('lost acknowledgements are surfaced for retry instead of reporting success',async()=>{
 await assert.rejects(()=>deliverNotifications([{id:'1',lease_token:'lease1',payload:{}}],async()=>{},async()=>{throw Error('db unavailable')}))
})
