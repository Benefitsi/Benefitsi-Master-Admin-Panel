import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import { moderateCommunitySubmission, moderateNativeMeetup } from "@/app/city-pages/[citySlug]/community/actions"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { requireAdmin } from "@/lib/admin"
import {
  loadCityCommunityInbox,
  type CommunitySubmission,
  type NativeCommunityMeetup,
} from "@/lib/city-pages/community"

import { meetupApprovalBlockers } from "@/lib/city-pages/community-moderation"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Community-Inbox",
  description: "Community-Vorschläge einer Stadt sicher prüfen und beantworten.",
}

const statusLabels: Record<string, string> = {
  PENDING: "App-Vorschlag offen",
  FLAGGED: "Gemeldet / erneut prüfen",
  APPROVED: "Freigegeben",
  REJECTED: "Abgelehnt",
  DRAFT: "Entwurf",
  PUBLISHED: "Veröffentlicht",
  SCHEDULED: "Geplant",
  ONGOING: "Läuft",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Abgesagt",
  needs_review: "Offen",
  approved: "Angenommen",
  rejected: "Nicht übernommen",
  archived: "Archiviert",
}

const kindLabels: Record<string, string> = {
  event: "Event",
  meetup: "Treffen",
  place_change: "Ortsänderung",
  local_tip: "Lokaler Tipp",
}

