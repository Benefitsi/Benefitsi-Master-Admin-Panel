import { redirect } from "next/navigation"
import { signOut } from "@/app/actions"
import { getAdminSession } from "@/lib/admin"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { LoginForm } from "./login-form"

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const config = getSupabaseConfig()

  if (config.isConfigured) {
    const supabase = await createClient()
    const adminSession = await getAdminSession(supabase)

    if (adminSession?.isAdmin) {
      redirect("/")
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f4] text-zinc-950">
      <div className="grid min-h-screen lg:grid-cols-[1fr_460px]">
        <section className="hidden bg-zinc-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-teal-500 text-sm font-bold text-zinc-950">
              B
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-200">
                Benefitsi
              </p>
              <p className="text-sm text-zinc-400">Admin operations</p>
            </div>
          </div>

          <div className="max-w-xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.16em] text-amber-300">
              Secure workspace
            </p>
            <h1 className="max-w-lg text-5xl font-semibold leading-tight tracking-normal">
              Deals, rewards, and partners in one calm console.
            </h1>
          </div>

          <div className="grid grid-cols-4">
            {[
              ["", "Available on Android and iOS platforms"],
            ].map(([value, label]) => (
              <div
                key={label}
                className="rounded-md border border-white/10 bg-white/5 p-4"
              >
                <p className="text-2xl font-semibold text-white">{value}</p>
                <p className="mt-1 text-sm text-zinc-400">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10">
          <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-8">
              <div className="mb-6 grid size-11 place-items-center rounded-md bg-teal-100 text-base font-bold text-teal-900 lg:hidden">
                B
              </div>
              <p className="text-sm font-medium text-teal-700">Benefitsi</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal text-zinc-950">
                Admin sign in
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Use your Supabase admin account to access the console.
              </p>
            </div>

            {config.isConfigured ? <NonAdminSessionNotice /> : null}
            <LoginForm isConfigured={config.isConfigured} />
          </div>
        </section>
      </div>
    </main>
  )
}

async function NonAdminSessionNotice() {
  const supabase = await createClient()
  const adminSession = await getAdminSession(supabase)

  if (!adminSession || adminSession.isAdmin) {
    return null
  }

  return (
    <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-medium">The current account is not an admin.</p>
      <form action={signOut} className="mt-2">
        <button
          type="submit"
          className="h-9 rounded-md bg-amber-900 px-3 text-xs font-semibold text-white transition hover:bg-amber-950"
        >
          Sign out of this account
        </button>
      </form>
    </div>
  )
}
