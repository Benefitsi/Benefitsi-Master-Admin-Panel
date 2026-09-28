import assert from 'node:assert/strict'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'
function loginCode(host,session) {
 let signins=0,signouts=0
 const client={auth:{signInWithPassword:async()=>{signins++;return {error:null}},signOut:async()=>{signouts++;return {error:null}}}}
 const stubs={'next/headers':{headers:async()=>new Headers({host})},'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:url=>{throw new Error('redirect:'+url)}},'@/lib/admin':{getAdminSession:async()=>session},'@/lib/partner-portal':{getPartnerPortalSession:async()=>session},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/config':{getSupabaseConfig:()=>({isConfigured:true})}}
 const form=new FormData();form.set('email','partner@example.invalid');form.set('password','test')
 return {admin:loadTypescript('app/login/actions.ts',stubs).login,partner:loadTypescript('app/partner/login/actions.ts',stubs).partnerLogin,form,counts:()=>({signins,signouts})}
}
test('admin login rejects a valid partner password and clears only the local session',async()=>{
 const t=loginCode('admin.benefitsi.de',{isAdmin:false,partnerIds:['shop']})
 const result=await t.admin({message:''},t.form)
 assert.match(result.message,/not authorized/);assert.deepEqual(t.counts(),{signins:1,signouts:1})
})
test('neither login action can be replayed on the other canonical host',async()=>{
 const a=loginCode('partner.benefitsi.de',{isAdmin:true}),p=loginCode('admin.benefitsi.de',{isAdmin:false,partnerIds:['shop']})
 assert.match((await a.admin({message:''},a.form)).message,/unavailable/)
 assert.match((await p.partner({message:''},p.form)).message,/partner.benefitsi.de/)
 assert.equal(a.counts().signins,0);assert.equal(p.counts().signins,0)
})
test('linked partner login remains inside the partner dashboard',async()=>{
 const t=loginCode('partner.benefitsi.de',{isAdmin:false,partnerIds:['shop']})
 await assert.rejects(t.partner({message:''},t.form),/redirect:\/partner$/)
})

test('partner sign-in form submits through the partner action',()=>{
 const partnerLogin=async()=>{},adminLogin=async()=>{}
 let submittedAction
 const {PartnerLoginForm}=loadTypescript('app/partner/login/login-form.tsx',{
  react:{useActionState:action=>{submittedAction=action;return [{message:''},()=>{},false]}},
  'next/link':()=>null,
  '@/components/loading-ui':{LoadingSpinner:()=>null},
  '@/app/login/actions':{login:adminLogin},
  './actions':{partnerLogin},
 })
 PartnerLoginForm({isConfigured:true})
 assert.equal(submittedAction,partnerLogin)
})
