import test from 'node:test'
import assert from 'node:assert/strict'
import { now, id, intent, customer, invoice, line, payment, pi, transport, provider, moduleAt } from './helpers/corporate-recurring-fixtures.mjs'
const op = kind => ({ operation_id: id, setup_request_id: id, root_operation_id: id, next_operation_id: null, kind, period_id: intent.period_id, contract_id: intent.contract_id, expected_version: intent.expected_version, payload_hash: intent.payload_hash, lease_token: id, first_attempt_at: new Date(now).toISOString(), lease_expires_at: new Date(now + 120000).toISOString(), provider_object_ref: intent.invoice_ref, intent })
function worker(t, operation, changes = {}) {
 const calls = [], records = []; const rpc = async (name, args) => { calls.push({ name, args }); if (changes.rpc) { const r = await changes.rpc(name,args); if (r) return r }
 if (name === 'claim_corporate_billing_operations') return { status: 'ok', operations: [operation] }
 if (name === 'authorize_corporate_billing_step') return { status: 'authorized', request_hash: 'f'.repeat(64), intent: operation.intent }
 if (name === 'record_corporate_provider_result') { records.push(args.p_result); return { status: 'recorded', operation_state: 'succeeded', next_operation_id: null, setup_request_id: id } }
 throw Error(`Unexpected RPC ${name}`) }
 const p = provider(t), w = new (moduleAt('lib/stripe/corporate-worker.ts').CorporateWorker)(p, rpc)
 return { w, calls, records }
}
test('awaiting_setup and completed authority are terminal and never call provider', async () => {
 for(const status of ['awaiting_setup','completed','cancelled','conflict','review_required']) { const t=transport(),{w,records}=worker(t,op('create_invoice'),{rpc:async name=>name==='authorize_corporate_billing_step'?{status,reason:'invoice_payment_verified'}:null}); const r=await w.run(id); assert.equal(r.status,status); assert.equal(t.calls.length,0); assert.equal(records.length,0) }
})
test('expired lease or 23h ambiguous creation causes no network write',async()=>{
 for(const operation of [{...op('create_invoice'),first_attempt_at:new Date(now-23*3600000).toISOString()},{...op('create_invoice'),lease_expires_at:new Date(now-1).toISOString()}]) {const t=transport(),{w}=worker(t,operation); await w.run(id); assert.equal(t.calls.filter(c=>c.method==='POST').length,0)}
})
test('protective pause only disables SAME invoice and records fresh false readback despite contact loss',async()=>{
 let enabled=true;const t=transport({'/v1/invoices/in_synthetic':call=>{if(call.method==='POST'){assert.equal(call.body.get('auto_advance'),'false');enabled=false}return {...invoice,auto_advance:enabled}}}),{w,records,calls}=worker(t,{...op('pause_invoice_recovery'),intent:{...intent,recovery_blocked:true}})
 await w.run(id); assert.equal(records[0].type,'recovery_paused');assert.equal(records[0].auto_advance,false);assert.equal(records[0].observed_at,'2026-10-23T22:00:00.000Z');assert.equal(t.calls.filter(c=>c.method==='POST').length,1);assert.equal(calls.filter(c=>c.name==='apply_corporate_invoice_evidence').length,0)
})
test('cancelled authorization after provider reads blocks finalize and preserves single invoice',async()=>{
 let checks=0;const t=transport({'/v1/invoices/in_synthetic':{...invoice,status:'draft'}}),{w}=worker(t,op('finalize_invoice'),{rpc:async name=>name==='authorize_corporate_billing_step'&&++checks>1?{status:'cancelled'}:null}); await w.run(id);assert.equal(t.calls.filter(c=>c.method==='POST').length,0)
})
test('create draft replay uses stable step keys and never attaches duplicate approved line',async()=>{
 let made=0,attached=false;const seen=new Set();const t=transport({'/v1/invoices':call=>{const key=call.headers['Idempotency-Key']||call.headers['idempotency-key'];if(!seen.has(key)){seen.add(key);made++}assert.equal(call.body.get('auto_advance'),'false');assert.equal(call.body.get('pending_invoice_items_behavior'),'exclude');return {...invoice,status:'draft'}},'/v1/invoices/in_synthetic':{...invoice,status:'draft'},'/v1/invoices/in_synthetic/lines':()=>({object:'list',has_more:false,data:attached?[line]:[]}),'/v1/invoiceitems':call=>{attached=true;assert.equal(call.body.get('invoice'),'in_synthetic');return{id:'ii_synthetic',object:'invoiceitem'}}})
 const operation={...op('create_invoice'),intent:{...intent,invoice_ref:null},provider_object_ref:null};for(let i=0;i<2;i++){const {w}=worker(t,operation);await w.run(id)}assert.equal(made,1);assert.equal(t.calls.filter(c=>c.path==='/v1/invoiceitems').length,1)
})
test('setup verifies attached off-session method and updates only Customer defaults/email',async()=>{
 let updated=false;const t=transport({'/v1/checkout/sessions/cs_test_synthetic':{id:'cs_test_synthetic',object:'checkout.session',livemode:false,mode:'setup',customer:customer.id,status:'complete',setup_intent:'seti_synthetic',metadata:customer.metadata},'/v1/setup_intents/seti_synthetic':{id:'seti_synthetic',object:'setup_intent',livemode:false,customer:customer.id,status:'succeeded',usage:'off_session',payment_method:'pm_synthetic',metadata:customer.metadata},'/v1/payment_methods/pm_synthetic':{id:'pm_synthetic',object:'payment_method',livemode:false,customer:customer.id},'/v1/customers/cus_synthetic':call=>{if(call.method==='POST'){updated=true;assert.equal(call.body.get('invoice_settings[default_payment_method]'),'pm_synthetic');assert.equal(call.body.get('email'),intent.billing_contact.email)}return customer}}),{w,records,calls}=worker(t,{...op('verify_setup'),period_id:null,intent:{...intent,period_id:null}});await w.run(id);assert.equal(updated,true);assert.equal(records[0].type,'setup_verified');assert.equal(records[0].customer_email,intent.billing_contact.email);assert.equal(calls.filter(c=>c.name==='apply_corporate_invoice_evidence').length,0)
})
export { worker, op }
test('foreign email drift immediately before write blocks collection',async()=>{
 let reads=0;const t=transport({'/v1/customers/cus_synthetic':()=>({...customer,email:++reads>1?'former@example.test':customer.email}),'/v1/invoices/in_synthetic':{...invoice,status:'draft'},'/v1/invoices/in_synthetic/finalize':{...invoice,status:'open'}}),{w,records}=worker(t,op('finalize_invoice'));await w.run(id);assert.equal(t.calls.filter(c=>c.path.endsWith('/finalize')).length,0);assert.equal(records.at(-1).type,'requires_review')
})
test('structured invoice format without approved adapter blocks financial creation',async()=>{
 const t=transport({'/v1/invoices':{...invoice,status:'draft'},'/v1/invoices/in_synthetic':{...invoice,status:'draft'}}),{w,records}=worker(t,{...op('create_invoice'),intent:{...intent,invoice_ref:null,billing_profile:{...intent.billing_profile,invoice_format:'xml_original'}}});await w.run(id);assert.equal(t.calls.filter(c=>c.method==='POST').length,0);assert.equal(records.at(-1).type,'requires_review')
})
test('fresh failed collection performs one pay then same-invoice recovery, never another PaymentIntent',async()=>{
 let attempted=false,pays=0;const open=()=>({...invoice,status:'open',amount_paid:0,amount_remaining:49750,attempted,attempt_count:attempted?1:0,status_transitions:{paid_at:null}})
 const t=transport({'/v1/invoices/in_synthetic':open,'/v1/invoice_payments':{object:'list',has_more:false,data:[{...payment,status:'open',amount_paid:null}]},'/v1/payment_intents/pi_synthetic':{...pi,status:'requires_payment_method',amount_received:0,latest_charge:null},'/v1/invoices/in_synthetic/pay':call=>{pays++;attempted=true;assert.equal(call.body.get('off_session'),'true');assert.equal(call.body.has('payment_method'),false);return open()}})
 for(let i=0;i<2;i++){const {w,records}=worker(t,op('collect_invoice'));await w.run(id);assert.equal(records[0].type,'collection_observed');assert.equal(records[0].collection_state,'failed')}assert.equal(pays,1)
})
test('lost enable response with actual auto_advance true is recorded without another write',async()=>{
 const t=transport({'/v1/invoices/in_synthetic':{...invoice,status:'open',auto_advance:true,amount_paid:0,amount_remaining:49750,status_transitions:{paid_at:null}},'/v1/invoice_payments':{object:'list',has_more:false,data:[]}}),{w,records}=worker(t,op('enable_invoice_recovery'));await w.run(id);assert.equal(records[0].type,'provider_bound');assert.equal(t.calls.filter(c=>c.method==='POST').length,0)
})
test('timeout after draft creation replays same key without second invoice',async()=>{
 const keys=[],created=new Set();let first=true;const t=transport({'/v1/invoices':call=>{const key=call.headers['Idempotency-Key']||call.headers['idempotency-key'];keys.push(key);created.add(key);if(first){first=false;throw Error('controlled lost response')}return{...invoice,status:'draft'}},'/v1/invoices/in_synthetic':{...invoice,status:'draft'}}),operation={...op('create_invoice'),intent:{...intent,invoice_ref:null},provider_object_ref:null}
 const a=worker(t,operation);await a.w.run(id);assert.equal(a.records.at(-1).type,'retryable_failure');const b=worker(t,operation);await b.w.run(id);assert.equal(b.records.at(-1).type,'provider_bound');assert.equal(keys.length,2);assert.equal(created.size,1)
})
test('changed immutable authorization hash and lost lease after read stop provider writes',async()=>{
 for(const change of [{status:'conflict'},{status:'authorized',request_hash:'9'.repeat(64),intent}]){let auth=0;const t=transport({'/v1/invoices/in_synthetic':{...invoice,status:'draft'},'/v1/invoices/in_synthetic/finalize':{...invoice,status:'open'}}),{w}=worker(t,op('finalize_invoice'),{rpc:async name=>name==='authorize_corporate_billing_step'&&++auth>1?change:null});await w.run(id);assert.equal(t.calls.filter(c=>c.method==='POST').length,0)}
})
