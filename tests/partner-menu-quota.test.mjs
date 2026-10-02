import assert from 'node:assert/strict'
import test from 'node:test'
import {existsSync} from 'node:fs'
import {loadTypescript} from './helpers/load-typescript.mjs'
test('AI provider runs only after quota reserve and successful work is consumed',async()=>{
 assert.ok(existsSync(new URL('../lib/partners/menu-quota.ts',import.meta.url)),'Missing trusted quota orchestration')
 const {runMeteredImport}=loadTypescript('lib/partners/menu-quota.ts')
 const calls=[]
 const client={rpc:async(n,a)=>{calls.push([n,a]);return {data:{reservation_id:'r',state:'reserved'},error:null}}}
 const finish=async(...a)=>{calls.push(['finish',a])}
 assert.equal(await runMeteredImport(client,'own','server-generated-id',async()=>{calls.push(['provider']);return 'draft'},finish),'draft')
 assert.deepEqual(calls.map(c=>c[0]),['reserve_partner_menu_ai_import','provider','finish'])
 assert.deepEqual(calls[2][1],['own','r',true])
})
test('quota denied, repeated consumed request, and provider failure do not leak allowance',async()=>{
 assert.ok(existsSync(new URL('../lib/partners/menu-quota.ts',import.meta.url)))
 const {runMeteredImport}=loadTypescript('lib/partners/menu-quota.ts')
 let invoked=0;const finish=[]
 const run=async()=>{invoked++;throw new Error('provider failed')}
 await assert.rejects(()=>runMeteredImport({rpc:async()=>({error:{message:'quota_exceeded'}})},'own','key',run,async()=>{}),/quota_exceeded/)
 assert.equal(invoked,0)
 await assert.rejects(()=>runMeteredImport({rpc:async()=>({data:{state:'consumed',reservation_id:'r'}})},'own','key',run,async()=>{}),/bereits/)
 await assert.rejects(()=>runMeteredImport({rpc:async()=>({data:{state:'reserved',reservation_id:'r'}})},'own','key',run,async(...args)=>finish.push(args)),/provider failed/)
 assert.deepEqual(finish,[['own','r',false]])
})
