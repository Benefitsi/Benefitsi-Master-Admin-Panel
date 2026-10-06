import test from 'node:test'
import assert from 'node:assert/strict'
import {readAllRows} from '../lib/workspace/pagination.ts'

test('metadata pagination reaches workspaces and favorites beyond the first server batch',async()=>{
  const rows=Array.from({length:1203},(_,i)=>({id:String(i)}))
  const ranges=[]
  const result=await readAllRows(async(from,to)=>{ranges.push([from,to]);return {data:rows.slice(from,to+1),error:null}})
  assert.equal(result.data.length,1203)
  assert.equal(result.data.at(-1).id,'1202')
  assert.deepEqual(ranges,[[0,199],[200,399],[400,599],[600,799],[800,999],[1000,1199],[1200,1399]])
})
test('metadata read errors are returned without advertising a partial index as complete',async()=>{
  const result=await readAllRows(async(from)=>from===0?{data:Array(200).fill({id:'x'}),error:null}:{data:null,error:{code:'42P01',message:'Missing table'}})
  assert.equal(result.data,null)
  assert.equal(result.error.code,'42P01')
})
