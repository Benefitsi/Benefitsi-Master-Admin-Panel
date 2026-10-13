"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useAdminLanguage } from "@/app/admin-language"
import type { ProfileDocumentContent, ProfileDocumentList, ProfileFileId, ProfileModelApplied, ProfileModelOptions } from "@/lib/agent-profile-controls"

const buttonClass = "min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#17b7c7] hover:text-[#087d89] disabled:cursor-not-allowed disabled:opacity-50"
const errorCopy: Record<string, string> = {
  access_denied: "Die erforderliche Admin- oder Finanzberechtigung fehlt.",
  unsupported_profile: "Dieses Profil gehört nicht zum Benefitsi-Team.",
  context_file_missing: "Die Datei fehlt auf M1.",
  context_file_forbidden: "Diese Datei ist nicht zur Ansicht freigegeben.",
  context_not_utf8: "Die Datei ist nicht als UTF-8 lesbar.",
  context_too_large: "Die Datei überschreitet das Leselimit von 64 KiB.",
  context_symlink: "Die Datei ist aus Sicherheitsgründen nicht lesbar.",
  context_changed: "Die Datei wurde während des Lesens geändert. Bitte erneut lesen.",
  context_profile_forbidden: "Dieses Profil gehört nicht zum Benefitsi-Team.",
  context_unavailable: "Die M1-Verbindung ist derzeit nicht erreichbar. Bitte erneut prüfen.",
  unauthenticated_provider: "Die Verbindung ist nicht mehr angemeldet. Bitte in Hermes prüfen.",
  unavailable_model: "Das Modell ist für diese Verbindung nicht verfügbar.",
  catalog_unavailable: "Der Modellkatalog ist derzeit nicht verfügbar.",
  configuration_changed: "Die Einstellung wurde inzwischen geändert. Bitte die Verbindungen neu prüfen.",
  model_busy: "Ein anderer Modellwechsel läuft. Bitte danach neu prüfen.",
  starter_not_supported: "Der vorhandene Startweg übernimmt diese Profilwahl derzeit nicht.",
  persist_failed: "Die Einstellung konnte nicht gespeichert werden. Bitte den Stand neu prüfen.",
  readback_failed: "Der gespeicherte Stand konnte nicht bestätigt werden. Bitte neu prüfen, bevor du erneut anwendest.",
  save_unconfirmed: "Der gespeicherte Stand konnte nicht bestätigt werden. Bitte neu prüfen, bevor du erneut anwendest.",
  invalid_response: "M1 hat keine bestätigte gültige Antwort geliefert.",
}
function message(error: unknown) { return error instanceof Error ? errorCopy[error.message] ?? "Die M1-Verbindung ist derzeit nicht erreichbar. Bitte erneut prüfen." : "Die M1-Verbindung ist derzeit nicht erreichbar. Bitte erneut prüfen." }
async function read<T>(url: string, signal: AbortSignal, input?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, { method: input ? "POST" : "GET", cache: "no-store", credentials: "same-origin", signal, ...(input ? { headers: { "content-type": "application/json" }, body: JSON.stringify(input) } : {}) })
  const result = await response.json()
  if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "bridge_unavailable")
  return result as T
}