export default async function CityCommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ citySlug: string }>
  searchParams: Promise<{ success?: string; error?: string; warning?: string; published?: string }>
}) {
  const { citySlug } = await params
  const query = await searchParams
  const { adminSession } = await requireAdmin()
  const inbox = await loadCityCommunityInbox(citySlug)
  if (!inbox.city) notFound()

  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"
  const openCount = inbox.submissions.filter(
    (submission) => submission.status === "needs_review",
  ).length + inbox.nativeMeetups.length + inbox.submissions.filter(submission => submission.linkedMeetup && submission.status !== "needs_review").length

  return (
    <AdminShell
      adminName={adminName}
      title={`${inbox.city.name} Community`}
      subtitle="Web-Einreichungen und App-Treffen gemeinsam prüfen"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/city-pages/${citySlug}`} className="text-sm font-black text-[#0b75d9]">
          ← Zur Stadtverwaltung
        </Link>
        <span className="rounded-full bg-[#e8f4ff] px-3 py-1.5 text-xs font-black text-[#0b75d9]">
          {openCount} offen
        </span>
      </div>

      {query.success ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
          Moderation und Statusverlauf wurden atomar gespeichert.
        </p>
      ) : null}
      {query.success === "APPROVED" && query.published && /^[0-9a-f-]{36}$/i.test(query.published) ? <a href={publicMeetupUrl(citySlug, query.published)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-black text-[#0b75d9]">Freigegebenes Treffen auf der Website öffnen ↗</a> : null}
      {query.error ? (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
          {query.error === "private_note"
            ? "Eine interne Begründung ist für jede Moderation erforderlich."
            : query.error === "city" ? "Die Stadtzuordnung konnte nicht bestätigt werden. Bitte die Inbox neu laden."
            : query.error === "meetup_moderation" ? "Das App-Treffen konnte nicht moderiert werden. Prüfe Gastgeber, Termin, Treffpunkt und aktuellen Status; abgeschlossene oder abgesagte Treffen werden nicht reaktiviert."
            : "Die Moderation konnte nicht gespeichert werden. Für ein Treffen müssen Gastgeberkonto, Termin und Treffpunkt vorliegen; prüfe auch den aktuellen Status."}
        </p>
      ) : null}
      {query.warning ? <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">Die Moderation ist gespeichert. {query.warning === "refresh_not_configured" ? "Die Aktualisierung der öffentlichen Website ist noch nicht konfiguriert." : "Die öffentliche Website konnte noch nicht aktualisiert werden."} Bitte die öffentliche Anzeige prüfen; den gespeicherten Status nicht erneut einreichen.</p> : null}
      {inbox.warnings.map((warning) => (
        <p key={warning} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">{warning}</p>
      ))}

      <section className="grid overflow-hidden rounded-3xl bg-[#061829] text-white sm:grid-cols-3">
        <Metric label="Gesamt" value={inbox.submissions.length + inbox.nativeMeetups.length} />
        <Metric label="Offen" value={openCount} />
        <Metric label="App-Treffen zur Prüfung" value={inbox.nativeMeetups.length} />
      </section>

      {inbox.nativeMeetups.length ? <section className="grid gap-5"><div><h2 className="text-xl font-black">Treffen aus App & Community</h2><p className="mt-2 text-sm text-[#617080]">Freigabe und Ablehnung ändern den bestehenden Treffendatensatz. Sichtbare Web-Einreichungen zeigen ihr verknüpftes Treffen direkt in derselben Karte.</p></div>{inbox.nativeMeetups.map(meetup => <NativeMeetupCard key={meetup.id} citySlug={citySlug} meetup={meetup} />)}</section> : null}
      <h2 className="text-xl font-black">Web-Einreichungen</h2>
      {inbox.submissions.length ? (
        <div className="grid gap-5">
          {inbox.submissions.map((submission) => (
            <SubmissionCard key={submission.id} citySlug={citySlug} submission={submission} />
          ))}
        </div>
      ) : (
        <section className="rounded-3xl border border-[#061829]/10 bg-white px-6 py-16 text-center">
          <h2 className="text-xl font-black">Noch keine Einreichungen</h2>
          <p className="mt-2 text-sm text-[#617080]">Neue Vorschläge erscheinen automatisch in dieser Inbox.</p>
        </section>
      )}
    </AdminShell>
  )
}

function SubmissionCard({
  citySlug,
  submission,
}: {
  citySlug: string
  submission: CommunitySubmission
}) {
  const canModerate = submission.status !== "archived"
  const blockers = submission.kind === "meetup" ? meetupApprovalBlockers({hostUserId: submission.hostUserId, startsAt: submission.eventStartsAt, endsAt: submission.eventEndsAt, meetingPoint: submission.eventLocation}) : []
  return (
    <article className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white shadow-[0_18px_50px_rgba(6,24,41,.04)]">
      <header className="grid gap-4 border-b border-[#061829]/10 p-5 md:grid-cols-[1fr_auto] md:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em]">
            <span className="text-[#0b75d9]">{kindLabels[submission.kind] ?? submission.kind}</span>
            <span className="text-[#a0a9b2]">·</span>
            <span className="text-[#617080]">{submission.reference ?? "Alte Einreichung ohne Tracking"}</span>
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.025em]">{submission.title}</h2>
        </div>
        <span className={`h-fit rounded-full px-3 py-1.5 text-xs font-black ${submission.status === "needs_review" ? "bg-amber-100 text-amber-900" : "bg-[#edf2f4] text-[#526170]"}`}>
          {statusLabels[submission.status] ?? submission.status}
        </span>
      </header>

      <div className="grid gap-7 p-5 md:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)] md:p-6">
        <div>
          <p className="whitespace-pre-wrap text-sm leading-7 text-[#455767]">{submission.description}</p>
          <dl className="mt-6 grid gap-x-5 gap-y-3 border-y border-[#061829]/10 py-5 text-sm sm:grid-cols-2">
            <Fact label="Kontakt" value={`${submission.contactName} · ${submission.contactEmail}`} />
            <Fact label="Eingang" value={formatDate(submission.createdAt)} />
            {submission.eventStartsAt ? <Fact label="Beginn (Europe/Berlin)" value={formatDate(submission.eventStartsAt)} /> : null}
            {submission.kind === "meetup" || submission.kind === "event" ? <>
              <Fact label="Ende" value={submission.eventEndsAt ? formatDate(submission.eventEndsAt) : "Nicht angegeben"} />
              <Fact label="Zeitzone" value={submission.eventTimezone ?? "Nicht strukturiert erfasst"} />
              <Fact label="Aktivität" value={activityLabel(submission.activityType)} />
              <Fact label="Maximale Gruppengröße" value={submission.capacity === null ? "Nicht angegeben" : String(submission.capacity)} />
              <Fact label="Zielgruppe" value={submission.targetAudience ?? "Nicht angegeben"} />
              <Fact label="Kosten" value={submission.costDescription ?? "Nicht angegeben"} />
              {submission.kind === "meetup" ? <Fact label="Gastgeberkonto" value={submission.hostUserId ? "Mit bestehendem Benefitsi-Konto verknüpft" : "Fehlt – Kontaktangaben allein genügen nicht"} /> : null}
            </> : null}
            {submission.eventLocation ? <Fact label="Ort" value={submission.eventLocation} /> : null}
            {submission.sourceUrl ? (
              <div>
                <dt className="text-xs font-bold text-[#7a8793]">Quelle</dt>
                <dd className="mt-1"><a className="font-black text-[#0b75d9]" href={submission.sourceUrl} target="_blank" rel="noreferrer">Quelle prüfen ↗</a></dd>
              </div>
            ) : null}
          </dl>

          {submission.kind === "meetup" && submission.publishedRecordId ? <a href={publicMeetupUrl(citySlug, submission.publishedRecordId)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-[#e8f4ff] px-4 text-sm font-black text-[#0b75d9]">Veröffentlichtes Treffen öffnen ↗</a> : null}
          <h3 className="mt-6 text-sm font-black uppercase tracking-[0.12em] text-[#617080]">Audit-Verlauf</h3>
          <ol className="mt-4 border-l border-[#cbd5da] pl-5">
            {submission.audit.map((entry) => (
              <li key={entry.id} className="relative pb-5 last:pb-0">
                <span className="absolute -left-[1.52rem] top-1 size-2.5 rounded-full bg-[#118cff]" />
                <p className="text-sm font-black">{statusLabels[entry.toStatus] ?? entry.toStatus}</p>
                <p className="mt-1 text-xs text-[#7a8793]">{formatDate(entry.createdAt)}{entry.actorProfile ? ` · ${entry.actorProfile}` : ""}</p>
                {entry.privateNote ? <p className="mt-2 text-sm leading-6 text-[#455767]">Intern: {entry.privateNote}</p> : null}
                {entry.publicMessage ? <p className="mt-1 text-sm leading-6 text-[#617080]">Öffentlich: {entry.publicMessage}</p> : null}
              </li>
            ))}
          </ol>
        </div>

        <form action={moderateCommunitySubmission} className="h-fit rounded-2xl bg-[#f6f8f7] p-4">
          <input type="hidden" name="cityId" value={submission.cityId} />
          <input type="hidden" name="citySlug" value={citySlug} />
          <input type="hidden" name="submissionId" value={submission.id} />
          <h3 className="text-lg font-black">Moderieren</h3>
          <p className="mt-2 text-xs leading-5 text-[#617080]">
            {submission.kind === "meetup" ? "Annehmen veröffentlicht das Treffen mit dem verifizierten Gastgeberkonto. Der Status und die Verknüpfung werden gemeinsam gespeichert. Archivieren schließt nur die Einreichung; ein bestehendes Treffen bleibt separat verwaltbar." : "Annehmen bestätigt diesen Hinweis. Events und Orte müssen anschließend als eigener Entwurf durch den Städte-Review."}
          </p>
          {submission.status === "needs_review" && blockers.length ? <div role="note" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">Freigabe noch nicht möglich</p><ul className="mt-2 list-disc space-y-2 pl-4">{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul><p className="mt-2">Bitte den Gastgeber um eine neue Anmeldung bzw. vervollständigte Einreichung bitten. Keine Ersatzidentität anlegen.</p></div> : null}
          <label className="mt-4 grid gap-2 text-xs font-bold text-[#526170]">
            Status
            <select name="status" disabled={!canModerate} defaultValue={submission.status === "needs_review" ? blockers.length ? "rejected" : "approved" : "archived"} className={inputClass}>
              {submission.status === "needs_review" ? (
                <>
                  <option value="approved" disabled={blockers.length > 0}>Annehmen{blockers.length ? " – Voraussetzungen fehlen" : ""}</option>
                  <option value="rejected">Nicht übernehmen</option>
                  <option value="archived">Archivieren</option>
                </>
              ) : (
                <option value="archived">Archivieren</option>
              )}
            </select>
          </label>
          <label className="mt-4 grid gap-2 text-xs font-bold text-[#526170]">
            Interne Begründung *
            <textarea name="privateNote" required maxLength={2000} rows={4} disabled={!canModerate} className={`${inputClass} min-h-28 py-3`} />
          </label>
          <label className="mt-4 grid gap-2 text-xs font-bold text-[#526170]">
            Rückmeldung im Statuszugang
            <textarea name="publicMessage" maxLength={1000} rows={4} disabled={!canModerate} defaultValue={submission.publicStatusMessage ?? ""} className={`${inputClass} min-h-28 py-3`} />
          </label>
          {canModerate ? (
            <PendingSubmitButton pendingLabel="Wird gespeichert …" className="mt-4 min-h-11 w-full rounded-xl bg-[#118cff] px-4 text-sm font-black text-white">
              Status speichern
            </PendingSubmitButton>
          ) : (
            <p className="mt-4 rounded-xl bg-white px-4 py-3 text-center text-sm font-black text-[#617080]">
              Einreichung abgeschlossen
            </p>
          )}
        </form>
      </div>
      {submission.linkedMeetup ? <section className="border-t border-[#061829]/10 bg-amber-50 p-5"><h3 className="mb-4 text-lg font-black">Verknüpftes Treffen erneut prüfen</h3><NativeMeetupCard citySlug={citySlug} meetup={submission.linkedMeetup} /></section> : null}
    </article>
  )
}

function NativeMeetupCard({ citySlug, meetup }: { citySlug: string; meetup: NativeCommunityMeetup }) {
  const blockers = meetupApprovalBlockers(meetup)
  return <article className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white p-5 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wide text-[#0b75d9]">{meetup.linkedSubmission ? "Verknüpftes Community-Treffen" : "App-Treffen"} · {statusLabels[meetup.lifecycleStatus] ?? meetup.lifecycleStatus}</p><h3 className="mt-2 text-2xl font-black">{meetup.title}</h3></div><span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-900">{statusLabels[meetup.moderationStatus] ?? meetup.moderationStatus}</span></div>
    <div className="mt-5 grid gap-7 md:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]"><div><p className="whitespace-pre-wrap text-sm leading-7 text-[#455767]">{meetup.description}</p>
      <dl className="mt-5 grid gap-4 border-y border-[#061829]/10 py-5 text-sm sm:grid-cols-2">
        <Fact label="Öffentlicher Gastgebername" value={meetup.hostDisplayName ?? "Nicht verfügbar"} />
        <Fact label="Beginn (Europe/Berlin)" value={meetup.startsAt ? formatDate(meetup.startsAt) : "Nicht angegeben"} />
        <Fact label="Ende" value={meetup.endsAt ? formatDate(meetup.endsAt) : "Nicht angegeben"} />
        <Fact label="Treffpunkt" value={meetup.meetingPoint ?? "Nicht angegeben"} />
        <Fact label="Aktivität" value={activityLabel(meetup.activityType)} />
        <Fact label="Maximale Gruppengröße" value={meetup.capacity === null ? "Nicht angegeben" : String(meetup.capacity)} />
        <Fact label="Zielgruppe" value={meetup.targetAudience ?? "Nicht angegeben"} />
        <Fact label="Kosten" value={meetup.costDescription ?? "Nicht angegeben"} />
        <Fact label="Sichtbarkeit" value={meetup.visibility === "PUBLIC" ? "Öffentlich" : "Eingeschränkt – bleibt nach Freigabe unverändert"} />
        <Fact label="Eingang" value={formatDate(meetup.createdAt)} />
      </dl><p className="mt-3 text-xs leading-5 text-[#617080]">Nur der öffentliche Profilname wird geladen. Private E-Mail, Telefonnummer und Teilnehmerlisten werden nicht angezeigt.</p>
    </div><form action={moderateNativeMeetup} className="h-fit rounded-2xl bg-[#f6f8f7] p-4">
      <input type="hidden" name="cityId" value={meetup.cityId} /><input type="hidden" name="citySlug" value={citySlug} /><input type="hidden" name="meetupId" value={meetup.id} />
      <h4 className="text-lg font-black">App-Treffen moderieren</h4>
      {blockers.length ? <ul className="mt-3 list-disc space-y-2 rounded-xl bg-amber-50 py-3 pl-7 pr-3 text-sm text-amber-950">{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul> : <p className="mt-2 text-sm leading-6 text-[#617080]">Freigabe veröffentlicht dieses Treffen im bestehenden Datensatz. Sichtbarkeit und Gastgeber bleiben erhalten.</p>}
      <label className="mt-4 grid gap-2 text-xs font-bold text-[#526170]">Entscheidung<select name="status" defaultValue={blockers.length ? "REJECTED" : "APPROVED"} className={inputClass}><option value="APPROVED" disabled={blockers.length > 0}>Freigeben</option><option value="REJECTED">Ablehnen</option></select></label>
      <label className="mt-4 grid gap-2 text-xs font-bold text-[#526170]">Interne Begründung *<textarea name="privateNote" required maxLength={2000} rows={4} className={`${inputClass} py-3`} /></label>
      <PendingSubmitButton pendingLabel="Wird gespeichert …" className="mt-4 min-h-11 w-full rounded-xl bg-[#118cff] px-4 text-sm font-black text-white">Entscheidung speichern</PendingSubmitButton>
    </form></div>
  </article>
}

function activityLabel(value: string | null) {
  const labels: Record<string, string> = {HIKING: "Wandern", WALKING: "Spaziergang", CYCLING: "Radfahren", SOCIAL: "Austausch / Stammtisch", FAMILY: "Familie", CULTURE: "Kultur", OTHER: "Andere Aktivität"}
  return value ? labels[value] ?? value : "Nicht angegeben"
}

function publicMeetupUrl(citySlug: string, meetupId: string) {
  const path = `/stadt/${encodeURIComponent(citySlug)}/community/treffen/${encodeURIComponent(meetupId)}`
  return new URL(path, process.env.BENEFITSI_WEB_URL || "https://benefitsi.de").toString()
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold text-[#7a8793]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="border-white/10 px-5 py-5 sm:border-l sm:first:border-l-0"><p className="text-3xl font-black">{value}</p><p className="mt-1 text-sm font-semibold text-white/65">{label}</p></div>
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "unbekannt" : new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" }).format(date)
}

const inputClass =
  "min-h-12 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"
