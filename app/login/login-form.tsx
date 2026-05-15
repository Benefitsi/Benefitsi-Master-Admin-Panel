"use client"

import { useActionState } from "react"
import { login, type LoginActionState } from "./actions"

const initialState: LoginActionState = {
  message: "",
}

type LoginFormProps = {
  isConfigured: boolean
}

export function LoginForm({ isConfigured }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(login, initialState)
  const disabled = pending || !isConfigured

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="text-sm font-medium text-zinc-700"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={disabled}
          className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-zinc-100"
          placeholder="admin@benefitsi.com"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="text-sm font-medium text-zinc-700"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={disabled}
          className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-zinc-100"
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
        className="h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  )
}
