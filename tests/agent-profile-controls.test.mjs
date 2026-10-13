import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'

let controls
try { controls = loadTypescript('lib/agent-profile-controls.ts') } catch { controls = {} }
const access = {isAdmin:true, financeRead:true}
const now = '2026-10-13T16:00:00Z'
const envelope = (profileId='ben') => ({schemaVersion:1,hostId:'m1-benefitsi',profileId,checkedAt:now})
const catalogue = () => ({...envelope(),current:{provider:'minimax',model:'MiniMax-M3.0'},revision:'rev-1',starter:{mode:'profile-default',appliesToNewJobs:true,limitations:[]},providers:[{id:'minimax',label:'MiniMax',authenticated:true,models:[{id:'MiniMax-M3.0',label:'MiniMax M3'}],source:'hermes'},{id:'openai-codex',label:'Codex',authenticated:true,models:[{id:'gpt-5.5',label:'GPT 5.5'}],source:'hermes'}]})

test('profile controls deny non-admin, non-Benefitsi and finance access before bridge IO', async () => {
  assert.equal(typeof controls.executeAgentProfileOperation,'function')
  let calls=0
  const bridge=async()=>{calls++;return catalogue()}
  for (const [profile,permission] of [['ben',{isAdmin:false,financeRead:true}],['studio',access],['viki',access],['benefitsi-finance',{isAdmin:true,financeRead:false}]]) {
    await assert.rejects(controls.executeAgentProfileOperation(profile,'model-options',{},permission,bridge))
  }
  assert.equal(calls,0)
})

test('context reader restricts exact profile/file combinations and verifies content bytes and hash', async () => {
  const content='# Agent\n<svg onload="secret()">\n'
  const read={...envelope(),fileId:'soul',path:'SOUL.md',modifiedAt:now,readAt:now,byteLength:Buffer.byteLength(content),sha256:createHash('sha256').update(content).digest('hex'),hashVersion:'sha256-bytes-v1',content}
  const result=await controls.executeAgentProfileOperation('ben','context-read',{fileId:'soul'},access,async request=>{
    assert.deepEqual(JSON.parse(JSON.stringify(request)),{schemaVersion:1,action:'context-read',profileId:'ben',fileId:'soul'});return read
  })
  assert.equal(result.content,content)
  assert.equal(result.path,'SOUL.md')
  for(const input of [{fileId:'../../config.yaml'},{fileId:'soul',path:'/etc/passwd'}]) await assert.rejects(controls.executeAgentProfileOperation('ben','context-read',input,access,async()=>read))
  await assert.rejects(controls.executeAgentProfileOperation('benefitsi-finance','context-read',{fileId:'short-memory'},access,async()=>read))
  for(const corrupted of [{...read,profileId:'studio'},{...read,byteLength:1},{...read,sha256:'a'.repeat(64)},{...read,content:'x'.repeat(65537),byteLength:65537}]) await assert.rejects(controls.executeAgentProfileOperation('ben','context-read',{fileId:'soul'},access,async()=>corrupted))
})

test('model options expose only validated authenticated catalogue without bridge extras', async () => {
  const result=await controls.executeAgentProfileOperation('ben','model-options',{},access,async()=>({...catalogue(),secret:'never-forward'}))
  assert.equal(result.providers.length,2)
  assert.equal(result.secret,undefined)
  for(const invalid of [{...catalogue(),providers:[{id:'x',label:'X',authenticated:false,models:[]}]},{...catalogue(),hostId:'other'}]) await assert.rejects(controls.executeAgentProfileOperation('ben','model-options',{},access,async()=>invalid))
})

test('apply validates an actual catalogue and requires confirmed matching readback', async () => {
  const input={provider:'openai-codex',model:'gpt-5.5',expectedProvider:'minimax',expectedModel:'MiniMax-M3.0',expectedRevision:'rev-1',confirmed:true}
  const calls=[]
  const bridge=async request=>{calls.push(request);return request.action==='model-options'?catalogue():{...envelope(),current:{provider:'openai-codex',model:'gpt-5.5'},revision:'rev-2',starter:catalogue().starter,effectiveFor:'new-jobs',confirmed:true,readbackVerified:true,changed:true}}
  const result=await controls.executeAgentProfileOperation('ben','model-apply',input,access,bridge)
  assert.equal(result.current.model,'gpt-5.5')
  assert.deepEqual(calls.map(item=>item.action),['model-options','model-apply'])
  for(const bad of [{...input,confirmed:false},{...input,model:'not-authenticated'},{...input,expectedModel:'outdated'},{...input,apiKey:'do-not-forward'}]) await assert.rejects(controls.executeAgentProfileOperation('ben','model-apply',bad,access,bridge))
  await assert.rejects(controls.executeAgentProfileOperation('ben','model-apply',input,access,async request=>request.action==='model-options'?catalogue():{...envelope(),current:catalogue().current,revision:'rev-2',starter:catalogue().starter,effectiveFor:'new-jobs',confirmed:true,readbackVerified:true,changed:true}))
})

test('bridge endpoint is fixed, HTTPS and credential-free', () => {
  assert.equal(controls.agentProfilesEndpoint('https://bridge.example/base?unsafe=1'),'https://bridge.example/hermes/profiles')
  for(const url of ['http://bridge.example','https://user:password@bridge.example','javascript:alert(1)']) assert.throws(()=>controls.agentProfilesEndpoint(url))
})

test('six profile knowledge entry documents are explicit narrow permissions',async()=>{
  const content='# Benefitsi\n[[95 Agenten/Übersicht]]\n'
  for(const profileId of ['ben','benefitsi-content','benefitsi-finance','benefitsi-seo','city-annweiler','benefitsi-menu']){
    const result=await controls.executeAgentProfileOperation(profileId,'context-read',{fileId:'knowledge'},access,async()=>({...envelope(profileId),fileId:'knowledge',path:'KNOWLEDGE.md',modifiedAt:now,byteLength:Buffer.byteLength(content),sha256:createHash('sha256').update(content).digest('hex'),hashVersion:'sha256-bytes-v1',content}))
    assert.equal(result.path,'KNOWLEDGE.md')
  }
})

test('model apply cannot claim effect when the current start path ignores profile configuration',async()=>{
 const input={provider:'openai-codex',model:'gpt-5.5',expectedProvider:'minimax',expectedModel:'MiniMax-M3.0',expectedRevision:'rev-1',confirmed:true}
 const actions=[]
 await assert.rejects(controls.executeAgentProfileOperation('ben','model-apply',input,access,async request=>{
   actions.push(request.action)
   return request.action==='model-options'?{...catalogue(),starter:{mode:'profile-default',appliesToNewJobs:false,limitations:[]}}:{...envelope(),current:{provider:'openai-codex',model:'gpt-5.5'},revision:'rev-2',starter:{mode:'profile-default',appliesToNewJobs:false,limitations:[]},effectiveFor:'new-jobs',confirmed:true,readbackVerified:true,changed:true}
 }),error=>error.code==='starter_not_supported')
 assert.deepEqual(actions,['model-options'])
})
