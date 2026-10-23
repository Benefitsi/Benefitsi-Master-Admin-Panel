import type { SupabaseClient } from '@supabase/supabase-js'
import {isUuid} from '@/lib/corporate/companies'
import {isRecord,isTimestamp} from '@/lib/corporate/requests'
import {loadRecurringContract,loadInvoiceIndex,validDocument} from '@/lib/corporate/recurring'
import {recurringField,type RecurringMutation} from '@/lib/corporate/recurring-admin-mutations'
import {validateOriginal} from '@/lib/corporate/recurring-documents'
type Client=Pick<SupabaseClient,'rpc'|'storage'>
const invalid:RecurringMutation={status:'invalid'},failure:RecurringMutation={status:'error'}
export async function attachAdminPeriodDocument(client:Client,form:FormData):Promise<RecurringMutation>{
 const company=recurringField(form,'companyId'),periodId=recurringField(form,'periodId'),expected=recurringField(form,'expectedVersion'),id=recurringField(form,'documentId'),format=recurringField(form,'format'),invoice=recurringField(form,'invoiceRef'),account=recurringField(form,'providerAccountRef'),source=recurringField(form,'sourceRef'),file=form.get('invoice')
 if(!isUuid(company)||!isUuid(periodId)||!isUuid(id)||!isTimestamp(expected)||!['pdf_original','xml_original'].includes(String(format))||recurringField(form,'confirmed')!=='true'||![invoice,account,source].every(v=>typeof v==='string'&&v.trim().length>0&&v.length<=2000)||!file||typeof file==='string'||form.getAll('invoice').length!==1||file.size<1||file.size>4194304)return invalid
 let bytes:Uint8Array,sha256:string
 try{bytes=new Uint8Array(await file.arrayBuffer());sha256=validateOriginal(bytes,format!)}catch{return invalid}
 try{
  const state=await loadRecurringContract(client,company);const period=[state?.current_period,state?.next_period].find(p=>p?.period_id===periodId)
  if(!period)return {status:'unavailable'}
  const existing=period.invoice_documents.find(d=>d.document_id===id)
  if(!existing&&period.updated_at!==expected)return {status:'conflict'}
  const path=`${company}/${id}.${format==='xml_original'?'xml':'pdf'}`,bucket=client.storage.from('corporate-period-documents')
  if(existing&&(existing.sha256!==sha256||existing.storage_path!==path||existing.invoice_ref!==invoice||existing.source_ref!==source||existing.format!==format))return {status:'conflict'}
  // An unbound upload is deliberately unreadable to authenticated users.
  // The existing security-definer attachment RPC authoritatively checks the
  // same object's path, managed size/MIME, custom hash and invoice/profile.
  // An uncertain upload therefore retains exactly this evidence and identity.
  let uploadConfirmed=!!existing
  if(!existing){try{const uploaded=await bucket.upload(path,bytes,{contentType:format==='xml_original'?'application/xml':'application/pdf',upsert:false,metadata:{sha256},cacheControl:'0'});uploadConfirmed=!uploaded.error}catch{/* Reconcile the exact attempted object below; never overwrite. */}}
  const evidence={document_id:id,storage_path:path,sha256,size_bytes:bytes.byteLength,format,invoice_ref:invoice,provider_account_ref:account,environment:'test',source_ref:source,validation_evidence_ref:null}
  const {data,error}=await client.rpc('attach_corporate_period_document',{p_period_id:periodId,p_expected_version:expected,p_document_evidence:evidence})
  if(error||!isRecord(data))return failure
  if(data.status==='invalid')return uploadConfirmed?invalid:failure
  if(data.status==='conflict'||data.status==='unavailable')return {status:data.status}
  if(data.status!=='attached'||!validDocument(data.document,company,periodId)||data.document.document_id!==id||data.document.sha256!==sha256||!isTimestamp(data.updated_at)||typeof data.replayed!=='boolean')return failure
  return {status:'attached',receipt:{document:data.document,updated_at:data.updated_at,replayed:data.replayed}}
 }catch{return failure}
}
export async function readAdminPeriodDocument(client:Client,company:string,periodId:string,documentId:string,before:string|null):Promise<{url:string}|null>{
 if(!isUuid(periodId)||!isUuid(documentId))return null
 const index=await loadInvoiceIndex(client,company,before),document=index?.periods.find(p=>p.period_id===periodId)?.invoice_documents.find(d=>d.document_id===documentId)
 if(!document)return null
 try{const {data,error}=await client.storage.from('corporate-period-documents').createSignedUrl(document.storage_path,60,{download:true});return !error&&data?.signedUrl&&new URL(data.signedUrl).protocol==='https:'?{url:data.signedUrl}:null}catch{return null}
}
