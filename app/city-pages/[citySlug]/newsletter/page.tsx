import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import {
  approveNewsletterEdition,
  requestNewsletterDraft,
  saveNewsletterEdition,
} from "@/app/city-pages/[citySlug]/newsletter/actions"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { requireAdmin } from "@/lib/admin"
import {
  loadCityNewsletterData,
  type NewsletterEdition,
} from "@/lib/city-pages/newsletter"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Stadtnewsletter",
  description: "Stadtbezogene Newsletter entwerfen, prüfen und freigeben.",
}

const statusLabels: Record<string, string> = {
  draft: "Entwurf",
  agent_drafting: "Agent erstellt Entwurf",
  needs_review: "Menschliche Prüfung",
  approved: "Freigegeben – Versand gesperrt",
  scheduled: "Geplant",
  sent: "Versendet",
  cancelled: "Abgebrochen",
}

const interestLabels = {
  events: "Wochenende & Events",
  family: "Familie",
  food: "Gastro & Deals",
  culture: "Kultur",
  clubs: "Vereine",
  notices: "Wichtige Meldungen",
} as const

export default async function CityNewsletterPage({
  params,
  searchParams,
}: {
  params: Promise<{ citySlug: string }>
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  const { citySlug } = await params
  const query = await searchParams
  const { adminSession } = await requireAdmin()
  const data = await loadCityNewsletterData(citySlug)
  if (!data.city) notFound()

  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"

  return (
    <AdminShell
      adminName={adminName}
      title={`${data.city.name} Newsletter`}
      subtitle="Stadtbezogene Ausgaben mit Agent-Entwurf und Human-Gate"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/city-pages/${citySlug}`} className="text-sm font-black text-[#0b75d9]">
          ← Zur Stadtverwaltung
        </Link>
        <form action={requestNewsletterDraft}>
          <input type="hidden" name="cityId" value={data.city.id} />
          <input type="hidden" name="citySlug" value={citySlug} />
          <PendingSubmitButton pendingLabel="Agent-Auftrag wird angelegt …" className={primaryButton}>
            Neue Ausgabe vorbereiten
          </PendingSubmitButton>
        </form>
      </div>

      {query.success ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
          Newsletter-Workflow gespeichert. Es wurde keine E-Mail versendet.
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
          {query.error === "content"
            ? "Betreff, Einleitung und mindestens ein vollständiger Abschnitt werden benötigt."
            : query.error === "approval_note"
              ? "Die menschliche Freigabe benötigt eine nachvollziehbare Prüfnotiz."
              : "Der Newsletter-Schritt konnte nicht gespeichert werden."}
        </p>
      ) : null}

      <section className={`rounded-3xl border p-5 sm:p-6 ${data.deliveryConfigured ? "border-amber-300 bg-amber-50" : "border-[#b9d4c5] bg-[#eef7f1]"}`}>
        <p className="text-xs font-black uppercase tracking-[.14em] text-[#315e40]">Versandsicherheit</p>
        <h2 className="mt-2 text-xl font-black">
          {data.deliveryConfigured
            ? "E-Mail-Zugang erkannt – Versandaktion trotzdem noch nicht freigeschaltet"
            : "Versand gesperrt, bis Absenderdomain und Resend bewusst eingerichtet sind"}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#526170]">
          Entwurf, Vorschau und Human-Gate funktionieren bereits. Diese Oberfläche besitzt absichtlich keinen Versand-Button. Später dürfen ausschließlich bestätigte Abonnenten der gewählten Stadt mit individuellem Abmeldelink beliefert werden.
        </p>
      </section>

      <section className="grid overflow-hidden rounded-3xl bg-[#061829] text-white sm:grid-cols-3">
        <Metric label="Bestätigt" value={data.subscribers.confirmed} />
        <Metric label="Bestätigung offen" value={data.subscribers.pending} />
        <Metric label="Ausgaben" value={data.editions.length} />
      </section>

      {data.editions.length ? (
        <div className="grid gap-6">
          {data.editions.map((edition) => (
            <EditionCard key={edition.id} citySlug={citySlug} cityName={data.city!.name} edition={edition} />
          ))}
        </div>
      ) : (
        <section className="rounded-3xl border border-[#061829]/10 bg-white px-6 py-16 text-center">
          <h2 className="text-xl font-black">Noch keine Ausgabe</h2>
          <p className="mt-2 text-sm text-[#617080]">Lege den ersten Agent-Auftrag für einen strukturierten Entwurf an.</p>
        </section>
      )}
    </AdminShell>
  )
}

function EditionCard({
  citySlug,
  cityName,
  edition,
}: {
  citySlug: string
  cityName: string
  edition: NewsletterEdition
}) {
  const editable = ["draft", "agent_drafting", "needs_review"].includes(edition.status)
  return (
    <article className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#061829]/10 p-5 sm:p-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[.14em] text-[#0b75d9]">{edition.editionKey}</p>
          <h2 className="mt-2 text-2xl font-black">{edition.subject || "Noch ohne Betreff"}</h2>
        </div>
        <span className="rounded-full bg-[#edf2f4] px-3 py-1.5 text-xs font-black text-[#526170]">
          {statusLabels[edition.status] ?? edition.status}
        </span>
      </header>

      <div className="grid lg:grid-cols-[1.05fr_.95fr]">
        <form action={saveNewsletterEdition} className="grid gap-4 border-b border-[#061829]/10 p-5 lg:border-b-0 lg:border-r sm:p-6">
          <input type="hidden" name="cityId" value={edition.cityId} />
          <input type="hidden" name="citySlug" value={citySlug} />
          <input type="hidden" name="editionId" value={edition.id} />
          <Field label="Betreff">
            <input name="subject" required minLength={5} maxLength={180} disabled={!editable} defaultValue={edition.subject} className={inputClass} />
          </Field>
          <Field label="Preheader">
            <input name="preheader" maxLength={240} disabled={!editable} defaultValue={edition.preheader} className={inputClass} />
          </Field>
          <Field label="Einleitung">
            <textarea name="intro" required minLength={20} maxLength={2000} rows={4} disabled={!editable} defaultValue={edition.intro} className={`${inputClass} min-h-28 py-3`} />
          </Field>

          {[0, 1, 2].map((index) => {
            const section = edition.sections[index]
            const number = index + 1
            return (
              <fieldset key={number} className="grid gap-3 rounded-2xl border border-[#061829]/10 bg-[#f8faf9] p-4">
                <legend className="px-1 text-xs font-black uppercase tracking-[.12em] text-[#617080]">Abschnitt {number}</legend>
                <input name={`section${number}Title`} required={number === 1} minLength={number === 1 ? 3 : undefined} maxLength={180} disabled={!editable} defaultValue={section?.title ?? ""} placeholder="Überschrift" className={inputClass} />
                <textarea name={`section${number}Body`} required={number === 1} minLength={number === 1 ? 20 : undefined} maxLength={2000} rows={4} disabled={!editable} defaultValue={section?.body ?? ""} placeholder="Vollständiger, eigenständiger Abschnitt" className={`${inputClass} min-h-24 py-3`} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name={`section${number}Label`} maxLength={80} disabled={!editable} defaultValue={section?.label ?? ""} placeholder="Linktext, optional" className={inputClass} />
                  <input name={`section${number}Href`} maxLength={1000} disabled={!editable} defaultValue={section?.href ?? ""} placeholder="/stadt/… oder https://…" className={inputClass} />
                </div>
              </fieldset>
            )
          })}

          <fieldset>
            <legend className="text-xs font-black text-[#526170]">Zielinteressen</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(interestLabels).map(([value, label]) => (
                <label key={value} className="border border-[#061829]/10 px-3 py-2 text-xs font-bold">
                  <input name={`interest-${value}`} type="checkbox" disabled={!editable} defaultChecked={edition.audienceInterests.includes(value)} className="mr-2" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {editable ? (
            <PendingSubmitButton pendingLabel="Entwurf wird gespeichert …" className={primaryButton}>
              Zur menschlichen Prüfung speichern
            </PendingSubmitButton>
          ) : null}
        </form>

        <div className="grid content-start gap-5 bg-[#f6f2e9] p-5 sm:p-6">
          <div className="overflow-hidden border border-[#d8d3c8] bg-white">
            <div className="bg-[#0b4b36] px-5 py-4 text-white">
              <p className="text-xs font-black uppercase tracking-[.14em] text-[#efc869]">{cityName}</p>
              <p className="mt-2 text-xl font-black">{edition.subject || "Newsletter-Vorschau"}</p>
              {edition.preheader ? <p className="mt-1 text-xs text-white/65">{edition.preheader}</p> : null}
            </div>
            <div className="p-5">
              <p className="text-sm leading-6 text-[#526170]">{edition.intro || "Die Einleitung erscheint hier."}</p>
              <div className="mt-5 divide-y divide-[#e3e0d9] border-y border-[#e3e0d9]">
                {edition.sections.map((section) => (
                  <section key={section.title} className="py-4">
                    <h3 className="font-black">{section.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#617080]">{section.body}</p>
                    {section.label ? <p className="mt-2 text-xs font-black text-[#0b75d9]">{section.label} →</p> : null}
                  </section>
                ))}
              </div>
            </div>
          </div>

          {edition.status === "needs_review" ? (
            <form action={approveNewsletterEdition} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <input type="hidden" name="cityId" value={edition.cityId} />
              <input type="hidden" name="citySlug" value={citySlug} />
              <input type="hidden" name="editionId" value={edition.id} />
              <p className="text-sm font-black text-amber-950">Human-Gate</p>
              <p className="mt-1 text-xs leading-5 text-amber-900">Quellen, Links, Inhalte und Zielinteressen prüfen. Die Freigabe startet keinen Versand.</p>
              <textarea name="note" required minLength={10} maxLength={1000} rows={3} placeholder="Prüfnotiz" className={`${inputClass} mt-3 min-h-20 py-3`} />
              <PendingSubmitButton pendingLabel="Freigabe wird protokolliert …" className={`${primaryButton} mt-3`}>
                Inhalt freigeben
              </PendingSubmitButton>
            </form>
          ) : null}

          <div>
            <p className="text-xs font-black uppercase tracking-[.12em] text-[#617080]">Audit-Verlauf</p>
            <ol className="mt-3 border-l border-[#cbd5da] pl-5">
              {edition.audit.map((entry) => (
                <li key={entry.id} className="relative pb-4 last:pb-0">
                  <span className="absolute -left-[1.52rem] top-1 size-2.5 rounded-full bg-[#118cff]" />
                  <p className="text-sm font-black">{entry.action}</p>
                  <p className="mt-1 text-xs text-[#7a8793]">{formatDate(entry.createdAt)}{entry.actorProfile ? ` · ${entry.actorProfile}` : ""}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </article>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-xs font-bold text-[#526170]"><span>{label}</span>{children}</label>
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="border-white/10 px-5 py-5 sm:border-l sm:first:border-l-0"><p className="text-3xl font-black">{value}</p><p className="mt-1 text-sm font-semibold text-white/65">{label}</p></div>
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "unbekannt" : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

const inputClass =
  "min-h-12 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10 disabled:bg-[#f1f3f2] disabled:text-[#617080]"

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#118cff] px-4 text-sm font-black text-white transition hover:bg-[#0878df] active:scale-[.98]"
