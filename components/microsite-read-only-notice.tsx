import Link from "next/link"

export function MicrositeReadOnlyNotice({ identifier }: { identifier: string }) {
  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950">
      <h2 className="font-semibold">Deine Microsite ansehen</h2>
      <p className="mt-2 leading-6">
        Änderungen an der Microsite und Veröffentlichungen übernimmt derzeit das
        Benefitsi-Team. Deine Partnerdaten kannst du mit dem dafür berechtigten
        Inhaberzugang weiterhin bearbeiten.
      </p>
      <Link className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-sky-800 px-4 py-2 font-medium text-white hover:bg-sky-900" href={`/partner/microsite-preview/${encodeURIComponent(identifier)}`}>
        Vorschau öffnen
      </Link>
    </section>
  )
}
