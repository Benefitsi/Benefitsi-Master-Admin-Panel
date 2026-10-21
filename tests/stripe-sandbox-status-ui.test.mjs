import assert from "node:assert/strict"
import test from "node:test"
import React,{act} from "react"
import {JSDOM} from "jsdom"
import {loadTypescript} from "./helpers/load-typescript.mjs"
import * as language from "../app/admin-language.tsx"
import {AdminTranslationBoundary} from "../components/admin-translation-boundary.tsx"
import * as contracts from "../lib/bookings/contracts.ts"
const h=React.createElement,accountId="acct_1T3ZuLH0Ev7iKGq0"
const fixture={migrationReady:false,warnings:[],slots:[],cities:[{id:"city",name:"Wissen"}],providers:[{id:"provider",partnerId:null,displayName:"Wissen",supportEmail:null,stripeAccountId:null,onboardingStatus:"pending",chargesEnabled:false,payoutsEnabled:false,detailsSubmitted:false,testMode:true,updatedAt:null}],offers:[{id:"offer",providerId:"provider",providerName:"Wissen",cityId:"city",cityName:"Wissen",title:"Prüfung & Freigaben",slug:"offer",description:"Eigener Text",currency:"eur",unitAmount:2000,applicationFeeBps:1200,status:"needs_review",canonicalPath:"/stadt/annweiler/buchen/offer",reviewStage:"agent_draft",reviewVerdict:"unreviewed",reviewIssues:[],updatedAt:null}],bookings:[{id:"booking",providerId:"provider",publicReference:"Wissen",offerTitle:"Prüfung & Freigaben",state:"confirmed",totalAmount:2000,createdAt:"2026-10-13T10:00:00Z"}]}
async function mount(t){
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:"https://admin.example/bookings"})
 const names=["window","self","document","Element","Text","Node","NodeFilter","HTMLElement","MutationObserver","IS_REACT_ACT_ENVIRONMENT"]
 const old=Object.fromEntries(names.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 for(const key of names)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]})
 const {createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"))
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const key of names){if(old[key])Object.defineProperty(globalThis,key,old[key]);else delete globalThis[key]}})
 const settle=()=>new Promise(resolve=>setTimeout(resolve,15))
 return{render:async tree=>{await act(async()=>{root.render(tree);await settle()});await act(settle)},toggle:async label=>act(async()=>{[...document.querySelectorAll("button")].find(node=>node.textContent===label).click();await settle()})}
}
function pageModule(state,trace,authorized=true,options={}){
 const realm=options.realm??"legacy",data=options.data??fixture
 const button=({children,...props})=>{delete props.pendingLabel;return h("button",props,children)}
 return loadTypescript("app/bookings/page.tsx",{
  "next/link":({children,...props})=>h("a",props,children),"@/app/admin-shell":{AdminShell:({children,adminName,title})=>h(language.AdminLanguageProvider,null,h(language.AdminLanguageControl),h("h1",null,title),h("p",{"data-admin-i18n-ignore":"true"},adminName),children)},
  "@/app/bookings/actions":{createBookingOffer:()=>{},createBookingProvider:()=>{},publishBookingOffer:()=>{},submitBookingOfferToBen:()=>{}},
  "@/components/bookings/connect-onboarding-button":{ConnectOnboardingButton:({enabled,providerId})=>h("button",{disabled:!enabled,"data-connect-provider":providerId},"Connect fixture")},
  "@/components/pending-submit-button":{PendingSubmitButton:button},"@/components/admin-translation-boundary":{AdminTranslationBoundary},
  "@/lib/admin":{requireAdmin:async()=>{trace.push("admin");if(!authorized)throw new Error("login redirect");return{adminSession:{isAdmin:true,profile:{display_name:"Wissen"},user:{email:"user@example.test"}}}}},
  "@/lib/bookings/contracts":contracts,"@/lib/bookings/data":{loadBookingOperations:async()=>{trace.push("bookings");return data}},
  "@/lib/stripe/config":{isStripeTestConfigured:()=>true,isStripeConnectPlatformReady:()=>false,isStripeSandboxConfigured:()=>state!=="not_configured"},
  "@/lib/stripe/booking-client":{getBookingRealm:()=>{if(realm==="invalid")throw new Error("invalid realm");return realm},isBookingConnectConfigured:()=>options.connectConfigured===true,isBookingProviderAllowed:(providerId,account,testMode)=>realm==="legacy"?testMode===true:providerId==="provider"&&account==="acct_DemoScoped"&&testMode===true},
  "@/lib/stripe/sandbox-status":{getStripeSandboxStatus:async()=>{trace.push("sandbox");return{state,accountId}}},
 })
}
test("bookings page renders sandbox verification states in EN/DE while preserving legacy gates and authored data",async t=>{
 const ui=await mount(t)
 for(const [state,en,de]of[["not_configured","Sandbox not configured","Sandbox nicht konfiguriert"],["configured_unverified","Sandbox configured · not verified","Sandbox konfiguriert · nicht bestätigt"],["verified","Sandbox verified","Sandbox bestätigt"]]){
  const trace=[],page=pageModule(state,trace)
  await ui.render(await page.default({searchParams:Promise.resolve({})}))
  assert.equal(trace[0],"admin");assert.ok(trace.includes("sandbox"))
  const section=document.querySelector("#stripe-sandbox-status")
  assert.ok(section);assert.match(section.textContent,new RegExp(en))
  assert.match(section.textContent,/does not enable merchants, customers or commerce/)
  assert.equal(section.querySelector("code").textContent,accountId)
  assert.equal(document.querySelector("fieldset").disabled,true)
  assert.match(document.body.textContent,/Connect wartet auf UG|Connect waiting for the UG/)
  assert.equal(document.querySelector('article h3').textContent,"Wissen")
  assert.equal(document.querySelector('tbody td:nth-child(2)').textContent,"Prüfung & Freigaben")
  const links=[...document.querySelectorAll("a")].map(node=>node.getAttribute("href"))
  await ui.toggle("DE")
  assert.match(section.textContent,new RegExp(de));assert.equal(section.querySelector("code").textContent,accountId)
  assert.equal(document.querySelector('article h3').textContent,"Wissen")
  await ui.toggle("EN")
  assert.match(section.textContent,new RegExp(en));assert.equal(document.querySelector('tbody td:nth-child(2)').textContent,"Prüfung & Freigaben")
  assert.deepEqual([...document.querySelectorAll("a")].map(node=>node.getAttribute("href")),links)
 }
})
test("bookings page verifies admin identity before loading booking or sandbox status",async()=>{
 const trace=[],page=pageModule("verified",trace,false)
 await assert.rejects(page.default({searchParams:Promise.resolve({})}),/login redirect/)
 assert.deepEqual(trace,["admin"])
})

