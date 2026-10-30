import test from 'node:test'
import assert from 'node:assert/strict'
import { moduleAt, intent, invoice, transport, provider, id } from './helpers/corporate-recurring-fixtures.mjs'
const bytes = Buffer.from('%PDF-1.7\nSynthetic original provider invoice\n%%EOF')
test('bounded original document download refuses redirects, XML entity declarations, oversized and fake PDF', async()=>{
 const m=moduleAt('lib/corporate/recurring-documents.ts')
 for(const [body,format] of [['plain text','pdf_original'],['<?xml version="1.0"?><!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x/>','xml_original']]) assert.throws(()=>m.validateOriginal(Buffer.from(body),format))
 for(const response of [new Response(bytes,{status:302,headers:{location:'https://evil.test/a'}}),new Response(bytes,{headers:{'content-length':'4194305'}}),new Response(new Uint8Array(4194305))]) await assert.rejects(m.downloadOriginal('https://pay.stripe.com/invoice/file',async()=>response))
 const original=await m.downloadOriginal('https://pay.stripe.com/invoice/file',async()=>new Response(bytes));assert.equal(Buffer.compare(Buffer.from(original),bytes),0)
})
test('preserves provider bytes, custom metadata and no-upsert before narrow attachment RPC',async()=>{
 const m=moduleAt('lib/corporate/recurring-documents.ts'),calls=[]; const context={status:'ok',operation_id:id,period_id:intent.period_id,company_id:id,period_version:intent.expected_version,intent,documents:[],document_refs:[]}
 const rpc=async(name,args)=>{calls.push({name,args});return name==='attach_corporate_period_document'?{status:'attached'}:context}
 const storage={from:bucket=>({upload:async(path,value,options)=>{calls.push({bucket,path,value,options});return{error:null}}})}
 await m.attachProviderOriginal(context,provider(transport()),rpc,storage,async()=>new Response(bytes))
 assert.equal(calls[0].options.upsert,false);assert.equal(calls[0].bucket,'corporate-period-documents');assert.equal(Buffer.compare(Buffer.from(calls[0].value),bytes),0);assert.match(calls[0].options.metadata.sha256,/^[a-f0-9]{64}$/);assert.equal(calls[1].name,'attach_corporate_period_document');assert.equal(calls[1].args.p_expected_version,intent.expected_version)
})
test('completed invoice then later charge reference uses narrow context, current evidence and same operation',async()=>{
 const { CorporateReconciler }=moduleAt('lib/stripe/corporate-reconciliation.ts'),calls=[];const ctx={status:'ok',operation_id:id,period_id:intent.period_id,company_id:id,period_version:intent.expected_version,intent,documents:[{document_id:id,invoice_ref:invoice.id,format:'pdf_original'}],document_refs:[id]}
 const rpc=async(name,args)=>{calls.push({name,args});if(name==='get_corporate_reconciliation_context')return ctx;if(name==='apply_corporate_invoice_evidence')return{status:'payment_review'};throw Error(name)}
 const r=new CorporateReconciler(provider(transport()),rpc,null)
 const result=await r.reconcile('charge','ch_synthetic','evt_old_paid');assert.equal(result.status,'payment_review');assert.equal(calls[0].args.p_reference_kind,'charge');assert.equal(calls[0].args.p_reference,'ch_synthetic');assert.equal(calls.at(-1).args.p_operation_id,id);assert.equal(calls.at(-1).args.p_evidence.invoice_auto_advance,false)
})
test('UTF16 or nul-smuggled XML cannot bypass entity rejection',()=>{const {validateOriginal}=moduleAt('lib/corporate/recurring-documents.ts');assert.throws(()=>validateOriginal(Buffer.from('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x/>','utf16le'),'xml_original'))})
test('completed sync is revisited by actual current Refund and Dispute objects without a new claim',async()=>{
 const { CorporateReconciler }=moduleAt('lib/stripe/corporate-reconciliation.ts'),{charge,pi}=await import('./helpers/corporate-recurring-fixtures.mjs');let risk=false,disputed=false;const calls=[],evidences=[]
 const t=transport({'/v1/charges/ch_synthetic':()=>({...charge,amount_refunded:risk?100:0,disputed}),'/v1/refunds':()=>({object:'list',has_more:false,data:risk?[{id:'re_synthetic',charge:charge.id,amount:100,currency:'eur',status:'succeeded'}]:[]}),'/v1/disputes':()=>({object:'list',has_more:false,data:disputed?[{id:'dp_synthetic',charge:charge.id,livemode:false,amount:49750,currency:'eur',status:'needs_response'}]:[]}),'/v1/refunds/re_synthetic':{id:'re_synthetic',object:'refund',charge:charge.id,payment_intent:pi.id,amount:100,currency:'eur',status:'succeeded'},'/v1/disputes/dp_synthetic':{id:'dp_synthetic',object:'dispute',charge:charge.id,livemode:false}})
 const context={status:'ok',operation_id:id,operation_kind:'sync_payment',operation_state:'succeeded',company_id:id,period_id:intent.period_id,period_version:intent.expected_version,intent,documents:[{document_id:id,invoice_ref:invoice.id,format:'pdf_original'}],document_refs:[id]}
 const rpc=async(name,args)=>{calls.push({name,args});if(name==='get_corporate_reconciliation_context')return context;if(name==='apply_corporate_invoice_evidence'){evidences.push(args.p_evidence);return{status:'paid'}}throw Error('Unexpected RPC')}
 const r=new CorporateReconciler(provider(t),rpc,null);await r.reconcile('invoice',invoice.id,'evt_paid');risk=true;await r.webhook({id:'evt_refund',type:'charge.refund.updated',livemode:false,data:{object:{object:'refund',id:'re_synthetic',charge:'ch_untrusted_event'}}});disputed=true;await r.webhook({id:'evt_dispute',type:'charge.dispute.created',livemode:false,data:{object:{object:'dispute',id:'dp_synthetic'}}});assert.equal(evidences[0].payments[0].refunded_cents,0);assert.equal(evidences[1].payments[0].refunded_cents,100);assert.equal(evidences[2].payments[0].disputed,true);assert.ok(evidences.every(e=>e.operation_id===id));assert.ok(calls.filter(c=>c.name==='get_corporate_reconciliation_context').slice(1).every(c=>c.args.p_reference_kind==='charge'&&c.args.p_reference==='ch_synthetic'));assert.equal(calls.filter(c=>c.name.includes('claim')).length,0)
})
