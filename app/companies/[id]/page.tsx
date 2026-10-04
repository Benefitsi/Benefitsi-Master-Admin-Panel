import Link from "next/link"
import type { Metadata } from "next"
import { AdminShell } from "@/app/admin-shell"
import { requireAdmin } from "@/lib/admin"
import { loadCorporateCompany, parseOffset, type CompanyDetailResult } from "@/lib/corporate/companies"
import { CorporateCompanySummary, CorporateCompanyEditor, CorporateRoster } from "@/components/corporate/company-detail"
import { CorporateCompanyInvitation } from "@/components/corporate/company-invitation"
export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Firmenkonto", robots: { index: false, follow: false } }
export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ offset?: string | string[] }> }) {
  const { supabase, adminSession } = await requireAdmin()
  const { id } = await params
  const offset = parseOffset((await searchParams).offset)
  const result: CompanyDetailResult = offset === null ? { status: "invalid", message: "Ungültige Teamseite. Bitte Firmenkonto neu laden." } : await loadCorporateCompany(supabase, id, offset)
  const adminName = adminSession.profile?.display_name || adminSession.profile?.email || adminSession.user.email || "Admin"
  return <AdminShell adminName={adminName} title="Firmenkonto" subtitle="Corporate Benefits · Jahreskontingent und persönliche Teamaufnahme">
    <div className="space-y-5">
      <Link href="/companies" className="inline-flex min-h-11 items-center text-sm font-bold text-[#0b75d9] underline">Zur Firmenliste und den Anfragen</Link>
      {result.status !== "ok" ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm">{result.message}</div> : <>
        <CorporateCompanySummary company={result.company} />
        <CorporateCompanyEditor company={result.company} />
        <CorporateCompanyInvitation key={result.company.company_id} company={result.company} />
        <CorporateRoster detail={result} />
      </>}
    </div>
  </AdminShell>
}
