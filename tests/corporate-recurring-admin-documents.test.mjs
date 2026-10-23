import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {loadTypescript} from './helpers/load-typescript.mjs'
const state=JSON.parse(readFileSync(new URL('./fixtures/corporate-recurring/current.json',import.meta.url))).paid
const archive=JSON.parse(readFileSync(new URL('./fixtures/corporate-recurring/invoice-periods.json',import.meta.url))).admin_all
const id='11111111-1111-4111-8111-111111111111'
const mod=()=>loadTypescript('lib/corporate/recurring-admin-documents.ts',{}, {TextDecoder,TextEncoder,Uint8Array})
function form(xml='<Invoice>opaque original</Invoice>') {const f=new FormData();for(const [k,v] of Object.entries({companyId:state.company_id,periodId:state.current_period.period_id,expectedVersion:state.current_period.updated_at,documentId:id,format:'xml_original',invoiceRef:'in_native',providerAccountRef:'acct_native',sourceRef:'private-original/42',confirmed:'true'}))f.set(k,v);f.set('invoice',new Blob([xml],{type:'application/xml'}),'invoice.xml');return f}
test('original XML stays opaque, exact hash/size/version and immutable private upload reach attachment',async()=>{
 const uploads=[],calls=[];const xml='<Invoice>opaque original</Invoice>',sha256=createHash('sha256').update(xml).digest('hex')
 const doc={document_id:id,company_id:state.company_id,period_id:state.current_period.period_id,bucket_id:'corporate-period-documents',storage_path:`${state.company_id}/${id}.xml`,sha256,size_bytes:Buffer.byteLength(xml),format:'xml_original',invoice_ref:'in_native',source_ref:'private-original/42',validation_evidence_ref:null,attached_at:state.version}
 const client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='get_corporate_contract'?state:{status:'attached',document:doc,updated_at:state.version,replayed:false},error:null}},storage:{from:bucket=>({upload:async(path,bytes,options)=>{uploads.push({bucket,path,bytes,options});return {error:null}}})}}
 assert.equal((await mod().attachAdminPeriodDocument(client,form(xml))).status,'attached')
 assert.equal(uploads[0].bucket,'corporate-period-documents');assert.equal(uploads[0].options.upsert,false);assert.equal(uploads[0].options.metadata.sha256,sha256)
 const args=calls.at(-1).args;assert.equal(args.p_expected_version,state.current_period.updated_at);assert.equal(args.p_document_evidence.sha256,sha256);assert.equal(args.p_document_evidence.format,'xml_original')
})
test('XML entities, oversized bytes, and false ZUGFeRD declaration never upload',async()=>{
 let network=0;const client={rpc:async()=>{network++;return {data:state,error:null}},storage:{from:()=>{network++;throw Error('no upload')}}}
 for(const xml of ['<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x>&x;</x>','x'.repeat(4194305)])assert.equal((await mod().attachAdminPeriodDocument(client,form(xml))).status,'invalid')
 const f=form();f.set('format','zugferd_original');assert.equal((await mod().attachAdminPeriodDocument(client,f)).status,'invalid');assert.equal(network,0)
})
test('archive download binds the actual period and immutable document before signing a private short-lived URL',async()=>{
 const doc=archive.periods[0].invoice_documents[0],calls=[]
 const client={rpc:async()=>({data:archive,error:null}),storage:{from:bucket=>({createSignedUrl:async(path,seconds,options)=>{calls.push({bucket,path,seconds,options});return {data:{signedUrl:'https://synthetic.example.test/private/document'},error:null}}})}}
 const result=await mod().readAdminPeriodDocument(client,archive.company_id,archive.periods[0].period_id,doc.document_id,null)
 assert.equal(result.url,'https://synthetic.example.test/private/document');assert.equal(calls[0].path,doc.storage_path);assert.equal(calls[0].seconds,60)
 assert.equal(await mod().readAdminPeriodDocument(client,archive.company_id,id,doc.document_id,null),null);assert.equal(calls.length,1)
})
test('uncertain upload with absent/mismatched stored metadata stays unconfirmed after exact authoritative attachment check',async()=>{
 const calls=[]
 const client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='get_corporate_contract'?state:{status:'invalid'},error:null}},storage:{from:()=>({upload:async(_path,_bytes,options)=>{assert.equal(options.upsert,false);return {error:{message:'lost upload response'}}},download:async()=>{throw Error('unbound download forbidden')}})}}
 assert.equal((await mod().attachAdminPeriodDocument(client,form())).status,'error');assert.deepEqual(calls.map(c=>c.name),['get_corporate_contract','attach_corporate_period_document'])
})
test('lost upload and attachment responses retry the same validated original through exact SQL evidence without unbound read',async()=>{
 const calls=[],uploads=[];let attachAttempts=0
 const client={rpc:async(name,args)=>{calls.push({name,args});if(name==='get_corporate_contract')return {data:state,error:null};if(attachAttempts++===0)throw Error('lost attach response');return {data:{status:'attached',document:{...args.p_document_evidence,period_id:state.current_period.period_id,company_id:state.company_id,bucket_id:'corporate-period-documents',attached_at:state.version},updated_at:state.version,replayed:true},error:null}},storage:{from:()=>({upload:async(path,bytes,options)=>{uploads.push({path,sha:createHash('sha256').update(bytes).digest('hex'),options});if(uploads.length===1)throw Error('lost upload response');return {error:{message:'already exists'}}},download:async()=>{throw Error('unbound download forbidden')}})}}
 const f=form();assert.equal((await mod().attachAdminPeriodDocument(client,f)).status,'error');assert.equal((await mod().attachAdminPeriodDocument(client,f)).status,'attached')
 assert.equal(uploads.length,2);assert.equal(JSON.stringify(uploads[0]),JSON.stringify(uploads[1]));assert.equal(uploads[0].options.upsert,false);assert.equal(JSON.stringify(calls[1].args),JSON.stringify(calls[3].args))
})
