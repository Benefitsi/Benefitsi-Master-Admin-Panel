"use client"

import { useMemo, useState } from "react"
import type { CityNavigationEditorItem, CitySafeTargetOption, CitySurfaceEntityOption } from "@/lib/city-pages/surface-configs"

const typeLabels: Record<string, string> = { PLACE: "Ort", EVENT: "Event", ROUTE: "Route", GUIDE: "Guide", BUSINESS: "Business", EDITORIAL: "Editorial" }

export function SurfaceEntityPicker({ name, options, initial }: { name: string; options: CitySurfaceEntityOption[]; initial: Array<{ id: string; entityType: string }> }) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(() => initial.flatMap((entry) => {
    const option = options.find((candidate) => candidate.id === entry.id && candidate.entityType === entry.entityType)
    return option ? [option] : []
  }))
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de-DE")
    if (!needle) return options
    return options.filter((option) => `${option.label} ${option.location ?? ""} ${typeLabels[option.entityType]}`.toLocaleLowerCase("de-DE").includes(needle))
  }, [options, query])
  const selectedKey = new Set(selected.map((option) => `${option.entityType}:${option.id}`))

  function toggle(option: CitySurfaceEntityOption) {
    const key = `${option.entityType}:${option.id}`
    setSelected((current) => current.some((item) => `${item.entityType}:${item.id}` === key) ? current.filter((item) => `${item.entityType}:${item.id}` !== key) : [...current, option])
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction
    if (next < 0 || next >= selected.length) return
    setSelected((current) => {
      const copy = [...current]
      const [item] = copy.splice(index, 1)
      copy.splice(next, 0, item)
      return copy
    })
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name={name} value={JSON.stringify(selected.map((option) => ({ id: option.id, entityType: option.entityType, slug: option.slug })))} readOnly />
      <label className="block text-xs font-black text-[#526170]">Suchen und auswählen
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, Ort oder Typ suchen …" className="mt-2 min-h-11 w-full rounded-xl border border-[#061829]/12 bg-white px-3 text-sm font-semibold outline-none focus:border-[#118cff] focus:ring-2 focus:ring-[#118cff]/10" />
      </label>
      <div className="max-h-72 overflow-y-auto rounded-2xl border border-[#061829]/10 bg-[#fafcfb] p-2">
        {filtered.length ? filtered.map((option) => {
          const key = `${option.entityType}:${option.id}`
          return <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[#f0f7ff]">
            <input type="checkbox" checked={selectedKey.has(key)} onChange={() => toggle(option)} className="size-4 accent-[#118cff]" />
            {option.imageUrl ? <img src={option.imageUrl} alt="" className="size-10 rounded-lg object-cover" /> : <span className="grid size-10 place-items-center rounded-lg bg-[#e8f4ff] text-[10px] font-black text-[#0b75d9]">{typeLabels[option.entityType]}</span>}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-[#061829]">{option.label}</span><span className="block truncate text-xs font-semibold text-[#71808b]">{typeLabels[option.entityType]}{option.location ? ` · ${option.location}` : ""}</span></span>
          </label>
        }) : <p className="px-3 py-6 text-sm text-[#71808b]">Keine passenden Inhalte gefunden.</p>}
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-[.12em] text-[#0b75d9]">Ausgewählte Reihenfolge</p>
        {selected.length ? <div className="mt-2 space-y-2">{selected.map((option, index) => <div key={`${option.entityType}:${option.id}`} className="flex items-center gap-2 rounded-xl border border-[#061829]/10 bg-white px-3 py-2"><span className="grid size-6 place-items-center rounded-full bg-[#eef6ff] text-xs font-black text-[#0b75d9]">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-bold">{option.label}</span><button type="button" onClick={() => move(index, -1)} aria-label={`${option.label} nach oben`} className="grid size-8 place-items-center rounded-lg border border-[#061829]/10 text-sm font-black hover:border-[#118cff]">↑</button><button type="button" onClick={() => move(index, 1)} aria-label={`${option.label} nach unten`} className="grid size-8 place-items-center rounded-lg border border-[#061829]/10 text-sm font-black hover:border-[#118cff]">↓</button></div>)}</div> : <p className="mt-2 text-sm text-[#71808b]">Noch keine Inhalte ausgewählt.</p>}
      </div>
    </div>
  )
}

export function NavigationEditor({ name, initial, targetOptions }: { name: string; initial: CityNavigationEditorItem[]; targetOptions: CitySafeTargetOption[] }) {
  const [items, setItems] = useState(initial)
  const targetGroups = [...new Set(targetOptions.map((option) => option.group))]
  function update(itemKey: string, patch: Partial<CityNavigationEditorItem>) {
    setItems((current) => current.map((item) => item.itemKey === itemKey ? { ...item, ...patch } : item))
  }
  return <div className="space-y-3">
    <input type="hidden" name={name} value={JSON.stringify(items)} readOnly />
    {items.map((item) => <div key={item.itemKey} className="grid gap-3 rounded-2xl border border-[#061829]/10 bg-[#fafcfb] p-4 md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#0b75d9]">{item.group}</p><input value={item.label} onChange={(event) => update(item.itemKey, { label: event.target.value })} maxLength={120} className="mt-1 min-h-10 w-full rounded-lg border border-[#061829]/12 bg-white px-3 text-sm font-black outline-none focus:border-[#118cff]" /></div>
      <label className="flex items-center gap-2 text-xs font-bold text-[#526170]"><input type="checkbox" checked={item.visible} onChange={(event) => update(item.itemKey, { visible: event.target.checked })} className="size-4 accent-[#118cff]" /> sichtbar</label>
      <select value={item.targetKey} onChange={(event) => update(item.itemKey, { targetKey: event.target.value })} className="min-h-10 rounded-lg border border-[#061829]/12 bg-white px-3 text-sm font-semibold outline-none focus:border-[#118cff]">{targetGroups.map((group) => <optgroup key={group} label={group}>{targetOptions.filter((option) => option.group === group).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</optgroup>)}</select>
      <label className="text-xs font-bold text-[#526170]">Reihenfolge<input type="number" min={0} max={999} value={item.order} onChange={(event) => update(item.itemKey, { order: Number(event.target.value) || 0 })} className="mt-1 min-h-10 w-20 rounded-lg border border-[#061829]/12 bg-white px-3 text-sm font-black outline-none focus:border-[#118cff]" /></label>
    </div>)}
  </div>
}
