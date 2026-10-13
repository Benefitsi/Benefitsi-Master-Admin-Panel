import assert from "node:assert/strict"
import test from "node:test"
import {loadTypescript} from "./helpers/load-typescript.mjs"
const providerId="913a18e4-3e5b-4762-898c-0cbe2831b050",accountId="acct_TestMerchant"
function setup(path,{authorized=true,configured=true,providerAllowed=true,boundaryAllowed=true}={}){
 const trace=[],writes=[],stripe={fixture:true}
 const provider={id:providerId,display_name:"Synthetic TEST",support_email:"test@example.test",stripe_account_id:accountId,test_mode:true}
 const chain={eq(){return this},then(resolve){return Promise.resolve({error:null}).then(resolve)}}
 const admin={from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>{trace.push("read-provider");return{data:provider,error:null}}})}),update:data=>{writes.push({table,data});return chain},insert:async data=>{writes.push({table,data});return{error:null}}})}
 const route=loadTypescript(path,{
  "next/server":{NextResponse:{json:(body,init)=>Response.json(body,init),redirect:url=>new Response(null,{status:307,headers:{location:String(url)}})}},
  "@/lib/admin":{requireAdmin:async()=>{trace.push("admin");if(!authorized)throw Error("unauthorized");return{adminSession:{user:{id:"user",email:"admin@example.test"},profile:null}}}},
  "@/lib/supabase/admin":{createAdminClient:()=>{trace.push("db-client");return admin}},
  "@/lib/stripe/config":{requireBookingBaseUrl:()=>"https://admin.example.test"},
  "@/lib/stripe/booking-client":{
   assertBookingRealmBoundary:()=>{trace.push("boundary");if(!boundaryAllowed)throw Error("wrong database")},
   isBookingConnectConfigured:()=>configured,
   getBookingConnectClient:async input=>{trace.push("verified-client");assert.deepEqual({...input},{providerId,testMode:true,accountId});if(!providerAllowed)throw Error("provider not admitted");return stripe},
  },
  "@/lib/stripe/connect":{
   createTestMerchantAccount:async()=>assert.fail("Existing prepared merchant must be preserved"),
   createMerchantOnboardingLink:async(client,input)=>{trace.push("link");assert.equal(client,stripe);assert.equal(input.accountId,accountId);return"https://connect.stripe.com/setup/test"},
   retrieveMerchantAccountStatus:async(client,id)=>{trace.push("merchant-status");assert.equal(client,stripe);assert.equal(id,accountId);return{accountId,chargesEnabled:true,payoutsEnabled:true,onboardingStatus:"ready"}},
  },
 })
 return{route,trace,writes}
}
const onboarding="app/api/stripe/connect/onboarding/route.ts",status="app/api/stripe/connect/status/route.ts"
const request=()=>new Request("https://admin.example.test/api/stripe/connect/onboarding",{method:"POST",body:JSON.stringify({providerId})})
test("prepared sandbox onboarding awaits verified scoped client before any Stripe link",async()=>{
 const d=setup(onboarding),response=await d.route.POST(request())
 assert.equal(response.status,200);assert.equal((await response.json()).onboardingUrl,"https://connect.stripe.com/setup/test")
 assert.equal(d.trace[0],"admin");assert.ok(d.trace.indexOf("boundary")<d.trace.indexOf("db-client"));assert.ok(d.trace.indexOf("verified-client")<d.trace.indexOf("link"));assert.equal(d.writes.length,0)
})
test("unapproved provider or database cannot create Stripe links or update providers",async()=>{
 const wrongProvider=setup(onboarding,{providerAllowed:false});assert.equal((await wrongProvider.route.POST(request())).status,503);assert.equal(wrongProvider.trace.includes("link"),false);assert.equal(wrongProvider.writes.length,0)
 const wrongDb=setup(onboarding,{boundaryAllowed:false});assert.equal((await wrongDb.route.POST(request())).status,503);assert.equal(wrongDb.trace.includes("db-client"),false);assert.equal(wrongDb.writes.length,0)
})
test("missing Connect configuration and missing admin authorization never open DB or Stripe",async()=>{
 const missing=setup(onboarding,{configured:false});assert.equal((await missing.route.POST(request())).status,503);assert.equal(missing.trace.includes("db-client"),false)
 const denied=setup(onboarding,{authorized:false});await assert.rejects(denied.route.POST(request()),/unauthorized/);assert.deepEqual(denied.trace,["admin"])
})
test("Connect callback verifies scoped client and merchant before persisting readiness",async()=>{
 const d=setup(status),response=await d.route.GET(new Request(`https://admin.example.test/api/stripe/connect/status?provider=${providerId}&mode=return`))
 assert.equal(response.status,307);assert.match(response.headers.get("location"),/connect=returned/)
 assert.ok(d.trace.indexOf("verified-client")<d.trace.indexOf("merchant-status"));assert.equal(d.writes[0].table,"booking_providers");assert.equal(d.writes[0].data.charges_enabled,true)
 const bad=setup(status,{providerAllowed:false});await bad.route.GET(new Request(`https://admin.example.test/api/stripe/connect/status?provider=${providerId}&mode=return`));assert.equal(bad.writes.length,0)
})
