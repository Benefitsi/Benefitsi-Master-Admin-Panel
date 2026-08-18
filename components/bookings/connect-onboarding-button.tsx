"use client"

import { useState } from "react"

export function ConnectOnboardingButton({
  providerId,
  enabled,
  disabledReason,
}: {
  providerId: string
  enabled: boolean
  disabledReason: string
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  if (!enabled) {
    return (
      <div className="max-w-72 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
        <p className="text-sm font-black text-amber-950">
          Connect-Onboarding gesperrt
        </p>
        <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
          {disabledReason}
        </p>
      </div>
    )
  }

  async function start() {
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/stripe/connect/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId }),
      })
      const data = (await response.json()) as {
        onboardingUrl?: string
        error?: string
      }
      if (!response.ok || !data.onboardingUrl) {
        setError(data.error || "Onboarding konnte nicht gestartet werden.")
        return
      }
      window.location.assign(data.onboardingUrl)
    } catch {
      setError("Onboarding konnte nicht gestartet werden.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="min-h-11 rounded-xl bg-[#118cff] px-4 text-sm font-black text-white transition hover:bg-[#0878df] disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Stripe wird vorbereitet …" : "Stripe-Test-Onboarding"}
      </button>
      {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </div>
  )
}
