'use client'

export default function MemoryStampsError({ reset }: { reset: () => void }) {
  return <div className="mx-auto max-w-xl space-y-4 p-6" role="alert">
    <h2 className="text-xl font-bold">Entdeckerstempel konnten nicht geladen werden</h2>
    <p>Bitte erneut versuchen. Falls die Meldung bleibt, prüfe deine Anmeldung und die Verbindung zur Datenbank.</p>
    <button onClick={reset} className="min-h-11 rounded-xl bg-[#0b75d9] px-4 font-bold text-white">Erneut laden</button>
  </div>
}
