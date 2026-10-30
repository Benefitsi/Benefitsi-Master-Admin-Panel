import { createHash } from 'node:crypto'
import {isUuid,isDate,type CorporateClient} from '@/lib/corporate/companies'
import {isRecord,isTimestamp} from '@/lib/corporate/requests'
import {loadRecurringContract,hash} from '@/lib/corporate/recurring'
export type RecurringMutation={status:'idle'|'invalid'|'unavailable'|'conflict'|'error'|'cancelled'|'received_pending_review'|'published'|'attached';receipt?:Record<string,unknown>}
export const recurringInitial:RecurringMutation={status:'idle'}
const invalid:RecurringMutation={status:'invalid'},failure:RecurringMutation={status:'error'}
export function recurringField(form:FormData,key:string){const v=form.get(key);return form.getAll(key).length===1&&typeof v==='string'?v:null}
function exactTimestamp(value:string){
 const match=/^(.*?)(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
 if(!match)return null
 const whole=Date.parse(`${match[1]}${match[3]}`)
 return Number.isFinite(whole)?BigInt(whole)*BigInt(1000)+BigInt((match[2]??'').padEnd(6,'0')):null
}
const nonempty=(v:unknown,max=2000):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)
function rejected(v:unknown):RecurringMutation{return v==='invalid'||v==='conflict'||v==='unavailable'?{status:v}:failure}
async function call(client:CorporateClient,name:string,args:Record<string,unknown>){const {data,error}=await client.rpc(name,args);return !error&&isRecord(data)?data:null}
export async function recordExternalCancellation(client:CorporateClient,form:FormData):Promise<RecurringMutation>{
 const companyId=recurringField(form,'companyId'),contractId=recurringField(form,'contractId'),requestId=recurringField(form,'requestId'),evidenceId=recurringField(form,'evidenceId'),receivedAt=recurringField(form,'receivedAt'),evidenceRef=recurringField(form,'evidenceRef'),file=form.get('evidence')
 if(!isUuid(companyId)||!isUuid(contractId)||!isUuid(requestId)||!isUuid(evidenceId)||!isTimestamp(receivedAt)||exactTimestamp(receivedAt)===null||Date.parse(receivedAt)>Date.now()||!nonempty(evidenceRef)||recurringField(form,'confirmed')!=='true'||form.getAll('evidence').length!==1||!file||typeof file==='string'||file.size<1||file.size>4194304)return invalid
 try{
  const state=await loadRecurringContract(client,companyId)
  if(!state||state.contract?.contract_id!==contractId)return {status:'unavailable'}
  const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.byteLength!==file.size)return invalid
  const sha256=createHash('sha256').update(bytes).digest('hex')
  const registered=await call(client,'admin_register_corporate_cancellation_evidence',{p_evidence_id:evidenceId,p_contract_id:contractId,p_received_at:receivedAt,p_evidence_ref:evidenceRef,p_sha256:sha256})
  if(registered?.status!=='recorded')return rejected(registered?.status)
  if(registered.evidence_id!==evidenceId||typeof registered.replayed!=='boolean')return failure
  const result=await call(client,'record_corporate_external_cancellation',{p_request_id:requestId,p_contract_id:contractId,p_evidence_id:evidenceId,p_received_at:receivedAt,p_requested_end:null})
  if(result?.status!=='cancelled'&&result?.status!=='received_pending_review')return rejected(result?.status)
  if(result.receipt_id!==requestId||!isTimestamp(result.received_at)||exactTimestamp(result.received_at)!==exactTimestamp(receivedAt)||!isTimestamp(result.version)||!isDate(result.effective_end)||typeof result.replayed!=='boolean')return failure
  return {status:result.status,receipt:result}
 }catch{return failure}
}
export async function publishRecurringTerms(client:CorporateClient,form:FormData):Promise<RecurringMutation>{
 const version=recurringField(form,'termsVersion'),profileId=recurringField(form,'profileId'),de=recurringField(form,'deText'),en=recurringField(form,'enText'),evidence=recurringField(form,'approvalEvidenceRef')
 if(!nonempty(version,100)||!isUuid(profileId)||!nonempty(evidence)||recurringField(form,'confirmed')!=='true'||![de,en].every(v=>typeof v==='string'&&Buffer.byteLength(v,'utf8')>=100&&Buffer.byteLength(v,'utf8')<=100000))return invalid
 try{const result=await call(client,'admin_publish_corporate_terms',{p_terms_version:version,p_profile_id:profileId,p_de_text:de,p_en_text:en,p_approval_evidence_ref:evidence});if(result?.status!=='published')return rejected(result?.status);return result.terms_version===version&&hash(result.terms_hash)&&typeof result.replayed==='boolean'?{status:'published',receipt:result}:failure}catch{return failure}
}
export async function publishRecurringProfile(client:CorporateClient,form:FormData):Promise<RecurringMutation>{
 const profileId=recurringField(form,'profileId'),raw=recurringField(form,'profile')
 if(!isUuid(profileId)||!raw||Buffer.byteLength(raw,'utf8')>16384||recurringField(form,'confirmed')!=='true')return invalid
 let p:unknown
 try{p=JSON.parse(raw)}catch{return invalid}
 try{
  if(!isRecord(p)||p.environment!=='test'||p.released!==true||p.tax_country!=='DE'||!Number.isInteger(p.tax_basis_points)||!['pdf_original','xml_original','zugferd_original'].includes(String(p.invoice_format))||!['provider_account_ref','billing_identity_ref','tax_profile_ref','operator_name','operator_address','operator_email','invoice_format_evidence_ref','release_evidence_ref','return_origin'].every(k=>nonempty(p[k])))return invalid
  if(p.tax_mode==='explicit_rate'?(Number(p.tax_basis_points)<1||Number(p.tax_basis_points)>10000||!/^txr_[A-Za-z0-9]+$/.test(String(p.tax_profile_ref))):p.tax_mode!=='explicit_exempt'||p.tax_basis_points!==0)return invalid
  const origin=new URL(String(p.return_origin));if(origin.protocol!=='https:'||origin.origin!==p.return_origin)return invalid
  const result=await call(client,'admin_publish_corporate_billing_profile',{p_profile_id:profileId,p_profile:p});if(result?.status!=='published')return rejected(result?.status);return result.profile_id===profileId&&typeof result.replayed==='boolean'?{status:'published',receipt:result}:failure
 }catch{return failure}
}
