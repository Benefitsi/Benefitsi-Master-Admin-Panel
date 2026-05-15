import { redirect } from "next/navigation"
import { signOut } from "./actions"
import { getAdminSession } from "@/lib/admin"
import { getDashboardData } from "@/lib/admin-data"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { PartnerWorkspace } from "./partner-admin"

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
    <main className="min-h-screen bg-[#f6f7f4] text-zinc-950">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-zinc-200 bg-white px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-teal-700 text-sm font-bold text-white">
              B
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-800">
                Benefitsi
              </p>
              <p className="text-xs text-zinc-500">Admin panel</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            <a
              href="#partners"
              className="flex h-10 items-center rounded-md bg-teal-50 px-3 text-sm font-medium text-teal-800"
            >
              Partners
            </a>
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex flex-col gap-4 border-b border-zinc-200 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
            <div>
              <p className="text-sm font-medium text-teal-700">Partners</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">
                Partner and deal administration
              </h1>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="max-w-full truncate text-sm text-zinc-600">
                {adminName}
              </p>
              <form action={signOut}>
                <button
                  type="submit"
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 sm:w-auto"
                >
                  Sign out
                </button>
              </form>
            </div>
          </header>

          <div className="space-y-6 px-5 py-6 lg:px-8">
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
          </div>
        </section>
      </div>
    </main>
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
