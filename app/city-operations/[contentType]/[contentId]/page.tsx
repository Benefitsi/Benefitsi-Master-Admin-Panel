import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import {
  publishCityContent,
  rejectCityReview,
  requestCityReviewCorrection,
} from "@/app/city-operations/actions"
import {
  IssueList,
  ReviewStatus,
} from "@/components/city-operations/review-ui"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { requireAdmin } from "@/lib/admin"
import {
  canPublishReview,
  contentTypeLabel,
  isCityContentType,
} from "@/lib/city-operations/contracts"
import { loadCityReviewDetail } from "@/lib/city-operations/data"

export const dynamic = "force-dynamic"

type DetailParams = {
  contentType: string
  contentId: string
}

type DetailSearchParams = {
  error?: string
  success?: string
}

export default async function CityReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<DetailParams>
  searchParams: Promise<DetailSearchParams>
}) {
  const { adminSession } = await requireAdmin()
  const route = await params
  const feedback = await searchParams
  if (!isCityContentType(route.contentType)) notFound()

  const detail = await loadCityReviewDetail(route.contentType, route.contentId)
  if (!detail.record) notFound()

  const record = detail.record
  const publishable = canPublishReview(record)
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"

  return (
    <AdminShell
      adminName={adminName}
      title={record.title}
      subtitle={`${record.cityName} · ${contentTypeLabel(record.contentType)}`}
    >
      <Link
        href="/city-operations"
        className="inline-flex min-h-11 items-center text-sm font-black text-[#0b75d9] hover:underline"
      >
        ← Zur globalen Arbeitsliste
      </Link>

      {feedback.error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
          {feedback.error === "note"
            ? "Für Korrektur oder Ablehnung ist eine Begründung erforderlich."
            : feedback.error === "publish_gate"
              ? "Veröffentlichung blockiert: Die Agent-Prüfung erfüllt noch nicht alle Sicherheitsregeln."
              : "Die Aktion konnte nicht abgeschlossen werden. Bitte erneut prüfen."}
        </div>
      ) : null}
      {feedback.success ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          Die Review-Aktion wurde gespeichert und protokolliert.
        </div>
      ) : null}
      {detail.warnings.map((warning) => (
        <div key={warning} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          {warning}
        </div>
      ))}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,.65fr)]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_18px_50px_rgba(6,24,41,.06)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
                  Entwurf
                </p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.025em]">
                  Inhalt prüfen
                </h2>
              </div>
              <ReviewStatus record={record} />
            </div>
            <p className="mt-5 whitespace-pre-line text-[15px] leading-7 text-[#334454]">
              {record.description}
            </p>
            <dl className="mt-6 grid gap-4 border-t border-[#061829]/10 pt-5 text-sm sm:grid-cols-2">
              <Datum label="Kategorie" value={record.category} />
              <Datum label="Inhaltsstatus" value={record.contentStatus} />
              <Datum label="Beginn" value={formatDate(record.startsAt)} />
              <Datum label="Verifiziertes Ende" value={formatDate(record.endsAt)} />
              <Datum label="Ablauf" value={formatDate(record.expiresAt)} />
              <Datum label="Agent-Profil" value={record.agentProfile} />
            </dl>
          </section>

          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              Agent-Analyse
            </p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.025em]">
              Gefundene Fehler und Abweichungen
            </h2>
            {record.summary ? (
              <p className="mt-3 text-sm leading-6 text-[#526170]">{record.summary}</p>
            ) : null}
            <div className="mt-5">
              <IssueList issues={record.issues} />
            </div>
          </section>

          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              Originalquelle
            </p>
            <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black tracking-[-0.025em]">
                  {record.sourceName || "Quelle ohne Bezeichnung"}
                </h2>
                <p className="mt-2 text-sm text-[#526170]">
                  Status: {record.sourceStatus} · zuletzt geprüft:{" "}
                  {formatDate(record.sourceCheckedAt)}
                </p>
              </div>
              {record.sourceUrl ? (
                <a
                  href={record.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#118cff]/25 bg-[#f3f8ff] px-4 text-sm font-black text-[#0b75d9] hover:border-[#118cff]"
                >
                  Quelle öffnen ↗
                </a>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-[#061829]/10 bg-[#061829] p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#17d4d7]">
              Menschliche Entscheidung
            </p>
            <h2 className="mt-2 text-xl font-black">Review abschließen</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Jede Entscheidung wird mit Admin, Zeitpunkt und Begründung protokolliert.
            </p>

            {record.reviewId ? (
              <div className="mt-5 space-y-4">
                <ReviewForm
                  record={record}
                  action={requestCityReviewCorrection}
                  button="Korrektur anfordern"
                  pending="Wird gespeichert …"
                  placeholder="Was muss Ben oder der Stadt-Agent korrigieren?"
                  buttonClass="bg-white text-[#061829] hover:bg-[#eef7ff]"
                />
                <ReviewForm
                  record={record}
                  action={rejectCityReview}
                  button="Entwurf ablehnen"
                  pending="Wird abgelehnt …"
                  placeholder="Warum soll dieser Inhalt nicht verwendet werden?"
                  buttonClass="border border-white/25 bg-transparent text-white hover:bg-white/10"
                />
                {publishable ? (
                  <form action={publishCityContent}>
                    <HiddenReviewFields record={record} />
                    <input type="hidden" name="note" value="Manuell im Städte-Review freigegeben." />
                    <PendingSubmitButton
                      pendingLabel="Wird veröffentlicht …"
                      className="min-h-11 w-full rounded-xl bg-[#17d4d7] px-4 text-sm font-black text-[#061829] transition hover:bg-[#39e3e5] active:scale-[.98]"
                    >
                      Geprüft veröffentlichen
                    </PendingSubmitButton>
                  </form>
                ) : (
                  <div
                    aria-disabled="true"
                    className="grid min-h-11 place-items-center rounded-xl bg-white/12 px-4 text-sm font-black text-white/55"
                  >
                    Veröffentlichung blockiert
                  </div>
                )}
                {!publishable ? (
                  <p className="text-xs leading-5 text-white/55">
                    Erforderlich: verifizierte HTTPS-Quelle, frische Prüfung,
                    Agent-Urteil „bestanden“ und keine blockierenden Fehler.
                    {record.contentType === "events"
                      ? " Bei Veranstaltungen zusätzlich: bestätigtes End- und Ablaufdatum."
                      : ""}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-5 rounded-2xl bg-white/8 p-4 text-sm text-white/70">
                Review-Metadaten fehlen. Die Migration muss zuerst angewendet werden.
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              Audit
            </p>
            <h2 className="mt-1 text-lg font-black">Verlauf</h2>
            {detail.audit.length > 0 ? (
              <ol className="mt-4 space-y-4 border-l border-[#061829]/15 pl-4">
                {detail.audit.map((entry) => (
                  <li key={entry.id}>
                    <p className="text-sm font-black text-[#061829]">
                      {auditLabel(entry.action)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#617080]">
                      {entry.actorProfile || entry.actorType} · {formatDate(entry.createdAt)}
                    </p>
                    {typeof entry.details.note === "string" ? (
                      <p className="mt-1 text-sm leading-6 text-[#334454]">
                        {entry.details.note}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-[#617080]">Noch keine Audit-Einträge.</p>
            )}
          </section>
        </aside>
      </div>
    </AdminShell>
  )
}

function ReviewForm({
  record,
  action,
  button,
  pending,
  placeholder,
  buttonClass,
}: {
  record: NonNullable<Awaited<ReturnType<typeof loadCityReviewDetail>>["record"]>
  action: (formData: FormData) => Promise<void>
  button: string
  pending: string
  placeholder: string
  buttonClass: string
}) {
  return (
    <form action={action}>
      <HiddenReviewFields record={record} />
      <label className="sr-only" htmlFor={`${button}-${record.id}`}>
        Begründung
      </label>
      <textarea
        id={`${button}-${record.id}`}
        name="note"
        required
        maxLength={2000}
        rows={3}
        placeholder={placeholder}
        className="w-full resize-y rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#17d4d7]"
      />
      <PendingSubmitButton
        pendingLabel={pending}
        className={`mt-2 min-h-11 w-full rounded-xl px-4 text-sm font-black transition active:scale-[.98] ${buttonClass}`}
      >
        {button}
      </PendingSubmitButton>
    </form>
  )
}

function HiddenReviewFields({
  record,
}: {
  record: NonNullable<Awaited<ReturnType<typeof loadCityReviewDetail>>["record"]>
}) {
  return (
    <>
      <input type="hidden" name="reviewId" value={record.reviewId || ""} />
      <input type="hidden" name="contentType" value={record.contentType} />
      <input type="hidden" name="contentId" value={record.id} />
    </>
  )
}

function Datum({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-bold text-[#617080]">{label}</dt>
      <dd className="mt-1 font-semibold text-[#061829]">{value || "—"}</dd>
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Berlin",
      }).format(date)
}

function auditLabel(action: string) {
  return {
    draft_discovered: "Entwurf entdeckt",
    agent_reviewed: "Agent-Prüfung",
    correction_requested: "Korrektur angefordert",
    rejected: "Abgelehnt",
    published: "Veröffentlicht",
    archived: "Archiviert",
  }[action] || action
}
