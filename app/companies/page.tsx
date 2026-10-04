import type { Metadata } from "next"
import { AdminShell } from "@/app/admin-shell"
import { CorporateRequestWorkspace } from "@/components/corporate/request-workspace"
import { requireAdmin } from "@/lib/admin"
import { loadCorporateRequests, parseCorporateStatusFilter, type CorporateListResult } from "@/lib/corporate/requests"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Firmenanfragen", description: "Unverbindliche Corporate-Benefits-Anfragen bearbeiten." }

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const { supabase, adminSession } = await requireAdmin()
  const status = parseCorporateStatusFilter((await searchParams).status)
  const result: CorporateListResult = status === undefined
    ? { status: "error", message: "Unbekannter Statusfilter. Bitte einen Status auswählen." }
    : await loadCorporateRequests(supabase, status)
  const adminName = adminSession.profile?.display_name || adminSession.profile?.email || adminSession.user.email || "Admin"
  return (
    <AdminShell adminName={adminName} title="Firmenanfragen" subtitle="Corporate Benefits · Unverbindliche Anfragen und interne Bearbeitung">
      <CorporateRequestWorkspace result={result} selectedStatus={status ?? null} />
    </AdminShell>
  )
}
