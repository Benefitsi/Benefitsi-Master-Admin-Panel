"use client"
import { useRef, useState, useTransition } from "react"
import { attachCorporateInvoice, confirmCorporateExtension, quoteCorporateExtension, readCorporateInvoice } from "@/app/companies/actions"
import { extensionStatusLabels, type CorporateBilling, type CorporateExtension } from "@/lib/corporate/annual"
import { annualFailure, annualInitial, annualMustReload, MAX_INVOICE_BYTES, type AnnualMutation } from "@/lib/corporate/annual-mutations"
import { euro, period, type CorporateCompany, type InvoiceDocument } from "@/lib/corporate/companies"
import { corporateButtonClass, corporateInputClass, corporatePanelClass } from "@/components/corporate/company-ui"

function Feedback({ state, companyId }: { state: AnnualMutation; companyId: string }) {
  if (!state.message) return null
  const success = ["quoted", "activated", "attached"].includes(state.status)
  return <div role={success ? "status" : "alert"} className="rounded-xl border bg-[#f7f6f1] p-3 text-sm">
    <p>{state.message}</p>
    {(success || annualMustReload(state)) && <a className="mt-2 inline-flex min-h-11 items-center font-bold underline" href={`/companies/${companyId}`}>Aktuelle Angaben neu laden</a>}
  </div>
}
export function CorporateAnnualBilling({ billing, adminIdentity }: { billing: CorporateBilling; adminIdentity: string }) {
  if (billing.status !== "ok") return <section className={corporatePanelClass} role="alert">{billing.message}</section>
  const company = billing.agreement
  return <section className={`${corporatePanelClass} space-y-5`} aria-label="Jahresabrechnung">
    <h2 className="text-xl font-black">Jahresabrechnung</h2>
    <p><strong>Ursprüngliche Vereinbarung: {company.seats} Plätze · {euro(company.total_amount_cents)} netto/Jahr · zzgl. MwSt.</strong><br />Jahreszeitraum: {period(company.starts_on, company.ends_on)}<br />Angebotsreferenz: {company.source_request_id}</p>
    <p>Vom Ansprechpartner angenommen: {company.annual_accepted_at ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(company.annual_accepted_at)) : "Noch offen – Bestätigung im Firmenportal erforderlich"}</p>
    <p>Bezahlte Kapazität: {company.capacity_seats ?? company.seats} Plätze. Ein offenes Erweiterungsangebot verändert das bisherige Kontingent nicht.</p>
    <Invoice key={`${adminIdentity}:${company.company_id}:original:${company.invoice_document?.storage_path ?? ""}`} companyId={company.company_id} extensionId={null} reference={company.invoice_reference} document={company.invoice_document} />
    <h3 className="text-lg font-black">Zusätzliche Mitarbeiterplätze</h3>
    <p className="text-sm text-[#617080]">Anfrage im Firmenportal → konkretes Nettoangebot → Annahme durch den Ansprechpartner → belegte Zahlung. Das Ende des Firmenjahrs bleibt unverändert. Keine automatische Preisberechnung oder Verlängerung.</p>
    {billing.extensions.length === 0 ? <p className="text-sm">Keine Erweiterungen angefragt.</p> : billing.extensions.map(extension => <Extension key={`${adminIdentity}:${company.company_id}:${extension.extension_id}`} company={company} extension={extension} />)}
  </section>
}
function Invoice({ companyId, extensionId, reference, document }: { companyId: string; extensionId: string | null; reference: string; document: InvoiceDocument | null }) {
  const [state, setState] = useState<AnnualMutation>(annualInitial)
  const [documentId] = useState(() => crypto.randomUUID())
  const [url, setUrl] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const busy = useRef(false)
  const attached = !!document || state.status === "attached"
  const blocked = pending || annualMustReload(state) || state.status === "attached"
  return <div className="space-y-3 rounded-2xl border border-[#061829]/10 p-4">
    <p className="text-sm font-bold">Rechnung: {reference || "Rechnungsreferenz fehlt"}</p>
    {attached ? <>
      <button type="button" disabled={pending} className={corporateButtonClass} onClick={() => {
        if (busy.current) return
        busy.current = true; setUrl(null)
        startTransition(async () => {
          try { const result = await readCorporateInvoice(companyId, extensionId); if (result) setUrl(result.url); else setState(annualFailure) }
          catch { setState(annualFailure) } finally { busy.current = false }
        })
      }}>{pending ? "Lädt …" : "Privaten Rechnungsbeleg abrufen"}</button>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="ml-3 inline-flex min-h-11 items-center font-bold underline" onClick={() => setTimeout(() => setUrl(null), 0)}>PDF öffnen (kurzzeitig gültig)</a>}
    </> : <form aria-label="Rechnungsbeleg zuordnen" className="space-y-3" onSubmit={event => {
      event.preventDefault(); if (busy.current || blocked || !reference.trim()) return
      const file = event.currentTarget.elements.namedItem("invoice") as HTMLInputElement | null
      const pdf = file?.files?.[0]
      if (!pdf || pdf.size > MAX_INVOICE_BYTES || pdf.type !== "application/pdf") { setState({ status: "invalid", message: "Bitte eine vorhandene PDF-Rechnung bis 10 MiB auswählen." }); return }
      const data = new FormData(); data.set("companyId", companyId); data.set("extensionId", extensionId ?? ""); data.set("invoiceReference", reference); data.set("documentId", documentId); data.set("invoice", pdf)
      busy.current = true
      startTransition(async () => { try { setState(await attachCorporateInvoice(data)) } catch { setState(annualFailure) } finally { busy.current = false } })
    }}>
      <label className="grid gap-2 text-sm font-bold">Vorhandene Rechnung als PDF (max. 10 MiB)<input className={corporateInputClass} name="invoice" type="file" accept="application/pdf,.pdf" required disabled={blocked || !reference.trim()} /></label>
      <p className="text-xs text-[#617080]">Privater Beleg. Die Zuordnung ist unveränderlich. Aussteller, Steuer und Bruttobetrag stammen aus der tatsächlichen Rechnung.</p>
      <button className={corporateButtonClass} type="submit" disabled={blocked || !reference.trim()}>{pending ? "Ordnet zu …" : "Rechnungsbeleg unveränderlich zuordnen"}</button>
    </form>}
    <Feedback state={state} companyId={companyId} />
  </div>
}
function Extension({ company, extension: latest }: { company: CorporateCompany; extension: CorporateExtension }) {
  // Freeze the operation being reviewed. Automatic RSC refreshes never replace
  // a draft, accepted snapshot or payment evidence under an in-flight action.
  const [extension] = useState(latest)
  const [quantity, setQuantity] = useState(String(extension.additional_seats))
  const [amount, setAmount] = useState(extension.net_amount_cents === null ? "" : String(extension.net_amount_cents))
  const [reference, setReference] = useState(extension.invoice_reference)
  const [payment, setPayment] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [state, setState] = useState<AnnualMutation>(annualInitial)
  const [pending, startTransition] = useTransition()
  const busy = useRef(false)
  const blocked = pending || annualMustReload(state) || ["quoted", "activated"].includes(state.status)
  const quoted = extension.status !== "requested"
  const accepted = extension.status === "accepted" || extension.status === "activated"
  return <article className="space-y-4 rounded-2xl border border-[#061829]/10 p-4">
    <h4 className="font-black">{extension.additional_seats} zusätzliche Plätze · {extensionStatusLabels[extension.status]}</h4>
    <p className="text-sm">Referenz: {extension.extension_id}<br />{quoted ? <>Konkretes Angebot: {euro(extension.net_amount_cents!)} netto · zzgl. MwSt.<br />Verbleibende Laufzeit: {period(extension.starts_on!, extension.ends_on)}</> : <>Gemeinsames Ende: {period(company.starts_on, extension.ends_on)} (Firmenjahr)</>}<br />Vom Ansprechpartner angenommen: {accepted ? "Ja" : "Noch offen"}</p>
    {!accepted && <form aria-label="Erweiterungsangebot" className="space-y-3" onSubmit={event => {
      event.preventDefault(); if (busy.current || blocked) return
      const data = new FormData(); data.set("companyId", company.company_id); data.set("extensionId", extension.extension_id); data.set("expectedUpdatedAt", extension.updated_at); data.set("additionalSeats", quantity); data.set("netAmountCents", amount); data.set("invoiceReference", reference)
      busy.current = true
      startTransition(async () => { try { setState(await quoteCorporateExtension(data)) } catch { setState(annualFailure) } finally { busy.current = false } })
    }}>
      <fieldset className="grid gap-3 sm:grid-cols-3" disabled={blocked}>
        <legend className="sr-only">Konkretes Erweiterungsangebot</legend>
        <label className="grid gap-1 text-xs font-bold">Zusätzliche Plätze<input className={corporateInputClass} type="number" name="additionalSeats" min="1" max="10000" required value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
        <label className="grid gap-1 text-xs font-bold">Gesamtbetrag netto in Cent<input className={corporateInputClass} type="number" name="netAmountCents" min="1" max="2147483647" step="1" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label className="grid gap-1 text-xs font-bold">Rechnungsreferenz<input className={corporateInputClass} name="invoiceReference" maxLength={160} required value={reference} onChange={e => setReference(e.target.value)} /></label>
      </fieldset>
      <p className="text-xs">Dieser Betrag gilt für die zusätzlichen Plätze bis zum bestehenden Firmenende. Der ursprüngliche Jahresbetrag bleibt unverändert.</p>
      <button type="submit" className={corporateButtonClass} disabled={blocked}>{pending ? "Speichert …" : "Nettoangebot speichern"}</button>
    </form>}
    {quoted && <Invoice companyId={company.company_id} extensionId={extension.extension_id} reference={extension.invoice_reference} document={extension.invoice_document} />}
    {extension.status === "accepted" && <form aria-label="Erweiterungszahlung" className="space-y-3" onSubmit={event => {
      event.preventDefault(); if (busy.current || blocked || !extension.invoice_document || !confirmed || !payment.trim()) return
      const data = new FormData(); data.set("companyId", company.company_id); data.set("extensionId", extension.extension_id); data.set("expectedUpdatedAt", extension.updated_at); data.set("paymentReference", payment); data.set("paymentConfirmed", "true")
      busy.current = true
      startTransition(async () => { try { const result = await confirmCorporateExtension(data); setState(result); if (result.status === "activated") setConfirmed(false) } catch { setState(annualFailure) } finally { busy.current = false } })
    }}>
      <fieldset disabled={blocked} className="space-y-3">
        <legend className="sr-only">Externen Zahlungseingang bestätigen</legend>
        <label className="grid gap-1 text-xs font-bold">Zahlungsreferenz<input name="paymentReference" className={corporateInputClass} maxLength={160} value={payment} onChange={e => setPayment(e.target.value)} /></label>
        <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" name="paymentConfirmed" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>Ich habe den externen Zahlungseingang für diese angenommene Menge, Rechnung, Nettosumme und Laufzeit geprüft und bestätige ihn.</span></label>
      </fieldset>
      {!extension.invoice_document && <p className="text-sm">Vor Zahlungsbestätigung den tatsächlichen Rechnungsbeleg zuordnen und aktuelle Angaben neu laden.</p>}
      <button type="submit" className={corporateButtonClass} disabled={blocked || !extension.invoice_document || !confirmed || !payment.trim()}>{pending ? "Bestätigt …" : "Zahlung bestätigen und Plätze freigeben"}</button>
    </form>}
    {extension.status === "activated" && <p className="text-sm">Zahlungsreferenz: {extension.payment_reference}. Die ursprüngliche Jahresvereinbarung und das Firmenende bleiben unverändert.</p>}
    <Feedback state={state} companyId={company.company_id} />
  </article>
}
