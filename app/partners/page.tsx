import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getAdminSession } from "@/lib/admin"
import { getDashboardData } from "@/lib/admin-data"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { AdminTranslationBoundary } from "@/components/admin-translation-boundary"
import { AdminShell } from "../admin-shell"
import { PartnerWorkspace } from "../partner-admin"

export const dynamic = "force-dynamic"
export const maxDuration = 180

type PartnerSearch = Record<string, string | string[] | undefined>

export default async function PartnersPage({ searchParams }: { searchParams: Promise<PartnerSearch> }) {
  if (!getSupabaseConfig().isConfigured) redirect("/")
  const supabase = await createClient()
  const session = await getAdminSession(supabase)
  if (!session?.isAdmin) redirect("/login")
  const query = await searchParams
  const data = getDashboardData(supabase, { entitlementPartnerId: singleQueryValue(query.partner) || null })
  const adminName = session.profile?.display_name || session.profile?.email || session.user.email || "Admin"
  return (
    <AdminShell title="Partner management" subtitle="All partners and their information" adminName={adminName}>
      <Suspense fallback={<p role="status" className="text-sm text-zinc-500">Loading partners…</p>}>
        <DashboardPartners data={data} query={query} />
      </Suspense>
    </AdminShell>
  )
}

async function DashboardPartners({ data, query }: {
  data: ReturnType<typeof getDashboardData>
  query: PartnerSearch
}) {
  const dashboard = await data
  const requestedPartnerId = singleQueryValue(query.partner)
  const initialPartnerId = dashboard.partners.some(partner => partner.id === requestedPartnerId)
    ? requestedPartnerId : dashboard.partners[0]?.id ?? ""
  return <AdminTranslationBoundary>
    {dashboard.errors.length > 0 ? (
      <section className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Supabase returned warnings</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {dashboard.errors.map(error => <li key={error}>{error}</li>)}
        </ul>
      </section>
    ) : null}
    <PartnerWorkspace
      partners={dashboard.partners}
      cities={dashboard.cities}
      owners={dashboard.owners}
      initialMode={singleQueryValue(query.mode) === "create" ? "create" : "view"}
      initialPartnerId={initialPartnerId}
      initialSettingsTab={singleQueryValue(query.tab)}
      initialView={singleQueryValue(query.view) === "microsite" ? "microsite" : "settings"}
    />
  </AdminTranslationBoundary>
}

function singleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}
