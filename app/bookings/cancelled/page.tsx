import Link from "next/link"

export default async function BookingCancelledPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>
}) {
  const booking = (await searchParams).booking?.slice(0, 20)
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f6f1] px-5 text-[#061829]">
      <section className="w-full max-w-xl rounded-3xl border border-[#061829]/10 bg-white p-7 text-center">
        <h1 className="text-3xl font-black tracking-[-0.04em]">Checkout abgebrochen</h1>
        <p className="mt-3 text-sm leading-7 text-[#526170]">
          Es wurde nichts bezahlt. Die temporäre Reservierung wird automatisch freigegeben.
        </p>
        {booking ? <p className="mt-4 text-sm font-bold">Referenz: {booking}</p> : null}
        <Link href="/bookings" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#061829] px-5 text-sm font-black text-white">
          Zurück
        </Link>
      </section>
    </main>
  )
}
