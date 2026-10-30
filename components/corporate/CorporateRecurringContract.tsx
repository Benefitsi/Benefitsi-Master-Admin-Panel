"use client"
import {useRef,useState,useTransition,type ReactNode} from 'react'
import {recordCorporateExternalCancellation} from '@/app/companies/actions'
import {period,euro,entitlementStatusLabels} from '@/lib/corporate/companies'
import {savedJson,type ContractState,type Period} from '@/lib/corporate/recurring'
import {type RecurringMutation} from '@/lib/corporate/recurring-admin-mutations'
import {corporatePanelClass,corporateInputClass,corporateButtonClass} from '@/components/corporate/company-ui'
const feedback={idle:'',invalid:'Bitte Eingaben und tatsächliche Nachweise prüfen.',conflict:'Abweichende oder veraltete Angaben. Entwurf sichern und aktuelle Angaben neu laden.',unavailable:'Für das aktuelle Konto nicht verfügbar. Aktuelle Angaben neu laden.',error:'Antwort unklar. Unverändert erneut versuchen; dieselben Belege und IDs bleiben erhalten.',cancelled:'Kündigung erfasst.',received_pending_review:'Kündigung eingegangen · Prüfung erforderlich.',published:'Unveränderlich veröffentlicht.',attached:'Originalbeleg unveränderlich zugeordnet.'} as const
export function RecurringForm({title,action,companyId,children,fields={}}:{title:string;action:(form:FormData)=>Promise<RecurringMutation>;companyId:string;children:ReactNode;fields?:Record<string,string>}){
 const [draft,setDraft]=useState(()=>savedJson({draft:true,...fields,companyId})),[result,setResult]=useState<RecurringMutation>({status:'idle'}),[pending,start]=useTransition(),frozen=useRef<FormData|null>(null),busy=useRef(false)
 const complete=['cancelled','received_pending_review','published','attached'].includes(result.status),blocked=complete||result.status==='conflict'||result.status==='unavailable'
 return <form className="space-y-3 rounded-xl border p-4" aria-label={title} aria-busy={pending} onChange={event=>{const data=new FormData(event.currentTarget);setDraft(savedJson({draft:true,...fields,companyId,inputs:Object.fromEntries([...data].map(([k,v])=>[k,typeof v==='string'?v:{name:v.name,size:v.size,type:v.type}]))}))}} onSubmit={event=>{
  event.preventDefault();if(busy.current||blocked)return
  if(!frozen.current){const form=new FormData(event.currentTarget);for(const [k,v] of Object.entries(fields))form.set(k,v);form.set('companyId',companyId);frozen.current=form}
  const form=frozen.current;busy.current=true
  start(async()=>{try{const response=await action(form);setResult(response);if(response.status==='invalid')frozen.current=null}catch{setResult({status:'error'})}finally{busy.current=false}})
 }}>
  <h3 className="font-bold">{title}</h3>
  <fieldset disabled={pending||result.status==='error'||blocked} className="space-y-3">{children}</fieldset>
  <a className="block underline" download="corporate-unpublished-draft.json" href={draft}>Entwurf speichern</a>
  <button type="submit" className={corporateButtonClass} disabled={pending||blocked}>{pending?'Speichert …':result.status==='error'?'Unverändert erneut versuchen':title}</button>
  {result.status!=='idle'&&<p role={complete?'status':'alert'}>{feedback[result.status]}</p>}
  {result.receipt&&<a className="block underline" download="corporate-operation-receipt.json" href={savedJson(result.receipt)}>Ergebnisbeleg speichern</a>}
  {(blocked||complete)&&<a className="block underline" href={`/companies/${companyId}`}>Aktuelle Angaben neu laden</a>}
 </form>
}
export function EvidenceConfirmation(){return <label className="flex items-start gap-2 text-sm"><input name="confirmed" type="checkbox" value="true" required/><span>Aktuelle Adminrolle und tatsächliche Originalnachweise geprüft. Angaben ausdrücklich bestätigen.</span></label>}
export function RecurringInput({name,label,type='text',required=true}:{name:string;label:string;type?:string;required?:boolean}){return <label className="grid gap-1 text-sm">{label}<input translate="no" className={corporateInputClass} name={name} type={type} required={required}/></label>}
export function RecurringPeriod({value,title}:{value:Period;title:string}){return <article className="space-y-2 rounded-xl border p-4"><h3 className="font-bold">{title}</h3><p>{period(value.starts_on,value.ends_on)} · {euro(value.net_total_cents)} netto</p><p>Kapazität: <span translate="no">{value.capacity_seats}</span> · Zahlung: <span>{paymentLabels[value.payment_state]??value.payment_state}</span></p><p>{value.funding_confirmed?'Zahlung bestätigt':'Keine bezahlte Freigabe'} · {entitlementStatusLabels[value.access_status as keyof typeof entitlementStatusLabels]}</p><p>Zahlungszeitpunkt: <span translate="no">{value.paid_at??'—'}</span></p><p>Perioden-ID: <span translate="no">{value.period_id}</span></p></article>}
export const paymentLabels:Record<string,string>={unpaid:'Unbezahlt',pending:'Zahlung ausstehend',action_required:'Zahlungsaktion erforderlich',paid:'Bezahlt',failed:'Zahlung fehlgeschlagen',payment_review:'Zahlungsprüfung erforderlich'}
export function CorporateRecurringContract({state}:{state:ContractState}){
 const [requestId]=useState(()=>crypto.randomUUID()),[evidenceId]=useState(()=>crypto.randomUUID())
 return <section className={`${corporatePanelClass} space-y-4`}>
  <h2 className="text-xl font-black">Laufender Jahresvertrag</h2>
  <p>{state.contract?'Jährliche Verlängerung nach vereinbarten Bedingungen. Folgejahr erst nach vollständig bestätigter Zahlung.':'Keine wiederkehrende Vereinbarung angenommen. Einmalige ausdrückliche Annahme im Firmenportal erforderlich.'}</p>
  <p>Geprüfte Vertragsversion: <span translate="no">{state.version}</span></p>
  {state.contract&&<p>Vertragsstatus: <span>{state.contract.status==='recurring'?'Jährlich wiederkehrend':state.contract.status==='cancel_scheduled'?'Kündigung vorgemerkt':'Beendet'}</span> · {state.contract.review_required?'Prüfung erforderlich':'Keine Vertragsprüfung gemeldet'}</p>}
  {state.current_period?<RecurringPeriod value={state.current_period} title="Aktuelles Firmenjahr"/>:<p>Keine aktuelle Periode verfügbar.</p>}
  {state.next_period&&<RecurringPeriod value={state.next_period} title="Erzeugtes Folgejahr"/>}
  {state.next_preview&&<div className="rounded-xl border p-4"><h3 className="font-bold">Unverbindliche Vorschau</h3><p>{period(state.next_preview.starts_on,state.next_preview.ends_on)} · {state.next_preview.seats} Plätze · {euro(state.next_preview.total_amount_cents)} netto</p><p>Bezahlte Plätze einschließlich freier Plätze und aktivierter Zusatzplätze. Keine vorläufige Freigabe.</p></div>}
  {state.terms&&<details><summary className="cursor-pointer font-bold">{state.contract?'Angenommene Bedingungen':'Veröffentlichte Bedingungen zur Annahme'}</summary><p translate="no">{state.terms.terms_version} · {state.terms.terms_hash}</p><pre translate="no" className="whitespace-pre-wrap break-words" lang="de">{state.terms.de_text}</pre><pre translate="no" className="whitespace-pre-wrap break-words" lang="en">{state.terms.en_text}</pre><a download="corporate-terms.json" href={savedJson(state.terms)} className="underline">Bedingungen speichern</a></details>}
  {state.receipt_documents.map(receipt=><details key={receipt.document_id}><summary className="cursor-pointer">{receipt.kind==='acceptance_receipt'?'Annahmebeleg':'Kündigungsbeleg'}</summary><pre translate="no" className="whitespace-pre-wrap break-words">{JSON.stringify(receipt.content,null,2)}</pre><a download={`${receipt.kind}.json`} href={savedJson(receipt)} className="underline">Beleg speichern</a></details>)}
  {state.contract&&<details><summary className="cursor-pointer font-bold">Externe Kündigung erfassen</summary><p>Tatsächlichen Zugang anhand des archivierten Originals nachweisen. Erfassungszeit ist nicht Eingangszeit. Ende wird aus dem belegten Zugang zum frühesten zulässigen Termin ermittelt.</p><RecurringForm title="Externe Kündigung verbindlich erfassen" action={recordCorporateExternalCancellation} companyId={state.company_id} fields={{contractId:state.contract.contract_id,requestId,evidenceId}}>
   <RecurringInput name="receivedAt" label="Belegter Eingangszeitpunkt (ISO mit Zeitzone)"/><RecurringInput name="evidenceRef" label="Unveränderliche private Archivreferenz"/>
   <label className="grid gap-1 text-sm">Originalnachweis (höchstens 4 MiB)<input name="evidence" type="file" required/></label><p>Der Originalnachweis muss unter der angegebenen Archivreferenz bereits unveränderlich gesichert sein. Hier werden Byte-Hash und Referenz registriert.</p><EvidenceConfirmation/>
  </RecurringForm></details>}
 </section>
}
