import {isDate,isUuid,type CorporateCompany,type CorporateClient} from '@/lib/corporate/companies'
import {isTimestamp,isRecord as record} from '@/lib/corporate/requests'
export type Recipient = { legal_name:string; address_line1:string; address_line2:string|null; postal_code:string; city:string; country:string; tax_id:null|{type:string;value:string}; confirmed:true };
export type BillingQuote = {currency:'EUR';net_total_cents:number;tax_total_cents:number;gross_total_cents:number;tax_mode:string;tax_basis_points:number;tax_country:'DE'};
export type PeriodDocument = {document_id:string;company_id:string;period_id:string;bucket_id:'corporate-period-documents';storage_path:string;sha256:string;size_bytes:number;format:'pdf_original'|'xml_original'|'zugferd_original';invoice_ref:string;source_ref:string;validation_evidence_ref:string|null;attached_at:string};
export type InvoicePeriod = {period_id:string;contract_id:string;source_kind:string;starts_on:string;ends_on:string;net_total_cents:number;currency:'EUR';payment_state:string;invoice_documents:PeriodDocument[]};
export type Period = InvoicePeriod & {company_id:string;seats:number;unit_amount_cents:number;total_amount_cents:number;capacity_seats:number;available_seats:number;employee_count:number;reserved_count:number;funding_confirmed:boolean;access_status:string;updated_at:string;paid_at:string|null};
export type Terms = {terms_version:string;terms_hash:string;de_text:string;en_text:string;profile_id:string;published_at:string};
export type RecurringContract = {contract_id:string;status:'recurring'|'cancel_scheduled'|'ended';terms_version:string;terms_hash:string;accepted_at:string;effective_end:string|null;cancellation_received_at:string|null;version:string;receipt_id:string;review_required?:boolean};
export type Preview = {starts_on:string;ends_on:string;seats:number;unit_amount_cents:number;total_amount_cents:number;currency:'EUR';binding:false;billing_quote:BillingQuote};
export type ContractState = {status:'ok';company_id:string;version:string;contract:RecurringContract|null;current_period:Period|null;next_period:Period|null;next_preview:Preview|null;original_agreement:CorporateCompany;terms:Terms|null;offer_hash:string|null;billing_quote:BillingQuote|null;billing_recipient:(Recipient & {recipient_id:string;recipient_version:number;recipient_hash:string;confirmed_at:string})|null;payment_setup:{state:string;setup_request_id:string|null;updated_at:string|null};readiness:{environment:'test';checkout_enabled:boolean;reason:string|null};receipt_documents:{document_id:string;kind:string;created_at:string;content:Record<string,unknown>}[];payment_contact_email?:string|null};
export type InvoiceIndex = {status:'ok';company_id:string;periods:InvoicePeriod[];next_before_starts_on:string|null};
export const hash = (v:unknown):v is string => typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
const amount=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const text=(v:unknown):v is string=>typeof v==='string';
export function validDocument(v:unknown,companyId:string,periodId:string):v is PeriodDocument {
 if(!record(v)||v.company_id!==companyId||v.period_id!==periodId||!isUuid(v.document_id)||v.bucket_id!=='corporate-period-documents'||!hash(v.sha256)||!amount(v.size_bytes)||v.size_bytes<1||v.size_bytes>4194304||!['pdf_original','xml_original','zugferd_original'].includes(String(v.format))||!isTimestamp(v.attached_at)||!text(v.invoice_ref)||!v.invoice_ref||!text(v.source_ref)||(v.validation_evidence_ref!==null&&!text(v.validation_evidence_ref)))return false;
 return v.storage_path===`${companyId}/${v.document_id}.${v.format==='xml_original'?'xml':'pdf'}`;
}
export function validInvoicePeriod(v:unknown,companyId:string):v is InvoicePeriod {
 return record(v)&&isUuid(v.period_id)&&isUuid(v.contract_id)&&['original','renewal'].includes(String(v.source_kind))&&isDate(v.starts_on)&&isDate(v.ends_on)&&v.starts_on<v.ends_on&&amount(v.net_total_cents)&&v.currency==='EUR'&&['unpaid','pending','action_required','paid','failed','payment_review'].includes(String(v.payment_state))&&Array.isArray(v.invoice_documents)&&v.invoice_documents.every(d=>validDocument(d,companyId,v.period_id as string));
}
export function parseInvoiceIndex(v:unknown,companyId:string):InvoiceIndex|null {
 return record(v)&&v.status==='ok'&&v.company_id===companyId&&Array.isArray(v.periods)&&v.periods.length<=50&&v.periods.every(p=>validInvoicePeriod(p,companyId))&&(v.next_before_starts_on===null||isDate(v.next_before_starts_on))?v as InvoiceIndex:null;
}
function validPeriod(v:unknown,companyId:string):v is Period {
 return record(v)&&v.company_id===companyId&&['seats','unit_amount_cents','total_amount_cents','capacity_seats','available_seats','employee_count','reserved_count'].every(k=>amount(v[k]))&&typeof v.funding_confirmed==='boolean'&&['not_enabled','scheduled','active','suspended','expired'].includes(String(v.access_status))&&isTimestamp(v.updated_at)&&validInvoicePeriod(v,companyId);
}
export function parseContract(v:unknown,companyId:string):ContractState|null {
 if(!record(v)||v.status!=='ok'||v.company_id!==companyId||!isTimestamp(v.version)||!record(v.original_agreement)||v.original_agreement.company_id!==companyId||!text(v.original_agreement.company_name)||!text(v.original_agreement.city)||!isDate(v.original_agreement.starts_on)||!isDate(v.original_agreement.ends_on)||!amount(v.original_agreement.total_amount_cents)||!record(v.readiness)||typeof v.readiness.checkout_enabled!=='boolean'||!record(v.payment_setup)||!text(v.payment_setup.state))return null;
 if(v.contract!==null&&(!record(v.contract)||!isUuid(v.contract.contract_id)||!isTimestamp(v.contract.version)||!['recurring','cancel_scheduled','ended'].includes(String(v.contract.status))))return null;
 if([v.current_period,v.next_period].some(p=>p!==null&&!validPeriod(p,companyId)))return null;
 if(v.terms!==null&&(!record(v.terms)||!text(v.terms.de_text)||!text(v.terms.en_text)||!text(v.terms.terms_version)||!hash(v.terms.terms_hash)))return null;
 if(v.offer_hash!==null&&!hash(v.offer_hash))return null;
 if(v.next_preview!==null&&(!record(v.next_preview)||!isDate(v.next_preview.starts_on)||!isDate(v.next_preview.ends_on)||!amount(v.next_preview.seats)||!amount(v.next_preview.total_amount_cents)||!amount(v.next_preview.unit_amount_cents)||v.next_preview.binding!==false))return null;
 if(!Array.isArray(v.receipt_documents)||!v.receipt_documents.every(r=>record(r)&&isUuid(r.document_id)&&['acceptance_receipt','cancellation_receipt'].includes(String(r.kind))&&isTimestamp(r.created_at)&&record(r.content)))return null;
 if(v.billing_recipient!==null&&(!record(v.billing_recipient)||!hash(v.billing_recipient.recipient_hash)||!isUuid(v.billing_recipient.recipient_id)||!validRecipient(v.billing_recipient,false)))return null;
 if(v.contract && [v.current_period,v.next_period].some(p=>p && (p as Period).contract_id!==(v.contract as RecurringContract).contract_id))return null;
 return {...v,payment_setup:{state:v.payment_setup.state,setup_request_id:v.payment_setup.setup_request_id??null,updated_at:v.payment_setup.updated_at??null}} as ContractState;
}
export function validRecipient(v:unknown,exact=true):v is Recipient {
 if(!record(v))return false;
 const keys=['legal_name','address_line1','address_line2','postal_code','city','country','tax_id','confirmed'];
 if(exact&&(Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k))))return false;
 const clean=(s:unknown,max:number)=>typeof s==='string'&&s===s.trim()&&s.length>0&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
 return clean(v.legal_name,200)&&clean(v.address_line1,200)&&(v.address_line2===null||clean(v.address_line2,200))&&clean(v.city,100)&&clean(v.country,2)&&typeof v.postal_code==='string'&&/^\d{5}$/.test(v.postal_code)&&v.confirmed===true&&(v.tax_id===null||(record(v.tax_id)&&Object.keys(v.tax_id).length===2&&clean(v.tax_id.type,40)&&clean(v.tax_id.value,100)));
}
export const savedJson=(value:unknown)=>`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(value,null,2))}`;

