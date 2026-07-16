import { redirect } from "next/navigation"
import { signOut } from "@/app/actions"
import { getAdminSession } from "@/lib/admin"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { LoginForm } from "./login-form"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { BrandLogo } from "@/components/brand-logo"

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
    <main className="min-h-screen bg-[#f7f6f1] text-[#061829]">
      <div className="grid min-h-screen lg:grid-cols-[1fr_460px]">
        <section className="hidden bg-[#061829] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <BrandLogo surface="dark" className="h-auto w-48" priority />
            <p className="mt-3 text-sm font-medium text-white/55">Admin Panel</p>
          </div>

          <div className="max-w-xl">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-[#17d4d7]">
              Sicherer Arbeitsbereich
            </p>
            <h1 className="max-w-lg text-5xl font-black leading-[1.05] tracking-[-0.05em]">
              Partner, Vorteile und Inhalte an einem Ort.
            </h1>
          </div>

          <div className="grid grid-cols-4">
            {[
              ["", "Available on Android and iOS platforms"],
            ].map(([value, label]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <p className="text-2xl font-semibold text-white">{value}</p>
                <p className="mt-1 text-sm text-zinc-400">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10">
          <div className="w-full max-w-md rounded-2xl border border-[#061829]/10 bg-white p-6 shadow-[0_24px_70px_rgba(6,24,41,.08)] sm:p-8">
            <div className="mb-8">
              <BrandLogo className="mb-7 h-auto w-44 lg:hidden" priority />
              <p className="text-sm font-bold text-[#118cff]">Admin Panel</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-[#061829]">
                Admin-Anmeldung
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#526170]">
                Melde dich mit deinem Supabase-Administratorkonto an.
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
        <PendingSubmitButton
          pendingLabel="Signing out..."
          className="h-9 rounded-md bg-amber-900 px-3 text-xs font-semibold text-white transition hover:bg-amber-950"
        >
          Sign out of this account
        </PendingSubmitButton>
      </form>
    </div>
  )
}
