import Link from "next/link"
import { getStripeTestClient } from "@/lib/stripe/config"

export const dynamic = "force-dynamic"

export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const { session_id: sessionId } = await searchParams
  let reference = ""
  let paid = false
  if (sessionId?.startsWith("cs_test_")) {
    try {
      const session = await getStripeTestClient().checkout.sessions.retrieve(sessionId)
      reference = session.client_reference_id || ""
      paid = session.payment_status === "paid"
    } catch {
      // The webhook remains authoritative; the page intentionally stays pending.
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f6f1] px-5 text-[#061829]">
      <section className="w-full max-w-xl rounded-3xl border border-[#061829]/10 bg-white p-7 text-center shadow-[0_20px_56px_rgba(6,24,41,.08)]">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-800">✓</div>
        <h1 className="mt-5 text-3xl font-black tracking-[-0.04em]">
          {paid ? "Testzahlung erfolgreich" : "Zahlung wird bestätigt"}
        </h1>
        <p className="mt-3 text-sm leading-7 text-[#526170]">
          Stripe bestätigt die Buchung serverseitig per signiertem Webhook. Ein Neuladen oder doppelter Webhook erzeugt keine zweite Buchung.
        </p>
        {reference ? <p className="mt-4 font-black">Referenz: {reference}</p> : null}
        <Link href="/bookings" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#061829] px-5 text-sm font-black text-white">
          Zum Booking Control
        </Link>
      </section>
    </main>
  )
}
