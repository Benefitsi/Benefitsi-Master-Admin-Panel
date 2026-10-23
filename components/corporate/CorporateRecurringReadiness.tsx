"use client"
import {useState} from 'react'
import {publishCorporateRecurringProfile,publishCorporateRecurringTerms} from '@/app/companies/actions'
import type {ContractState,AdminOperations} from '@/lib/corporate/recurring'
import {RecurringForm,RecurringInput,EvidenceConfirmation} from '@/components/corporate/CorporateRecurringContract'
import {corporateInputClass,corporatePanelClass} from '@/components/corporate/company-ui'
type Runtime={environment:'test';configured:boolean;reason:string|null;live_enabled:false}
export function CorporateRecurringReadiness({state,runtime,operations=null}:{state:ContractState;runtime:Runtime;operations?:AdminOperations|null}){
 const [profileId]=useState(()=>crypto.randomUUID())
 return <section className={`${corporatePanelClass} space-y-4`}><h2 className="text-xl font-black">Abrechnungsbereitschaft</h2>
 <p>{runtime.configured?'Testlaufzeit konfiguriert':'Testlaufzeit nicht konfiguriert'} · <span translate="no">{runtime.reason??'—'}</span></p>
 <p>Zahlungsautorisierung: <span>{setupLabels[state.payment_setup.state]??'Status unbekannt'}</span></p>
 <p>{state.readiness.checkout_enabled?'Vertragskonfiguration vorhanden':'Vertragskonfiguration unvollständig'} · <span translate="no">{state.readiness.reason??'—'}</span></p>
 <p>Keine operative Freigabe. Konfiguration und Referenzen belegen weder Rechtsprüfung noch echte Provider-Einstellungen, zugestellte Pflichtmitteilungen oder E-Rechnungskonformität.</p>
 <p>{state.terms?'Veröffentlichte Bedingungen vorhanden. Annahmen behalten ihre damalige Profil- und Textversion.':'Keine veröffentlichten Bedingungen vorhanden.'}</p>
 <p>Aussteller, Steuerbasis, Rechnungsempfänger und Originalformat müssen tatsächlich geprüft sein. XML- und ZUGFeRD-Erzeugung benötigt einen freigegebenen strukturierten Adapter; ein PDF ist kein solcher Nachweis.</p>
 {state.billing_recipient&&<details><summary>Gebundener Rechnungsempfänger</summary><pre translate="no" className="whitespace-pre-wrap break-words">{JSON.stringify(state.billing_recipient,null,2)}</pre></details>}
 {state.billing_quote&&<details><summary>Gebundene Steuer- und Betragsdaten</summary><pre translate="no">{JSON.stringify(state.billing_quote,null,2)}</pre></details>}
 <section className="space-y-3"><h3 className="font-bold">Abrechnungsvorgänge</h3>
 <p>Keine Aussage über Worker-Betrieb. Zeitlich fällig bedeutet noch keine Berechtigung zur Ausführung. Unklare Provider-Ergebnisse verlangen tatsächliche Evidenz und Prüfung.</p>
 {!operations?<p>Vorgangsstatus nicht verfügbar.</p>:<><p>Abfragestand: <span translate="no">{operations.snapshot_at}</span></p><dl><dt>Zeitlich fällig</dt><dd>{operations.counts.due}</dd><dt>Prüfung erforderlich</dt><dd>{operations.counts.review_required}</dd><dt>Wartet auf Zahlungsautorisierung</dt><dd>{operations.counts.by_state.awaiting_setup}</dd><dt>Gesamtzahl</dt><dd>{operations.counts.total}</dd></dl>
 {operations.has_more&&<p>Nur die letzten 20 Vorgänge. Summen berücksichtigen auch ältere Vorgänge.</p>}
 <ul>{operations.operations.map(o=><li key={o.operation_id} className="border-t py-2"><span translate="no">{o.operation_id} · {o.kind}</span><p>{operationLabels[o.state]} · <span>{o.attempts}</span></p><p>{o.next_attempt_at==='infinity'?'Keine begrenzte Fälligkeit':o.next_attempt_at==='-infinity'?'Bereits zeitlich fällig':<span translate="no">{o.next_attempt_at}</span>}</p><p>Perioden-ID: <span translate="no">{o.period_id??'—'}</span></p></li>)}</ul></>}
 </section>
 <details><summary className="cursor-pointer font-bold">Neues Abrechnungsprofil · Entwurf</summary>
 <p>Ein neues Profil veröffentlicht allein keine neuen Bedingungen und ändert keine bestehende Annahme. Keine Werte sind vorausgefüllt.</p>
 <p>Erforderlich: environment, provider_account_ref, billing_identity_ref, tax_profile_ref, operator_name, operator_address, operator_email, tax_mode, tax_basis_points, tax_country, invoice_format, invoice_format_evidence_ref, release_evidence_ref, return_origin, released.</p>
 <RecurringForm title="Geprüftes Abrechnungsprofil unveränderlich veröffentlichen" action={publishCorporateRecurringProfile} companyId={state.company_id} fields={{profileId}}><label className="grid gap-1">Geprüftes Profil (JSON)<textarea name="profile" translate="no" className={corporateInputClass} rows={12} required/></label><EvidenceConfirmation/></RecurringForm>
 </details>
 <details><summary className="cursor-pointer font-bold">Neue Bedingungen · Entwurf</summary>
 <p>Neue Bedingungen gelten für künftige Annahmen aller Firmen. Diese Veröffentlichung ist nicht auf die angezeigte Firma beschränkt. Bestehende Annahmen bleiben unverändert.</p>
 <RecurringForm title="Geprüfte Bedingungen unveränderlich veröffentlichen" action={publishCorporateRecurringTerms} companyId={state.company_id}><RecurringInput name="termsVersion" label="Neue unveränderliche Textversion"/><RecurringInput name="profileId" label="ID des tatsächlich veröffentlichten Profils"/><RecurringInput name="approvalEvidenceRef" label="Referenz der tatsächlichen Freigabe"/>
 <label className="grid gap-1">Vollständiger freigegebener Text DE<textarea name="deText" translate="no" className={corporateInputClass} rows={8} required/></label><label className="grid gap-1">Vollständiger freigegebener Text EN<textarea name="enText" translate="no" className={corporateInputClass} rows={8} required/></label><EvidenceConfirmation/></RecurringForm>
 </details></section>
}

const operationLabels={pending:'Ausstehend',processing:'In Bearbeitung',awaiting_setup:'Wartet auf Zahlungsautorisierung',succeeded:'Abgeschlossen',retry_wait:'Wartet auf geplanten Wiederholungsversuch',review_required:'Prüfung erforderlich',cancelled:'Abgebrochen'}

const setupLabels:Record<string,string>={not_configured:'Nicht konfiguriert',not_started:'Noch nicht begonnen',pending:'Ausstehend',ready:'Verifiziert',expired:'Abgelaufen',review_required:'Prüfung erforderlich'}
