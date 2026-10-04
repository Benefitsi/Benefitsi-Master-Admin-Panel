"use client"
import { useRef, useState, useTransition } from "react"
import { createCorporateCompany } from "@/app/companies/actions"
import { annualQuote, euro, mutationFailure, mutationInitial, type CompanyMutationState, type CorporateCatalog } from "@/lib/corporate/companies"
import { type CorporateRequest } from "@/lib/corporate/requests"
import { CompanyFeedback, corporateInputClass, corporateButtonClass, mustReload } from "@/components/corporate/company-ui"

export function CorporateCompanySetup({ request, catalog, today, latestStart }: { request: Pick<CorporateRequest, "request_id" | "company_name" | "seats" | "updated_at">; catalog: CorporateCatalog | null; today: string; latestStart: string }) {
  const [seats, setSeats] = useState(String(request.seats))
  const [startsOn, setStartsOn] = useState(today)
  const [state, setState] = useState<CompanyMutationState>(mutationInitial)
  const [attemptPreview, setAttemptPreview] = useState<{ version: string; quote: ReturnType<typeof annualQuote> } | null>(null)
  const [pending, startTransition] = useTransition()
  const busy = useRef(false)
  const attempt = useRef<{ fields: Record<string, string>; quote: ReturnType<typeof annualQuote> } | null>(null)
  const quote = attemptPreview?.quote ?? annualQuote(catalog, Number(seats))
  const blocked = pending || mustReload(state) || state.status === "created"
  return <form aria-label={`Firmenkonto für ${request.company_name} vorbereiten`} aria-busy={pending} className="mt-6 space-y-4 border-t border-[#061829]/10 pt-5" onSubmit={event => {
    event.preventDefault()
    if (busy.current || blocked || !catalog || !quote) return
    busy.current = true
    if (!attempt.current) {
      setAttemptPreview({ version: catalog.version, quote })
      attempt.current = { fields: { requestId: request.request_id, expectedUpdatedAt: request.updated_at, seats, startsOn, catalogVersion: catalog.version }, quote }
    }
    const data = new FormData()
    for (const [key, value] of Object.entries(attempt.current.fields)) data.set(key, value)
    startTransition(async () => {
      try {
        const result = await createCorporateCompany(data)
        if (result.status === "invalid") { attempt.current = null; setAttemptPreview(null) }
        setState(result)
      }
      catch { setState(mutationFailure) }
      finally { busy.current = false }
    })
  }}>
    <h4 className="text-sm font-black">Firmenkonto vorbereiten</h4>
    <p className="text-xs text-[#617080]">Festes Jahreskontingent nach Abstimmung. Die Anfrage wird auf „Angebot in Abstimmung“ gesetzt. Premium-Zugang ist noch nicht aktiviert.</p>
    {!catalog && <p role="alert" className="text-sm text-amber-900">Aktueller Katalog ist nicht verfügbar. Firmenkonto kann nicht vorbereitet werden. Bitte Seite neu laden.</p>}
    <fieldset disabled={blocked || !catalog || !!attemptPreview} className="grid gap-3 disabled:opacity-70 sm:grid-cols-2">
      <legend className="sr-only">Jahresvereinbarung</legend>
      <label className="grid gap-1.5 text-xs font-bold">Vereinbarte Mitarbeiterplätze<input name="seats" type="number" min="1" max={catalog?.max_seats ?? 10000} step="1" required value={seats} onChange={event => setSeats(event.target.value)} className={corporateInputClass} /></label>
      <label className="grid gap-1.5 text-xs font-bold">Beginn<input name="startsOn" type="date" min={today} max={latestStart} required value={startsOn} onChange={event => setStartsOn(event.target.value)} className={corporateInputClass} /></label>
    </fieldset>
    {quote && <p className="rounded-xl bg-[#f8fafb] p-3 text-sm"><strong>{euro(quote.totalCents)} netto pro Jahr</strong><br />{euro(quote.unitCents)} je Mitarbeiter und Jahr · zzgl. MwSt.<br /><span className="text-xs">Katalog {attemptPreview?.version ?? catalog?.version} · Beginn {startsOn} · ein Kalenderjahr. Betrag und Plätze bleiben bei Austritt oder Ablauf einer Einladung fest.</span></p>}
    <CompanyFeedback state={state} href="/companies" />
    {state.status === "created" && state.companyId ? <a href={`/companies/${state.companyId}`} className="inline-flex min-h-11 items-center font-bold text-[#0b75d9] underline">Firmenkonto öffnen</a>
      : <button type="submit" className={corporateButtonClass} disabled={blocked || !catalog || !quote}>{pending ? "Bereitet vor …" : attemptPreview ? "Unverändert erneut versuchen" : "Firmenkonto vorbereiten"}</button>}
    {state.status === "error" && <p className="text-xs text-[#617080]">Die erste Aktion könnte bereits angekommen sein. Wiederholung verwendet exakt dieselben Angaben. Nach Neuladen zunächst die Firmenliste prüfen.</p>}
  </form>
}