export async function loadRecurringContract(client:CorporateClient,companyId:string):Promise<ContractState|null>{
 if(!isUuid(companyId))return null
 try{const {data,error}=await client.rpc('get_corporate_contract',{p_company_id:companyId});return error?null:parseContract(data,companyId)}catch{return null}
}
export async function loadInvoiceIndex(client:CorporateClient,companyId:string,before:string|null=null):Promise<InvoiceIndex|null>{
 if(!isUuid(companyId)||(before!==null&&!isDate(before)))return null
 try{const {data,error}=await client.rpc('list_corporate_invoice_periods',{p_company_id:companyId,p_before_starts_on:before,p_limit:20});return error?null:parseInvoiceIndex(data,companyId)}catch{return null}
}

export const operationStates=['pending','processing','awaiting_setup','succeeded','retry_wait','review_required','cancelled'] as const
export type OperationState=typeof operationStates[number]
export type AdminOperation={operation_id:string;contract_id:string;period_id:string|null;kind:string;state:OperationState;attempts:number;next_attempt_at:string;lease_expires_at:string|null;created_at:string;updated_at:string}
export type AdminOperations={status:'ok';company_id:string;snapshot_at:string;operations:AdminOperation[];has_more:boolean;counts:{total:number;due:number;review_required:number;by_state:Record<OperationState,number>}}
export function parseAdminOperations(value:unknown,companyId:string):AdminOperations|null{
 if(!record(value)||value.status!=='ok'||value.company_id!==companyId||!isTimestamp(value.snapshot_at)||!Array.isArray(value.operations)||value.operations.length>20||typeof value.has_more!=='boolean'||!record(value.counts)||!record(value.counts.by_state))return null
 const counts=value.counts,byState=value.counts.by_state
 if(!['total','due','review_required'].every(k=>amount(counts[k]))||!operationStates.every(k=>amount(byState[k]))||operationStates.reduce((sum,k)=>sum+Number(byState[k]),0)!==counts.total||counts.review_required!==byState.review_required||Number(counts.due)>Number(counts.total)||Number(counts.total)<value.operations.length||value.has_more!==(Number(counts.total)>value.operations.length))return null
 const operations:AdminOperation[]=[]
 for(const v of value.operations){
  if(!record(v)||!isUuid(v.operation_id)||!isUuid(v.contract_id)||(v.period_id!==null&&!isUuid(v.period_id))||!['setup_customer','setup_session','verify_setup','create_invoice','finalize_invoice','collect_invoice','sync_payment','enable_invoice_recovery','pause_invoice_recovery','cancel_invoice'].includes(String(v.kind))||!operationStates.includes(v.state as OperationState)||!amount(v.attempts)||!(isTimestamp(v.next_attempt_at)||v.next_attempt_at==='infinity'||v.next_attempt_at==='-infinity')||(v.lease_expires_at!==null&&!isTimestamp(v.lease_expires_at))||!isTimestamp(v.created_at)||!isTimestamp(v.updated_at))return null
  operations.push({operation_id:v.operation_id,contract_id:v.contract_id,period_id:v.period_id as string|null,kind:String(v.kind),state:v.state as OperationState,attempts:v.attempts,next_attempt_at:String(v.next_attempt_at),lease_expires_at:v.lease_expires_at as string|null,created_at:v.created_at,updated_at:v.updated_at})
 }
 if(new Set(operations.map(o=>o.operation_id)).size!==operations.length)return null
 return {status:'ok',company_id:companyId,snapshot_at:value.snapshot_at,operations,has_more:value.has_more,counts:{total:Number(counts.total),due:Number(counts.due),review_required:Number(counts.review_required),by_state:Object.fromEntries(operationStates.map(k=>[k,byState[k]])) as Record<OperationState,number>}}
}
export async function loadAdminOperations(client:CorporateClient,companyId:string):Promise<AdminOperations|null>{
 if(!isUuid(companyId))return null
 try{const {data,error}=await client.rpc('admin_get_corporate_billing_operations',{p_company_id:companyId,p_limit:20});return error?null:parseAdminOperations(data,companyId)}catch{return null}
}
