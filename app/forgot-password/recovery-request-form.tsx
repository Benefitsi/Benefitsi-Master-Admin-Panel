"use client"

import { useState, type FormEvent } from "react"
import { CheckCircle2 } from "lucide-react"
import { LoadingSpinner } from "@/components/loading-ui"
import { createClient } from "@/lib/supabase/client"
import {
  resetPasswordPathForPortal,
  type AuthPortal,
} from "@/lib/auth-recovery"

type RecoveryRequestFormProps = {
  portal: AuthPortal
  isConfigured: boolean
}

export function RecoveryRequestForm({
  portal,
  isConfigured,
}: RecoveryRequestFormProps) {
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [message, setMessage] = useState("")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage("")
    setPending(true)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim().toLowerCase()

    try {
      const supabase = createClient()
      const redirectTo = new URL(
        resetPasswordPathForPortal(portal),
        window.location.origin,
      ).toString()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })

      if (error) {
        setMessage(
          error.status === 429
            ? "Too many recovery emails were requested. Please wait a few minutes and try again."
            : "We could not send the recovery email. Please try again shortly.",
        )
        return
      }

      setSent(true)
    } catch {
      setMessage("We could not send the recovery email. Please try again shortly.")
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900"
        role="status"
      >
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">Check your email</p>
            <p className="mt-1 leading-6">
              If an account exists for that address, a password recovery link
              has been sent. You can close this page after opening the email.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const disabled = pending || !isConfigured

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor={`${portal}-recovery-email`} className="text-sm font-medium text-zinc-700">
          Email
        </label>
        <input
          id={`${portal}-recovery-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={disabled}
          className="h-11 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-2 focus:ring-[#118cff]/15 disabled:cursor-not-allowed disabled:bg-zinc-100"
          placeholder={portal === "partner" ? "owner@partner.com" : "admin@benefitsi.com"}
        />
      </div>

      {message ? (
        <p
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}

      {!isConfigured ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Add your Supabase publishable key to `.env.local` to enable account
          recovery.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={disabled}
        aria-busy={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#17d4d7_0%,#118cff_100%)] px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(17,140,255,.2)] transition hover:-translate-y-px hover:shadow-[0_12px_28px_rgba(17,140,255,.26)] active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none"
      >
        {pending ? <LoadingSpinner /> : null}
        {pending ? "Sending recovery email..." : "Send recovery email"}
      </button>
    </form>
  )
}
