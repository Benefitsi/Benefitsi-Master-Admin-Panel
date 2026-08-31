"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { CheckCircle2, CircleAlert } from "lucide-react"
import { LoadingSpinner } from "@/components/loading-ui"
import { createClient } from "@/lib/supabase/client"
import {
  loginPathForPortal,
  type AuthPortal,
} from "@/lib/auth-recovery"

type RecoveryPhase = "checking" | "ready" | "invalid" | "success"

type ResetPasswordFormProps = {
  portal: AuthPortal
  code?: string
  authError?: string
  confirmedByServer: boolean
  isConfigured: boolean
}

export function ResetPasswordForm({
  portal,
  code,
  authError,
  confirmedByServer,
  isConfigured,
}: ResetPasswordFormProps) {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const [phase, setPhase] = useState<RecoveryPhase>(
    authError || !isConfigured ? "invalid" : "checking",
  )
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    let active = true

    if (!isConfigured) {
      return () => {
        active = false
      }
    }

    const supabase = createClient()
    supabaseRef.current = supabase

    async function initializeRecoverySession() {
      if (authError) {
        if (active) setPhase("invalid")
        return
      }

      const hashParams = new URLSearchParams(window.location.hash.slice(1))
      const hasImplicitRecoveryToken = hashParams.get("type") === "recovery"

      if (!code && !confirmedByServer && !hasImplicitRecoveryToken) {
        if (active) setPhase("invalid")
        return
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
          if (active) setPhase("invalid")
          return
        }
      }

      const { data, error } = await supabase.auth.getSession()

      if (!active) return
      setPhase(!error && data.session ? "ready" : "invalid")
    }

    void initializeRecoverySession()

    return () => {
      active = false
    }
  }, [authError, code, confirmedByServer, isConfigured])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage("")

    const formData = new FormData(event.currentTarget)
    const password = String(formData.get("password") ?? "")
    const confirmation = String(formData.get("passwordConfirmation") ?? "")

    if (password.length < 8) {
      setMessage("Use at least 8 characters for your new password.")
      return
    }

    if (password !== confirmation) {
      setMessage("The passwords do not match.")
      return
    }

    setPending(true)

    try {
      const supabase = supabaseRef.current ?? createClient()
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        setMessage(
          error.message.toLowerCase().includes("password")
            ? "That password cannot be used. Choose a stronger password and try again."
            : "We could not update your password. Request a new recovery link and try again.",
        )
        return
      }

      await supabase.auth.signOut({ scope: "global" })
      setPhase("success")
    } catch {
      setMessage("We could not update your password. Please try again.")
    } finally {
      setPending(false)
    }
  }

  if (phase === "checking") {
    return (
      <div className="flex items-center justify-center gap-3 rounded-xl border border-[#061829]/10 bg-[#f7f6f1] px-4 py-5 text-sm text-[#526170]" role="status">
        <LoadingSpinner className="text-[#118cff]" />
        Verifying your recovery link...
      </div>
    )
  }

  if (phase === "invalid") {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900" role="alert">
        <div className="flex gap-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">This recovery link is invalid or expired.</p>
            <p className="mt-1 leading-6">
              Return to sign in and request a new password recovery email.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (phase === "success") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900" role="status">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">Your password has been updated.</p>
            <p className="mt-1 leading-6">You can now sign in with your new password.</p>
            <Link
              href={loginPathForPortal(portal)}
              className="mt-3 inline-flex font-bold text-[#0872d1] hover:underline"
            >
              Continue to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="new-password" className="text-sm font-medium text-zinc-700">
          New password
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={pending}
          className="h-11 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-2 focus:ring-[#118cff]/15 disabled:cursor-not-allowed disabled:bg-zinc-100"
          placeholder="At least 8 characters"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="confirm-new-password" className="text-sm font-medium text-zinc-700">
          Confirm new password
        </label>
        <input
          id="confirm-new-password"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={pending}
          className="h-11 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-2 focus:ring-[#118cff]/15 disabled:cursor-not-allowed disabled:bg-zinc-100"
          placeholder="Repeat your new password"
        />
      </div>

      {message ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" aria-live="polite">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#17d4d7_0%,#118cff_100%)] px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(17,140,255,.2)] transition hover:-translate-y-px hover:shadow-[0_12px_28px_rgba(17,140,255,.26)] active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none"
      >
        {pending ? <LoadingSpinner /> : null}
        {pending ? "Updating password..." : "Update password"}
      </button>
    </form>
  )
}
