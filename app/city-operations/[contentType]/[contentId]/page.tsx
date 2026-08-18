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
  canStartHumanPublication,
  contentTypeLabel,
  humanPublicationRequirements,
  isCityContentType,
} from "@/lib/city-operations/contracts"
import { loadCityReviewDetail } from "@/lib/city-operations/data"
import {
  draftPreviewPath,
  publicCityContentUrl,
} from "@/lib/city-operations/preview"

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
  const humanPublishable = canStartHumanPublication(record)
  const publicationRequirements = humanPublicationRequirements(record)
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
            : feedback.error === "human_publish_gate"
              ? "Die menschliche Freigabe ist für diesen Review-Status derzeit nicht möglich."
              : feedback.error === "manual_verification_required"
                ? "Für diese aktualitätskritischen Felder sind Quelle, Prüfnotiz und manuelle Bestätigung erforderlich."
              : "Die Aktion konnte nicht abgeschlossen werden. Bitte erneut prüfen."}
        </div>
      ) : null}
      {feedback.success ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {feedback.success === "human_published"
            ? "Menschlich freigegeben und veröffentlicht. Die Entscheidung wurde als HUMAN_APPROVED protokolliert."
            : "Die Review-Aktion wurde gespeichert und protokolliert."}
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
              <Datum label="Geänderte Felder" value={record.changedFields.join(", ") || "Keine Angabe"} />
              <Datum label="Veröffentlichungsmethode" value={record.publicationMethod} />
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
          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              Vorschau
            </p>
            <h2 className="mt-1 text-lg font-black">Entwurf und Live-Version</h2>
            <p className="mt-2 text-sm leading-6 text-[#617080]">
              Die Entwurfsvorschau ist nur für eingeloggte Admins sichtbar. Die öffentliche Vorschau zeigt weiterhin die zuletzt veröffentlichte Version.
            </p>
            <div className="mt-4 grid gap-2">
              <Link
                href={draftPreviewPath(record)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#118cff] px-4 text-sm font-black text-white transition hover:bg-[#0878df]"
              >
                Entwurf ansehen
              </Link>
              <a
                href={publicCityContentUrl(record)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#118cff]/25 bg-[#f3f8ff] px-4 text-sm font-black text-[#0b75d9] transition hover:border-[#118cff]"
              >
                Veröffentlichte Version ansehen ↗
              </a>
            </div>
          </section>

          <section className="rounded-3xl border border-[#061829]/10 bg-[#061829] p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#17d4d7]">
              Menschliche Entscheidung
            </p>
            <h2 className="mt-2 text-xl font-black">Review abschließen</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Jede Entscheidung wird mit Admin, Zeitpunkt und Begründung protokolliert.
            </p>
            {publicationRequirements.warnings.map((warning) => (
              <p key={warning} className="mt-3 rounded-xl border border-amber-200/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
                {warning}
              </p>
            ))}

            {record.reviewId ? (
              <div className="mt-5 space-y-4">
                {humanPublishable ? (
                  <HumanPublishForm
                    record={record}
                    requiresManualVerification={publicationRequirements.requiresManualVerification}
                  />
                ) : null}
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
                {!humanPublishable ? (
                  <div
                    aria-disabled="true"
                    className="grid min-h-11 place-items-center rounded-xl bg-white/12 px-4 text-sm font-black text-white/55"
                  >
                    Freigabe derzeit nicht möglich
                  </div>
                ) : null}
                {humanPublishable ? (
                  <p className="text-xs leading-5 text-white/55">
                    Agent-Prüfung: optional. Die Freigabe wird als HUMAN_APPROVED protokolliert und behauptet keine Agent-Verifikation.
                  </p>
                ) : (
                  <p className="text-xs leading-5 text-white/55">
                    Nur offene Entwürfe können freigegeben werden. Bereits veröffentlichte, abgelehnte oder archivierte Reviews bleiben unverändert.
                  </p>
                )}
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
                    {entry.details.publication_method === "HUMAN_APPROVED" ? (
                      <p className="mt-1 text-xs font-black text-[#227174]">
                        HUMAN_APPROVED · Agent-Verifikation nicht behauptet
                      </p>
                    ) : null}
                    {Array.isArray(entry.details.changed_fields) && entry.details.changed_fields.length > 0 ? (
                      <p className="mt-1 text-xs leading-5 text-[#617080]">
                        Felder: {entry.details.changed_fields.filter((field): field is string => typeof field === "string").join(", ")}
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

function HumanPublishForm({
  record,
  requiresManualVerification,
}: {
  record: NonNullable<Awaited<ReturnType<typeof loadCityReviewDetail>>["record"]>
  requiresManualVerification: boolean
}) {
  return (
    <form action={publishCityContent} className="rounded-2xl border border-[#17d4d7]/30 bg-[#0d3540] p-3">
      <HiddenReviewFields record={record} />
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8af4f2]">
        Menschliche Freigabe
      </p>
      <p className="mt-1 text-sm leading-6 text-white/75">
        Der berechtigte Admin kann diesen Entwurf ohne ein Agent-Urteil freigeben.
      </p>
      <label className="mt-3 block text-xs font-bold text-white/75" htmlFor={`publish-note-${record.id}`}>
        Begründung (optional)
      </label>
      <textarea
        id={`publish-note-${record.id}`}
        name="note"
        maxLength={2000}
        rows={2}
        placeholder="Warum ist der Entwurf für die Veröffentlichung freigegeben?"
        className="mt-1 w-full resize-y rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#17d4d7]"
      />
      {requiresManualVerification ? (
        <div className="mt-3 space-y-3 rounded-xl border border-amber-200/25 bg-amber-400/10 p-3">
          <p className="text-xs font-black text-amber-100">
            Aktualitätskritische Änderung – manuelle Verifikation erforderlich
          </p>
          <label className="block text-xs font-bold text-white/75" htmlFor={`verification-source-${record.id}`}>
            Bestätigte Quelle (HTTPS)
          </label>
          <input
            id={`verification-source-${record.id}`}
            name="manual_verification_source"
            type="url"
            required
            defaultValue={record.manualVerificationSource || record.sourceUrl || ""}
            placeholder="https://…"
            className="w-full rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#17d4d7]"
          />
          <label className="block text-xs font-bold text-white/75" htmlFor={`verification-note-${record.id}`}>
            Manuelle Prüfnotiz
          </label>
          <textarea
            id={`verification-note-${record.id}`}
            name="manual_verification_note"
            required
            maxLength={2000}
            rows={2}
            placeholder="Was wurde wann gegen die Quelle geprüft?"
            className="w-full resize-y rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#17d4d7]"
          />
          <label className="flex items-start gap-2 text-xs leading-5 text-white/75">
            <input
              name="manual_verification_confirmed"
              type="checkbox"
              required
              className="mt-0.5 size-4 accent-[#17d4d7]"
            />
            <span>Ich habe die aktualitätskritischen Fakten manuell geprüft und bestätige die Veröffentlichung.</span>
          </label>
        </div>
      ) : null}
      <PendingSubmitButton
        pendingLabel="Wird freigegeben …"
        className="mt-3 min-h-11 w-full rounded-xl bg-[#17d4d7] px-4 text-sm font-black text-[#061829] transition hover:bg-[#39e3e5] active:scale-[.98]"
      >
        Freigeben &amp; veröffentlichen
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
    published: "Veröffentlicht / freigegeben",
    archived: "Archiviert",
  }[action] || action
}
