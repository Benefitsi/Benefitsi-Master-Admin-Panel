import Link from "next/link"
import { redirect } from "next/navigation"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { getAdminSession } from "@/lib/admin"
import { publicSeoTarget } from "@/lib/seo/seo-setup"
import { getSeoOperationsData } from "@/lib/seo/seo-data"
import { enqueueSeoAudit, enqueueSeoRankCheck } from "./actions"
import { SeoDashboard } from "./seo-dashboard"
import { AdminShell } from "../admin-shell"

export const dynamic = "force-dynamic"

export default async function SeoOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ started?: string; rank?: string; target?: string; error?: string; setup?: string; measurement?: string }>
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
    <AdminShell
      title="SEO & Sichtbarkeit"
      subtitle="Unternehmensprofile, Messungen und nächste Schritte"
      adminName={adminName}
    >
      {params.setup === "1" && <p role="status" className="rounded-md bg-[#f3f8ff] p-3 text-sm text-[#061829]">Profilvorbereitung gespeichert.</p>}
      {params.measurement === "1" && <p role="status" className="rounded-md bg-[#f3f8ff] p-3 text-sm text-[#061829]">Messversuch gespeichert. Den Zustand findest du bei den Messbelegen.</p>}
      <Link href="/seo/aieo" className="mb-4 inline-flex text-sm font-semibold text-[#0b75d9]">Offizielle KI-Berichtswerte ansehen oder importieren</Link>
      <SeoDashboard
        data={{...data, targets:data.targets.map(publicSeoTarget)}}
        initialTargetId={params.target}
        started={params.started === "1"}
        rankStarted={params.rank === "1"}
        error={params.error}
        startAuditAction={enqueueSeoAudit}
        startRankCheckAction={enqueueSeoRankCheck}
      />
    </AdminShell>
  )
}

function SetupRequired() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f6f1] px-5 text-zinc-950">
      <section className="w-full max-w-xl rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-[#0b75d9]">Benefitsi SEO &amp; Sichtbarkeit</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">Supabase-Konfiguration erforderlich</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Lege `.env.local` aus `.env.example` an und hinterlege den Supabase Publishable Key.
        </p>
      </section>
    </main>
  )
}
