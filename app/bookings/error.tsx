"use client"

export default function BookingError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f6f1] px-5 text-[#061829]">
      <section className="max-w-lg rounded-3xl border border-rose-200 bg-white p-7">
        <h1 className="text-2xl font-black">Booking Control nicht verfügbar</h1>
        <p className="mt-3 text-sm leading-7 text-[#526170]">
          Die sichere Datenverbindung konnte nicht hergestellt werden.
        </p>
        <button onClick={reset} className="mt-5 min-h-11 rounded-xl bg-[#061829] px-5 text-sm font-black text-white">
          Erneut versuchen
        </button>
      </section>
    </main>
  )
}
