import assert from 'node:assert/strict'
import test from 'node:test'
import * as contract from '../lib/benefitsi-knowledge-controls.ts'
import {parseKnowledgeCreate,parseKnowledgeReceipt,parseKnowledgeTasks,executeKnowledgeOperation,knowledgeEndpoint} from '../lib/benefitsi-knowledge-controls.ts'
const request={schemaVersion:1,action:'note-create',kind:'task',title:'Partner kontaktieren',content:'Eigene unveränderte Notiz: Wissen, $& und 12,50.',profileId:'ben',dueDate:'2026-10-30',requestId:'ea4db5c0-dfd4-4106-94b4-b22c5ad608ff'}
const receipt={schemaVersion:1,sourceId:'benefitsi-obsidian',ownership:'BENEFITSI_EXTERNAL',checkedAt:'2026-10-13T10:00:00Z',path:'96 Aufgaben/2026-10-13-partner.md',title:request.title,kind:'task',sha256:'a'.repeat(64),readbackVerified:true,created:true,mirrorState:'pending'}
test('create contract preserves authored content and only accepts bounded approved metadata',()=>{
 assert.deepEqual(parseKnowledgeCreate(request),request)
 for(const changes of [{path:'/etc/passwd'},{overwrite:true},{profileId:'nova'},{kind:'journal'},{title:' '},{title:'x'.repeat(141)},{content:''},{content:'x'.repeat(12001)},{dueDate:'2026-02-30'},{requestId:'../notes'}])assert.throws(()=>parseKnowledgeCreate({...request,...changes}))
 assert.throws(()=>parseKnowledgeCreate({...request,kind:'decision'}))
})
test('dispatch requires current admin access and sends a fixed create-only protocol',async()=>{
 let called=0;const gateway=async input=>{called++;assert.deepEqual(input,request);return receipt}
 await assert.rejects(executeKnowledgeOperation('note-create',request,{isAdmin:false},gateway),/Admin/);assert.equal(called,0)
 assert.deepEqual(await executeKnowledgeOperation('note-create',request,{isAdmin:true},gateway),receipt)
 assert.equal(called,1)
 await assert.rejects(executeKnowledgeOperation('overwrite',request,{isAdmin:true},gateway));assert.equal(called,1)
})
test('only verified receipt for the matching kind/title and fixed folder can be presented as saved',()=>{
 assert.deepEqual(parseKnowledgeReceipt({...receipt,secret:'never display'},request),receipt)
 assert.equal(parseKnowledgeReceipt({...receipt,created:false},request).created,false)
 for(const changes of [{ownership:'OTHER'},{sourceId:'general'},{kind:'decision'},{title:'different'},{path:'96 Aufgaben/../secret.md'},{path:'/96 Aufgaben/note.md'},{path:'95 Agenten/Ergebnisse/note.md'},{path:'96 Aufgaben/x.exe'},{sha256:'invented'},{readbackVerified:false},{mirrorState:'ready'},{created:'true'}])assert.throws(()=>parseKnowledgeReceipt({...receipt,...changes},request))
})
test('task read projects only current open task metadata and rejects duplicate IDs/unbounded lists',()=>{
 const item={id:request.requestId,title:request.title,dueDate:null,profileId:'ben',path:receipt.path,createdAt:receipt.checkedAt,state:'open'}
 const tasks={schemaVersion:1,sourceId:receipt.sourceId,ownership:receipt.ownership,checkedAt:receipt.checkedAt,items:[item],truncated:false}
 assert.deepEqual(parseKnowledgeTasks({...tasks,secret:'drop'},),tasks)
 assert.throws(()=>parseKnowledgeTasks({...tasks,items:[item,item]}))
 assert.throws(()=>parseKnowledgeTasks({...tasks,items:[{...item,state:'closed'}]}))
 assert.throws(()=>parseKnowledgeTasks({...tasks,items:Array(201).fill(item)}))
})
test('bridge URL is fixed and does not accept credentials, tokens or remote plain HTTP',()=>{
 assert.equal(knowledgeEndpoint('https://bridge.example/a').href,'https://bridge.example/benefitsi/knowledge')
 assert.equal(knowledgeEndpoint('http://127.0.0.1:9130').pathname,'/benefitsi/knowledge')
 for(const value of ['https://user:pass@bridge.example','https://bridge.example?token=x','http://bridge.example','file:///tmp/x'])assert.throws(()=>knowledgeEndpoint(value))
})

const note={schemaVersion:1,sourceId:'benefitsi-obsidian',ownership:'BENEFITSI_EXTERNAL',checkedAt:receipt.checkedAt,id:request.requestId,path:receipt.path,title:request.title,kind:'task',profileId:'ben',createdAt:receipt.checkedAt,modifiedAt:receipt.checkedAt,sha256:'a'.repeat(64),hashVersion:'sha256-bytes-v1',byteLength:42,content:'# Eigene Notiz\n<script>window.BAD=true</script>'}
test('managed note reader accepts only one UUID selector and projects bounded fixed-folder content',async()=>{
 assert.equal(typeof contract.parseKnowledgeNoteRead,'function')
 assert.deepEqual(contract.parseKnowledgeNoteRead({id:request.requestId}),{id:request.requestId})
 for(const input of [{id:'../secret'},{id:request.requestId,path:receipt.path},{id:request.requestId,overwrite:true},{}])assert.throws(()=>contract.parseKnowledgeNoteRead(input))
 assert.deepEqual(contract.parseKnowledgeNote({...note,secret:'DROP'},request.requestId),note)
 for(const changes of [{id:'00000000-0000-4000-8000-000000000001'},{byteLength:65537},{hashVersion:'normalized'},{path:'96 Aufgaben/../secret.md'},{kind:'result'},{profileId:'other'},{content:'x'.repeat(65537)}])assert.throws(()=>contract.parseKnowledgeNote({...note,...changes},request.requestId))
 let calls=0
 const value=await executeKnowledgeOperation('note-read',{id:request.requestId},{isAdmin:true},async value=>{calls++;assert.deepEqual(value,{schemaVersion:1,action:'note-read',id:request.requestId});return note})
 assert.deepEqual(value,note);assert.equal(calls,1)
 await assert.rejects(executeKnowledgeOperation('note-read',{id:request.requestId},{isAdmin:false},async()=>{calls++;return note}));assert.equal(calls,1)
})

test('create receipt offers only a verified managed UUID for direct note links',()=>{
 const linked={...receipt,path:'96 Aufgaben/'+request.requestId+'.md'}
 assert.equal(parseKnowledgeReceipt(linked,request).id,request.requestId)
 assert.equal(parseKnowledgeReceipt({...linked,id:request.requestId},request).id,request.requestId)
 assert.throws(()=>parseKnowledgeReceipt({...linked,id:'00000000-0000-4000-8000-000000000001'},request))
 assert.equal(parseKnowledgeReceipt(receipt,request).id,undefined)
})
