type Version = { id: string; version_number: number | null; created_at?: string | null }

export function MicrositePublicationSummary({
  saved, published, dirty, publicUrl, locale = "de",
}: {
  saved: Version | null
  published: Version | null
  dirty: boolean
  publicUrl: string
  locale?: "de" | "en"
}) {
  const en = locale === "en"
  const versionText = (version: Version) => version.version_number == null
    ? (en ? "Saved version" : "Gespeicherte Version")
    : `Version ${version.version_number}`
  const isDraft = saved && saved.id !== published?.id
  return (
    <div className="grid gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-3 sm:grid-cols-2" aria-live="polite">
      <div>
        <p className="text-xs font-semibold text-zinc-500">{en ? "Your changes" : "Dein Arbeitsstand"}</p>
        <p className={`mt-1 text-sm font-semibold ${dirty ? "text-amber-800" : "text-zinc-900"}`}>
          {dirty ? (en ? "Unsaved changes" : "Ungespeicherte Änderungen")
            : saved ? `${versionText(saved)} · ${isDraft ? (en ? "Draft saved" : "Entwurf gespeichert") : (en ? "Saved" : "Gespeichert")}`
              : (en ? "New draft" : "Neuer Entwurf")}
        </p>
        <p className="mt-1 text-xs text-zinc-500">{en ? "Save keeps your changes. Publish makes them visible to visitors." : "Speichern sichert deine Änderungen. Veröffentlichen zeigt sie den Besuchern."}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-zinc-500">{en ? "Currently online" : "Aktuell veröffentlicht"}</p>
        {published ? (
          <a href={publicUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-8 items-center gap-2 text-sm font-semibold text-teal-800 underline underline-offset-4">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
            {versionText(published)} · {en ? "Open live page" : "Live-Seite öffnen"}
          </a>
        ) : <p className="mt-1 text-sm font-semibold text-zinc-700">{en ? "Not published" : "Noch nicht veröffentlicht"}</p>}
      </div>
    </div>
  )
}
