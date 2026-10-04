"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { updateCorporateRequest } from "@/app/companies/actions"
import { corporateStatuses, corporateStatusLabels, type CorporateRequest, type CorporateStatus, type CorporateUpdateState } from "@/lib/corporate/requests"

const inputClass = "min-h-11 w-full rounded-xl border border-[#061829]/15 bg-white px-3 py-2.5 text-sm text-[#061829] outline-none focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"
const initial: CorporateUpdateState = { status: "idle", message: "" }

export function CorporateRequestEditor({ request }: { request: CorporateRequest }) {
  const [status, setStatus] = useState<CorporateStatus>(request.status)
  const [note, setNote] = useState(request.note)
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(request.updated_at)
  const formRef = useRef<HTMLFormElement>(null)
  const submitting = useRef(false)
  const [state, action, pending] = useActionState(async (previous: CorporateUpdateState, data: FormData): Promise<CorporateUpdateState> => {
    const submittedStatus = data.get("status")
    const submittedNote = data.get("note")
    // Keep the submitted draft when React resets a form after its action settles.
    if (typeof submittedStatus === "string" && corporateStatuses.some(value => value === submittedStatus)) setStatus(submittedStatus as CorporateStatus)
    if (typeof submittedNote === "string") setNote(submittedNote)
    try {
      const result = await updateCorporateRequest(previous, data)
      if (result.status === "updated" && result.updatedAt) setExpectedUpdatedAt(result.updatedAt)
      return result
    } catch {
      return { status: "error", message: "Speichern fehlgeschlagen. Bitte erneut versuchen; Ihre Eingaben bleiben erhalten." }
    } finally {
      submitting.current = false
    }
  }, initial)
  useEffect(() => {
    if (state.status === "idle" || !formRef.current) return
    const statusInput = formRef.current.elements.namedItem("status") as HTMLSelectElement | null
    const noteInput = formRef.current.elements.namedItem("note") as HTMLTextAreaElement | null
    if (statusInput) statusInput.value = status
    if (noteInput) noteInput.value = note
  }, [state, status, note])
  const mustRefresh = state.status === "conflict" || state.status === "not_found"
  const count = [...note].length

  return (
    <form ref={formRef} action={action} aria-label={`Anfrage von ${request.company_name} bearbeiten`} aria-busy={pending} onSubmit={event => {
      if (submitting.current || mustRefresh) event.preventDefault()
      else submitting.current = true
    }} className="space-y-4">
      <input type="hidden" name="requestId" value={request.request_id} />
      <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      <fieldset disabled={pending || mustRefresh} className="space-y-4 disabled:opacity-70">
        <legend className="mb-3 text-sm font-black">Interne Bearbeitung</legend>
        <label className="grid gap-1.5 text-xs font-bold text-[#526170]">
          Anfragestatus
          <select name="status" value={status} onChange={event => setStatus(event.target.value as CorporateStatus)} className={inputClass}>
            {corporateStatuses.map(value => <option key={value} value={value}>{corporateStatusLabels[value]}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-[#526170]">
          Interne Notiz
          <textarea name="note" value={note} onChange={event => setNote(event.target.value)} rows={4} maxLength={4000} className={`${inputClass} resize-y`} aria-describedby={`note-limit-${request.request_id}`} />
        </label>
        <p id={`note-limit-${request.request_id}`} className={`text-xs ${count > 2000 ? "text-red-700" : "text-[#617080]"}`}>{count} / 2000 Zeichen · Nur für Admins</p>
      </fieldset>
      {state.message && <div role={state.status === "updated" ? "status" : "alert"} className={`rounded-xl border p-3 text-sm ${state.status === "updated" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
        <p>{state.message}</p>
        {mustRefresh && <a href="/companies" className="mt-2 inline-block font-bold underline">Seite neu laden</a>}
      </div>}
      <button type="submit" disabled={pending || mustRefresh || count > 2000} className="min-h-11 rounded-xl bg-[#118cff] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0b75d9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff] disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? "Speichert …" : "Status & Notiz speichern"}
      </button>
    </form>
  )
}
