// Execute the real Admin Server Action, replacing only auth/cache/RPC transport.
import assert from 'node:assert/strict'
import {loadTypescript} from './load-typescript.mjs'
const calls=[]
const action=loadTypescript('app/partner/plan-actions.ts',{
 '@/lib/admin':{requireAdmin:async()=>({supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:'captured-draft',error:null}}}})},
 '@/lib/stripe/partner-billing':{},'next/cache':{revalidatePath(){}},
})
const result={}
for(const [name,plan,quota,enabled] of [['finite','pro','2',true],['unlimited','pro','',false],['free_zero','free','0',true],['free_high','free','9',true],['free_null','free','',true]]){
 const form=new FormData()
 for(const [key,value] of Object.entries({partner_id:'synthetic',reason:'Lifecycle regression',operation:'draft_plan',plan_code:plan,version:String({finite:2,unlimited:3,free_zero:2,free_high:3,free_null:4}[name]),deal_drops_monthly:quota,team_members:'10',analytics_days:'365',menu_ai_imports_monthly:'2','analytics.basic':'on','feedback.manage':enabled?'on':'','marketing.manage':enabled?'':'on','crm.manage':enabled?'on':''}))form.set(key,value)
 const outcome=await action.updatePartnerPlan({},form)
 assert.equal(outcome.ok,true)
 const call=calls.at(-1);assert.equal(call.name,'admin_save_partner_catalog_draft')
 result[name]=call.args
}
process.stdout.write(JSON.stringify(result))