test("selected sandbox booking realm enables only the allowlisted test provider after verified proof",async t=>{
 const ui=await mount(t),data={...fixture,migrationReady:true,providers:[{...fixture.providers[0],stripeAccountId:"acct_DemoScoped"},{...fixture.providers[0],id:"ordinary",displayName:"Normales Partnerprofil",stripeAccountId:"acct_Ordinary",testMode:false}]}
 const page=pageModule("verified",[],true,{realm:"sandbox",connectConfigured:true,data})
 await ui.render(await page.default({searchParams:Promise.resolve({})}))
 assert.match(document.body.textContent,/Sandbox test bookings prepared/)
 assert.equal(document.querySelector('[data-connect-provider="provider"]').disabled,false)
 assert.equal(document.querySelector('[data-connect-provider="ordinary"]').disabled,true)
 assert.equal(document.querySelector('form fieldset').disabled,true,"No general sandbox provider creation")
 assert.equal(document.querySelector('select[name="providerId"] option[value="ordinary"]'),null)
 assert.match(document.body.textContent,/Connect: pending/)
 await ui.toggle("DE");assert.match(document.body.textContent,/Sandbox-Testbuchungen vorbereitet/)
 assert.equal(document.querySelector('[data-connect-provider="ordinary"]').disabled,true)
})
test("unverified or invalid booking realm remains blocked while independent sandbox proof stays visible",async t=>{
 const ui=await mount(t)
 for(const [realm,state]of[["sandbox","configured_unverified"],["invalid","verified"]]){
  const page=pageModule(state,[],true,{realm,connectConfigured:true,data:{...fixture,migrationReady:true}})
  await ui.render(await page.default({searchParams:Promise.resolve({})}))
  assert.match(document.body.textContent,realm==="invalid"?/Booking realm not approved/:/Sandbox test bookings blocked/)
  assert.equal(document.querySelector('[data-connect-provider="provider"]')?.disabled??true,true)
  assert.equal(document.querySelector('form fieldset').disabled,true)
  assert.ok(document.querySelector("#stripe-sandbox-status"))
 }
})

