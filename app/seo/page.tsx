import { redirect } from "next/navigation"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { getAdminSession } from "@/lib/admin"
import { getSeoOperationsData } from "@/lib/seo/seo-data"
import { enqueueSeoAudit, enqueueSeoRankCheck } from "./actions"
import { SeoDashboard } from "./seo-dashboard"
import Image from "next/image"
import Link from "next/link"
import { signOut } from "../actions"

export const dynamic = "force-dynamic"

export default async function SeoOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ started?: string; rank?: string; target?: string; error?: string }>
}) {
  const config = getSupabaseConfig()
  if (!config.isConfigured) return <SetupRequired />

  const supabase = await createClient()
  const adminSession = await getAdminSession(supabase)
  if (!adminSession?.isAdmin) redirect("/login")

  const data = await getSeoOperationsData(supabase)
  const params = await searchParams
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
            <div className="grid size-10 place-items-center rounded-md bg-white text-sm font-bold text-white">
              <Image src="/Benefitsi_Icon_FullColor_RGB_512.png" alt="Benefitsi Logo" width={35} height={35} />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-800">Benefitsi</p>
              <p className="text-xs text-zinc-500">Admin panel</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            <Link href="/" className="flex h-10 items-center rounded-md px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950">
              Partners
            </Link>
            <a href="/seo" className="flex h-10 items-center rounded-md bg-teal-50 px-3 text-sm font-medium text-teal-800">
              SEO &amp; Sichtbarkeit
            </a>
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex flex-col gap-4 border-b border-zinc-200 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
            <div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">SEO &amp; Sichtbarkeit</h1>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="max-w-full truncate text-sm text-zinc-600">{adminName}</p>
              <form action={signOut}>
                <button type="submit" className="h-10 w-full rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 sm:w-auto">
                  Sign out
                </button>
              </form>
            </div>
          </header>

          <div className="space-y-6 px-5 py-6 lg:px-8">
            <SeoDashboard
              data={data}
              initialTargetId={params.target}
              started={params.started === "1"}
              rankStarted={params.rank === "1"}
              error={params.error}
              startAuditAction={enqueueSeoAudit}
              startRankCheckAction={enqueueSeoRankCheck}
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
        <p className="text-sm font-medium text-teal-700">Benefitsi SEO &amp; Sichtbarkeit</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">Supabase-Konfiguration erforderlich</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Lege `.env.local` aus `.env.example` an und hinterlege den Supabase Publishable Key.
        </p>
      </section>
    </main>
  )
}
