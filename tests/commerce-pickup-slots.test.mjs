import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
const loadedModule={exports:{}}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/commerce/pickup-slots.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loadedModule,exports:loadedModule.exports,Date})
const {readPickupSlots}=loadedModule.exports
test('pickup dashboard loads both API-capped pages with a stable tenant-bound order',async()=>{
 const reads=[]
 const admin={from:table=>{const read={table,filters:[],order:[]};reads.push(read);const query={select:()=>query,eq:(...args)=>{read.filters.push(['eq',...args]);return query},gte:(...args)=>{read.filters.push(['gte',...args]);return query},order:(...args)=>{read.order.push(args);return query},range:async(start,end)=>{read.range=[start,end];return {data:Array.from({length:1000},(_,i)=>({id:String(start+i)})),error:null}}};return query}}
 const result=await readPickupSlots(admin,'owned-provider','2026-10-01T10:00:00.000Z')
 assert.equal(result.data.length,2000)
 assert.equal(new Set(result.data.map(row=>row.id)).size,2000)
 assert.deepEqual(reads.map(read=>read.range),[[0,999],[1000,1999]])
 for(const read of reads){assert.equal(read.table,'commerce_slots');assert.deepEqual(read.filters,[['eq','provider_id','owned-provider'],['gte','ends_at','2026-10-01T10:00:00.000Z']]);assert.deepEqual(read.order.map(value=>value[0]),['starts_at','id'])}
})
test('a failed second page remains an error instead of silently claiming a complete dashboard',async()=>{
 const admin={from:()=>{const q={select:()=>q,eq:()=>q,gte:()=>q,order:()=>q,range:async start=>({data:start?null:[{id:'first'}],error:start?{message:'unavailable'}:null})};return q}}
 const result=await readPickupSlots(admin,'owned-provider')
 assert.equal(result.error.message,'unavailable')
})
