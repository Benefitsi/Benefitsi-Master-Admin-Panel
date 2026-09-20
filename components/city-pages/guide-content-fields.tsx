"use client"

import { useState } from "react"
import { parseGuideBlocks, parseGuideSourceEvidence, type GuideEditorBlock } from "@/lib/city-pages/guide-editor"

const input = "min-h-11 w-full rounded-xl border border-[#061829]/15 bg-white px-3 py-2 text-sm font-medium text-[#344454]"
const button = "min-h-11 rounded-xl border border-[#061829]/15 px-3 text-sm font-bold disabled:opacity-40"
const editableTypes = [{ value: "TEXT", label: "Textabschnitt" }, { value: "INFO", label: "Information" }, { value: "TIP", label: "Tipp" }, { value: "WARNING", label: "Hinweis" }]

export function GuideBlocksControl({ value }: { value: unknown }) {
  const [blocks, setBlocks] = useState<GuideEditorBlock[]>(() => Array.isArray(value) ? [...value as GuideEditorBlock[]].sort((a, b) => a.sortOrder - b.sortOrder) : [])
  const [removed, setRemoved] = useState<{ block: GuideEditorBlock; index: number } | null>(null)
  const serialized = JSON.stringify(blocks)
  let invalid = false
  try { parseGuideBlocks(serialized) } catch { invalid = true }
  const update = (index: number, patch: Partial<GuideEditorBlock>) => setBlocks(current => current.map((block, position) => position === index ? { ...block, ...patch } : block))
  const move = (index: number, offset: number) => setBlocks(current => {
    const next = [...current]; [next[index], next[index + offset]] = [next[index + offset], next[index]]
    return next.map((block, sortOrder) => ({ ...block, sortOrder }))
  })
  return <fieldset className="grid gap-4">
    <legend className="text-sm font-black">Guide-Inhalt</legend>
    <p className="text-sm leading-6 text-[#617080]">Abschnitte ergänzen und ordnen. Absätze mit einer Leerzeile trennen; Quellen als [Linktext](https://…) einfügen.</p>
    <input type="hidden" name="blocks" value={serialized} />
    {blocks.map((block, index) => <section key={block.id} className="grid gap-3 rounded-2xl border border-[#061829]/15 bg-[#f8faf9] p-4" aria-label={`Block ${index + 1}`}>
      <div className="flex flex-wrap items-center gap-2">
        <strong className="mr-auto text-sm">Abschnitt {index + 1}</strong>
        <button type="button" className={button} disabled={index === 0} aria-label={`Block ${index + 1} nach oben`} onClick={() => move(index, -1)}>↑</button>
        <button type="button" className={button} disabled={index === blocks.length - 1} aria-label={`Block ${index + 1} nach unten`} onClick={() => move(index, 1)}>↓</button>
        <button type="button" className={button} onClick={() => { setRemoved({ block, index }); setBlocks(current => current.filter((_, i) => i !== index)) }}>Entfernen</button>
      </div>
      <label className="grid gap-1 text-xs font-bold">Art
        <select className={input} value={block.blockType} onChange={event => update(index, { blockType: event.target.value })}>
          {!editableTypes.some(type => type.value === block.blockType) ? <option value={block.blockType}>{block.blockType} (bestehender Inhalt)</option> : null}
          {editableTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-bold">Überschrift<input className={input} value={block.title ?? ""} maxLength={500} onChange={event => update(index, { title: event.target.value })} /></label>
      <label className="grid gap-1 text-xs font-bold">Text<textarea className={`${input} min-h-40 leading-6`} value={block.text ?? ""} maxLength={20000} rows={8} onChange={event => update(index, { text: event.target.value })} /></label>
      <label className="grid gap-1 text-xs font-bold">Listenpunkte · einer pro Zeile<textarea className={input} value={(block.items ?? []).join("\n")} rows={3} onChange={event => update(index, { items: event.target.value.split("\n").filter(line => line.trim()) })} /></label>
      {block.timeline || block.quickFacts || block.relationIds || block.guideIds ? <p className="text-xs leading-5 text-[#617080]">Vorhandene Verknüpfungen, Fakten und Zeitpläne bleiben erhalten.</p> : null}
    </section>)}
    {removed ? <div role="status" className="flex flex-wrap items-center gap-3 text-sm">Abschnitt entfernt.<button type="button" className={button} onClick={() => { setBlocks(current => { const next = [...current]; next.splice(removed.index, 0, removed.block); return next.map((block, sortOrder) => ({ ...block, sortOrder })) }); setRemoved(null) }}>Rückgängig</button></div> : null}
    <button type="button" disabled={blocks.length >= 60} className={button} onClick={() => setBlocks(current => [...current, { id: `text-${crypto.randomUUID()}`, blockType: "TEXT", sortOrder: Math.min(9999, Math.max(-1, ...current.map(block => block.sortOrder)) + 1), title: "", text: "" }])}>Textabschnitt hinzufügen</button>
    {invalid ? <p role="alert" className="text-sm font-bold text-rose-700">Bitte die Abschnitte prüfen: gültige Links, eindeutige Abschnitte und höchstens 20.000 Zeichen je Text. Ungültige Inhalte werden nicht gespeichert.</p> : null}
  </fieldset>
}

export function GuideSourcesControl({ value }: { value: unknown }) {
  const initial = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const [evidence, setEvidence] = useState(initial)
  const update = (key: string, value: unknown) => setEvidence(current => ({ sourceType: "PRIMARY", confidence: "medium", freshnessTtlDays: 90, ...current, [key]: value, verificationStatus: "NEEDS_REVIEW" }))
  const serialized = JSON.stringify(evidence)
  let invalid = false
  try { parseGuideSourceEvidence(serialized) } catch { invalid = true }
  return <fieldset className="grid gap-3 rounded-2xl border border-[#061829]/15 p-4">
    <legend className="text-sm font-black">Quellenprüfung</legend>
    <p className="text-sm leading-6 text-[#617080]">Diese Angaben dokumentieren die Recherche; sie sind keine Veröffentlichungsfreigabe. Weitere Quellen direkt im Guide verlinken.</p>
    <input type="hidden" name="source_meta" value={serialized} />
    <label className="grid gap-1 text-xs font-bold">Quellenart<select className={input} value={String(evidence.sourceType ?? "PRIMARY")} onChange={event => update("sourceType", event.target.value)}><option value="PRIMARY">Offizielle Originalquelle</option><option value="TRUSTED_SECONDARY">Verlässliche ergänzende Quelle</option><option value="INTERNAL">Eigene Redaktion</option></select></label>
    <label className="grid gap-1 text-xs font-bold">Wichtigste Quelle<input className={input} type="url" value={String(evidence.sourceUrl ?? "")} onChange={event => setEvidence(current => { const next = { sourceType: "PRIMARY", confidence: "medium", freshnessTtlDays: 90, ...current, verificationStatus: "NEEDS_REVIEW" }; if (event.target.value) return { ...next, sourceUrl: event.target.value }; const rest: Record<string, unknown> = { ...next }; delete rest.sourceUrl; return rest })} /></label>
    <label className="grid gap-1 text-xs font-bold">Quelle geprüft am<input className={input} type="date" value={String(evidence.lastVerifiedAt ?? "").slice(0, 10)} onChange={event => update("lastVerifiedAt", event.target.value)} /></label>
    <label className="grid gap-1 text-xs font-bold">Sicherheit der Recherche<select className={input} value={String(evidence.confidence ?? "medium")} onChange={event => update("confidence", event.target.value)}><option value="low">Offene Fragen</option><option value="medium">Teilweise bestätigt</option><option value="high">Gut belegt</option></select></label>
    <label className="grid gap-1 text-xs font-bold">Erneut prüfen nach Tagen<input className={input} type="number" min={1} max={3650} value={Number(evidence.freshnessTtlDays ?? 90)} onChange={event => update("freshnessTtlDays", Number(event.target.value))} /></label>
    {invalid ? <p role="alert" className="text-sm font-bold text-rose-700">Bitte Prüfdatum, Quellenlink und Prüfintervall vollständig und gültig angeben.</p> : null}
  </fieldset>
}
