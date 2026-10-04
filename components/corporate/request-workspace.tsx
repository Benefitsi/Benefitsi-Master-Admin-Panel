import { CorporateRequestEditor } from "@/components/corporate/request-editor"
import { corporateInterestLabels, corporateStatuses, corporateStatusLabels, type CorporateListResult, type CorporateRequest, type CorporateStatus } from "@/lib/corporate/requests"

export function CorporateRequestWorkspace({ result, selectedStatus }: { result: CorporateListResult; selectedStatus: CorporateStatus | null }) {
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Anfrageverwaltung</p>
        <h2 className="mt-1 text-xl font-black">Firmeninteresse koordinieren</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#617080]">Status und Notiz dokumentieren den Kontakt. Sie aktivieren keine Premium-Zugänge und lösen keine Einladungen, Nachrichten oder Zahlungen aus.</p>
        <form action="/companies" method="get" className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="grid gap-1.5 text-xs font-bold text-[#526170]">
            Statusfilter
            <select name="status" defaultValue={selectedStatus ?? ""} className="min-h-11 rounded-xl border border-[#061829]/15 bg-white px-3 py-2.5 text-sm text-[#061829] focus:outline-2 focus:outline-[#118cff]">
              <option value="">Alle Status</option>
              {corporateStatuses.map(status => <option key={status} value={status}>{corporateStatusLabels[status]}</option>)}
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-xl border border-[#061829]/15 bg-white px-4 text-sm font-bold hover:border-[#118cff] focus-visible:outline-2 focus-visible:outline-[#118cff]">Filtern</button>
          <a href="/companies" className="inline-flex min-h-11 items-center px-1 text-sm font-bold text-[#0b75d9] underline">Alle Anfragen neu laden</a>
        </form>
      </section>

      {result.status === "error" ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">{result.message}</div>
      ) : (
        <section aria-label="Firmenanfragen" className="space-y-4">
          <p className="px-1 text-sm text-[#617080]">{result.requests.length} angezeigt · Die neuesten maximal 50 Anfragen für diesen Filter.</p>
          {result.requests.length === 0 ? (
            <div className="rounded-3xl border border-[#061829]/10 bg-white px-5 py-10 text-center text-sm text-[#617080]">Keine Anfragen für diesen Filter vorhanden.</div>
          ) : result.requests.map(request => <RequestCard key={request.request_id} request={request} />)}
        </section>
      )}
    </div>
  )
}

function RequestCard({ request }: { request: CorporateRequest }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white">
      <header className="flex flex-col gap-3 border-b border-[#061829]/10 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-black">{request.company_name}</h3>
          <p className="mt-1 break-words text-sm text-[#617080]">{request.city} · {request.seats.toLocaleString("de-DE")} geplante Plätze</p>
        </div>
        <span className="self-start rounded-full bg-[#e6f2ff] px-3 py-1.5 text-xs font-black text-[#0b75d9]">{corporateStatusLabels[request.status]}</span>
      </header>
      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div className="min-w-0 space-y-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-bold text-[#617080]">Kontakt</dt><dd className="mt-1 break-words font-semibold">{request.contact_name}</dd></div>
            <div><dt className="text-xs font-bold text-[#617080]">E-Mail</dt><dd className="mt-1 break-all font-semibold">{request.email}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-bold text-[#617080]">Interessen</dt><dd className="mt-2 flex flex-wrap gap-2">
              {request.interests.length ? request.interests.map(interest => <span key={interest} className="rounded-lg bg-[#f7f6f1] px-2.5 py-1 text-xs font-semibold">{corporateInterestLabels[interest]}</span>) : "Keine zusätzlichen Interessen angegeben"}
            </dd></div>
          </dl>
          <div className="rounded-2xl border border-[#061829]/10 bg-[#f8fafb] p-4">
            <p className="text-xs font-bold text-[#617080]">Gespeicherte Preisorientierung</p>
            {request.total_amount_cents === null || request.unit_amount_cents === null ? <p className="mt-2 text-sm font-semibold">Keine Preisorientierung bei der Anfrage hinterlegt.</p> : <>
              <p className="mt-2 text-2xl font-black tracking-tight">{money(request.total_amount_cents)} <span className="text-sm font-semibold">pro Jahr</span></p>
              <p className="mt-1 text-sm">{money(request.unit_amount_cents)} je Mitarbeiter und Jahr · zzgl. MwSt.</p>
              <p className="mt-2 break-words text-xs text-[#617080]">Katalogversion {request.catalog_version}</p>
            </>}
            <p className="mt-3 text-xs leading-relaxed text-[#617080]">Unverbindliche Preisorientierung; finales Angebot nach Abstimmung. Geschenke, Essen und Events kosten zusätzlich. Gewünschte Ausbaustufen sind geplant.</p>
          </div>
          <dl className="grid gap-3 text-xs text-[#617080] sm:grid-cols-2">
            <div><dt className="font-bold">Eingegangen</dt><dd className="mt-1"><time dateTime={request.created_at}>{displayTime(request.created_at)}</time></dd></div>
            <div><dt className="font-bold">Zuletzt geändert</dt><dd className="mt-1"><time dateTime={request.updated_at}>{displayTime(request.updated_at)}</time></dd></div>
          </dl>
        </div>
        <div className="min-w-0 border-t border-[#061829]/10 pt-5 xl:border-t-0 xl:border-l xl:pl-6 xl:pt-0">
          <CorporateRequestEditor request={request} />
        </div>
      </div>
    </article>
  )
}
function money(cents: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100)
}
function displayTime(timestamp: string) {
  // Dates are used only for display; the original token goes untouched to the editor.
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(timestamp))
}
