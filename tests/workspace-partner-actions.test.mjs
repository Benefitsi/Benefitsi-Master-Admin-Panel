import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTypescript} from './helpers/load-typescript.mjs'
const id='00000000-0000-4000-8000-000000000011'
function actions(allowed){const calls=[];const record=name=>(...args)=>{calls.push([name,...args]);return {id,updated_at:'2026-10-07T10:00:00Z'}};const handlers=loadTypescript('app/workspace/partner-edit-actions.ts',{
  '@/lib/admin':{requireAdmin:async()=>{calls.push(['auth']);if(!allowed)throw new Error('admin required');return {supabase:{marker:'authenticated-admin'}}}},
  '@/lib/workspace/partner-edit':{readPartnerDetails:record('read'),savePartnerDetail:record('save'),addPartnerDetail:record('add')},
  '@/lib/public-web-revalidation':{invalidatePublicPartner:record('public-refresh')},
  'next/cache':{revalidatePath:record('path')}
});return {handlers,calls}}
for(const method of ['loadWorkspacePartnerDetails','saveWorkspacePartnerDetail','addWorkspacePartnerDetail'])test(`${method} authorizes before any database access`,async()=>{
  const denied=actions(false);await assert.rejects(()=>denied.handlers[method](id,{}),/admin required/);assert.deepEqual(denied.calls,[['auth']])
  const allowed=actions(true),result=await allowed.handlers[method](id,{})
  assert.equal(result.ok,true);assert.equal(allowed.calls[0][0],'auth');assert.deepEqual(allowed.calls[1][1],{marker:'authenticated-admin'});assert.equal(allowed.calls[1][2],id)
  if(method!=='loadWorkspacePartnerDetails')assert.ok(allowed.calls.some(call=>call[0]==='public-refresh'&&call[2]===id))
})
