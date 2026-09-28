import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { timingSafeEqual } from 'node:crypto'
import ts from 'typescript'
import { deliverNotifications } from '../lib/commerce/delivery.ts'
import { buildBookingEmails, deliverResendEmails } from '../lib/commerce/notification-email.ts'

const workerSecret='synthetic-notification-worker-secret-123456789'
const message={id:'11111111-1111-4111-8111-111111111111',lease_token:'lease-1',provider_id:'22222222-2222-4222-8222-222222222222',booking_id:'33333333-3333-4333-8333-333333333333',event_key:'booking.created',payload:{
  booking:{public_reference:'B-123456',currency:'eur',total_amount:1000,starts_at:'2026-09-28T12:00:00Z',payment_state:'unpaid',state:'pending',title:'Mittagessen',quantity:1,kind:'food_pickup',fulfillment_mode:'pickup',subtotal_amount:1000,delivery_fee:0,items:[]},
  customer:{email:'guest@example.invalid',name:'Guest'},
}}

function worker({marker,mode}) {
  const calls={secretReads:0,adapterSends:0,resendSends:0,receiptStarts:0,receiptCompletions:0,finished:[]}
  const rows={
    booking_providers:{display_name:'Synthetic café',support_email:'partner@example.invalid'},
    commerce_bookings:{public_reference:'B-123456',...(marker===undefined?{}:{is_test:marker})},
    commerce_booking_secrets:{public_token:'a'.repeat(64)},
  }
  const admin={
    from(table) {
      if(table==='commerce_booking_secrets') calls.secretReads++
      assert.ok(Object.hasOwn(rows,table),`unexpected table ${table}`)
      let columns=''
      const query={
        select(value){columns=value;return query},
        eq(){return query},
        async single(){
          const data=Object.fromEntries(columns.split(',').map(key=>key.trim()).filter(key=>Object.hasOwn(rows[table],key)).map(key=>[key,rows[table][key]]))
          return {data,error:null}
        },
      }
      return query
    },
    async rpc(name,args) {
      if(name==='commerce_claim_notifications') return {data:[message],error:null}
      if(name==='commerce_finish_notification') {calls.finished.push(args);return {data:null,error:null}}
      if(name==='commerce_begin_notification_delivery') {calls.receiptStarts++;return {data:{state:'pending',first_attempt_at:new Date().toISOString(),request_fingerprint:args.p_fingerprint},error:null}}
      if(name==='commerce_complete_notification_delivery') {calls.receiptCompletions++;return {data:null,error:null}}
      throw Error(`unexpected RPC ${name}`)
    },
  }
  const stubs={
    'node:crypto':{timingSafeEqual},
    '@/lib/commerce/http':{webOrigin:()=>new URL('https://guest.example.invalid')},
    '@/lib/supabase/admin':{createAdminClient:()=>admin},
    '@/lib/stripe/config':{requirePartnerBaseUrl:()=>new URL('https://partner.example.invalid')},
    '@/lib/commerce/delivery':{deliverNotifications},
    '@/lib/commerce/notification-email':{
      notificationDeliveryConfig:()=>mode==='adapter'?{mode,url:'https://processor.example.invalid',token:'synthetic-adapter-token'}:{mode:'resend',from:'test@example.invalid',apiKey:'re_synthetic'},
      buildBookingEmails,deliverResendEmails,
    },
  }
  const source=readFileSync(new URL('../app/api/commerce/notifications/route.ts',import.meta.url),'utf8')
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const loaded={exports:{}}
  const fetcher=async url=>{
    if(url==='https://api.resend.com/emails') {calls.resendSends++;return {ok:true,json:async()=>({id:`synthetic-email-${calls.resendSends}`})}}
    assert.equal(url,'https://processor.example.invalid')
    calls.adapterSends++;return {ok:true}
  }
  vm.runInNewContext(compiled,{
    module:loaded,exports:loaded.exports,require:name=>{assert.ok(Object.hasOwn(stubs,name),`unexpected import ${name}`);return stubs[name]},
    process:{env:{BENEFITSI_COMMERCE_ENABLED:'true',BENEFITSI_NOTIFICATION_WORKER_SECRET:workerSecret}},
    Buffer,URL,Response,AbortSignal,
    fetch:fetcher,
  },{filename:'commerce-notifications-route.js'})
  const request=new Request('https://admin.example.invalid/api/commerce/notifications',{method:'POST',headers:{authorization:`Bearer ${workerSecret}`}})
  return {run:async()=>{
    const previous=globalThis.fetch
    globalThis.fetch=fetcher
    try{return await loaded.exports.POST(request)}finally{globalThis.fetch=previous}
  },calls}
}

for(const mode of ['resend','adapter']) {
  for(const marker of [true,undefined]) {
    test(`${mode} worker suppresses a ${marker===undefined?'missing':'test'} booking marker before secrets or delivery`,async()=>{
      const {run,calls}=worker({marker,mode})
      const response=await run()
      assert.equal(response.status,200)
      assert.deepEqual(await response.json(),{sent:1,failed:0})
      assert.equal(calls.secretReads,0)
      assert.equal(calls.resendSends,0)
      assert.equal(calls.adapterSends,0)
      assert.equal(calls.receiptStarts,0)
      assert.equal(calls.finished.length,1)
    })
  }
  test(`${mode} worker still delivers a booking explicitly marked live`,async()=>{
    const {run,calls}=worker({marker:false,mode})
    const response=await run()
    assert.equal(response.status,200)
    assert.deepEqual(await response.json(),{sent:1,failed:0})
    assert.equal(calls.secretReads,1)
    assert.equal(calls.resendSends,mode==='resend'?2:0)
    assert.equal(calls.adapterSends,mode==='adapter'?1:0)
    assert.equal(calls.receiptStarts,mode==='resend'?2:0)
    assert.equal(calls.receiptCompletions,mode==='resend'?2:0)
    assert.equal(calls.finished.length,1)
  })
}
