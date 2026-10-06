"use client"
import { useEffect, useRef, useState, useTransition } from "react"
import { loadCorporateOccasions, previewCorporateOccasionOffer, approveCorporateOccasionOffer, saveCorporateOccasionProgram, saveCorporateMemberOccasion } from "@/app/companies/actions"
import { berlinToday, occasionDate, occasionFailure, occasionReference, occasionUuid, parseOccasionPreview, parseOccasionSettings, type OccasionMember, type OccasionMutation, type OccasionOffer, type OccasionPreview, type OccasionProgram, type OccasionSettings } from "@/lib/corporate/occasions"
import { corporateButtonClass, corporateInputClass, corporatePanelClass } from "@/components/corporate/company-ui"
const inputClass = `${corporateInputClass} min-h-12`
const buttonClass = `${corporateButtonClass} min-h-12`
const plainButton = "min-h-12 font-bold text-[#0b75d9] underline disabled:opacity-50"
type Save = (action: (data: FormData) => Promise<OccasionMutation>, data: FormData) => void
function payload(companyId: string, expected: string | null, fields: Record<string, string>) {
  const data = new FormData(); data.set("companyId", companyId); data.set("expectedUpdatedAt", expected ?? "")
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
export function CorporateOccasionWorkspace({ companyId, adminIdentity }: { companyId: string; adminIdentity: string }) {
  return <OccasionWorkspace key={`${adminIdentity}:${companyId}`} companyId={companyId} />
}
function OccasionWorkspace({ companyId }: { companyId: string }) {
  const [settings, setSettings] = useState<OccasionSettings | null>(null)
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [approvalCandidate, setApprovalCandidate] = useState({ deal: "", request: 0 })
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<OccasionMutation>({ status: "idle", message: "" })
  // Busy state belongs to this incarnation, even while an older transition is unresolved.
  const [pending, setPending] = useState(false)
  const [, startTransition] = useTransition()
  const busy = useRef(false), mounted = useRef(false), generation = useRef(0)
  const needsReload = ["conflict", "not_found", "unavailable", "error"].includes(state.status)
  const blocked = pending || loading || needsReload
  // Every read and write belongs to this mounted company/session incarnation.
  useEffect(() => {
    mounted.current = true
    const request = ++generation.current
    void (async () => {
      try {
        const result = await loadCorporateOccasions(companyId, 0)
        if (!mounted.current || request !== generation.current) return
        if (result.status !== "ok") { setState({ status: "error", message: result.message }); return }
        setSettings(parseOccasionSettings(result, companyId))
      } catch { if (mounted.current && request === generation.current) setState({ status: "error", message: "Anlassvorteile konnten nicht geladen werden. Bitte den Serverstand neu laden." }) }
      finally { if (mounted.current && request === generation.current) setLoading(false) }
    })()
    return () => { mounted.current = false }
  }, [companyId])
  async function read(page: number, request: number): Promise<boolean> {
    try {
      const result = await loadCorporateOccasions(companyId, page)
      if (!mounted.current || request !== generation.current) return false
      if (result.status !== "ok") { setState({ status: "error", message: result.message }); return false }
      const parsed = parseOccasionSettings(result, companyId)
      if (parsed.next_offset !== null && parsed.next_offset !== page + 50) throw new Error("Invalid page")
      setSettings(parsed); setOffset(page); setRevision(v => v + 1); setApprovalCandidate(v => ({ deal: "", request: v.request + 1 })); setState({ status: "idle", message: "Serverstand geladen." }); return true
    } catch { if (mounted.current && request === generation.current) setState({ status: "error", message: "Der Serverstand konnte nicht geladen werden. Ihre Eingaben bleiben erhalten." }); return false }
  }
  function reload(page = offset) {
    if (busy.current || pending || loading) return
    busy.current = true; setLoading(true); setPending(true)
    const request = ++generation.current
    startTransition(async () => { try { await read(page, request) } finally { busy.current = false; if (mounted.current && request === generation.current) { setLoading(false); setPending(false) } } })
  }
  const save: Save = (action, data) => {
    if (busy.current || blocked) return
    busy.current = true; setPending(true)
    const request = ++generation.current
    startTransition(async () => {
      try {
        const result = await action(data)
        if (!mounted.current || request !== generation.current) return
        setState(result)
        if (result.status === "updated") { setLoading(true); await read(offset, request) }
      } catch { if (mounted.current && request === generation.current) setState(occasionFailure) }
      finally { busy.current = false; if (mounted.current && request === generation.current) { setLoading(false); setPending(false) } }
    })
  }
  return <section aria-label="Anlassvorteile" aria-busy={loading || pending} className={`${corporatePanelClass} space-y-5`}>
    <h2 className="text-xl font-black">Anlassvorteile</h2>
    <p className="text-sm text-[#617080]">Zusätzliche, separat vereinbarte persönliche Partnerangebote zum Geburtstag und Dienstjubiläum. Die beiden Regeln sind zunächst ausgeschaltet.</p>
    {loading && <p role="status">Anlassvorteile werden geladen …</p>}
    {state.message && <p role={state.status === "idle" || state.status === "updated" ? "status" : "alert"} className="rounded-xl border p-3 text-sm">{state.message}</p>}
    <button type="button" disabled={pending || loading} className={plainButton} onClick={() => reload()}>Serverstand neu laden</button>
    {settings && <div key={revision} className="space-y-5">
      {settings.can_approve_offers && <OfferApproval key={approvalCandidate.request} initialDeal={approvalCandidate.deal} companyId={companyId} offers={settings.offers} blocked={blocked} save={save} />}
      <section aria-label="Freigegebene Partnerangebote" className="space-y-3">
        <h3 className="text-lg font-bold">Partnerangebote und Freigaben</h3>
        {settings.offers.length === 0 ? <p className="text-sm">Für diese Firma ist noch kein Partnerangebot freigegeben. Zuerst ein einfaches aktives Angebot vereinbaren, konkret prüfen und freigeben.</p> : <ul className="grid gap-3 md:grid-cols-2">{settings.offers.map(offer => <ApprovedOffer key={offer.offer_id} companyId={companyId} offer={offer} canApprove={settings.can_approve_offers} blocked={blocked} save={save} select={() => setApprovalCandidate(v => ({ deal: offer.deal_id, request: v.request + 1 }))} />)}</ul>}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">{settings.programs.map(program => <ProgramEditor key={program.kind} companyId={companyId} program={program} offers={settings.offers} blocked={blocked} save={save} />)}</div>
      <section aria-label="Nächste Anlässe und Eintrittsdaten" className="space-y-3">
        <h3 className="text-lg font-bold">Nächste Anlässe und Eintrittsdaten</h3>
        <p className="text-sm text-[#617080]">Geburtstag nur bei persönlicher Zustimmung; Tag und Monat. Die Zustimmung pflegt jede Person selbst. Eintrittsdatum ab 1900 bis heute; Entfernen verhindert neue Jubiläen, bereits ausgegebene Vorteile bleiben gültig.</p>
        <nav aria-label="Anlass-Teamseiten" className="flex flex-wrap gap-4">
          <span className="self-center text-sm">Teamseite {offset / 50 + 1} · bis zu 50 Mitarbeitende</span>
          {offset > 0 && <button type="button" disabled={blocked} className={plainButton} onClick={() => reload(offset - 50)}>Vorherige Teamseite</button>}
          {settings.next_offset !== null && <button type="button" disabled={blocked} className={plainButton} onClick={() => reload(settings.next_offset!)}>Nächste Teamseite</button>}
        </nav>
        {settings.members.length === 0 ? <p className="text-sm">Keine Mitarbeitenden auf dieser Teamseite.</p> : <ul className="grid gap-3 lg:grid-cols-2">{settings.members.map(member => <MemberEditor key={`${member.user_id}:${member.membership_id}`} companyId={companyId} member={member} blocked={blocked} save={save} />)}</ul>}
      </section>
    </div>}
  </section>
}
function OfferDetails({ offer }: { offer: Pick<OccasionOffer, "partner_name" | "title" | "description" | "terms"> }) {
  return <div className="min-w-0 space-y-1 break-words text-sm"><p className="font-bold">{offer.partner_name}</p><p>{offer.title}</p>{offer.description && <p className="whitespace-pre-wrap">{offer.description}</p>}<p className="whitespace-pre-wrap">Bedingungen: {offer.terms || "Keine zusätzlichen Bedingungen hinterlegt."}</p></div>
}
function OfferApproval({ companyId, initialDeal, offers, blocked, save }: { companyId: string; initialDeal: string; offers: OccasionOffer[]; blocked: boolean; save: Save }) {
  const [deal, setDeal] = useState(initialDeal)
  const [reference, setReference] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [preview, setPreview] = useState<OccasionPreview | null>(null)
  const [message, setMessage] = useState("")
  const [pending, startTransition] = useTransition()
  const request = useRef(0), mounted = useRef(false), busy = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  function changeDeal(value: string) { request.current++; setDeal(value); setPreview(null); setConfirmed(false); setReference(""); setMessage("") }
  function loadPreview() {
    if (busy.current || blocked || !occasionUuid(deal)) return
    busy.current = true; setPreview(null); setConfirmed(false); setMessage("")
    const generation = ++request.current, selectedDeal = deal
    startTransition(async () => {
      try {
        const result = await previewCorporateOccasionOffer(payload(companyId, null, { dealId: selectedDeal }))
        if (!mounted.current || request.current !== generation) return
        if (result.status !== "ok") { setMessage(result.message); return }
        setPreview(parseOccasionPreview(result.preview, companyId, selectedDeal))
      } catch { if (mounted.current && request.current === generation) setMessage("Die konkrete Angebotsvorschau konnte nicht bestätigt werden. Bitte erneut prüfen.") }
      finally { busy.current = false }
    })
  }
  const previewMatches = preview?.company_id === companyId && preview.deal_id === deal
  const canApprove = previewMatches && confirmed && occasionReference(reference) && !blocked && !pending
  return <form aria-label="Partnerangebot freigeben" className="space-y-3 rounded-2xl border border-[#061829]/10 p-4" onSubmit={event => {
    event.preventDefault(); if (!canApprove || !preview) return
    save(approveCorporateOccasionOffer, payload(companyId, offers.find(o => o.deal_id === deal)?.updated_at ?? null, { dealId: deal, enabled: "true", authorizationReference: reference, previewHash: preview.preview_hash, confirmed: "true" }))
  }}>
    <h3 className="text-lg font-bold">Partnerangebot prüfen und freigeben</h3>
    <label className="grid gap-1.5 text-sm font-bold">Angebotskennung (Deal-UUID)<input name="dealId" className={inputClass} value={deal} disabled={blocked} autoComplete="off" onChange={event => changeDeal(event.target.value)} /></label>
    <button type="button" className={buttonClass} disabled={blocked || pending || !occasionUuid(deal)} onClick={loadPreview}>{pending ? "Prüft …" : "Angebot prüfen"}</button>
    {pending && <p role="status">Die konkrete Partnervereinbarung wird geprüft …</p>}
    {message && <p role="alert" className="text-sm">{message}</p>}
    {previewMatches && preview && <div className="space-y-3 rounded-xl bg-[#f4f8fc] p-4">
      <h4 className="font-bold">Konkrete Angebotsvorschau</h4><OfferDetails offer={preview} />
      <p className="text-sm">Die Freigabe erlaubt zusätzliche persönliche Einlösungen außerhalb der normalen Angebotslimits. Sie gilt nur für diese Firma und das angezeigte Angebot. Freigabe und Vorschau lösen keine Zahlung, Bestellung oder Nachricht aus.</p>
      <fieldset disabled={blocked || pending} className="space-y-3">
        <legend className="sr-only">Vereinbarung ausdrücklich bestätigen</legend>
        <label className="grid gap-1.5 text-sm font-bold">Interne Vereinbarungsreferenz<input name="authorizationReference" value={reference} onChange={event => setReference(event.target.value)} className={inputClass} autoComplete="off" /></label>
        <p className="text-xs">1–160 Zeichen ohne Steuerzeichen. Nur für Benefitsi-Admins sichtbar.</p>
        <label className="flex min-h-12 items-center gap-3 text-sm"><input name="confirmed" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="size-5 shrink-0" />Ich bestätige die bestehende Partnervereinbarung für genau diese Vorschau und die zusätzlichen persönlichen Einlösungen.</label>
      </fieldset>
      <button type="submit" disabled={!canApprove} className={buttonClass}>Freigabe bestätigen</button>
    </div>}
  </form>
}
function ApprovedOffer({ companyId, offer, canApprove, blocked, save, select }: { companyId: string; offer: OccasionOffer; canApprove: boolean; blocked: boolean; save: Save; select: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const status = !offer.enabled ? "Widerrufen" : offer.reapproval_required ? "Geändert: erneute Freigabe erforderlich" : !offer.available ? "Derzeit nicht verfügbar" : "Freigegeben und verfügbar"
  return <li className="space-y-3 rounded-2xl border border-[#061829]/10 p-4">
    <OfferDetails offer={offer} /><p className="text-sm font-bold">{status}</p>
    {offer.reapproval_required && <p className="text-sm">Das Originalangebot wurde geändert. Für neue Vorteile ist eine neue konkrete Vorschau und ausdrückliche Freigabe nötig. Bereits ausgegebene Vorteile behalten ihren ursprünglichen Inhalt und ihre Bedingungen.</p>}
    {canApprove && offer.authorization_reference && <p className="break-words text-xs">Interne Referenz: {offer.authorization_reference}</p>}
    {canApprove && <button type="button" disabled={blocked} className={plainButton} onClick={select}>Dieses Angebot erneut prüfen</button>}
    {canApprove && offer.enabled && (confirm ? <div className="space-y-2">
      <p className="text-sm">Widerrufen: Neue Ausgabe ist gesperrt; ausstehende Vorteile sind sofort nicht mehr nutzbar.</p>
      <button type="button" disabled={blocked} className={`${buttonClass} bg-red-700`} onClick={() => save(approveCorporateOccasionOffer, payload(companyId, offer.updated_at, { dealId: offer.deal_id, enabled: "false", authorizationReference: offer.authorization_reference ?? "", previewHash: "", confirmed: "true" }))}>Widerruf bestätigen</button>
      <button type="button" disabled={blocked} onClick={() => setConfirm(false)} className={`${plainButton} ml-3`}>Abbrechen</button>
    </div> : <button type="button" disabled={blocked} className={plainButton} onClick={() => setConfirm(true)}>Freigabe widerrufen</button>)}
  </li>
}
function ProgramEditor({ companyId, program, offers, blocked, save }: { companyId: string; program: OccasionProgram; offers: OccasionOffer[]; blocked: boolean; save: Save }) {
  const [enabled, setEnabled] = useState(program.enabled), [offerId, setOfferId] = useState(program.offer_id ?? ""), [interval, setInterval] = useState<1 | 5>(program.anniversary_interval)
  const title = program.kind === "birthday" ? "Geburtstag" : "Dienstjubiläum"
  const selected = offers.find(o => o.offer_id === offerId)
  const usable = !!selected && selected.enabled && selected.available && !selected.reapproval_required
  return <form aria-label={`${title} bearbeiten`} className="space-y-3 rounded-2xl border border-[#061829]/10 p-4" onSubmit={event => {
    event.preventDefault(); if (blocked || (enabled && !usable)) return
    save(saveCorporateOccasionProgram, payload(companyId, program.updated_at, { kind: program.kind, enabled: String(enabled), offerId, anniversaryInterval: String(interval) }))
  }}>
    <h3 className="text-lg font-bold">{title}</h3><p className="text-sm">Gespeicherter Zustand: {program.enabled ? "Eingeschaltet" : "Ausgeschaltet"}{program.enabled && !offers.some(o => o.offer_id === program.offer_id && o.enabled && o.available && !o.reapproval_required) && " · Aktuell kein verfügbares Angebot für neue Ausgabe"}</p>
    <fieldset disabled={blocked} className="space-y-3">
      <legend className="sr-only">{title} konfigurieren</legend>
      <label className="grid gap-1.5 text-sm font-bold">Freigegebenes Angebot<select name="offerId" value={offerId} onChange={event => setOfferId(event.target.value)} className={inputClass}><option value="">Bitte Angebot wählen</option>{offers.map(o => <option key={o.offer_id} value={o.offer_id} disabled={!o.enabled || !o.available || o.reapproval_required}>{o.partner_name} · {o.title}{(!o.enabled || !o.available || o.reapproval_required) && " · nicht verfügbar"}</option>)}</select></label>
      {program.kind === "anniversary" && <label className="grid gap-1.5 text-sm font-bold">Jubiläumsrhythmus<select name="anniversaryInterval" value={interval} onChange={event => setInterval(Number(event.target.value) as 1 | 5)} className={inputClass}><option value="1">Jährlich</option><option value="5">Alle fünf Jahre</option></select></label>}
      <label className="flex min-h-12 items-center gap-3 text-sm"><input name="enabled" type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="size-5 shrink-0" />Regel beim Speichern einschalten</label>
    </fieldset>
    <p className="text-xs text-[#617080]">Auswahl und Häkchen sind ein Entwurf bis zum Speichern. Vorteile gelten 30 Kalendertage ab dem Anlass; am Ablaufzeitpunkt endet die Nutzung, spätestens mit dem Firmenvertrag. 29. Februar zählt in Nichtschaltjahren am 28. Februar. Frühere Anlasstage vor Regelaktivierung, Mitgliedschaft oder Vertrag werden nicht nachgeholt.</p>
    {program.kind === "anniversary" && <p className="text-xs text-[#617080]">Erstmals nach einem vollen Beschäftigungsjahr. Der gewählte Rhythmus wird mit dem Einschalten bestätigt.</p>}
    {!enabled && <p className="text-sm">Ausschalten verhindert neue Ausgabe; bereits ausgegebene Vorteile bleiben bis zum Ablauf oder einer ausdrücklichen Sperre gültig.</p>}
    {enabled && !usable && <p className="text-sm">Zum Einschalten bitte ein freigegebenes, verfügbares Angebot wählen.</p>}
    <button type="submit" disabled={blocked || (enabled && !usable)} className={buttonClass}>{title} speichern</button>
  </form>
}
function displayDate(value: string | null) { return value ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}` : "Kein nächster Anlass" }
function MemberEditor({ companyId, member, blocked, save }: { companyId: string; member: OccasionMember; blocked: boolean; save: Save }) {
  const [employment, setEmployment] = useState(member.employment_started_on ?? "")
  const invalid = employment !== "" && (!occasionDate(employment) || employment < "1900-01-01" || employment > berlinToday())
  return <li className="space-y-3 rounded-2xl border border-[#061829]/10 p-4">
    <p className="break-words font-bold">{member.name || member.email}</p>
    <p className="text-sm">Geburtstag: {member.birthday_enabled && member.birthday_month !== null && member.birthday_day !== null ? `${member.birthday_day}.${member.birthday_month}. · ${displayDate(member.next_birthday_on)}` : "Keine freigegebene Geburtstagsangabe"}</p>
    <p className="text-sm">Dienstjubiläum: {displayDate(member.next_anniversary_on)}</p>
    <form aria-label={`Eintrittsdatum ${member.email}`} className="space-y-3" onSubmit={event => { event.preventDefault(); if (blocked || invalid) return; save(saveCorporateMemberOccasion, payload(companyId, member.updated_at, { userId: member.user_id, employmentStartedOn: employment })) }}>
      <fieldset disabled={blocked}>
        <legend className="sr-only">Eintrittsdatum pflegen</legend>
        <label className="grid gap-1.5 text-sm font-bold">Eintrittsdatum<input name="employmentStartedOn" type="date" min="1900-01-01" max={berlinToday()} value={employment} onChange={event => setEmployment(event.target.value)} className={inputClass} /></label>
      </fieldset>
      <button type="submit" disabled={blocked || invalid} className={buttonClass}>Eintrittsdatum speichern</button>
    </form>
  </li>
}
