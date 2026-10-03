"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

export function MicrositeCapabilitiesNotice() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div role="status" className="mx-auto mb-4 max-w-[1800px] rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p>Tarifberechtigungen konnten nicht geladen werden. Dein Profil bleibt sichtbar. Zusatzfunktionen sind bis zur erfolgreichen Prüfung nicht verfügbar.</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        className="mt-2 min-h-10 rounded-lg border border-amber-300 px-3 py-2 font-semibold disabled:opacity-60"
      >
        {pending ? "Wird geprüft …" : "Erneut versuchen"}
      </button>
    </div>
  )
}
