"use client"
import { useRef, useState, useTransition } from "react"
import { issueCorporateInvitation } from "@/app/companies/actions"
import { companyRoleLabels, mutationFailure, mutationInitial, type CompanyMutationState, type CorporateCompany, type CompanyRole } from "@/lib/corporate/companies"
import { invitationLink, newInvitationDraft, type InvitationDraft } from "@/lib/corporate/invitation-client"
import { CompanyFeedback, corporateInputClass, corporateButtonClass, corporatePanelClass, mustReload } from "@/components/corporate/company-ui"

export function CorporateCompanyInvitation({ company }: { company: CorporateCompany }) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<CompanyRole>("employee")
  const [state, setState] = useState<CompanyMutationState>(mutationInitial)
  const [link, setLink] = useState("")
  const [copyMessage, setCopyMessage] = useState("")
  const [hasAttempt, setHasAttempt] = useState(false)
  const [pending, startTransition] = useTransition()
  const busy = useRef(false)
  const attempt = useRef<InvitationDraft | null>(null)
  const blocked = company.status === "paused" || pending || mustReload(state) || state.status === "issued"
  return <section className={corporatePanelClass}>
    <h2 className="text-lg font-black">Persönliche Einladung</h2>
    <p className="mt-2 text-sm text-[#617080]">Ansprechpartner belegen keinen Mitarbeiterplatz und erhalten keine globalen Adminrechte. Mitarbeiteraufnahme ist nur bei Freigabe möglich. Links gelten sieben Tage, höchstens bis Firmenende. Es wird keine E-Mail versendet.</p>
    <form className="mt-4 space-y-4" aria-label="Einladung erstellen" aria-busy={pending} onSubmit={event => {
      event.preventDefault()
      if (busy.current || blocked) return
      busy.current = true
      setCopyMessage("")
      startTransition(async () => {
        try {
          attempt.current ??= newInvitationDraft(company.company_id, email, role)
          setHasAttempt(true)
          const data = new FormData()
          for (const [key, value] of Object.entries(attempt.current)) data.set(key, value)
          const result = await issueCorporateInvitation(data)
          if (result.status === "issued" && result.invitationId === attempt.current.invitationId) {
            setLink(invitationLink(attempt.current.token))
            attempt.current = null
            setHasAttempt(false)
          }
          setState(result)
        } catch { setState(mutationFailure) }
        finally { busy.current = false }
      })
    }}>
      <fieldset disabled={blocked || hasAttempt} className="grid gap-3 disabled:opacity-70 sm:grid-cols-2">
        <legend className="sr-only">Empfänger und Firmenrolle</legend>
        <label className="grid gap-1.5 text-xs font-bold">Zieladresse<input name="email" type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className={corporateInputClass} /></label>
        <label className="grid gap-1.5 text-xs font-bold">Rolle<select name="role" value={role} onChange={e => setRole(e.target.value as CompanyRole)} className={corporateInputClass}>
          <option value="employee">{companyRoleLabels.employee}</option><option value="owner">{companyRoleLabels.owner}</option>
        </select></label>
      </fieldset>
      {company.status === "paused" && <p role="alert" className="text-sm text-amber-900">Die Firmenaufnahme ist pausiert. Keine neue Einladung möglich.</p>}
      <CompanyFeedback state={state} href={`/companies/${company.company_id}`} />
      {link ? <div className="space-y-3 rounded-xl bg-[#f8fafb] p-4">
        <label className="grid gap-1.5 text-xs font-bold">Einladungslink<textarea aria-label="Einladungslink" readOnly value={link} rows={3} className={corporateInputClass} /></label>
        <p className="text-xs text-[#617080]">Dieser geheime Link wird nur in diesem geöffneten Formular angezeigt. Nur an die Zieladresse weitergeben. Nach Neuladen kann er nicht wieder ausgelesen werden; offene Einladung dann zurücknehmen und neu erstellen.</p>
        <p className="text-xs">Gültig bis {state.expiresAt && new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(state.expiresAt))} · Premium-Zugang ist noch nicht aktiviert.</p>
        <button type="button" className={corporateButtonClass} onClick={async () => {
          try { await navigator.clipboard.writeText(link); setCopyMessage("Link kopiert.") } catch { setCopyMessage("Kopieren nicht möglich. Link oben auswählen und manuell kopieren.") }
        }}>Link kopieren</button>
        {copyMessage && <p role="status" className="text-sm">{copyMessage}</p>}
      </div> : <button type="submit" className={corporateButtonClass} disabled={blocked || (role === "employee" && company.status !== "enrolling")}>{pending ? "Erstellt …" : hasAttempt ? "Unverändert erneut versuchen" : "Einladung erstellen"}</button>}
      {role === "employee" && company.status === "preparing" && <p className="text-xs text-[#617080]">Zuerst Teamaufnahme freigeben. Ansprechpartner können bereits vorbereitet werden.</p>}
      {(hasAttempt || link) && <button type="button" disabled={pending} className="min-h-11 text-sm font-bold text-[#0b75d9] underline" onClick={() => {
        attempt.current = null; setHasAttempt(false); setLink(""); setCopyMessage(""); setEmail(""); setState(mutationInitial)
      }}>Neue Einladung vorbereiten</button>}
      {state.status === "error" && <p className="text-xs text-[#617080]">Die Ausgabe könnte bereits angekommen sein. Die Wiederholung behält ID und Geheimnis. Bei einer neuen Einladung die Liste prüfen und eine eventuell offene Einladung zuerst zurücknehmen.</p>}
    </form>
  </section>
}