test("pipeline review and publication actions are absent for unscoped providers or invalid realm",async t=>{
 const ui=await mount(t)
 const provider={...fixture.providers[0],stripeAccountId:"acct_DemoScoped",chargesEnabled:true,onboardingStatus:"enabled"}
 for(const [realm,id,expected]of[["sandbox","ordinary",false],["invalid","provider",false],["sandbox","provider",true]]){
  const owner={...provider,id},data={...fixture,migrationReady:true,providers:[owner],offers:[{...fixture.offers[0],providerId:id,reviewStage:"agent_draft"},{...fixture.offers[0],id:"ready",providerId:id,reviewStage:"ready_for_human",reviewVerdict:"pass"}]}
  const page=pageModule("verified",[],true,{realm,connectConfigured:true,data})
  await ui.render(await page.default({searchParams:Promise.resolve({})}))
  const labels=[...document.querySelectorAll('article button')].map(node=>node.textContent)
  assert.equal(labels.includes('Ben prüfen lassen'),expected)
  assert.equal(labels.includes('Menschlich freigeben'),expected)
 }
})
function detailModule(options={}){
 const realm=options.realm??"sandbox",provider={...fixture.providers[0],stripeAccountId:"acct_DemoScoped",id:options.providerId??"provider"}
 const booking={...fixture.bookings[0],id:"00000000-0000-4000-8000-000000000001",providerId:provider.id,providerName:"Wissen",offerId:"offer",quantity:2,applicationFeeAmount:240,stripePaymentIntentId:"pi_Fixture",publicReference:"Wissen"}
 const button=({children,...props})=>{delete props.pendingLabel;return h("button",props,children)}
 return loadTypescript("app/bookings/[bookingId]/page.tsx",{
  "next/link":({children,...props})=>h("a",props,children),"next/navigation":{notFound:()=>{throw new Error("not found")}},
  "@/app/admin-shell":{AdminShell:({children,title,subtitle})=>h(language.AdminLanguageProvider,null,h(language.AdminLanguageControl),h("h1",null,title),h("p",null,subtitle),children)},
  "@/app/bookings/actions":{cancelOrRefundBooking:()=>{throw new Error("No mutation allowed in this test")}},
  "@/components/pending-submit-button":{PendingSubmitButton:button},
  "@/lib/admin":{requireAdmin:async()=>({adminSession:{profile:null,user:{email:"fixture@example.test"}}})},
  "@/lib/bookings/data":{loadBookingDetail:async()=>({booking,data:{...fixture,providers:[provider]},audit:[{id:"audit",action:"fixture",actorType:"admin",actorProfile:"Wissen",createdAt:booking.createdAt,details:{reason:"Prüfung & Freigaben"}}]})},
  "@/lib/stripe/booking-client":{getBookingRealm:()=>{if(realm==="invalid")throw new Error("invalid");return realm},isBookingStripeConfigured:()=>true,isBookingProviderAllowed:(id,_account,testMode)=>realm!=="invalid"&&id==="provider"&&testMode===true},
 })
}
test("booking detail offers cancellation only for a valid scoped persisted provider and preserves authored EN/DE data",async t=>{
 const ui=await mount(t)
 for(const [realm,providerId,allowed]of[["sandbox","ordinary",false],["invalid","provider",false],["sandbox","provider",true]]){
  const page=detailModule({realm,providerId})
  await ui.render(await page.default({params:Promise.resolve({bookingId:"00000000-0000-4000-8000-000000000001"}),searchParams:Promise.resolve({})}))
  assert.equal(Boolean(document.querySelector('aside form')),allowed)
  assert.ok([...document.querySelectorAll('dd')].some(node=>node.textContent==="Wissen"))
  assert.ok([...document.querySelectorAll('dd')].some(node=>node.textContent==="Prüfung & Freigaben"))
  assert.match(document.body.textContent,/Prüfung & Freigaben/)
  await ui.toggle("DE");await ui.toggle("EN")
  assert.ok([...document.querySelectorAll('dd')].some(node=>node.textContent==="Wissen"))
  assert.ok([...document.querySelectorAll('dd')].some(node=>node.textContent==="Prüfung & Freigaben"))
 }
})
