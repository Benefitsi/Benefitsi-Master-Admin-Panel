import {loadRecurringContract,loadInvoiceIndex,loadAdminOperations} from '@/lib/corporate/recurring'
import {corporateReadiness} from '@/lib/corporate/billing-runtime'
import {CorporateRecurringContract} from '@/components/corporate/CorporateRecurringContract'
import {CorporateRecurringBilling} from '@/components/corporate/CorporateRecurringBilling'
import {CorporateRecurringReadiness} from '@/components/corporate/CorporateRecurringReadiness'
import { loadCorporateBilling } from "@/lib/corporate/annual"
import { CorporateAnnualBilling } from "@/components/corporate/CorporateAnnualBilling"
import Link from "next/link"
import { AdminTranslationBoundary } from "@/components/admin-translation-boundary"
import type { Metadata } from "next"
import { AdminShell } from "@/app/admin-shell"
import { requireAdmin } from "@/lib/admin"
import { loadCorporateCompany, parseOffset, type CompanyDetailResult } from "@/lib/corporate/companies"
import { CorporateEmployeeAdmission, CorporateCompanySummary, CorporateCompanyEditor, CorporateRoster } from "@/components/corporate/company-detail"
import { CorporateCompanyBranding } from "@/components/corporate/company-branding"
import { CorporateCompanyPremium } from "@/components/corporate/company-premium"
import { CorporateCompanyInvitation } from "@/components/corporate/company-invitation"
export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Firmenkonto", robots: { index: false, follow: false } }
export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ offset?: string | string[]; invoiceBefore?: string | string[] }> }) {
  const { supabase, adminSession } = await requireAdmin()
  const { id } = await params
  const query = await searchParams
  const offset = parseOffset(query.offset)
  const before = typeof query.invoiceBefore === "string" ? query.invoiceBefore : null
  const result: CompanyDetailResult = offset === null ? { status: "invalid", message: "Ungültige Teamseite. Bitte Firmenkonto neu laden." } : await loadCorporateCompany(supabase, id, offset)
  const billing = result.status === "ok" ? await loadCorporateBilling(supabase, id) : null
  const recurring = result.status === "ok" ? await loadRecurringContract(supabase, id) : null
  const invoiceIndex = recurring ? await loadInvoiceIndex(supabase, id, before) : null
  const operations = recurring ? await loadAdminOperations(supabase, id) : null
  const runtime = corporateReadiness(process.env)
  const adminName = adminSession.profile?.display_name || adminSession.profile?.email || adminSession.user.email || "Admin"
  return <AdminShell adminName={adminName} title="Firmenkonto" subtitle="Corporate Benefits · Jahreskontingent und persönliche Teamaufnahme">
    <AdminTranslationBoundary><div className="space-y-5">
      <Link href="/companies" className="inline-flex min-h-11 items-center text-sm font-bold text-[#0b75d9] underline">Zur Firmenliste und den Anfragen</Link>
      {result.status !== "ok" ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm">{result.message}</div> : <>
        <CorporateCompanySummary company={result.company} />
        <CorporateCompanyEditor key={`${adminSession.user.id}:${result.company.company_id}`} company={result.company} />
        <CorporateEmployeeAdmission company={result.company} adminIdentity={adminSession.user.id} />
        <CorporateCompanyBranding company={result.company} adminIdentity={adminSession.user.id} />
        {billing && <CorporateAnnualBilling billing={billing} adminIdentity={adminSession.user.id} />}
        {recurring ? <>
          <CorporateRecurringContract key={`${adminSession.user.id}:${id}:contract`} state={recurring}/>
          <CorporateRecurringBilling key={`${adminSession.user.id}:${id}:invoices:${before??"latest"}`} state={recurring} index={invoiceIndex} before={before}/>
          <CorporateRecurringReadiness key={`${adminSession.user.id}:${id}:readiness`} state={recurring} runtime={runtime} operations={operations}/>
          {!recurring.contract && <CorporateCompanyPremium company={result.company} adminIdentity={adminSession.user.id} />}
        </> : <p role="alert">Wiederkehrende Vertragsdaten konnten nicht bestätigt werden. Zahlungsaktionen bleiben gesperrt; bitte aktuelle Angaben neu laden.</p>}
        <CorporateCompanyInvitation key={`${adminSession.user.id}:${result.company.company_id}`} company={result.company} />
        <CorporateRoster key={`${adminSession.user.id}:${result.company.company_id}`} detail={result} />
      </>}
    </div></AdminTranslationBoundary>
  </AdminShell>
}
