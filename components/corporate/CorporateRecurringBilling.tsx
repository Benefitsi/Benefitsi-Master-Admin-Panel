"use client"
import {useState,useTransition} from 'react'
import {attachCorporatePeriodDocument,readCorporatePeriodDocument} from '@/app/companies/actions'
import type {ContractState,InvoiceIndex,PeriodDocument,Period} from '@/lib/corporate/recurring'
import {period,euro} from '@/lib/corporate/companies'
import {RecurringForm,RecurringInput,EvidenceConfirmation,paymentLabels} from '@/components/corporate/CorporateRecurringContract'
import {corporatePanelClass,corporateInputClass,corporateButtonClass} from '@/components/corporate/company-ui'
function Document({document,before}:{document:PeriodDocument;before:string|null}){
 const [url,setUrl]=useState<string|null>(null),[failed,setFailed]=useState(false),[pending,start]=useTransition()
 return <li className="space-y-2 border-t py-3"><p>Originalformat: <span translate="no">{document.format}</span> · <span translate="no">{document.size_bytes}</span> Bytes</p><p>Rechnung: <span translate="no">{document.invoice_ref}</span></p><p className="break-all" translate="no">{document.document_id}<br/>{document.sha256}<br/>{document.source_ref}</p>
 <button className={corporateButtonClass} disabled={pending} onClick={()=>{setUrl(null);setFailed(false);start(async()=>{try{const result=await readCorporatePeriodDocument(document.company_id,document.period_id,document.document_id,before);if(result)setUrl(result.url);else setFailed(true)}catch{setFailed(true)}})}}>{pending?'Lädt …':'Privates Original abrufen'}</button>
 {url&&<a className="ml-3 underline" href={url} target="_blank" rel="noopener noreferrer">Original herunterladen (60 Sekunden)</a>}{failed&&<p role="alert">Original derzeit nicht verfügbar. Bitte erneut prüfen.</p>}</li>
}
function Attachment({companyId,value}:{companyId:string;value:Period}){
 const [id]=useState(()=>crypto.randomUUID())
 return <details><summary className="cursor-pointer font-bold">Vorhandenes Original zuordnen · {period(value.starts_on,value.ends_on)}</summary><RecurringForm title="Original unveränderlich zuordnen" companyId={companyId} action={attachCorporatePeriodDocument} fields={{periodId:value.period_id,expectedVersion:value.updated_at,documentId:id}}>
 <p>Geprüfte Periodenversion: <span translate="no">{value.updated_at}</span></p><label className="grid gap-1">Tatsächliches Originalformat<select name="format" className={corporateInputClass}><option value="pdf_original">PDF Original</option><option value="xml_original">XML Original</option></select></label>
 <RecurringInput name="invoiceRef" label="Exakte gebundene Provider-Rechnungsreferenz"/><RecurringInput name="providerAccountRef" label="Tatsächlich gebundenes Testkonto"/><RecurringInput name="sourceRef" label="Nachweis der Originalherkunft"/>
 <label className="grid gap-1">Originaldatei (höchstens 4 MiB)<input type="file" name="invoice" accept="application/pdf,application/xml,text/xml,.pdf,.xml" required/></label><EvidenceConfirmation/>
 </RecurringForm></details>
}
export function CorporateRecurringBilling({state,index,before}:{state:ContractState;index:InvoiceIndex|null;before:string|null}){
 return <section className={`${corporatePanelClass} space-y-4`}><h2 className="text-xl font-black">Periodenrechnungen</h2><p>Private unveränderliche Originale. XML wird nur heruntergeladen, nicht ausgeführt. Keine Zertifizierung als EN16931 oder ZUGFeRD durch diesen Upload.</p>
 {!index?<p role="alert">Rechnungsarchiv konnte nicht bestätigt werden. Aktuelle Angaben neu laden.</p>:<>
 {index.periods.length===0&&<p>Keine Originalrechnungen auf dieser Archivseite.</p>}
 {index.periods.map(p=><article key={p.period_id} className="rounded-xl border p-4"><h3 className="font-bold">{period(p.starts_on,p.ends_on)} · {euro(p.net_total_cents)} netto</h3><p>{paymentLabels[p.payment_state]??p.payment_state} · <span translate="no">{p.period_id}</span></p><ul>{p.invoice_documents.map(d=><Document key={d.document_id} document={d} before={before}/>)}</ul></article>)}
 {index.next_before_starts_on&&<a className="block underline" href={`/companies/${state.company_id}?invoiceBefore=${index.next_before_starts_on}`}>Ältere Rechnungsperioden</a>}{before&&<a className="block underline" href={`/companies/${state.company_id}`}>Neueste Rechnungsperioden</a>}
 </>}
 {[state.current_period,state.next_period].filter((v):v is Period=>v!==null).map(p=><Attachment key={p.period_id} companyId={state.company_id} value={p}/>)}
 </section>
}
