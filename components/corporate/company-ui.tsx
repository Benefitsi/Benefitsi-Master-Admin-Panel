import { type CompanyMutationState } from "@/lib/corporate/companies"
export const corporateInputClass = "min-h-11 w-full rounded-xl border border-[#061829]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"
export const corporateButtonClass = "min-h-11 rounded-xl bg-[#118cff] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0b75d9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff] disabled:cursor-not-allowed disabled:opacity-50"
export const corporatePanelClass = "rounded-3xl border border-[#061829]/10 bg-white p-5 sm:p-6"
export function mustReload(state: CompanyMutationState) { return state.status === "conflict" || state.status === "not_found" || state.status === "catalog_changed" }
export function CompanyFeedback({ state, href }: { state: CompanyMutationState; href: string }) {
  if (!state.message) return null
  const success = ["created", "updated", "issued", "revoked", "removed"].includes(state.status)
  return <div role={success ? "status" : "alert"} className={`rounded-xl border p-3 text-sm ${success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
    <p>{state.message}</p>
    {mustReload(state) && <a href={href} className="mt-2 inline-block font-bold underline">Aktuelle Angaben neu laden</a>}
  </div>
}
export function CompanyPagination({ offset, total, href }: { offset: number; total: number; href: (offset: number) => string }) {
  return <nav aria-label="Seitenauswahl" className="flex flex-wrap items-center gap-4 text-sm">
    <span>{total <= offset ? `${total} Einträge · Seite leer` : `${offset + 1}–${Math.min(offset + 50, total)} von ${total}`}</span>
    {offset > 0 && <a className="inline-flex min-h-11 items-center font-bold text-[#0b75d9] underline" href={href(Math.max(0, offset - 50))}>Vorherige Seite</a>}
    {offset + 50 < total && offset + 50 <= 1000000 && <a className="inline-flex min-h-11 items-center font-bold text-[#0b75d9] underline" href={href(offset + 50)}>Nächste Seite</a>}
  </nav>
}