type Props = { profileId: string; initialProvider: string | null; initialModel: string | null }
export function AgentProfileControls(props: Props) { return <ProfileControls key={props.profileId} {...props} /> }
function ProfileControls({ profileId, initialProvider, initialModel }: Props) {
  const { language, tr } = useAdminLanguage(), id = useId()
  const requests = useRef<{ docs?: AbortController; models?: AbortController }>({})
  const [documents, setDocuments] = useState<ProfileDocumentList | null>(null)
  const [document, setDocument] = useState<ProfileDocumentContent | null>(null)
  const [docBusy, setDocBusy] = useState(false), [docError, setDocError] = useState<string | null>(null)
  const [options, setOptions] = useState<ProfileModelOptions | null>(null)
  const [provider, setProvider] = useState(""), [model, setModel] = useState("")
  const [modelBusy, setModelBusy] = useState<"load" | "save" | null>(null), [modelError, setModelError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { const active = requests.current; return () => { active.docs?.abort(); active.models?.abort() } }, [])
  const date = (value: string) => new Intl.DateTimeFormat(language === "en" ? "en-GB" : "de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value))
  const base = `/api/agents/profiles/${encodeURIComponent(profileId)}`
  function begin(kind: "docs" | "models") { requests.current[kind]?.abort(); const controller = new AbortController(); requests.current[kind] = controller; return controller }

  async function loadDocuments(fileId?: ProfileFileId) {
    const controller = begin("docs")
    setDocBusy(true); setDocError(null); setDocument(null)
    try {
      if (fileId) { const loaded = await read<ProfileDocumentContent>(`${base}/documents?fileId=${encodeURIComponent(fileId)}`, controller.signal); if (!controller.signal.aborted) setDocument(loaded) }
      else { const loaded = await read<ProfileDocumentList>(`${base}/documents`, controller.signal); if (!controller.signal.aborted) setDocuments(loaded) }
    } catch (error) { if (!controller.signal.aborted) setDocError(message(error)) }
    finally { if (!controller.signal.aborted) setDocBusy(false) }
  }
  async function loadModels() {
    const controller = begin("models")
    setModelBusy("load"); setModelError(null); setSaved(false); setOptions(null)
    try {
      const loaded = await read<ProfileModelOptions>(`${base}/models`, controller.signal)
      if (controller.signal.aborted) return
      setOptions(loaded)
      const available = loaded.providers.find(p => p.id === loaded.current.provider && p.models.some(m => m.id === loaded.current.model))
      setProvider(available?.id ?? ""); setModel(available ? loaded.current.model ?? "" : "")
    } catch (error) { if (!controller.signal.aborted) setModelError(message(error)) }
    finally { if (!controller.signal.aborted) setModelBusy(null) }
  }
  async function applyModel() {
    if (!options || !options.starter.appliesToNewJobs || !provider || !model || modelBusy) return
    const controller = begin("models")
    setModelBusy("save"); setModelError(null); setSaved(false)
    try {
      const applied = await read<ProfileModelApplied>(`${base}/models`, controller.signal, { provider, model, expectedProvider: options.current.provider, expectedModel: options.current.model, expectedRevision: options.revision, confirmed: true })
      if (controller.signal.aborted) return
      setOptions({ ...options, ...applied }); setSaved(true)
    } catch (error) { if (!controller.signal.aborted) { setModelError(message(error)); setOptions(null) } }
    finally { if (!controller.signal.aborted) setModelBusy(null) }
  }
  const models = options?.providers.find(p => p.id === provider)?.models ?? []
  const adjustable = options?.starter.mode !== "deterministic" && options?.starter.appliesToNewJobs === true
  const changed = options && (provider !== options.current.provider || model !== options.current.model)

  return <section className="mt-5 space-y-5 border-t border-slate-100 pt-5" aria-label={tr("Markdown & Modell")}>
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-[#061829]">{tr("Markdown-Dateien")}</h4><button type="button" className={buttonClass} disabled={docBusy} onClick={() => loadDocuments()}>{tr(docBusy ? "Dateien werden geladen …" : documents ? "Dateien neu laden" : "Dateien anzeigen")}</button></div>
      {documents ? <div className="mt-3 flex flex-wrap gap-2">{documents.documents.length ? documents.documents.map(file => <button type="button" key={file.fileId} className={buttonClass} disabled={!file.exists || docBusy} onClick={() => loadDocuments(file.fileId)} title={!file.exists ? tr("Datei fehlt auf M1.") : tr("Datei lesen")}><span translate="no">{file.path}</span></button>) : <p className="text-xs text-slate-500">{tr("Keine freigegebenen Markdown-Dateien vorhanden.")}</p>}</div> : null}
      {docBusy ? <p role="status" className="mt-2 text-xs text-slate-500">{tr("Dokument wird gelesen …")}</p> : null}
      {docError ? <p role="alert" className="mt-2 text-xs leading-5 text-amber-800">{tr(docError)}</p> : null}
      {document ? <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><div className="space-y-1 border-b border-slate-200 px-3 py-2 text-xs text-slate-500"><p>{tr("Quelle: M1 · Live gelesen")} · <span translate="no">{document.path}</span></p><p>{tr("Geändert")}: {date(document.modifiedAt)} · {tr("Gelesen")}: {date(document.readAt)} · Europe/Berlin</p></div><pre translate="no" data-admin-i18n-ignore className="max-h-96 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-6 text-slate-700">{document.content}</pre></div> : null}
      <p className="mt-2 text-xs leading-5 text-slate-500">{tr("Kontextdateien zeigen hinterlegtes Wissen; ihre Existenz belegt keine Nutzung in einem laufenden Auftrag.")}</p>
    </div>
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-[#061829]">{tr("Modell & Verbindung")}</h4><button type="button" className={buttonClass} disabled={modelBusy !== null} onClick={loadModels}>{tr(modelBusy === "load" ? "Verbindungen werden geprüft …" : options || modelError ? "Verbindungen neu prüfen" : "Verbindungen prüfen")}</button></div>
      <p className="mt-2 text-xs text-slate-500">{tr(options ? "Gespeichert auf M1" : "Zuletzt beobachtet")}: <span translate="no">{options ? options.current.provider ?? "—" : initialProvider ?? "—"} · {options ? options.current.model ?? "—" : initialModel ?? "—"}</span></p>
      {options ? <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-500">{tr("Abgefragt")}: {date(options.checkedAt)} · Europe/Berlin</p>
        {options.starter.mode === "deterministic" ? null : options.providers.some(p => p.models.length) ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600" htmlFor={`${id}-provider`}>{tr("Anbieter")}<select id={`${id}-provider`} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={provider} disabled={modelBusy !== null || !adjustable} onChange={e => { setProvider(e.target.value); setModel(""); setSaved(false) }}><option value="">{tr("Bitte auswählen ...")}</option>{options.providers.filter(p => p.models.length).map(p => <option key={p.id} value={p.id} translate="no">{p.label}</option>)}</select></label><label className="text-xs font-semibold text-slate-600" htmlFor={`${id}-model`}>{tr("Modell")}<select id={`${id}-model`} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={model} disabled={!provider || modelBusy !== null || !adjustable} onChange={e => { setModel(e.target.value); setSaved(false) }}><option value="">{tr("Bitte auswählen ...")}</option>{models.map(m => <option key={m.id} value={m.id} translate="no">{m.label}</option>)}</select></label></div> : <p className="text-xs leading-5 text-amber-800">{tr("Keine angemeldete Verbindung mit verfügbarem Modell gefunden.")}</p>}
        <p className="text-xs leading-5 text-slate-500">{tr(options.starter.mode === "deterministic" ? "Modellwechsel sind für diesen Prüfworkflow nicht verfügbar." : options.starter.appliesToNewJobs ? profileId === "benefitsi-menu" ? "Die Auswahl gilt für neue Menüimporte. Ein Wechsel während der Texterkennung kann den Import vor dem Modellaufruf stoppen." : "Die Auswahl gilt für neue Aufträge. Laufende Aufträge bleiben unverändert." : "Der vorhandene Startweg übernimmt diese Profilwahl derzeit nicht.")}</p>
        {options.starter.limitations.length ? <ul className="space-y-1 text-xs leading-5 text-amber-800">{options.starter.limitations.map(note => <li key={note}>{tr(note)}</li>)}</ul> : null}
        {options.starter.mode !== "deterministic" ? <button type="button" className={`${buttonClass} !border-[#17b7c7] !bg-[#17b7c7] !text-white`} disabled={!options.starter.appliesToNewJobs || !provider || !model || !changed || modelBusy !== null} onClick={applyModel}>{tr(modelBusy === "save" ? "Wird gespeichert …" : "Anwenden")}</button> : null}
        {saved ? <p role="status" className="text-xs text-teal-700">{tr("Auf M1 gespeichert und zurückgelesen.")}</p> : null}
      </div> : null}
      {modelError ? <p role="alert" className="mt-2 text-xs leading-5 text-amber-800">{tr(modelError)}</p> : null}
      <p className="mt-2 text-xs leading-5 text-slate-500">{tr("Nur angemeldete Hermes-Verbindungen werden angeboten. Neue Anmeldungen erfolgen in Hermes.")}</p>
    </div>
  </section>
}
