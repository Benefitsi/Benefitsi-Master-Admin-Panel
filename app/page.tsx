import { redirect } from "next/navigation"
import { getAdminSession } from "@/lib/admin"
import { getDashboardData } from "@/lib/admin-data"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { PartnerWorkspace } from "./partner-admin"
import { AdminShell } from "./admin-shell"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const config = getSupabaseConfig()

  if (!config.isConfigured) {
    return <SetupRequired />
  }

  const supabase = await createClient()
  const adminSession = await getAdminSession(supabase)

  if (!adminSession?.isAdmin) {
    redirect("/login")
  }

  const dashboard = await getDashboardData(supabase)
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"

  return (
    <AdminShell adminName={adminName}>
      {dashboard.errors.length > 0 ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Supabase returned warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {dashboard.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <PartnerWorkspace
        partners={dashboard.partners}
        cities={dashboard.cities}
        owners={dashboard.owners}
      />
    </AdminShell>
  )
}

function SetupRequired() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f4] px-5 text-zinc-950">
      <section className="w-full max-w-xl rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-teal-700">Benefitsi Admin</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          Supabase env setup required
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Create `.env.local` from `.env.example`, then add your Supabase
          publishable key.
        </p>
      </section>
    </main>
  )
}
