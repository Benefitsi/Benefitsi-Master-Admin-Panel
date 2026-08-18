import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import { cancelOrRefundBooking } from "@/app/bookings/actions"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { requireAdmin } from "@/lib/admin"
import { loadBookingDetail } from "@/lib/bookings/data"
import { isStripeTestConfigured } from "@/lib/stripe/config"

export const dynamic = "force-dynamic"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { adminSession } = await requireAdmin()
  const { bookingId } = await params
  const feedback = await searchParams
  if (!UUID_PATTERN.test(bookingId)) notFound()
  const detail = await loadBookingDetail(bookingId)
  if (!detail.booking) notFound()
  const booking = detail.booking
  const provider = detail.data.providers.find(
    (candidate) => candidate.id === booking.providerId,
  )
  const offer = detail.data.offers.find(
    (candidate) => candidate.id === booking.offerId,
  )
  const slot = detail.data.slots.find(
    (candidate) => candidate.id === booking.slotId,
  )
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.user.email ||
    "Admin"
  const cancellable = ["hold", "payment_pending", "confirmed", "cancel_requested"].includes(
    booking.state,
  )
  const refundNeedsStripe = ["confirmed", "cancel_requested"].includes(booking.state)

  return (
    <AdminShell
      adminName={adminName}
      title={`Buchung ${booking.publicReference}`}
      subtitle={`${booking.offerTitle} · ${booking.state}`}
    >
      <Link href="/bookings" className="inline-flex min-h-11 items-center text-sm font-black text-[#0b75d9]">
        ← Zurück zum Booking Control
      </Link>
      {feedback.error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
          Aktion blockiert: {feedback.error}
        </div>
      ) : null}
      {feedback.success ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          Aktion gespeichert: {feedback.success}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,.75fr)]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Buchungsdaten</p>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <Datum label="Angebot" value={offer?.title || booking.offerTitle} />
              <Datum label="Anbieter" value={provider?.displayName || booking.providerName} />
              <Datum label="Termin" value={date(slot?.startsAt)} />
              <Datum label="Plätze" value={String(booking.quantity)} />
              <Datum label="Brutto" value={money(booking.totalAmount)} />
              <Datum label="Benefitsi-Gebühr" value={money(booking.applicationFeeAmount)} />
              <Datum label="Anbieteranteil" value={money(booking.totalAmount - booking.applicationFeeAmount)} />
              <Datum label="Zustand" value={booking.state} />
              <Datum label="Checkout" value={booking.stripeCheckoutSessionId || "—"} />
              <Datum label="Payment Intent" value={booking.stripePaymentIntentId || "—"} />
              <Datum label="Refund" value={booking.stripeRefundId || "—"} />
              <Datum label="Erstellt" value={date(booking.createdAt)} />
            </dl>
          </section>

          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Audit-Timeline</p>
            {detail.audit.length > 0 ? (
              <ol className="mt-5 space-y-4 border-l border-[#061829]/15 pl-5">
                {detail.audit.map((entry) => (
                  <li key={entry.id}>
                    <p className="font-black">{entry.action}</p>
                    <p className="mt-1 text-xs text-[#617080]">
                      {entry.actorProfile || entry.actorType} · {date(entry.createdAt)}
                    </p>
                    {typeof entry.details.reason === "string" ? (
                      <p className="mt-2 text-sm text-[#334454]">{entry.details.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-[#617080]">Keine Audit-Einträge.</p>
            )}
          </section>
        </div>

        <aside>
          <section className="rounded-3xl border border-[#061829]/10 bg-[#061829] p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#17d4d7]">Sensible Aktion</p>
            <h2 className="mt-2 text-xl font-black">Storno / Test-Refund</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Bezahlte Buchungen erzeugen ausschließlich einen Stripe-Test-Refund. Jede Aktion ist idempotent und auditiert.
            </p>
            {refundNeedsStripe && !isStripeTestConfigured() ? (
              <p className="mt-4 rounded-2xl bg-amber-300/15 p-3 text-sm text-amber-100">
                Refund gesperrt: `STRIPE_SECRET_KEY` im Testmodus fehlt.
              </p>
            ) : null}
            {cancellable ? (
              <form action={cancelOrRefundBooking} className="mt-5">
                <input type="hidden" name="bookingId" value={booking.id} />
                <label className="grid gap-1.5 text-xs font-bold text-white/70">
                  Begründung
                  <textarea name="reason" required minLength={3} maxLength={1000} rows={4} className="rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#17d4d7]" />
                </label>
                <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-white/70">
                  <input type="checkbox" name="confirm" value="yes" required className="mt-1" />
                  Ich bestätige die Stornierung und – falls bezahlt – den Stripe-Test-Refund.
                </label>
                <PendingSubmitButton
                  pendingLabel="Wird sicher verarbeitet …"
                  className="mt-4 min-h-11 w-full rounded-xl bg-[#17d4d7] px-4 text-sm font-black text-[#061829]"
                >
                  Storno sicher ausführen
                </PendingSubmitButton>
              </form>
            ) : (
              <p className="mt-4 text-sm text-white/60">Für diesen Zustand ist keine Stornoaktion offen.</p>
            )}
          </section>
        </aside>
      </div>
    </AdminShell>
  )
}

function Datum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold text-[#617080]">{label}</dt>
      <dd className="mt-1 break-all text-sm font-semibold text-[#061829]">{value}</dd>
    </div>
  )
}

function money(cents: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function date(value?: string | null) {
  if (!value) return "—"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(parsed)
}
