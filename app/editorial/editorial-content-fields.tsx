"use client"

import { translateValue, useAdminLocale } from "@/app/admin-language"
import { useRef, useState } from "react"
import type { EditorialPost } from "@/lib/editorial-types"

const inputClass = "min-h-11 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#061829]/15 bg-white px-3 text-sm font-bold text-[#086fcc] hover:bg-[#f3f8ff]"

export function EditorialContentFields({ initial }: { initial?: EditorialPost | null }) {
  const sequence = useRef(0)
  const [sections, setSections] = useState(() => (initial?.content.length ? initial.content : [{ heading: "", paragraphs: [""] }]).map((section, i) => ({ ...section, key: `saved-${i}`, text: section.paragraphs.join("\n\n") })))
  const content = sections.map(section => ({
    heading: section.heading,
    // Preserve the exact stored paragraphs when only metadata/the heading changes.
    paragraphs: section.text === section.paragraphs.join("\n\n") ? section.paragraphs : section.text.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean),
  }))

  return <>
    <input type="hidden" name="contentJson" value={JSON.stringify(content)} />
    <section aria-label="Beitragsinhalt" className="space-y-4">
      <div><h3 className="text-lg font-bold">Beitragsinhalt</h3><p className="mt-1 text-sm text-[#617080]">Überschrift und Text je Abschnitt. Eine Leerzeile beginnt einen neuen Absatz.</p></div>
      {sections.map((section, index) => <fieldset key={section.key} className="min-w-0 space-y-3 rounded-2xl border border-[#061829]/10 bg-[#f7f9fc] p-4">
        <legend className="px-1 text-xs font-bold text-[#526170]">Abschnitt {index + 1}</legend>
        <label className="grid gap-1.5 text-xs font-bold">Überschrift<input aria-label={`Überschrift für Abschnitt ${index + 1}`} required maxLength={250} value={section.heading} onChange={event => setSections(rows => rows.map(row => row.key === section.key ? { ...row, heading: event.target.value } : row))} className={inputClass} /></label>
        <label className="grid gap-1.5 text-xs font-bold">Text<textarea aria-label={`Text für Abschnitt ${index + 1}`} required rows={6} value={section.text} onChange={event => setSections(rows => rows.map(row => row.key === section.key ? { ...row, text: event.target.value } : row))} className={`${inputClass} py-3 font-sans leading-7`} /></label>
        {sections.length > 1 ? <button type="button" aria-label={`Abschnitt ${index + 1} entfernen`} onClick={() => setSections(rows => rows.filter(row => row.key !== section.key))} className="min-h-11 text-sm font-bold text-rose-700 hover:underline">Abschnitt entfernen</button> : null}
      </fieldset>)}
      <button type="button" onClick={() => { const key = `new-${sequence.current++}`; setSections(rows => [...rows, { key, heading: "", paragraphs: [""], text: "" }]) }} className={buttonClass}>+ Abschnitt hinzufügen</button>
    </section>
    <div className="grid gap-5 lg:grid-cols-2">
      <LinkFields title="Quellen" name="sourcesJson" targetKey="url" initial={initial?.sources.map(source => ({label:source.label,target:source.url})) ?? []} />
      <LinkFields title="Weiterlesen" name="relatedLinksJson" targetKey="href" initial={initial?.related_links.map(link => ({label:link.label,target:link.href})) ?? []} />
    </div>
  </>
}

function LinkFields({ title, name, targetKey, initial }: { title: string; name: string; targetKey: "url" | "href"; initial: {label:string;target:string}[] }) {
  const language = useAdminLocale() === "de-DE" ? "de" : "en"
  const sequence = useRef(0)
  const [links, setLinks] = useState(() => initial.map((link, index) => ({ ...link, key: `saved-${index}` })))
  return <section aria-label={title} className="min-w-0 space-y-3">
    <input type="hidden" name={name} value={JSON.stringify(links.map(link => ({label:link.label,[targetKey]:link.target})))} />
    <h3 className="text-lg font-bold">{title}</h3>
    <p className="text-sm leading-6 text-[#617080]">{targetKey === "url" ? "Die Seiten, auf denen die Angaben beruhen." : "Passende Ziele für den nächsten Klick."}</p>
    {links.map((link, index) => <fieldset key={link.key} className="min-w-0 space-y-3 rounded-2xl border border-[#061829]/10 bg-[#f7f9fc] p-4">
      <legend className="px-1 text-xs font-bold text-[#526170]">Link {index + 1}</legend>
      <label className="grid gap-1.5 text-xs font-bold">Bezeichnung<input aria-label={`${translateValue(title, language)}: Bezeichnung ${index + 1}`} required maxLength={200} value={link.label} onChange={event => setLinks(rows => rows.map(row => row.key === link.key ? {...row,label:event.target.value} : row))} className={inputClass} /></label>
      <label className="grid gap-1.5 text-xs font-bold">Webadresse<input aria-label={`${translateValue(title, language)}: Webadresse ${index + 1}`} required maxLength={2000} value={link.target} onChange={event => setLinks(rows => rows.map(row => row.key === link.key ? {...row,target:event.target.value} : row))} placeholder="https://… oder /stadt/annweiler" className={inputClass} /></label>
      <button type="button" aria-label={`${translateValue(title, language)}: Link ${index + 1} entfernen`} onClick={() => setLinks(rows => rows.filter(row => row.key !== link.key))} className="min-h-11 text-sm font-bold text-rose-700 hover:underline">Link entfernen</button>
    </fieldset>)}
    <button type="button" onClick={() => { const key = `new-${sequence.current++}`; setLinks(rows => [...rows,{key,label:"",target:""}]) }} className={buttonClass}>{targetKey === "url" ? "+ Quelle hinzufügen" : "+ Link hinzufügen"}</button>
  </section>
}
