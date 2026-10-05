"use client"
import { useRef, useState, useTransition } from "react"
import { updateCorporateCompany, revokeCorporateInvitation, removeCorporateMember } from "@/app/companies/actions"
import { companyStatusLabels, companyRoleLabels, entitlementStatusLabels, euro, period, mutationInitial, mutationFailure, type CorporateCompany, type CompanyStatus, type CompanyMutationState, type CompanyDetailResult, type RosterRow } from "@/lib/corporate/companies"
import { CompanyFeedback, CompanyPagination, corporateInputClass, corporateButtonClass, corporatePanelClass, mustReload } from "@/components/corporate/company-ui"

export function CorporateCompanySummary({ company }: { company: CorporateCompany }) {
  return <section className={corporatePanelClass}>
    <h2 className="text-xl font-black">{company.company_name}</h2>
    <p className="mt-1 text-sm text-[#617080]">{company.city} · {companyStatusLabels[company.status]}</p>
    <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <div><dt className="text-xs font-bold text-[#617080]">Festes Jahreskontingent</dt><dd className="mt-1 font-bold">{company.seats} Mitarbeiterplätze</dd></div>
      <div><dt className="text-xs font-bold text-[#617080]">Belegung bei letzter Abfrage</dt><dd className="mt-1">{company.employee_count} zugeordnet · {company.reserved_count} reserviert · {company.available_seats} frei</dd></div>
      <div><dt className="text-xs font-bold text-[#617080]">Zeitraum (einschließlich)</dt><dd className="mt-1">{period(company.starts_on, company.ends_on)}</dd></div>
      <div><dt className="text-xs font-bold text-[#617080]">Feste Jahresnettosumme</dt><dd className="mt-1 font-bold">{euro(company.total_amount_cents)} netto pro Jahr</dd><dd className="mt-1">{euro(company.unit_amount_cents)} je Mitarbeiter/Jahr · zzgl. MwSt.</dd></div>
      <div><dt className="text-xs font-bold text-[#617080]">Preisversion bei Vereinbarung</dt><dd className="mt-1">{company.catalog_version}</dd></div>
      <div><dt className="text-xs font-bold text-[#617080]">Kontakt aus Anfrage</dt><dd className="mt-1 break-words">{company.contact_name}<br />{company.contact_email}</dd></div>
      <div><dt className="text-xs font-bold text-[#617080]">Firmen-Premium</dt><dd className="mt-1 font-bold">{entitlementStatusLabels[company.entitlement_status]}</dd></div>
      <div><dt className="text-xs font-bold text-[#617080]">Externe Rechnungsreferenz</dt><dd className="mt-1 break-words">{company.invoice_reference || "Noch nicht hinterlegt"}</dd></div>
      <div><dt className="text-xs font-bold text-[#617080]">Letzte Zahlungsreferenz</dt><dd className="mt-1 break-words">{company.premium_payment_reference || "Noch nicht hinterlegt"}</dd></div>
    </dl>
    <p className="mt-4 text-sm text-[#617080]">Diese Verwaltung erfasst die manuelle Bestätigung einer extern geprüften Zahlung. Sie erzeugt keine Rechnung und löst keine Zahlung oder automatische Verlängerung aus. Plätze, Jahresbetrag und Zeitraum bleiben bei Austritt, Entfernung oder Ablauf einer Einladung unverändert.</p>
  </section>
}
export function CorporateCompanyEditor({ company }: { company: CorporateCompany }) {
  const [status, setStatus] = useState<CompanyStatus>(company.status)
  const [reference, setReference] = useState(company.invoice_reference)
  const [expected, setExpected] = useState(company.updated_at)
  const [state, setState] = useState<CompanyMutationState>(mutationInitial)
  const [pending, startTransition] = useTransition()
  const busy = useRef(false)
  const blocked = pending || mustReload(state)
  return <form className={`${corporatePanelClass} space-y-4`} aria-label="Firmenstatus und Rechnungsreferenz bearbeiten" aria-busy={pending} onSubmit={event => {
    event.preventDefault(); if (busy.current || blocked) return
    busy.current = true
    const data = new FormData(); data.set("companyId", company.company_id); data.set("expectedUpdatedAt", expected); data.set("status", status); data.set("invoiceReference", reference)
    startTransition(async () => {
      try { const result = await updateCorporateCompany(data); if (result.status === "updated" && result.updatedAt) setExpected(result.updatedAt); setState(result) }
      catch { setState(mutationFailure) } finally { busy.current = false }
    })
  }}>
    <h2 className="text-lg font-black">Firmenaufnahme und externer Beleg</h2>
    <fieldset disabled={blocked} className="grid gap-3 disabled:opacity-70 sm:grid-cols-2">
      <legend className="sr-only">Status und Rechnungsreferenz</legend>
      <label className="grid gap-1.5 text-xs font-bold">Firmenstatus<select name="status" value={status} onChange={e => setStatus(e.target.value as CompanyStatus)} className={corporateInputClass}>{Object.entries(companyStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-1.5 text-xs font-bold">Externe Rechnungsreferenz (optional)<input name="invoiceReference" maxLength={160} value={reference} onChange={e => setReference(e.target.value)} className={corporateInputClass} /></label>
    </fieldset>
    <p className="text-xs text-[#617080]">Referenz eines separat erstellten Belegs. Keine Rechnungserzeugung oder Aussage über einen Zahlungseingang. Bei „pausiert“ sind Ausgabe und Annahme aller Einladungen gesperrt.</p>
    <CompanyFeedback state={state} href={`/companies/${company.company_id}`} />
    <button type="submit" className={corporateButtonClass} disabled={blocked}>{pending ? "Speichert …" : "Firmenangaben speichern"}</button>
  </form>
}
export function CorporateRoster({ detail }: { detail: Extract<CompanyDetailResult, { status: "ok" }> }) {
  const href = (offset: number) => `/companies/${detail.company.company_id}?offset=${offset}`
  return <section className={`${corporatePanelClass} space-y-4`}>
    <h2 className="text-lg font-black">Team und offene Einladungen</h2>
    <p className="text-sm text-[#617080]">Aktive Zuordnungen und gültige offene Einladungen · 50 Einträge je Seite. Abgelaufene Einladungen erscheinen nach erneutem Laden nicht mehr und geben reservierte Plätze frei.</p>
    <a href={href(detail.offset)} className="inline-flex min-h-11 items-center text-sm font-bold text-[#0b75d9] underline">Belegung und Liste neu laden</a>
    <CompanyPagination offset={detail.offset} total={detail.roster_total} href={href} />
    {detail.roster.length === 0 ? <p className="text-sm">Keine Zuordnungen oder gültigen Einladungen auf dieser Seite.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr className="border-b border-[#061829]/10"><th scope="col" className="p-3">E-Mail</th><th scope="col" className="p-3">Rolle</th><th scope="col" className="p-3">Zustand</th><th scope="col" className="p-3">Aktion</th></tr></thead>
      <tbody>{detail.roster.map(row => <CorporateRosterRow key={`${row.kind}:${row.id}:${row.role}:${row.updated_at}`} row={row} companyId={detail.company.company_id} href={href(detail.offset)} />)}</tbody>
    </table></div>}
  </section>
}
function CorporateRosterRow({ row, companyId, href }: { row: RosterRow; companyId: string; href: string }) {
  const [confirm, setConfirm] = useState(false)
  const [state, setState] = useState<CompanyMutationState>(mutationInitial)
  const [pending, startTransition] = useTransition()
  const busy = useRef(false)
  const blocked = pending || mustReload(state) || state.status === "revoked" || state.status === "removed"
  const invitation = row.kind === "invitation"
  return <tr className="border-b border-[#061829]/10 align-top">
    <td className="break-all p-3">{row.email}</td><td className="p-3">{companyRoleLabels[row.role]}</td>
    <td className="p-3">{invitation ? <>Offene Einladung<br /><span className="text-xs">Gültig bis {row.expires_at && new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(row.expires_at))}</span></> : "Zugeordnet"}</td>
    <td className="min-w-56 space-y-2 p-3">
      {confirm ? <div className="space-y-2">
        <p>{invitation ? "Einladungslink ungültig machen" : `${companyRoleLabels[row.role]}-Zuordnung entfernen`}: {row.email}? {row.role === "owner" && "Die Firma kann dadurch ihren letzten Ansprechpartner verlieren."}</p>
        <button type="button" disabled={blocked} className={`${corporateButtonClass} bg-red-700 hover:bg-red-800`} onClick={() => {
          if (busy.current || blocked) return
          busy.current = true
          const data = new FormData(); data.set("companyId", companyId); data.set("expectedUpdatedAt", row.updated_at)
          if (invitation) data.set("invitationId", row.id)
          else { data.set("userId", row.id); data.set("role", row.role) }
          startTransition(async () => {
            try { setState(await (invitation ? revokeCorporateInvitation(data) : removeCorporateMember(data))) }
            catch { setState(mutationFailure) } finally { busy.current = false }
          })
        }}>{pending ? "Speichert …" : invitation ? "Rücknahme bestätigen" : "Entfernung bestätigen"}</button>
        <button type="button" disabled={pending} className="ml-3 min-h-11 font-bold underline" onClick={() => setConfirm(false)}>Abbrechen</button>
      </div> : <button type="button" disabled={blocked} className="min-h-11 font-bold text-red-700 underline disabled:opacity-50" onClick={() => setConfirm(true)}>{invitation ? "Einladung zurücknehmen" : "Zuordnung entfernen"}</button>}
      <CompanyFeedback state={state} href={href} />
    </td>
  </tr>
}
