"use client"
import { useRef, useState, useTransition } from "react"
import { setCorporatePremium } from "@/app/companies/actions"
import { euro, period, mutationInitial, mutationFailure, type CorporateCompany, type CompanyMutationState } from "@/lib/corporate/companies"
import { CompanyFeedback, corporateInputClass, corporateButtonClass, corporatePanelClass, mustReload } from "@/components/corporate/company-ui"

export function CorporateCompanyPremium({ company, adminIdentity }: { company: CorporateCompany; adminIdentity: string }) {
  return <PremiumForm key={`${adminIdentity}:${company.company_id}`} company={company} />
}
function PremiumForm({ company: latestCompany }: { company: CorporateCompany }) {
  const [agreement, setAgreement] = useState(latestCompany)
  const [reference, setReference] = useState(latestCompany.premium_payment_reference)
  const [confirmed, setConfirmed] = useState(false)
  const [expected, setExpected] = useState(latestCompany.updated_at)
  const [state, setState] = useState<CompanyMutationState>(mutationInitial)
  const [pending, startTransition] = useTransition()
  const busy = useRef(false)
  // An automatic refresh must not change the operation covered by a failed
  // payment confirmation. Adopt the current agreement only after our success.
  const company = state.status === "updated" && latestCompany.updated_at === expected ? latestCompany : agreement
  const enabled = !company.premium_enabled
  const waitingForRefresh = state.status === "updated" && latestCompany.updated_at !== expected
  const blocked = pending || mustReload(state) || waitingForRefresh
  const eligible = !enabled || (company.status === "enrolling" && !!company.invoice_reference.trim())
  const ready = confirmed && (!enabled || !!reference.trim()) && eligible
  return <form className={`${corporatePanelClass} space-y-4`} aria-label="Firmen-Premium und Zahlungsbestätigung" aria-busy={pending} onSubmit={event => {
    event.preventDefault()
    if (busy.current || blocked || !ready) return
    busy.current = true
    setAgreement(company)
    const data = new FormData()
    data.set("companyId", company.company_id)
    data.set("expectedUpdatedAt", expected)
    data.set("enabled", String(enabled))
    data.set("paymentReference", enabled ? reference : "")
    data.set(enabled ? "paymentConfirmed" : "suspensionConfirmed", "true")
    startTransition(async () => {
      try {
        const result = await setCorporatePremium(data)
        if (result.status === "updated" && result.updatedAt) { setExpected(result.updatedAt); setConfirmed(false) }
        setState(result)
      } catch { setState(mutationFailure) } finally { busy.current = false }
    })
  }}>
    <h2 className="text-lg font-black">{enabled ? "Extern bezahltes Firmen-Premium freigeben" : "Firmen-Premium sperren"}</h2>
    <p className="text-sm"><strong>{company.seats} Mitarbeiterplätze · {euro(company.total_amount_cents)} netto pro Jahr · zzgl. MwSt.</strong><br />{period(company.starts_on, company.ends_on)} · Tagesgrenzen in Europe/Berlin<br />Rechnungsreferenz: {company.invoice_reference || "Noch nicht hinterlegt"}</p>
    <fieldset disabled={blocked} className="space-y-3 disabled:opacity-70">
      <legend className="sr-only">{enabled ? "Zahlungsprüfung bestätigen" : "Sperre bestätigen"}</legend>
      {enabled ? <>
        <label className="grid gap-1.5 text-xs font-bold">Zahlungsreferenz<input name="paymentReference" maxLength={160} value={reference} onChange={event => setReference(event.target.value)} className={corporateInputClass} /></label>
        <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" name="paymentConfirmed" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-4" /><span>Ich habe die externe Zahlung für das angezeigte Jahreskontingent, den Betrag und Zeitraum geprüft und bestätige sie.</span></label>
      </> : <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" name="suspensionConfirmed" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-4" /><span>Ich bestätige die Sperre von Firmen-Premium für dieses Unternehmen.</span></label>}
    </fieldset>
    {enabled && !eligible && <p className="text-sm text-amber-950">Vor der Freigabe Firmenaufnahme freigeben und eine externe Rechnungsreferenz hinterlegen. Anschließend aktuelle Angaben neu laden.</p>}
    <p className="text-xs text-[#617080]">Benefitsi bestätigt die extern geprüfte Zahlung manuell. Die Software prüft keinen Bankeingang. Firmenstatus und Laufzeit bestimmen den tatsächlichen Zugang. Private Abos bleiben auch bei einer Sperre erhalten und gelten unabhängig weiter.</p>
    <CompanyFeedback state={state} href={`/companies/${company.company_id}`} />
    {waitingForRefresh && <a href={`/companies/${company.company_id}`} className="inline-block min-h-11 font-bold text-[#0b75d9] underline">Aktuelle Firmenangaben neu laden</a>}
    <button type="submit" className={corporateButtonClass} disabled={blocked || !ready}>{pending ? "Speichert …" : enabled ? "Premium freigeben" : "Premium sperren"}</button>
  </form>
}
