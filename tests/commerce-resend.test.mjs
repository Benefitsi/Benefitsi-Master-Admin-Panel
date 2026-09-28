import assert from 'node:assert/strict'
import test from 'node:test'
const input={notificationId:'11111111-1111-4111-8111-111111111111',providerId:'22222222-2222-4222-8222-222222222222',event:'booking.created',provider:{display_name:'Bistro <Nord>',support_email:'bistro@example.test'},payload:{booking:{id:'33333333-3333-4333-8333-333333333333',public_reference:'B-TEST123',title:'Tisch <Fenster>',kind:'table',state:'confirmed',payment_state:'unpaid',currency:'eur',total_amount:0,starts_at:'2026-09-22T16:00:00Z',quantity:2,items:[]},customer:{name:'Anna <script>alert(1)</script>',email:'anna@example.test',notes:'Ohne <b>Nüsse</b>'}},guestStatusUrl:'https://benefitsi.example/buchung/B-TEST123?token='+ 'a'.repeat(64),merchantUrl:'https://admin.example/partner/commerce?provider=22222222-2222-4222-8222-222222222222',from:'Benefitsi <buchung@example.test>'}

test('escaped German emails separate customer capability link from merchant portal',async()=>{
 const {buildBookingEmails}=await import('../lib/commerce/notification-email.ts')
 const [guest,merchant]=buildBookingEmails(input)
 assert.equal(guest.audience,'guest');assert.deepEqual(guest.body.to,['anna@example.test'])
 assert.equal(merchant.audience,'merchant');assert.deepEqual(merchant.body.to,['bistro@example.test'])
 assert.match(guest.body.html,/&lt;script&gt;/);assert.doesNotMatch(guest.body.html,/<script>/)
 assert.match(guest.body.text,/22\.09\.2026/);assert.match(guest.body.text,/18:00/)
 assert.match(guest.body.html,/token=/);assert.doesNotMatch(JSON.stringify(merchant),/token=|a{64}/)
 assert.match(merchant.body.text,/admin\.example\/partner\/commerce/)
 assert.notEqual(guest.idempotencyKey,merchant.idempotencyKey)
 assert.equal(guest.body.from,'Benefitsi <buchung@example.test>')
})
test('missing merchant email is skipped but invalid guest or sender is rejected',async()=>{
 const {buildBookingEmails}=await import('../lib/commerce/notification-email.ts')
 assert.equal(buildBookingEmails({...input,provider:{...input.provider,support_email:null}}).length,1)
 assert.throws(()=>buildBookingEmails({...input,from:'Benefitsi <a@example.test>\r\nBcc: evil@example.test'}))
 assert.throws(()=>buildBookingEmails({...input,payload:{...input.payload,customer:{...input.payload.customer,email:'a@example.test,evil@example.test'}}}))
 assert.throws(()=>buildBookingEmails({...input,guestStatusUrl:'javascript:alert(1)'}))
 assert.deepEqual(buildBookingEmails({...input,event:'payment.checkout_attached'}),[])
})
function ledger(){const rows=new Map();return {rows,begin:async(email)=>{let row=rows.get(email.audience);if(!row){row={state:'pending',first_attempt_at:'2026-09-22T10:00:00Z',request_fingerprint:email.fingerprint};rows.set(email.audience,row)}return row},complete:async(email,id)=>{rows.set(email.audience,{...rows.get(email.audience),state:'sent',provider_message_id:id})}}}
test('Resend retry skips acknowledged guest after merchant failure and retains audience keys',async()=>{
 const {buildBookingEmails,deliverResendEmails}=await import('../lib/commerce/notification-email.ts')
 const emails=buildBookingEmails(input),store=ledger(),calls=[]
 let merchantFails=true
 const fetcher=async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body,key:options.headers['Idempotency-Key']});if(body.to[0]==='bistro@example.test'&&merchantFails)return new Response('private provider error',{status:503});return Response.json({id:'resend-id-'+body.to[0]})}
 await assert.rejects(()=>deliverResendEmails(emails,{apiKey:'re_test_only',...store,fetcher,now:Date.parse('2026-09-22T10:00:00Z')}),/email_delivery_failed/)
 merchantFails=false
 await deliverResendEmails(emails,{apiKey:'re_test_only',...store,fetcher,now:Date.parse('2026-09-22T10:01:00Z')})
 assert.equal(calls.filter(c=>c.body.to[0]==='anna@example.test').length,1)
 assert.equal(calls.filter(c=>c.body.to[0]==='bistro@example.test').length,2)
 assert.equal(calls[1].key,calls[2].key)
 assert.ok(calls.every(c=>c.url==='https://api.resend.com/emails'))
 assert.equal(store.rows.get('merchant').state,'sent')
})
test('unknown old send outcome stops before Resend idempotency retention expires',async()=>{
 const {buildBookingEmails,deliverResendEmails}=await import('../lib/commerce/notification-email.ts')
 const emails=buildBookingEmails(input),store=ledger();await store.begin(emails[0])
 await assert.rejects(()=>deliverResendEmails(emails,{apiKey:'re_test_only',...store,fetcher:async()=>{assert.fail('no resend past safety window')},now:Date.parse('2026-09-23T09:01:00Z')}),/email_delivery_requires_reconciliation/)
})
test('provider errors and malformed success never expose private response text or acknowledge send',async()=>{
 const {buildBookingEmails,deliverResendEmails}=await import('../lib/commerce/notification-email.ts')
 for(const response of [new Response('anna@example.test secret',{status:400}),Response.json({message:'no id'})]){
 const store=ledger()
 await assert.rejects(()=>deliverResendEmails(buildBookingEmails(input),{apiKey:'re_test_only',...store,fetcher:async()=>response,now:Date.parse('2026-09-22T10:00:00Z')}),error=>error.message==='email_delivery_failed')
 assert.equal(store.rows.get('guest').state,'pending')
 }
})

