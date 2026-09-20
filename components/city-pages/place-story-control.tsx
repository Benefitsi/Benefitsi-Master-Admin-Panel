"use client"

import { useState } from "react"
import { parsePlaceStory, type PlaceStorySection } from "@/lib/city-pages/place-editor"

const input = "min-h-11 w-full rounded-xl border border-[#061829]/15 bg-white px-3 py-2 text-sm"
const button = "min-h-11 rounded-xl border border-[#061829]/15 px-3 text-sm font-bold disabled:opacity-40"

export function PlaceStoryControl({ value }: { value: unknown }) {
  const [sections, setSections] = useState<PlaceStorySection[]>(() => Array.isArray(value) ? value : [])
  const [removed, setRemoved] = useState<{ section: PlaceStorySection; index: number } | null>(null)
  const serialized = JSON.stringify(sections)
  let invalid = false
  try { parsePlaceStory(serialized) } catch { invalid = true }
  const update = (index: number, patch: Partial<PlaceStorySection>) => setSections(current => current.map((section, i) => i === index ? { ...section, ...patch } : section))
  const move = (index: number, offset: number) => setSections(current => {
    const next = [...current]; [next[index], next[index + offset]] = [next[index + offset], next[index]]
    return next
  })
  return <fieldset className="grid gap-4">
    <legend className="text-sm font-black">Hintergründe und Besuchstipps</legend>
    <p className="text-sm leading-6 text-[#617080]">Abschnitte ergänzen und ordnen. Quellen als [Linktext](https://…) einfügen. Änderungen werden als Entwurf gespeichert.</p>
    <input type="hidden" name="story" value={serialized} />
    {sections.map((section, index) => <section key={index} className="grid gap-3 rounded-2xl border border-[#061829]/15 bg-[#f8faf9] p-4">
      <div className="flex flex-wrap gap-2">
        <strong className="mr-auto text-sm">Abschnitt {index + 1}</strong>
        <button type="button" className={button} disabled={index === 0} aria-label={`Abschnitt ${index + 1} nach oben`} onClick={() => move(index, -1)}>↑</button>
        <button type="button" className={button} disabled={index === sections.length - 1} aria-label={`Abschnitt ${index + 1} nach unten`} onClick={() => move(index, 1)}>↓</button>
        <button type="button" className={button} onClick={() => { setRemoved({ section, index }); setSections(current => current.filter((_, i) => i !== index)) }}>Entfernen</button>
      </div>
      <label className="grid gap-1 text-xs font-bold">Überschrift<input className={input} required maxLength={200} value={section.title} onChange={event => update(index, { title: event.target.value })} /></label>
      <label className="grid gap-1 text-xs font-bold">Text<textarea className={`${input} leading-6`} required maxLength={20000} rows={8} value={section.body} onChange={event => update(index, { body: event.target.value })} /></label>
    </section>)}
    {removed ? <div role="status" className="flex flex-wrap items-center gap-3 text-sm">Abschnitt entfernt.<button type="button" className={button} onClick={() => { setSections(current => { const next = [...current]; next.splice(removed.index, 0, removed.section); return next }); setRemoved(null) }}>Rückgängig</button></div> : null}
    <button type="button" className={button} disabled={sections.length >= 30} onClick={() => setSections(current => [...current, { title: "", body: "" }])}>Abschnitt hinzufügen</button>
    {invalid ? <p role="alert" className="text-sm font-bold text-rose-700">Bitte Überschriften, Texte und Links prüfen. Ungültige Inhalte werden nicht gespeichert.</p> : null}
  </fieldset>
}
