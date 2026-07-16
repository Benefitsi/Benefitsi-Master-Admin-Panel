"use client"

import { useActionState } from "react"
import { LoadingSpinner } from "@/components/loading-ui"
import { partnerLogin, type PartnerLoginActionState } from "./actions"

const initialState: PartnerLoginActionState = {
  message: "",
}

type PartnerLoginFormProps = {
  isConfigured: boolean
}

export function PartnerLoginForm({ isConfigured }: PartnerLoginFormProps) {
  const [state, formAction, pending] = useActionState(partnerLogin, initialState)
  const disabled = pending || !isConfigured

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-zinc-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={disabled}
          className="h-11 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-2 focus:ring-[#118cff]/15 disabled:cursor-not-allowed disabled:bg-zinc-100"
          placeholder="owner@partner.com"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-zinc-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={disabled}
          className="h-11 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-2 focus:ring-[#118cff]/15 disabled:cursor-not-allowed disabled:bg-zinc-100"
          placeholder="Enter your password"
        />
      </div>

      {state.message ? (
        <p
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}

      {!isConfigured ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Add your Supabase publishable key to `.env.local` to enable sign in.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={disabled}
        aria-busy={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#17d4d7_0%,#118cff_100%)] px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(17,140,255,.2)] transition hover:-translate-y-px active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none"
      >
        {pending ? <LoadingSpinner /> : null}
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  )
}
