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

const revisedIntent = { ...intent, recipient_id: '44444444-4444-4444-8444-444444444444', recipient_hash: '6'.repeat(64), recipient_snapshot: { ...intent.recipient_snapshot, legal_name: 'Revised Synthetic Employer', address_line1: 'New Street 42', address_line2: 'Office 2', postal_code: '10117' } }
const setupOperation = kind => ({ ...op(kind), period_id: null, provider_object_ref: null, intent: { ...revisedIntent, period_id: null, invoice_ref: null } })
const completedSetup = {
 '/v1/checkout/sessions/cs_test_synthetic': { id: 'cs_test_synthetic', object: 'checkout.session', livemode: false, mode: 'setup', customer: customer.id, status: 'complete', setup_intent: 'seti_synthetic', metadata: customer.metadata },
 '/v1/setup_intents/seti_synthetic': { id: 'seti_synthetic', object: 'setup_intent', livemode: false, customer: customer.id, status: 'succeeded', usage: 'off_session', payment_method: 'pm_synthetic', metadata: customer.metadata },
 '/v1/payment_methods/pm_synthetic': { id: 'pm_synthetic', object: 'payment_method', livemode: false, customer: customer.id },
}
for (const kind of ['setup_session', 'verify_setup']) test(`recipient revision repairs existing Customer during ${kind}, allows future invoice and preserves finalized history`, async () => {
 let current = structuredClone(customer), draft = null, hasLine = false, admissions = 0, admissionsAtCustomerRead = 0
 const historical = structuredClone(invoice)
 const t = transport({ ...completedSetup,
  '/v1/customers/cus_synthetic': call => {
   if (call.method === 'POST') {
    assert.ok(admissions > admissionsAtCustomerRead, 'fresh admission after Customer read')
    if (call.body.has('name')) {
     assert.equal(call.body.get('name'), 'Revised Synthetic Employer'); assert.equal(call.body.get('address[line1]'), 'New Street 42'); assert.equal(call.body.get('address[line2]'), 'Office 2'); assert.equal(call.body.get('address[postal_code]'), '10117'); assert.equal(call.body.get('address[city]'), 'Berlin'); assert.equal(call.body.get('address[country]'), 'DE'); assert.equal(call.body.get('email'), 'owner@example.test')
     current = { ...current, name: call.body.get('name'), address: { ...current.address, line1: call.body.get('address[line1]'), line2: call.body.get('address[line2]'), postal_code: call.body.get('address[postal_code]') } }
    }
   } else admissionsAtCustomerRead = admissions
   return current
  },
  '/v1/checkout/sessions': call => {
   assert.equal(call.body.has('customer_update[address]'), false); assert.equal(call.body.has('customer_update[name]'), false)
   return { id: 'cs_test_synthetic', object: 'checkout.session', livemode: false, mode: 'setup', status: 'open', customer: customer.id, expires_at: now / 1000 + 3600, metadata: customer.metadata, url: 'https://checkout.stripe.com/c/pay/test' }
  },
  '/v1/invoices': call => {
   if (call.method === 'GET') { assert.equal(call.query.get('customer'), customer.id); assert.equal(call.query.get('status'), 'draft'); return { object: 'list', has_more: false, data: [] } }
   draft = { ...invoice, id: 'in_future', status: 'draft', customer_name: current.name, customer_address: structuredClone(current.address), metadata: { ...invoice.metadata, recipient_hash: revisedIntent.recipient_hash }, amount_paid: 0, amount_remaining: 49750, attempted: false, attempt_count: 0, status_transitions: { paid_at: null } }; return draft
  },
  '/v1/invoices/in_future': () => draft,
  '/v1/invoices/in_future/lines': () => ({ object: 'list', has_more: false, data: hasLine ? [{ ...line, invoice: 'in_future', metadata: { ...line.metadata, recipient_hash: revisedIntent.recipient_hash } }] : [] }),
  '/v1/invoiceitems': () => { hasLine = true; return { id: 'ii_future', object: 'invoiceitem' } },
  '/v1/invoices/in_synthetic': historical,
 })
 const rpc = async name => { if (name === 'authorize_corporate_billing_step') admissions++; return null }
 const setup = worker(t, setupOperation(kind), { rpc }); await setup.w.run(id)
 assert.equal(setup.records.at(-1).type, kind === 'verify_setup' ? 'setup_verified' : 'provider_bound')
 assert.equal(current.name, 'Revised Synthetic Employer'); assert.equal(current.address.line1, 'New Street 42')
 // The same fixture is read through the real validator, including original metadata and address.
 const old = await provider(t).invoice(intent); assert.deepEqual(old.invoice, historical)
 const future = worker(t, { ...op('create_invoice'), intent: { ...revisedIntent, invoice_ref: null }, provider_object_ref: null }, { rpc }); await future.w.run(id)
 assert.equal(future.records.at(-1).type, 'provider_bound'); assert.equal(future.records.at(-1).object_ref, 'in_future')
 assert.equal(draft.customer_address.line1, 'New Street 42')
 assert.equal(t.calls.filter(c => c.path === '/v1/invoices/in_synthetic' && c.method !== 'GET').length, 0)
 assert.deepEqual((await provider(t).invoice(intent)).invoice, historical)
})
test('recipient synchronization rejects revoked/stale admission and foreign Customer binding before any write', async () => {
 for (const mode of ['revoked', 'stale', 'foreign']) {
  let admissions = 0
  const operation = setupOperation('setup_session')
  const t = transport({ '/v1/customers/cus_synthetic': { ...customer, metadata: mode === 'foreign' ? { ...customer.metadata, company_id: 'foreign' } : customer.metadata }, '/v1/invoices': { object: 'list', has_more: false, data: [] } })
  const { w, records } = worker(t, operation, { rpc: async name => {
   if (name === 'authorize_corporate_billing_step' && ++admissions > 1) return mode === 'revoked' ? { status: 'review_required' } : mode === 'stale' ? { status: 'authorized', request_hash: '8'.repeat(64), intent: operation.intent } : null
   return null
  } })
  const result = await w.run(id)
  assert.equal(t.calls.filter(c => c.method === 'POST').length, 0)
  if (mode === 'revoked') assert.equal(result.status, 'review_required'); else assert.equal(records.at(-1).type, 'requires_review')
 }
})
test('recipient synchronization requires actual readback before Checkout and keeps bound stale draft in review', async () => {
 for (const mode of ['readback_drift', 'stale_draft']) {
  const draft = { ...invoice, status: 'draft' }
  const t = transport({ '/v1/invoices': { object: 'list', has_more: false, data: mode === 'stale_draft' ? [draft] : [] } })
  const { w, records } = worker(t, setupOperation('setup_session')); await w.run(id)
  assert.equal(records.at(-1).type, 'requires_review'); assert.equal(t.calls.filter(c => c.path === '/v1/checkout/sessions').length, 0)
  assert.equal(t.calls.filter(c => c.method === 'POST').length, mode === 'stale_draft' ? 0 : 1)
  assert.equal(draft.customer_address.line1, 'Example 1')
 }
})
test('recipient synchronization fails closed on incomplete draft lookup and stale bound financial intent', async () => {
 for (const data of [[], [{ ...invoice, status: 'draft' }]]) {
  const t = transport({ '/v1/invoices': { object: 'list', has_more: true, data } })
  const { w, records } = worker(t, setupOperation('setup_session')); await w.run(id)
  assert.equal(records.at(-1).type, 'requires_review'); assert.equal(t.calls.filter(c => c.method === 'POST').length, 0)
 }
 const t = transport({ '/v1/invoices/in_synthetic': { ...invoice, status: 'draft' } })
 const { w, records } = worker(t, { ...op('finalize_invoice'), intent: revisedIntent }); await w.run(id)
 assert.equal(records.at(-1).type, 'requires_review'); assert.equal(t.calls.filter(c => c.method === 'POST').length, 0)
})
