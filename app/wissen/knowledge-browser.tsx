import Link from "next/link"
import type {
  BenefitsiKnowledgeStatus,
  KnowledgeDocumentDetail,
  KnowledgeSearchResult,
} from "@/lib/knowledge/read"

type KnowledgeBrowserProps = {
  query: string
  page: number
  status: BenefitsiKnowledgeStatus
  search: KnowledgeSearchResult
  detail: KnowledgeDocumentDetail | null
}

export function KnowledgeBrowser({
  query,
  page,
  status,
  search,
  detail,
}: KnowledgeBrowserProps) {
  const safeErrorCode = search.errorCode ?? status.lastErrorCode

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[#061829]/10 bg-[#061829] p-5 text-white shadow-[0_18px_50px_rgba(6,24,41,.08)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#17d4d7]">
              Wissensspiegel
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.03em]">
              Benefitsi Knowledge Mirror
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              Eine kontrollierte Kopie des Benefitsi-Wissens. Die Ansicht ist
              schreibgeschützt; der private Quellpfad bleibt verborgen.
            </p>
          </div>
          <StatusPill status={status.status} />
        </div>

        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
          <Metric label="Letzte erfolgreiche Synchronisierung" value={formatDate(status.lastSuccessfulSyncAt)} />
          <Metric label="Dokumente" value={String(status.documentCount)} />
          <Metric label="Letzter sicherer Fehler" value={safeErrorCode ?? "Keiner"} />
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white shadow-[0_18px_50px_rgba(6,24,41,.05)]">
        <div className="border-b border-[#061829]/10 p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
                Spiegel-Inhalte
              </p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.025em]">
                Dokumente
              </h2>
            </div>
            <p className="text-sm text-[#617080]">
              {search.totalCount} Treffer · Seite {page + 1}
            </p>
          </div>

          <form method="get" className="mt-5 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="wissen-suche">Wissen durchsuchen</label>
            <input
              id="wissen-suche"
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Titel oder Inhalt suchen …"
              className="h-11 min-w-0 flex-1 rounded-xl border border-[#061829]/15 px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"
            />
            <button
              type="submit"
              className="h-11 rounded-xl bg-[#118cff] px-5 text-sm font-black text-white transition hover:bg-[#0878df] active:scale-[.98]"
            >
              Suchen
            </button>
          </form>
        </div>

        {search.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#061829]/10 bg-[#f7f8fa] text-xs font-black uppercase tracking-[0.12em] text-[#617080]">
                <tr>
                  <th className="px-5 py-3">Titel</th>
                  <th className="px-5 py-3">Relativer Pfad</th>
                  <th className="px-5 py-3">Geändert</th>
                  <th className="px-5 py-3">Synchronisiert</th>
                  <th className="px-5 py-3">Gelöscht</th>
                  <th className="px-5 py-3"><span className="sr-only">Aktion</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#061829]/8">
                {search.items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-[#f7fbff]">
                    <td className="px-5 py-4 font-bold text-[#061829]">{item.title}</td>
                    <td className="px-5 py-4 font-mono text-xs text-[#526170]">{item.relativePath}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[#617080]">{formatDate(item.sourceModifiedAt)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[#617080]">{formatDate(item.syncedAt)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${item.isDeleted ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {item.isDeleted ? "Ja" : "Nein"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={documentHref(query, page, item.id)}
                        className="font-black text-[#0b75d9] hover:text-[#061829]"
                      >
                        Dokument öffnen
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-16 text-center">
            <p className="text-lg font-black text-[#061829]">Keine Dokumente gefunden</p>
            <p className="mt-2 text-sm text-[#617080]">
              Suche anpassen oder auf den nächsten sicheren Sync warten.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-[#061829]/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#617080]">Serverseitig paginiert mit maximal 50 Zeilen.</p>
          <div className="flex gap-2">
            {page > 0 ? (
              <Link
                href={pageHref(query, page - 1)}
                className="rounded-lg border border-[#061829]/15 px-3 py-2 text-xs font-bold text-[#526170] hover:border-[#118cff] hover:text-[#0b75d9]"
              >
                Zurück
              </Link>
            ) : null}
            {search.hasMore ? (
              <Link
                href={pageHref(query, page + 1)}
                className="rounded-lg border border-[#118cff]/30 bg-[#f3f8ff] px-3 py-2 text-xs font-bold text-[#0b75d9] hover:border-[#118cff]"
              >
                Weiter
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_18px_50px_rgba(6,24,41,.05)] sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              Read-only Detailansicht
            </p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.025em]">
              {detail ? detail.title : "Dokument öffnen"}
            </h2>
          </div>
          {detail ? (
            <span className="rounded-full bg-[#f3f8ff] px-3 py-1.5 text-xs font-bold text-[#0b75d9]">
              Nur lesen
            </span>
          ) : null}
        </div>
        {detail ? (
          <div className="mt-5 space-y-4" aria-readonly="true">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#617080]">
              <span><strong className="text-[#526170]">Relativer Pfad:</strong> {detail.relativePath}</span>
              <span><strong className="text-[#526170]">Geändert:</strong> {formatDate(detail.sourceModifiedAt)}</span>
              <span><strong className="text-[#526170]">Synchronisiert:</strong> {formatDate(detail.syncedAt)}</span>
              <span><strong className="text-[#526170]">Gelöscht:</strong> {detail.isDeleted ? "Ja" : "Nein"}</span>
            </div>
            <pre className="max-h-[42rem] overflow-auto whitespace-pre-wrap rounded-2xl border border-[#061829]/10 bg-[#f7f8fa] p-5 font-mono text-xs leading-6 text-[#263849]">
              {detail.content}
            </pre>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[#617080]">
            Wähle ein Dokument aus der Liste, um den synchronisierten Inhalt schreibgeschützt zu lesen.
          </p>
        )}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#061829] px-4 py-4 sm:px-5">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-white/50">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-white">{value}</p>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const label = status === "healthy"
    ? "Aktiv"
    : status === "syncing"
      ? "Synchronisierung läuft"
      : status === "unavailable"
        ? "Nicht verfügbar"
        : status === "failed"
          ? "Fehler"
          : "Unbekannt"
  const tone = status === "healthy"
    ? "bg-emerald-400/15 text-emerald-100 ring-emerald-300/25"
    : status === "failed" || status === "unavailable"
      ? "bg-rose-400/15 text-rose-100 ring-rose-300/25"
      : "bg-amber-300/15 text-amber-100 ring-amber-200/25"
  return <span className={`inline-flex self-start rounded-full px-3 py-1.5 text-xs font-black ring-1 ring-inset ${tone}`}>Spiegelstatus: {label}</span>
}

function formatDate(value: string | null) {
  if (!value) return "Nicht verfügbar"
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value))
  } catch {
    return "Nicht verfügbar"
  }
}

function pageHref(query: string, page: number) {
  const params = new URLSearchParams()
  if (query) params.set("q", query)
  if (page > 0) params.set("page", String(page))
  const value = params.toString()
  return value ? `/wissen?${value}` : "/wissen"
}

function documentHref(query: string, page: number, documentId: string) {
  const params = new URLSearchParams()
  if (query) params.set("q", query)
  if (page > 0) params.set("page", String(page))
  params.set("document", documentId)
  return `/wissen?${params.toString()}`
}
