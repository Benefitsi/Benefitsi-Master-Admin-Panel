"use client"

export default function CityPageError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f7f6f1] px-4 text-[#061829]">
      <section className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-7 shadow-[0_18px_50px_rgba(80,24,24,.06)]">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-700">
          Stadtverwaltung nicht erreichbar
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.035em]">
          Die Stadtdaten konnten nicht geladen werden.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#617080]">
          Die Verbindung oder eine benötigte Datenbankmigration ist momentan nicht verfügbar.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-11 rounded-xl bg-[#118cff] px-5 text-sm font-black text-white transition hover:bg-[#0878df] active:scale-[.98]"
        >
          Erneut versuchen
        </button>
      </section>
    </main>
  )
}
