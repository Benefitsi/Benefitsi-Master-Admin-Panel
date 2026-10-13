import assert from "node:assert/strict"
import test from "node:test"
import {loadTypescript} from "./helpers/load-typescript.mjs"
const good={id:"provider-a",test_mode:true,stripe_account_id:"acct_Merchant"}
function setup({realm="sandbox",providers=[good],objectProvider="provider-a"}={}) {
 const calls=[]
 const api=loadTypescript("lib/stripe/booking-provider-scope.ts",{
  "@/lib/stripe/booking-client":{
   assertBookingRealmBoundary:()=>calls.push("boundary"),getBookingRealm:()=>realm,
   isBookingProviderAllowed:(id,account,testMode)=>id==="provider-a"&&account==="acct_Merchant"&&testMode===true,
  },
 })
 const admin={from:table=>{calls.push(table);return {select:()=>({eq:(field,value)=>({maybeSingle:async()=>({error:null,data:table==="booking_providers"?providers.find(p=>p.id===value):{provider_id:objectProvider}}),then:resolve=>Promise.resolve({error:null,data:providers.filter(p=>p.stripe_account_id===value)}).then(resolve)})})}}}
 return{api,admin,calls}
}
test("persisted provider and object owner must both be explicitly admitted before mutation",async()=>{
 const d=setup();await d.api.requireBookingObjectScope(d.admin,"commerce_bookings","booking")
 assert.equal(d.calls[0],"boundary");assert.deepEqual(d.calls.filter(x=>x!=="boundary"),["commerce_bookings","booking_providers"])
 const foreign=setup({objectProvider:"provider-b"});await assert.rejects(foreign.api.requireBookingObjectScope(foreign.admin,"bookings","booking"))
 const wrongMerchant=setup({providers:[{...good,stripe_account_id:"acct_Other"}]});await assert.rejects(wrongMerchant.api.requireBookingProviderScope(wrongMerchant.admin,good.id))
})
test("merchant status webhook refuses a shared account if any matching provider is not admitted",async()=>{
 const d=setup();assert.equal(await d.api.requireBookingMerchantProviderScope(d.admin,"acct_Merchant"),true)
 const shared=setup({providers:[good,{...good,id:"provider-b"}]});await assert.rejects(shared.api.requireBookingMerchantProviderScope(shared.admin,"acct_Merchant"))
 const absent=setup({providers:[]});assert.equal(await absent.api.requireBookingMerchantProviderScope(absent.admin,"acct_Merchant"),false)
})
test("legacy provider paths remain available without new ownership reads",async()=>{
 const d=setup({realm:"legacy"});await d.api.requireBookingProviderScope(d.admin,"old");await d.api.requireBookingObjectScope(d.admin,"bookings","old");assert.equal(await d.api.requireBookingMerchantProviderScope(d.admin,"acct_Old"),true)
 assert.ok(d.calls.every(x=>x==="boundary"))
})
