import Link from "next/link"
import {
  contentTypeLabel,
  stageLabel,
  type CityReviewIssue,
  type CityReviewRecord,
} from "@/lib/city-operations/contracts"

export function ReviewStatus({
  record,
}: {
  record: Pick<CityReviewRecord, "stage" | "issues">
}) {
  const blocking = record.issues.filter(
    (issue) => issue.severity === "blocking",
  ).length
  const tone =
    record.stage === "published"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : blocking > 0 || record.stage === "correction_requested"
        ? "bg-amber-50 text-amber-900 ring-amber-200"
        : record.stage === "ready_for_human"
          ? "bg-sky-50 text-sky-800 ring-sky-200"
          : "bg-zinc-100 text-zinc-700 ring-zinc-200"

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${tone}`}
    >
      {stageLabel(record.stage)}
      {blocking > 0 ? ` · ${blocking} blockierend` : ""}
    </span>
  )
}

export function ReviewQueueRow({ record }: { record: CityReviewRecord }) {
  return (
    <Link
      href={`/city-operations/${record.contentType}/${record.id}`}
      className="grid gap-3 border-t border-[#061829]/10 px-4 py-4 transition hover:bg-[#f3f8ff] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#118cff] md:grid-cols-[minmax(0,1.5fr)_minmax(9rem,.6fr)_minmax(12rem,.8fr)_auto] md:items-center md:px-5"
    >
      <div className="min-w-0">
        <p className="truncate font-black text-[#061829]">{record.title}</p>
        <p className="mt-1 line-clamp-1 text-sm text-[#617080]">
          {record.description}
        </p>
      </div>
      <div>
        <p className="text-sm font-bold text-[#061829]">{record.cityName}</p>
        <p className="mt-0.5 text-xs text-[#617080]">
          {contentTypeLabel(record.contentType)}
        </p>
      </div>
      <ReviewStatus record={record} />
      <span className="text-sm font-black text-[#0b75d9]">Prüfen →</span>
    </Link>
  )
}

export function IssueList({ issues }: { issues: CityReviewIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
        Der Agent hat keine offenen Probleme gemeldet.
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {issues.map((issue, index) => (
        <li
          key={`${issue.code}-${index}`}
          className={`rounded-2xl border p-4 ${
            issue.severity === "blocking"
              ? "border-rose-200 bg-rose-50"
              : issue.severity === "warning"
                ? "border-amber-200 bg-amber-50"
                : "border-sky-200 bg-sky-50"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase tracking-[0.12em]">
              {issue.severity === "blocking"
                ? "Blockierend"
                : issue.severity === "warning"
                  ? "Warnung"
                  : "Hinweis"}
            </span>
            <span className="text-xs text-[#617080]">{issue.field}</span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#061829]">
            {issue.message}
          </p>
          {issue.suggestion ? (
            <p className="mt-2 text-sm leading-6 text-[#526170]">
              Vorschlag: {issue.suggestion}
            </p>
          ) : null}
          {issue.actual || issue.expected ? (
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="font-bold text-[#617080]">Gefunden</dt>
                <dd className="mt-1 text-[#061829]">{issue.actual || "—"}</dd>
              </div>
              <div>
                <dt className="font-bold text-[#617080]">Erwartet</dt>
                <dd className="mt-1 text-[#061829]">{issue.expected || "—"}</dd>
              </div>
            </dl>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
