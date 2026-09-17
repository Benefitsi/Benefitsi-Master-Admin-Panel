"use client"

import Image from "next/image"
import { useRef, useState, useTransition } from "react"
import { ImageIcon, ArrowRight, Check, X, RotateCcw } from "lucide-react"
import { saveDiscoveryImage } from "@/app/city-pages/[citySlug]/discovery/actions"
import { discoveryCategories, type DiscoveryAsset, type DiscoveryAssignment, type DiscoveryCategory } from "@/lib/city-pages/discovery-images"

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b75d9] disabled:cursor-not-allowed disabled:opacity-50"
const primary = `${button} bg-[#0b75d9] text-white hover:bg-[#075eae]`
const secondary = `${button} border border-[#061829]/15 bg-white text-[#173b5b] hover:bg-[#edf6ff]`

function Preview({ asset, x = 0.5, y = 0.5 }: { asset: DiscoveryAsset; x?: number; y?: number }) {
  const [failed, setFailed] = useState<string | null>(null)
  return <div className="relative aspect-[2/1] overflow-hidden rounded-xl bg-[#e7f2fd]">
    {failed === asset.url ? <div className="absolute inset-0 flex items-center justify-center gap-2 p-4 text-center text-sm text-[#45647e]"><ImageIcon aria-hidden className="size-5 shrink-0" />Bild konnte nicht geladen werden.</div> : <Image src={asset.url} alt={asset.alt} fill unoptimized sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" style={{ objectPosition: `${x * 100}% ${y * 100}%` }} onError={() => setFailed(asset.url)} />}
  </div>
}

export function DiscoveryImageEditor({ cityId, assets, assignments: initialAssignments }: { cityId: string; assets: DiscoveryAsset[]; assignments: DiscoveryAssignment[] }) {
  const [assignments, setAssignments] = useState(initialAssignments)
  const [previousInitial, setPreviousInitial] = useState(initialAssignments)
  if (previousInitial !== initialAssignments) {
    setPreviousInitial(initialAssignments)
    setAssignments(initialAssignments)
  }
  const [category, setCategory] = useState<DiscoveryCategory>("viewpoints")
  const [assetId, setAssetId] = useState<string | null>(null)
  const [focal, setFocal] = useState({ x: 0.5, y: 0.5 })
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [feedback, setFeedback] = useState("")
  const [pending, startTransition] = useTransition()
  const dialog = useRef<HTMLDialogElement>(null)
  const [original, setOriginal] = useState<DiscoveryAssignment | null>(null)
  const selected = assets.find(asset => asset.id === assetId)
  const activeCategory = discoveryCategories.find(c => c.key === category)!
  const choices = assets.filter(asset => `${asset.title} ${asset.alt}`.toLocaleLowerCase("de").includes(query.trim().toLocaleLowerCase("de")))

  function open(key: DiscoveryCategory) {
    const assignment = assignments.find(a => a.entity_key === `discovery:${key}`) ?? null
    setOriginal(assignment)
    setCategory(key)
    setAssetId(assignment?.manual_lock ? assignment.media_asset_id : null)
    setFocal({ x: assignment?.focal_x ?? 0.5, y: assignment?.focal_y ?? 0.5 })
    setQuery("")
    setError("")
    dialog.current?.showModal()
  }

  function save(mode: "manual" | "automatic") {
    setError("")
    startTransition(async () => {
      try {
        const result = await saveDiscoveryImage({ cityId, category, mode, assetId, focalX: focal.x, focalY: focal.y, expectedId: original?.id ?? null, expectedUpdatedAt: original?.updated_at ?? null })
        if (!result.ok) { setError(result.message); return }
        setAssignments(current => [...current.filter(a => a.entity_key !== `discovery:${category}`), ...(result.assignment ? [result.assignment] : [])])
        const saved = mode === "manual" ? `Bild für „${activeCategory.title}“ gespeichert.` : `„${activeCategory.title}“ verwendet wieder die automatische Bildauswahl.`
        const refresh = result.refresh === "ok" ? " Die Startseite wurde aktualisiert." : " Die sofortige Aktualisierung ist noch ausstehend; die Startseite übernimmt die Auswahl beim nächsten regulären Datenabruf."
        setFeedback(`${saved}${refresh}${result.auditSaved ? "" : " Der Eintrag im Änderungsprotokoll konnte nicht gespeichert werden."}`)
        dialog.current?.close()
      } catch {
        setError("Die Verbindung wurde unterbrochen. Bitte die Seite neu laden, um den gespeicherten Stand zu prüfen.")
      }
    })
  }

  return <>
    {feedback && <p role="status" className="rounded-2xl border border-[#0b75d9]/20 bg-[#edf6ff] p-4 text-sm leading-6 text-[#173b5b]">{feedback}</p>}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {discoveryCategories.map(c => {
        const assignment = assignments.find(a => a.entity_key === `discovery:${c.key}`)
        const asset = assignment?.manual_lock ? assets.find(a => a.id === assignment.media_asset_id) : undefined
        return <section key={c.key} className="min-w-0 overflow-hidden rounded-2xl border border-[#061829]/10 bg-white p-3 shadow-sm">
          {asset ? <Preview asset={asset} x={assignment!.focal_x} y={assignment!.focal_y} /> : <div className="flex aspect-[2/1] flex-col justify-center gap-2 rounded-xl bg-[#edf6ff] p-5 text-[#345776]"><ImageIcon className="size-7 text-[#0b75d9]" aria-hidden /><p className="text-sm font-bold">Automatische Bildauswahl</p><p className="text-xs leading-5">Das Portal wählt ein passendes, verfügbares Bild.</p></div>}
          <div className="px-2 pb-2 pt-4">
            <p className="text-xs font-semibold text-[#617080]">{asset ? "Festes Vorschaubild" : "Automatisch"}</p>
            <h2 className="mt-1 text-xl font-black tracking-tight">{c.title}</h2>
            <p className="mt-1 truncate text-sm text-[#617080]" title={asset?.title}>{asset?.title ?? c.caption}</p>
            {assignment?.manual_lock && !asset && <p className="mt-2 text-xs leading-5 text-amber-800">Das bisherige Bild ist nicht mehr verfügbar. Die Startseite verwendet die Automatik.</p>}
            <button type="button" className={`${secondary} mt-4 w-full`} onClick={() => open(c.key)}>{asset ? "Bild ändern" : "Bild auswählen"}<ArrowRight className="size-4" aria-hidden /><span className="sr-only"> für {c.title}</span></button>
          </div>
        </section>
      })}
    </div>
    <dialog ref={dialog} aria-labelledby="discovery-editor-title" aria-describedby="discovery-editor-help" onCancel={event => { if (pending) event.preventDefault() }} className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl border border-[#061829]/10 bg-white p-0 text-[#061829] shadow-2xl backdrop:bg-[#061829]/60">
      <div className="flex items-start justify-between gap-4 border-b border-[#061829]/10 p-5 sm:p-6">
        <div><p className="text-xs font-bold uppercase tracking-wider text-[#0b75d9]">Startseite · Entdecken</p><h2 id="discovery-editor-title" className="mt-1 text-2xl font-black tracking-tight">{activeCategory.title}</h2><p id="discovery-editor-help" className="mt-2 text-sm leading-6 text-[#617080]">Bild wählen, Ausschnitt anpassen und speichern. Die Vorschau zeigt das Format der Themenkarte.</p></div>
        <button autoFocus type="button" aria-label="Bildauswahl schließen" disabled={pending} className={`${secondary} shrink-0 px-3`} onClick={() => dialog.current?.close()}><X className="size-5" aria-hidden /></button>
      </div>
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <h3 className="mb-3 text-sm font-bold">Deine Vorschau</h3>
          {selected ? <>
            <Preview asset={selected} x={focal.x} y={focal.y} />
            <p className="mt-3 font-bold">{selected.title}</p>
            {selected.credit && <p className="mt-1 break-words text-xs leading-5 text-[#617080]">{selected.credit}</p>}
            <fieldset disabled={pending} className="mt-5 space-y-4 rounded-xl bg-[#f5f8fb] p-4">
              <legend className="px-1 text-sm font-bold">Bildausschnitt</legend>
              <label className="block text-sm">Horizontal <span className="float-right text-[#617080]">{Math.round(focal.x * 100)} %</span><input aria-label="Horizontaler Bildausschnitt" type="range" min="0" max="100" step="1" value={Math.round(focal.x * 100)} onChange={e => setFocal(p => ({ ...p, x: Number(e.target.value) / 100 }))} className="mt-2 h-6 w-full accent-[#0b75d9]" /></label>
              <label className="block text-sm">Vertikal <span className="float-right text-[#617080]">{Math.round(focal.y * 100)} %</span><input aria-label="Vertikaler Bildausschnitt" type="range" min="0" max="100" step="1" value={Math.round(focal.y * 100)} onChange={e => setFocal(p => ({ ...p, y: Number(e.target.value) / 100 }))} className="mt-2 h-6 w-full accent-[#0b75d9]" /></label>
              <button type="button" className="min-h-10 text-sm font-semibold text-[#0b75d9] underline underline-offset-4" onClick={() => setFocal({ x: 0.5, y: 0.5 })}>Bild zentrieren</button>
            </fieldset>
            <p className="mt-3 text-xs leading-5 text-[#617080]">Je nach Bildformat verändert nur eine Richtung den sichtbaren Ausschnitt.</p>
          </> : <div className="flex aspect-[2/1] items-center justify-center rounded-xl bg-[#edf6ff] p-6 text-center text-sm leading-6 text-[#45647e]">Wähle ein Bild aus der Mediensammlung.</div>}
        </div>
        <div className="min-w-0">
          <label htmlFor="discovery-image-search" className="text-sm font-bold">Freigegebene Bilder ({assets.length})</label>
          <input id="discovery-image-search" type="search" placeholder="Bildname filtern …" value={query} onChange={e => setQuery(e.target.value)} className="mb-4 mt-3 min-h-11 w-full rounded-xl border border-[#061829]/20 px-3 text-sm outline-offset-2 focus:outline-[#0b75d9]" />
          <div className="grid max-h-[50dvh] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 lg:max-h-[28rem]">
            {choices.map(asset => <button key={asset.id} type="button" disabled={pending} aria-pressed={assetId === asset.id} onClick={() => { setAssetId(asset.id); setFocal({ x: 0.5, y: 0.5 }) }} className={`relative min-w-0 rounded-xl border-2 p-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b75d9] ${assetId === asset.id ? "border-[#0b75d9] bg-[#edf6ff]" : "border-transparent hover:border-[#0b75d9]/40"}`}>
              <Preview asset={asset} />
              {assetId === asset.id && <span className="absolute right-2 top-2 rounded-full bg-[#0b75d9] p-1 text-white"><Check className="size-3" aria-hidden /></span>}
              <span className="mt-2 block px-1 pb-1 text-xs font-semibold leading-4">{asset.title}</span>
            </button>)}
          </div>
          {!choices.length && <p role="status" className="rounded-xl bg-[#f5f8fb] p-4 text-sm leading-6 text-[#617080]">{assets.length ? "Kein Bild zu diesem Namen gefunden." : "Für diese Stadt sind noch keine Bilder freigegeben."}</p>}
        </div>
      </div>
      <div className="sticky bottom-0 border-t border-[#061829]/10 bg-white p-5 sm:p-6">
        {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-800">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {original ? <button type="button" disabled={pending} className={secondary} onClick={() => save("automatic")}><RotateCcw className="size-4" aria-hidden />Automatische Auswahl verwenden</button> : <p className="text-xs text-[#617080]">Die automatische Auswahl bleibt bis zum Speichern aktiv.</p>}
          <button type="button" disabled={pending || !selected} className={primary} onClick={() => save("manual")}>{pending ? "Wird gespeichert …" : "Bild speichern"}</button>
        </div>
      </div>
    </dialog>
  </>
}
