import type { Metadata } from "next"
import type { InputHTMLAttributes, ReactNode } from "react"
import Link from "next/link"
import { AdminShell } from "@/app/admin-shell"
import {
  createBookingOffer,
  createBookingProvider,
  publishBookingOffer,
  submitBookingOfferToBen,
} from "@/app/bookings/actions"
import { ConnectOnboardingButton } from "@/components/bookings/connect-onboarding-button"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { requireAdmin } from "@/lib/admin"
import { bookingAlerts, canPublishBookingOffer } from "@/lib/bookings/contracts"
import { loadBookingOperations } from "@/lib/bookings/data"
import {
  isStripeConnectPlatformReady,
  isStripeTestConfigured,
} from "@/lib/stripe/config"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Booking Control | Benefitsi Admin",
  description: "Stripe-Connect-Testbuchungen, Anbieter, Angebote und Kapazitäten.",
}

type SearchParams = {
  success?: string
  error?: string
  connect?: string
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { adminSession } = await requireAdmin()
  const feedback = await searchParams
  const data = await loadBookingOperations()
  const stripeConfigured = isStripeTestConfigured()
  const connectPlatformReady =
    stripeConfigured && isStripeConnectPlatformReady()
  const feedbackError =
    feedback.error === "connect_platform_not_ready"
      ? "Stripe Connect bleibt bis zur Verifizierung der Benefitsi UG gesperrt."
      : feedback.error
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"
  const confirmed = data.bookings.filter(
    (booking) => booking.state === "confirmed",
  )
  const gross = confirmed.reduce(
    (sum, booking) => sum + booking.totalAmount,
    0,
  )
  const fees = confirmed.reduce(
    (sum, booking) => sum + booking.applicationFeeAmount,
    0,
  )
  const alerts = bookingAlerts(data.bookings, data.providers)

  return (
    <AdminShell
      adminName={adminName}
      title="Booking Control"
      subtitle="Eigene Benefitsi-Buchungen mit Stripe Connect – ausschließlich Testmodus"
    >
      <section className="flex flex-col gap-3 rounded-3xl border border-[#061829]/10 bg-[#061829] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#17d4d7]">
            Sicherheitsmodus
          </p>
          <h2 className="mt-1 text-xl font-black">Keine echten Zahlungen</h2>
          <p className="mt-1 text-sm text-white/65">
            Live-Keys werden technisch abgelehnt. Anbieter-KYC bleibt vollständig bei Stripe.
          </p>
        </div>
        <span
          className={`inline-flex self-start rounded-full px-3 py-1.5 text-xs font-black ring-1 ring-inset ${
            connectPlatformReady
              ? "bg-emerald-400/15 text-emerald-200 ring-emerald-300/25"
              : "bg-amber-300/15 text-amber-100 ring-amber-200/25"
          }`}
        >
          {connectPlatformReady
            ? "Stripe Connect Test bereit"
            : stripeConfigured
              ? "Connect wartet auf UG"
              : "Stripe Test-Key fehlt"}
        </span>
      </section>

      {!connectPlatformReady ? (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          Anbieter-Onboarding bleibt technisch gesperrt, bis die Benefitsi UG
          gegründet und als Stripe-Connect-Plattform verifiziert ist. Die
          Werbeagentur oder vorläufige Ersatzdaten werden nicht verwendet.
        </div>
      ) : null}

      {feedback.success ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          Aktion erfolgreich gespeichert: {feedback.success}
        </div>
      ) : null}
      {feedbackError ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
          Aktion blockiert: {feedbackError}
        </div>
      ) : null}
      {feedback.connect ? (
        <div role="status" className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900">
          Stripe-Onboarding wurde verlassen. Der Kontostatus wird automatisch per signiertem Webhook aktualisiert.
        </div>
      ) : null}
      {data.warnings.map((warning) => (
        <div key={warning} role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          {warning}
        </div>
      ))}
      {alerts.length > 0 ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">
            Operative Hinweise
          </p>
          <ul className="mt-3 space-y-2">
            {alerts.map((alert, index) => (
              <li key={`${alert.code}-${alert.bookingId || index}`} className="flex flex-col gap-1 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                <span>{alert.message}</span>
                {alert.bookingId ? (
                  <Link href={`/bookings/${alert.bookingId}`} className="font-black text-[#0b75d9]">
                    Öffnen →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid overflow-hidden rounded-3xl border border-[#061829]/10 bg-white sm:grid-cols-4">
        <Metric label="Anbieter" value={String(data.providers.length)} />
        <Metric label="Aktive Angebote" value={String(data.offers.filter((offer) => offer.status === "active").length)} />
        <Metric label="Bestätigtes Volumen" value={money(gross)} />
        <Metric label="Benefitsi-Gebühr" value={money(fees)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(18rem,.65fr)_minmax(0,1.35fr)]">
        <aside className="space-y-5">
          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_18px_50px_rgba(6,24,41,.05)]">
            <Eyebrow>Anbieter</Eyebrow>
            <h2 className="mt-1 text-xl font-black">Test-Anbieter anlegen</h2>
            <form action={createBookingProvider} className="mt-5 space-y-3">
              <fieldset disabled={!data.migrationReady} className="space-y-3 disabled:opacity-50">
                <Field name="displayName" label="Anbietername" required />
                <Field name="supportEmail" label="Support-E-Mail" type="email" />
                <PendingSubmitButton
                  pendingLabel="Wird angelegt …"
                  className="min-h-11 w-full rounded-xl bg-[#061829] px-4 text-sm font-black text-white transition hover:bg-[#0d2b44]"
                >
                  Anbieter anlegen
                </PendingSubmitButton>
              </fieldset>
            </form>
          </section>

          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5">
            <Eyebrow>Automatisierter Ablauf</Eyebrow>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-[#526170]">
              <Step number="1">Anbieter anlegen und bei Stripe im Testmodus onboarden.</Step>
              <Step number="2">Angebot, Preis, Termin und echte Kapazität erfassen.</Step>
              <Step number="3">Ben prüft den Entwurf; ein Mensch veröffentlicht.</Step>
              <Step number="4">Checkout reserviert Plätze atomar, Webhooks bestätigen exakt einmal.</Step>
            </ol>
          </section>
        </aside>

        <div className="space-y-5">
          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_18px_50px_rgba(6,24,41,.05)] sm:p-6">
            <Eyebrow>Angebot</Eyebrow>
            <h2 className="mt-1 text-xl font-black">Buchbares Erlebnis vorbereiten</h2>
            <p className="mt-2 text-sm leading-6 text-[#617080]">
              Das Angebot startet immer als Prüfentwurf. Preis und Benefitsi-Gebühr werden beim Hold unveränderbar in die Buchung kopiert.
            </p>
            <form action={createBookingOffer}>
              <fieldset disabled={!data.migrationReady} className="mt-5 grid gap-3 disabled:opacity-50 sm:grid-cols-2">
              <SelectField name="providerId" label="Anbieter" required>
                <option value="">Bitte wählen</option>
                {data.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.displayName}</option>
                ))}
              </SelectField>
              <SelectField name="cityId" label="Stadt" required>
                <option value="">Bitte wählen</option>
                {data.cities.map((city) => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))}
              </SelectField>
              <Field name="title" label="Titel" required />
              <Field name="slug" label="URL-Slug" placeholder="trifels-fuehrung" required />
              <label className="grid gap-1.5 text-xs font-bold text-[#526170] sm:col-span-2">
                Beschreibung
                <textarea name="description" required minLength={20} maxLength={5000} rows={4} className={inputClass} />
              </label>
              <Field name="priceEuro" label="Preis pro Platz (€)" type="number" min="1" step="0.01" required />
              <Field name="feePercent" label="Benefitsi-Gebühr (%)" type="number" min="0" max="30" step="0.1" defaultValue="12" required />
              <Field name="startsAt" label="Beginn" type="datetime-local" required />
              <Field name="endsAt" label="Ende" type="datetime-local" required />
              <Field name="capacity" label="Kapazität" type="number" min="1" step="1" required />
              <div className="flex items-end">
                <PendingSubmitButton
                  pendingLabel="Wird vorbereitet …"
                  className="min-h-11 w-full rounded-xl bg-[#118cff] px-4 text-sm font-black text-white transition hover:bg-[#0878df]"
                >
                  Prüfentwurf erstellen
                </PendingSubmitButton>
              </div>
              </fieldset>
            </form>
          </section>

          <section className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white">
            <div className="p-5">
              <Eyebrow>Pipeline</Eyebrow>
              <h2 className="mt-1 text-xl font-black">Anbieter und Angebote</h2>
            </div>
            {data.providers.length === 0 ? (
              <Empty>Nach Anwendung des Schemas hier den ersten Annweiler-Anbieter anlegen.</Empty>
            ) : (
              <div className="divide-y divide-[#061829]/10">
                {data.providers.map((provider) => {
                  const offers = data.offers.filter((offer) => offer.providerId === provider.id)
                  return (
                    <article key={provider.id} className="p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h3 className="font-black">{provider.displayName}</h3>
                          <p className="mt-1 text-sm text-[#617080]">
                            Connect: {provider.onboardingStatus} · Zahlungen: {provider.chargesEnabled ? "bereit" : "gesperrt"}
                          </p>
                        </div>
                        {stripeConfigured ? (
                          <ConnectOnboardingButton
                            providerId={provider.id}
                            enabled={connectPlatformReady}
                            disabledReason="Freischaltung erst nach Gründung und Stripe-Verifizierung der Benefitsi UG."
                          />
                        ) : null}
                      </div>
                      <div className="mt-4 space-y-3">
                        {offers.map((offer) => {
                          const publishable = canPublishBookingOffer(offer, provider)
                          return (
                            <div key={offer.id} className="rounded-2xl border border-[#061829]/10 bg-[#f8fafb] p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="font-black">{offer.title}</p>
                                  <p className="mt-1 text-sm text-[#617080]">
                                    {money(offer.unitAmount)} · Gebühr {(offer.applicationFeeBps / 100).toLocaleString("de-DE")} % · {offer.cityName}
                                  </p>
                                  <p className="mt-1 text-xs font-semibold text-[#526170]">
                                    {offer.status} · {offer.reviewStage} · {offer.canonicalPath}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {offer.reviewStage === "agent_draft" ? (
                                    <form action={submitBookingOfferToBen}>
                                      <input type="hidden" name="offerId" value={offer.id} />
                                      <SmallSubmit label="Ben prüfen lassen" pending="Ben prüft …" />
                                    </form>
                                  ) : null}
                                  {publishable ? (
                                    <form action={publishBookingOffer}>
                                      <input type="hidden" name="offerId" value={offer.id} />
                                      <SmallSubmit label="Menschlich freigeben" pending="Freigabe …" primary />
                                    </form>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        {offers.length === 0 ? <p className="text-sm text-[#617080]">Noch kein Angebot.</p> : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white">
            <div className="p-5">
              <Eyebrow>Buchungen</Eyebrow>
              <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-black">Zahlungs- und Kapazitätsstatus</h2>
                <a href="/api/bookings/export" className="inline-flex min-h-10 items-center rounded-xl border border-[#061829]/15 px-3 text-xs font-black text-[#061829] hover:border-[#118cff]">
                  CSV exportieren
                </a>
              </div>
            </div>
            {data.bookings.length === 0 ? (
              <Empty>Noch keine Testbuchungen.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-y border-[#061829]/10 bg-[#f8fafb] text-xs uppercase tracking-[0.1em] text-[#617080]">
                    <tr>
                      <th className="px-5 py-3">Referenz</th>
                      <th className="px-5 py-3">Angebot</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Brutto</th>
                      <th className="px-5 py-3">Gebühr</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#061829]/10">
                    {data.bookings.map((booking) => (
                      <tr key={booking.id}>
                        <td className="px-5 py-4 font-black">
                          <Link href={`/bookings/${booking.id}`} className="text-[#0b75d9] hover:underline">
                            {booking.publicReference}
                          </Link>
                        </td>
                        <td className="px-5 py-4">{booking.offerTitle}</td>
                        <td className="px-5 py-4">{booking.state}</td>
                        <td className="px-5 py-4">{money(booking.totalAmount)}</td>
                        <td className="px-5 py-4 font-bold text-[#0b75d9]">{money(booking.applicationFeeAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminShell>
  )
}

const inputClass =
  "min-h-11 rounded-xl border border-[#061829]/15 bg-white px-3 py-2.5 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-[#061829]/10 px-5 py-5 sm:border-l sm:first:border-l-0">
      <p className="text-2xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#617080]">{label}</p>
    </div>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">{children}</p>
}

function Field({
  label,
  name,
  type = "text",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-[#526170]">
      {label}
      <input name={name} type={type} className={inputClass} {...props} />
    </label>
  )
}

function SelectField({ label, name, children, required }: { label: string; name: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-[#526170]">
      {label}
      <select name={name} required={required} className={inputClass}>{children}</select>
    </label>
  )
}

function Step({ number, children }: { number: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e6f2ff] text-xs font-black text-[#0b75d9]">{number}</span>
      <span>{children}</span>
    </li>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="border-t border-[#061829]/10 px-5 py-10 text-center text-sm text-[#617080]">{children}</div>
}

function SmallSubmit({ label, pending, primary = false }: { label: string; pending: string; primary?: boolean }) {
  return (
    <PendingSubmitButton
      pendingLabel={pending}
      className={`min-h-10 rounded-xl px-3 text-xs font-black transition ${
        primary
          ? "bg-[#17d4d7] text-[#061829] hover:bg-[#39e3e5]"
          : "border border-[#061829]/15 bg-white text-[#061829] hover:border-[#118cff]"
      }`}
    >
      {label}
    </PendingSubmitButton>
  )
}

function money(cents: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100)
}
