/* eslint-disable @next/next/no-html-link-for-pages -- Full reload deliberately clears stale optimistic drafts and reloads private lists. */
import { companyStatusLabels, euro, period, type CompanyListResult } from "@/lib/corporate/companies"
import { CompanyPagination, corporatePanelClass } from "@/components/corporate/company-ui"
export function CorporateCompanyIndex({ result, selectedStatus }: { result: CompanyListResult; selectedStatus?: string | null }) {
  return <section aria-label="Firmenkonten" className={`${corporatePanelClass} space-y-4`}>
    <h2 className="text-xl font-black">Vorbereitete Firmenkonten</h2>
    <p className="text-sm text-[#617080]">Feste Jahresvereinbarungen und aktuelle Platzbelegung. Premium-Zugang ist noch nicht aktiviert.</p>
    {result.status === "error" ? <p role="alert" className="text-sm text-amber-900">{result.message} <a href="/companies" className="font-bold underline">Neu laden</a></p> : <>
      <CompanyPagination offset={result.offset} total={result.total} href={offset => `/companies?companyOffset=${offset}${selectedStatus ? `&status=${selectedStatus}` : ""}`} />
      {result.companies.length === 0 ? <p className="text-sm">Keine Firmenkonten auf dieser Seite.</p> : <ul className="grid gap-3 lg:grid-cols-2">{result.companies.map(company => <li key={company.company_id} className="space-y-2 rounded-2xl border border-[#061829]/10 p-4">
        <a href={`/companies/${company.company_id}`} className="inline-flex min-h-11 items-center break-words font-black text-[#0b75d9] underline">{company.company_name}</a>
        <p className="text-xs">{companyStatusLabels[company.status]} · {company.city}</p>
        <p className="text-sm">{company.seats} vereinbarte Mitarbeiterplätze · {company.employee_count} zugeordnet · {company.reserved_count} reserviert · {company.available_seats} frei</p>
        <p className="text-sm font-bold">{euro(company.total_amount_cents)} netto/Jahr · zzgl. MwSt.</p>
        <p className="text-xs">{period(company.starts_on, company.ends_on)} · Katalog {company.catalog_version}</p>
      </li>)}</ul>}
    </>}
  </section>
}
