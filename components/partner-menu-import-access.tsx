"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { setPartnerMenuImportEnabled } from "@/app/partner-actions"

export function PartnerMenuImportAccess({ partnerId, enabled }: {
  partnerId: string
  enabled: boolean | null
}) {
  const router = useRouter()
  const [savedValue, setSavedValue] = useState(enabled)
  const [previousValue, setPreviousValue] = useState(enabled)
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()
  const submitting = useRef(false)

  if (enabled !== previousValue) {
    setPreviousValue(enabled)
    setSavedValue(enabled)
  }

  function toggle() {
    if (submitting.current || savedValue === null) return
    submitting.current = true
    const next = !savedValue
    setMessage("")
    setFailed(false)
    startTransition(async () => {
      try {
        const form = new FormData()
        form.set("partner_id", partnerId)
        form.set("enabled", String(next))
        const result = await setPartnerMenuImportEnabled(form)
        if (result.ok && typeof result.enabled === "boolean") {
          setSavedValue(result.enabled)
          router.refresh()
        } else setFailed(true)
        setMessage(result.message)
      } catch {
        setFailed(true)
        setMessage("Die Freischaltung konnte nicht bestätigt werden. Bitte die Seite neu laden und den Status prüfen.")
      } finally {
        submitting.current = false
      }
    })
  }

  return (
    <section aria-label="Menüimport im Partner-Dashboard" className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900">Menüimport im Partner-Dashboard</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-600">Erlaubt dem Inhaber, seine Speisekarte aus Foto oder PDF zu übernehmen und zu bearbeiten. Im Admin-Panel ist der Import immer verfügbar.</p>
        </div>
        <button type="button" role="switch" aria-checked={savedValue === true}
          aria-label="Menüimport für diesen Partner freischalten" aria-busy={pending}
          disabled={pending || savedValue === null} onClick={toggle}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60">
          <span aria-hidden="true" className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${savedValue ? "bg-teal-700" : "bg-zinc-300"}`}>
            <span className={`size-4 rounded-full bg-white transition-transform ${savedValue ? "translate-x-4" : ""}`} />
          </span>
          {pending ? "Speichert…" : savedValue === null ? "Nicht verfügbar" : savedValue ? "Freigeschaltet" : "Nicht freigeschaltet"}
        </button>
      </div>
      {savedValue === null ? <p role="alert" className="mt-2 text-xs text-amber-800">Die Freischaltung konnte nicht geladen werden. Bitte die Seite neu laden.</p> : null}
      {message ? <p role={failed ? "alert" : "status"} className={`mt-2 text-xs ${failed ? "text-rose-700" : "text-teal-800"}`}>{message}</p> : null}
    </section>
  )
}
