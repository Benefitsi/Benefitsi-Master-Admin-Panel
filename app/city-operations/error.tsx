"use client"

export default function CityOperationsError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f6f1] px-5 text-[#061829]">
      <section className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-7 shadow-[0_20px_56px_rgba(6,24,41,.08)]">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-700">
          Städte-Review
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.035em]">
          Daten konnten nicht geladen werden
        </h1>
        <p className="mt-3 text-sm leading-7 text-[#526170]">
          Prüfe die Supabase-Konfiguration und versuche es anschließend erneut.
        </p>
        <button
          onClick={reset}
          className="mt-5 min-h-11 rounded-xl bg-[#061829] px-5 text-sm font-black text-white"
        >
          Erneut versuchen
        </button>
      </section>
    </main>
  )
}
