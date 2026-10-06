import type { Metadata } from "next"
import { AdminShell } from "@/app/admin-shell"
import { CorporateRequestWorkspace } from "@/components/corporate/request-workspace"
import { loadCorporateCatalog, loadCorporateCompanies, parseOffset, type CompanyListResult } from "@/lib/corporate/companies"
import { requireAdmin } from "@/lib/admin"
import { loadCorporateRequests, parseCorporateStatusFilter, type CorporateListResult } from "@/lib/corporate/requests"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Firmenkonten & Anfragen", description: "Corporate-Benefits-Firmenkonten vorbereiten und Anfragen bearbeiten.", robots: { index: false, follow: false } }

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; companyOffset?: string | string[] }> }) {
  const { supabase, adminSession } = await requireAdmin()
  const query = await searchParams
  const status = parseCorporateStatusFilter(query.status)
  const offset = parseOffset(query.companyOffset)
  const [catalog, companies] = await Promise.all([
    loadCorporateCatalog(supabase),
    offset === null ? Promise.resolve<CompanyListResult>({ status: "error", message: "Ungültige Firmenseite. Bitte Firmenliste neu laden." }) : loadCorporateCompanies(supabase, offset),
  ])
  const today = new Date().toISOString().slice(0, 10)
  const lastStart = new Date(`${today}T00:00:00Z`)
  lastStart.setUTCDate(lastStart.getUTCDate() + 365)
  const result: CorporateListResult = status === undefined
    ? { status: "error", message: "Unbekannter Statusfilter. Bitte einen Status auswählen." }
    : await loadCorporateRequests(supabase, status)
  const adminName = adminSession.profile?.display_name || adminSession.profile?.email || adminSession.user.email || "Admin"
  return (
    <AdminShell adminName={adminName} title="Firmenkonten & Anfragen" subtitle="Corporate Benefits · Jahreskontingente, Teamaufnahme und interne Bearbeitung">
      <CorporateRequestWorkspace key={adminSession.user.id} result={result} selectedStatus={status ?? null} companies={companies} catalog={catalog} today={today} latestStart={lastStart.toISOString().slice(0, 10)} />
    </AdminShell>
  )
}
