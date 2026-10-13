"use client"
import { useAdminLanguage } from "@/app/admin-language"
import type { KnowledgeNote, KnowledgeProfile } from "@/lib/benefitsi-knowledge-controls"
export type ManagedNoteResult = { state: "ready"; note: KnowledgeNote } | { state: "invalid" | "unavailable" | "forbidden" }
const names: Record<KnowledgeProfile, string> = { ben: "Ben", "benefitsi-content": "Content", "benefitsi-finance": "Finanzen", "benefitsi-seo": "SEO", "city-annweiler": "Annweiler", "benefitsi-menu": "Menü" }
export function ManagedNoteDetail({ result }: { result: ManagedNoteResult }) {
  const { language, tr } = useAdminLanguage()
  const date = (value: string) => new Intl.DateTimeFormat(language === "en" ? "en-GB" : "de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value))
  if (result.state !== "ready") {
    const message = result.state === "invalid" ? "Die Notiz oder ihre ID konnte nicht sicher bestätigt werden." : result.state === "forbidden" ? "Für diese Notiz fehlt die erforderliche Berechtigung." : "Die verwaltete Obsidian-Notiz ist derzeit nicht verfügbar."
    return <section id="managed-note" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h2 className="text-sm font-semibold text-amber-950">{tr("Direkt aus Obsidian")}</h2><p role="status" className="mt-2 text-sm text-amber-900">{tr(message)}</p></section>
  }
  const note = result.note
  return <section id="managed-note" className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5"><p className="text-xs font-bold text-blue-700">{tr("Direkt aus Obsidian")}</p><h2 data-admin-no-translate="true" translate="no" className="break-words text-xl font-bold text-slate-900">{note.title}</h2><p className="text-xs leading-5 text-slate-500">{tr("Verwaltete Notiz live gelesen und anhand der Inhaltsbytes geprüft. Der Wissensspiegel wird separat aktualisiert.")}</p>
      <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="font-semibold text-slate-500">{tr("Quelle")}</dt><dd translate="no" className="mt-1">Benefitsi Obsidian · M1</dd></div>
        <div><dt className="font-semibold text-slate-500">{tr("Art")}</dt><dd className="mt-1">{tr(note.kind === "task" ? "Aufgabe" : note.kind === "decision" ? "Entscheidung" : "Ergebnis")}</dd></div>
        <div><dt className="font-semibold text-slate-500">{tr("Agent")}</dt><dd translate={note.profileId ? "no" : undefined} className="mt-1">{note.profileId ? names[note.profileId] : tr("Ohne Zuordnung")}</dd></div>
        <div><dt className="font-semibold text-slate-500">{tr("Erstellt")}</dt><dd translate="no" className="mt-1">{date(note.createdAt)}</dd></div>
        <div><dt className="font-semibold text-slate-500">{tr("Geändert")}</dt><dd translate="no" className="mt-1">{date(note.modifiedAt)}</dd></div>
        <div><dt className="font-semibold text-slate-500">{tr("Live gelesen")}</dt><dd translate="no" className="mt-1">{date(note.checkedAt)} · Europe/Berlin</dd></div>
        <div className="sm:col-span-2 lg:col-span-3"><dt className="font-semibold text-slate-500">{tr("Relativer Pfad")}</dt><dd className="mt-1"><code translate="no" data-admin-no-translate="true" className="break-all">{note.path}</code></dd></div>
        <div className="sm:col-span-2 lg:col-span-3"><dt className="font-semibold text-slate-500">{tr("Inhaltshash")} · SHA-256</dt><dd className="mt-1"><code translate="no" className="break-all">{note.sha256}</code></dd></div>
      </dl>
    </div>
    <pre translate="no" data-admin-no-translate="true" data-admin-i18n-ignore="true" className="max-h-[42rem] overflow-auto whitespace-pre-wrap break-words bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700 sm:p-5">{note.content}</pre>
  </section>
}