test('configuration requires a complete provider and explicit selection never falls back',async()=>{
 const {notificationDeliveryConfig}=await import('../lib/commerce/notification-email.ts')
 assert.equal(notificationDeliveryConfig({}),null)
 assert.equal(notificationDeliveryConfig({RESEND_API_KEY:'re_test_only'}),null)
 assert.equal(notificationDeliveryConfig({RESEND_API_KEY:'re_test_only',BENEFITSI_BOOKING_FROM_EMAIL:input.from}).mode,'resend')
 assert.equal(notificationDeliveryConfig({BENEFITSI_NOTIFICATION_DELIVERY_URL:'https://adapter.example/deliver',BENEFITSI_NOTIFICATION_DELIVERY_TOKEN:'synthetic'}).mode,'adapter')
 assert.throws(()=>notificationDeliveryConfig({BENEFITSI_NOTIFICATION_PROVIDER:'resend',BENEFITSI_NOTIFICATION_DELIVERY_URL:'https://adapter.example/deliver',BENEFITSI_NOTIFICATION_DELIVERY_TOKEN:'synthetic'}))
 assert.throws(()=>notificationDeliveryConfig({BENEFITSI_NOTIFICATION_PROVIDER:'adapter',BENEFITSI_NOTIFICATION_DELIVERY_URL:'http://adapter.example/deliver',BENEFITSI_NOTIFICATION_DELIVERY_TOKEN:'synthetic'}))
 assert.throws(()=>notificationDeliveryConfig({BENEFITSI_NOTIFICATION_PROVIDER:'unknown'}))
})

test('pending payment is not presented as a confirmed booking',async()=>{
 const {buildBookingEmails}=await import('../lib/commerce/notification-email.ts')
 const [guest]=buildBookingEmails({...input,payload:{...input.payload,booking:{...input.payload.booking,state:'payment_pending',payment_state:'pending'}}})
 assert.match(guest.body.text,/Onlinezahlung ist noch nicht bestätigt/)
 assert.doesNotMatch(guest.body.subject,/Reservierung bestätigt/)
})

test('changed pending content stops, while sent receipts skip even after template changes',async()=>{
 const {buildBookingEmails,deliverResendEmails}=await import('../lib/commerce/notification-email.ts')
 const emails=buildBookingEmails(input),store=ledger();await store.begin(emails[0])
 const changed=buildBookingEmails({...input,from:'Neu <neu@example.test>'})
 await assert.rejects(()=>deliverResendEmails(changed,{apiKey:'re_test_only',...store,fetcher:async()=>assert.fail('changed request must not send'),now:Date.parse('2026-09-22T10:00:00Z')}),/email_delivery_content_changed/)
 await store.complete(emails[0],'existing-message-id')
 await store.begin(emails[1]);await store.complete(emails[1],'existing-merchant-id')
 await deliverResendEmails(changed,{apiKey:'re_test_only',...store,fetcher:async()=>assert.fail('sent receipt must skip'),now:Date.parse('2026-09-24T10:00:00Z')})
})

test('outbox acknowledges success only after both recipients are durably recorded',async()=>{
 const {buildBookingEmails,deliverResendEmails}=await import('../lib/commerce/notification-email.ts')
 const {deliverNotifications}=await import('../lib/commerce/delivery.ts')
 const store=ledger(),acks=[]
 const result=await deliverNotifications([{id:input.notificationId,lease_token:'synthetic',payload:input.payload}],async()=>{
  await deliverResendEmails(buildBookingEmails(input),{apiKey:'re_test_only',...store,fetcher:async()=>Response.json({id:'synthetic-id'}),now:Date.parse('2026-09-22T10:00:00Z')})
 },async(id,success)=>{assert.equal(store.rows.get('guest').state,'sent');assert.equal(store.rows.get('merchant').state,'sent');acks.push({id,success})})
 assert.deepEqual(result,{sent:1,failed:0});assert.equal(acks[0].success,true)
})

test('food receipt includes configuration delivery address fee and delivery-ready label',async()=>{
 const {buildBookingEmails}=await import('../lib/commerce/notification-email.ts')
 const [guest]=buildBookingEmails({...input,payload:{...input.payload,booking:{...input.payload.booking,kind:'food_pickup',state:'ready',fulfillment_mode:'delivery',delivery_address:{street:'Main <1>',postal_code:'10115',city:'Berlin',details:'Floor 2'},subtotal_amount:2000,delivery_fee:300,total_amount:2300,items:[{title:'Pizza',quantity:1,variant:{title:'Large'},options:[{title:'Special dough'}],removed_ingredients:[{title:'Basil'}],note:'Please slice',extras:[{title:'Cheese'}]}]}}})
 for(const value of ['Lieferbereit','Main <1>','10115','Floor 2','Large','Special dough','Ohne: Basil','Please slice','Liefergebühr: 3,00','Zwischensumme: 20,00']) assert.ok(guest.body.text.includes(value),value)
 assert.ok(guest.body.html.includes('Main &lt;1&gt;'))
})
