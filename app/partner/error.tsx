'use client'
export default function PartnerError({
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f6f1] p-5">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-bold">
          Partnerbereich vorübergehend nicht verfügbar
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Deine Sitzung oder Berechtigung konnte nicht bestätigt werden.
          Versuche es erneut oder melde dich neu an.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-sky-700 px-4 py-3 text-sm font-bold text-white"
          >
            Erneut versuchen
          </button>
          <a
            href="/partner/login"
            className="rounded-lg border border-slate-300 px-4 py-3 text-sm"
          >
            Zur Anmeldung
          </a>
        </div>
      </section>
    </main>
  )
}
