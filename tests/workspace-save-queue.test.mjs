import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentSession } from '../lib/workspace/save-queue.ts'
import { makePage } from '../lib/workspace/model.ts'
const id='00000000-0000-4000-8000-000000000001'
test('an acknowledgment never overwrites typing made while the request is running',async()=>{
  const requests=[]
  const page={...makePage(id,'note'),revision:1}
  const session=new DocumentSession(page,p=>new Promise(resolve=>requests.push({p,resolve})),()=>{},60000)
  try{
    session.edit({...page,title:'First'})
    const saving=session.flush()
    session.edit({...session.snapshot().page,title:'Second'})
    requests[0].resolve({ok:true,value:{...requests[0].p,revision:2}})
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(requests[1].p.title,'Second')
    assert.equal(requests[1].p.revision,2)
    requests[1].resolve({ok:true,value:{...requests[1].p,revision:3}})
    assert.equal(await saving,true)
    assert.equal(session.snapshot().page.title,'Second')
    assert.equal(session.snapshot().state,'saved')
  }finally{session.dispose()}
})
test('failed and conflicting saves retain local text and stop automatic writes',async()=>{
  const page={...makePage(id,'note'),revision:1}
  const remote={...page,title:'Other admin',revision:2}
  const session=new DocumentSession(page,async()=>({ok:false,error:'Conflict',conflict:remote}),()=>{},60000)
  try{
    session.edit({...page,title:'Local notes'})
    assert.equal(await session.flush(),false)
    assert.equal(session.snapshot().state,'conflict')
    assert.equal(session.snapshot().page.title,'Local notes')
    assert.equal(session.snapshot().server.title,'Other admin')
    session.acceptServer()
    assert.equal(session.snapshot().page.title,'Other admin')
    assert.equal(session.snapshot().state,'saved')
  }finally{session.dispose()}
})
