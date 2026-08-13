import Link from "next/link"
import type { ReactNode } from "react"
import { BrandLogo } from "@/components/brand-logo"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { requireProviderBookingContext } from "@/lib/bookings/provider-data"
import { requestProviderCancellation } from "./actions"

export const dynamic = "force-dynamic"

export default async function PartnerBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const feedback = await searchParams
  const context = await requireProviderBookingContext()
  const userName =
    context.session.profile?.display_name ||
    context.session.user.email ||
    "Partner"
  const confirmed = context.bookings.filter((booking) => booking.state === "confirmed")
  const gross = confirmed.reduce((sum, booking) => sum + booking.totalAmount, 0)
  const net = confirmed.reduce(
    (sum, booking) =>
      sum + booking.totalAmount - booking.applicationFeeAmount,
    0,
  )

  return (
    <main className="min-h-screen bg-[#f7f6f1] px-5 py-6 text-[#061829]">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 rounded-3xl border border-[#061829]/10 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandLogo className="h-auto w-44" priority />
            <p className="mt-2 text-sm text-[#617080]">Partner Booking Operations</p>
          </div>
          <div className="text-sm font-semibold text-[#526170]">{userName}</div>
        </header>

        <div className="mt-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Eigene Buchungen</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.04em]">Buchungsübersicht</h1>
          </div>
          <Link href="/partner" className="text-sm font-black text-[#0b75d9]">Zum Partner-Dashboard →</Link>
        </div>

        {feedback.error ? <Message tone="error">Aktion blockiert: {feedback.error}</Message> : null}
        {feedback.success ? <Message tone="success">Stornoanfrage wurde sicher protokolliert.</Message> : null}

        <section className="mt-5 grid overflow-hidden rounded-3xl border border-[#061829]/10 bg-white sm:grid-cols-3">
          <Metric label="Bestätigte Buchungen" value={String(confirmed.length)} />
          <Metric label="Bruttovolumen" value={money(gross)} />
          <Metric label="Voraussichtlicher Anbieteranteil" value={money(net)} />
        </section>

        <section className="mt-5 rounded-3xl border border-[#061829]/10 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Stripe Connect</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {context.providers.map((provider) => (
              <div key={provider.id} className="rounded-2xl border border-[#061829]/10 bg-[#f8fafb] p-4">
                <p className="font-black">{provider.displayName}</p>
                <p className="mt-1 text-sm text-[#617080]">
                  {provider.onboardingStatus} · Zahlungen {provider.chargesEnabled ? "aktiv" : "gesperrt"} · Auszahlungen {provider.payoutsEnabled ? "aktiv" : "gesperrt"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-3xl border border-[#061829]/10 bg-white">
          <div className="p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Buchungen</p>
            <h2 className="mt-1 text-xl font-black">Nur zugeordnete Partnerbetriebe</h2>
          </div>
          {context.bookings.length === 0 ? (
            <p className="border-t border-[#061829]/10 px-5 py-10 text-center text-sm text-[#617080]">Noch keine Buchungen.</p>
          ) : (
            <div className="divide-y divide-[#061829]/10">
              {context.bookings.map((booking) => (
                <article key={booking.id} className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-start">
                  <div>
                    <p className="font-black">{booking.publicReference} · {booking.offerTitle}</p>
                    <p className="mt-1 text-sm text-[#617080]">
                      {booking.quantity} Platz/Plätze · {money(booking.totalAmount)} · Anbieteranteil {money(booking.totalAmount - booking.applicationFeeAmount)} · {booking.state}
                    </p>
                  </div>
                  {["hold", "payment_pending", "confirmed"].includes(booking.state) ? (
                    <form action={requestProviderCancellation} className="w-full md:w-72">
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <input name="reason" required minLength={3} maxLength={1000} placeholder="Stornogrund" className="min-h-10 w-full rounded-xl border border-[#061829]/15 px-3 text-sm" />
                      <PendingSubmitButton pendingLabel="Wird angefragt …" className="mt-2 min-h-10 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-xs font-black hover:border-[#118cff]">
                        Storno anfragen
                      </PendingSubmitButton>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-[#061829]/10 p-5 sm:border-l sm:first:border-l-0">
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#617080]">{label}</p>
    </div>
  )
}

function Message({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
      tone === "error"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-emerald-200 bg-emerald-50 text-emerald-900"
    }`}>{children}</div>
  )
}

function money(cents: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100)
}
