import assert from "node:assert/strict"
import test from "node:test"
import { loadTypescript } from "./helpers/load-typescript.mjs"
const accountId="acct_1T3ZuLH0Ev7iKGq0"
function load(config){let status={};try{status=loadTypescript("lib/stripe/sandbox-status.ts",{"./config":{BENEFITSI_STRIPE_SANDBOX_ACCOUNT_ID:accountId,...config}})}catch(error){if(error.code!=="ENOENT")throw error}return status}
const plain=value=>JSON.parse(JSON.stringify(value))
test("sandbox status keeps absent configuration separate and performs no verification call",async()=>{
 let calls=0
 const status=load({isStripeSandboxConfigured:()=>false,getVerifiedStripeSandboxClient:async()=>{calls++;return{}}})
 assert.equal(typeof status.getStripeSandboxStatus,"function")
 assert.deepEqual(plain(await status.getStripeSandboxStatus()),{state:"not_configured",accountId})
 assert.equal(calls,0)
})
test("configured flag alone cannot become verified while account and balance verification is pending",async()=>{
 let release,calls=0,returned=false
 const waiting=new Promise(resolve=>{release=resolve})
 const status=load({isStripeSandboxConfigured:()=>true,getVerifiedStripeSandboxClient:async()=>{calls++;await waiting;return new Proxy({},{get(_target,key){if(key==="then")return undefined;throw new Error("Do not expose SDK state")}})}})
 assert.equal(typeof status.getStripeSandboxStatus,"function")
 const result=status.getStripeSandboxStatus().then(value=>{returned=true;return value})
 await Promise.resolve();assert.equal(calls,1);assert.equal(returned,false)
 release()
 assert.deepEqual(plain(await result),{state:"verified",accountId})
})
test("failed identity or test-mode checks yield configured but unverified without leaking Stripe errors",async()=>{
 const status=load({isStripeSandboxConfigured:()=>true,getVerifiedStripeSandboxClient:async()=>{throw new Error("PRIVATE_STRIPE_ERROR_NEVER_RENDER")}})
 assert.equal(typeof status.getStripeSandboxStatus,"function")
 const result=await status.getStripeSandboxStatus()
 assert.deepEqual(plain(result),{state:"configured_unverified",accountId})
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|secret|balance|customer/)
})

test("sandbox status notices configuration disabled during verification",async()=>{
 let configured=true
 const status=load({isStripeSandboxConfigured:()=>configured,getVerifiedStripeSandboxClient:async()=>{configured=false;return{}}})
 assert.deepEqual(plain(await status.getStripeSandboxStatus()),{state:"not_configured",accountId})
})
