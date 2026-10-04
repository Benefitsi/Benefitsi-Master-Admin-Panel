'use client'

import { useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, MapPin, Stamp } from 'lucide-react'
import { saveMemoryStamp } from '@/app/city-pages/[citySlug]/memory-stamps/actions'
import { memoryEditions, type MemoryCatalog, type MemoryStampInput, type MemoryStampRecord, type MemoryZone } from '@/lib/city-pages/memory-stamps'

const field = 'mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-blue-600 focus:outline-2 focus:outline-blue-600 disabled:bg-slate-100'
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 disabled:opacity-50'
const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b75d9] px-4 text-sm font-bold text-white disabled:opacity-50'
const editionLabels: Record<string, string> = { standard: 'Standard', first_edition: 'Erste Edition', special_edition: 'Sonderedition', limited_edition: 'Limitierte Edition', seasonal_edition: 'Saisonale Edition', event_edition: 'Veranstaltungsedition' }

function status(record: MemoryStampRecord) {
  if (record.definition.active && record.definition.configuration_status === 'ready') return 'Freigegeben'
  if (record.definition.configuration_status === 'retired') return 'Zurückgezogen'
  return 'Entwurf / Prüfung offen'
}

function initialInput(catalog: MemoryCatalog, record?: MemoryStampRecord): MemoryStampInput {
  const d = record?.definition
  return {
    citySlug: catalog.city.slug, id: d?.id ?? null, revision: record?.revision ?? null, operation: 'save',
    slug: d?.slug ?? '', memory_code: d?.memory_code ?? '', title: d?.title ?? '', short_title: d?.short_title ?? '',
    description: d?.description ?? '', criteria: d?.criteria ?? '', place_id: d?.place_id ?? null,
    edition_type: d?.edition_type ?? 'standard', sort_order: d?.sort_order ?? 0,
    artwork_asset_id: record?.artwork_asset_id ?? null,
    minimum_accuracy_meters: record?.config?.minimum_accuracy_meters ?? 50,
    minimum_sample_count: record?.config?.minimum_sample_count ?? 3,
    maximum_sample_window_seconds: record?.config?.maximum_sample_window_seconds ?? 120,
    zones: record?.zones.map(z => ({ ...z })) ?? [], review_notes: record?.config?.review_notes ?? '', confirm_review: false,
  }
}

export function MemoryStampEditor({ catalog, selectedId }: { catalog: MemoryCatalog; selectedId?: string }) {
  const router = useRouter()
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const record = selectedId === 'new' ? undefined : catalog.stamps.find(s => s.definition.id === selectedId) ?? catalog.stamps[0]
  const filtered = catalog.stamps.filter(s => `${s.definition.title} ${s.definition.memory_code}`.toLocaleLowerCase('de').includes(search.toLocaleLowerCase('de')))
  function select(id: string) {
    setNotice('')
    router.push(`/city-pages/${catalog.city.slug}/memory-stamps?stamp=${encodeURIComponent(id)}`)
  }
  return <>
    {notice && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">{notice}</p>}
    <div className="grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Stempel auswählen">
        <div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-bold">{catalog.stamps.length} Stempel</h2><button onClick={() => select('new')} className={secondary}><Plus size={16} aria-hidden />Neu</button></div>
        <label className="text-sm font-semibold">Stempel suchen<input type="search" value={search} onChange={e => setSearch(e.target.value)} className={field} placeholder="Name oder Code" /></label>
        <ul className="mt-3 grid max-h-[28rem] gap-2 overflow-auto">
          {filtered.map(s => <li key={s.definition.id}><button onClick={() => select(s.definition.id)} aria-pressed={s.definition.id === record?.definition.id} className={`w-full rounded-xl border p-3 text-left transition hover:border-blue-500 ${s.definition.id === record?.definition.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}>
            <span className="block text-xs font-semibold text-slate-500">{s.definition.memory_code}</span><span className="mt-1 block text-sm font-bold">{s.definition.title}</span>
            <span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-semibold ${s.definition.active ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>{status(s)}</span>
          </button></li>)}
        </ul>
        {!filtered.length && <p className="mt-3 text-sm text-slate-600">{catalog.stamps.length ? 'Kein passender Stempel gefunden.' : 'Lege den ersten Stempel für diese Stadt an.'}</p>}
      </aside>
      <MemoryStampForm key={record ? `${record.definition.id}:${record.revision}` : 'new'} catalog={catalog} record={record} onSaved={(id, message) => {
        setNotice(message)
        router.replace(`/city-pages/${catalog.city.slug}/memory-stamps?stamp=${id}`, { scroll: false })
        router.refresh()
      }} />
    </div>
  </>
}

function Label({ title, children }: { title: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700">{title}{children}</label>
}

function MemoryStampForm({ catalog, record, onSaved }: { catalog: MemoryCatalog; record?: MemoryStampRecord; onSaved: (id: string, message: string) => void }) {
  const [value, setValue] = useState(() => initialInput(catalog, record))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [withdraw, setWithdraw] = useState(false)
  const selectedPlace = catalog.places.find(p => p.id === value.place_id)
  const selectedAsset = catalog.assets.find(a => a.id === value.artwork_asset_id)
  const existingZoneKeys = new Set(record?.zones.map(z => z.zone_key))
  function change<K extends keyof MemoryStampInput>(key: K, next: MemoryStampInput[K]) { setValue(v => ({ ...v, [key]: next })) }
  function zoneChange(index: number, change: Partial<MemoryZone>) { setValue(v => ({ ...v, zones: v.zones.map((z, i) => i === index ? { ...z, ...change } : z) })) }
  function addZone() {
    let number = value.zones.length + 1
    while (value.zones.some(z => z.zone_key === `bereich-${number}`)) number++
    change('zones', [...value.zones, { zone_key: `bereich-${number}`, label: `Sammelpunkt ${number}`, verification_type: 'POINT_RADIUS', safe_latitude: null, safe_longitude: null, unlock_radius_meters: 100, edge_tolerance_meters: 0, active: true }])
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const operation = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as MemoryStampInput['operation'] || 'save'
    const input = operation === 'withdraw' ? initialInput(catalog, record) : value
    setError('')
    startTransition(async () => {
      try {
        const result = await saveMemoryStamp({ ...input, operation })
        if (!result.ok) { setError(result.message); return }
        const saved = operation === 'approve' ? 'Stempel freigegeben.' : operation === 'withdraw' ? 'Stempel zurückgezogen. Gesammelte Erinnerungen bleiben erhalten.' : 'Stempel gespeichert. Änderungen an Sammelorten benötigen eine neue Freigabe.'
        const refresh = result.refresh === 'ok' ? ' Die Stadtseite wurde aktualisiert.' : ' Die automatische Aktualisierung der Stadtseite konnte nicht bestätigt werden. Bitte die öffentliche Anzeige prüfen; die Speicherung war erfolgreich.'
        onSaved(result.id, saved + refresh)
      } catch { setError('Die Speicherung konnte nicht bestätigt werden. Bitte lade vor einem weiteren Versuch die Seite neu. Deine Anmeldung könnte abgelaufen sein.') }
    })
  }
  return <form onSubmit={submit} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-busy={pending}>
    <div className="mb-6 flex items-start gap-3"><Stamp className="mt-1 shrink-0 text-[#0b75d9]" aria-hidden /><div><h2 className="text-xl font-bold">{record ? record.definition.title : 'Neuer Entdeckerstempel'}</h2><p className="mt-1 text-sm text-slate-600">{catalog.city.name}{record ? ` · ${status(record)} · ${record.claim_count} bestätigte Erinnerungen` : ' · Wird zunächst als Entwurf gespeichert'}</p></div></div>
    {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">{error}</p>}
    <fieldset disabled={pending} className="min-w-0 space-y-7">
      <section className="space-y-4" aria-labelledby="memory-details-heading">
        <h3 id="memory-details-heading" className="font-bold">Name und Darstellung</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label title="Name *"><input className={field} value={value.title} onChange={e => change('title', e.target.value)} required maxLength={180} /></Label>
          <Label title="Kurzer Name"><input className={field} value={value.short_title} onChange={e => change('short_title', e.target.value)} maxLength={80} /></Label>
          <Label title="Stempelcode *"><input className={field} value={value.memory_code} onChange={e => change('memory_code', e.target.value)} required readOnly={!!record} pattern="[A-Z0-9]+(-[A-Z0-9]+)*" maxLength={40} placeholder="z. B. ANN-11" /></Label>
          <Label title="Stabiler Pfad *"><input className={field} value={value.slug} onChange={e => change('slug', e.target.value)} required readOnly={!!record} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} placeholder="z. B. annweiler-memory-11" /></Label>
        </div>
        <p className="text-xs leading-5 text-slate-500">Stadt, Stempelcode und Pfad bleiben nach dem Anlegen unverändert. So bleiben Verknüpfungen und gesammelte Erinnerungen eindeutig zugeordnet.</p>
        <Label title="Beschreibung *"><textarea className={field} rows={3} value={value.description} onChange={e => change('description', e.target.value)} required maxLength={4000} /></Label>
        <Label title="Sammelhinweis für Besucher *"><textarea className={field} rows={2} value={value.criteria} onChange={e => change('criteria', e.target.value)} required maxLength={2000} placeholder="Wo kann der Stempel sicher gesammelt werden?" /></Label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label title="Edition"><select className={field} value={value.edition_type} onChange={e => change('edition_type', e.target.value)}>{memoryEditions.map(e => <option key={e} value={e}>{editionLabels[e]}{e !== 'standard' ? ' (nur Entwurf)' : ''}</option>)}</select></Label>
          <Label title="Reihenfolge"><input className={field} type="number" min={0} max={100000} step={1} value={value.sort_order} onChange={e => change('sort_order', e.target.valueAsNumber)} required /></Label>
        </div>
        <Label title="Veröffentlichtes Stempelbild"><select className={field} value={value.artwork_asset_id ?? ''} onChange={e => change('artwork_asset_id', e.target.value || null)}><option value="">Noch kein Bild ausgewählt</option>{value.artwork_asset_id && !selectedAsset && <option value={value.artwork_asset_id}>Bisheriges Bild ist nicht mehr veröffentlicht</option>}{catalog.assets.map(a => <option key={a.id} value={a.id}>{a.title || a.alt_text || a.id}</option>)}</select></Label>
        {selectedAsset && <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-3">
          {/* Existing published media may use several approved storage domains. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedAsset.public_url} alt={selectedAsset.alt_text || selectedAsset.title || 'Ausgewähltes Stempelbild'} width={96} height={96} className="size-24 rounded-xl object-contain" />
          <p className="text-sm text-slate-600">Dieses Bild wird für den Stempel in App und Stadtseite verwendet.</p>
        </div>}
        <p className="text-xs leading-5 text-slate-500">Die Auswahl enthält veröffentlichte Bilder aus der Mediathek dieser Stadt. Neue Motive zuerst dort hochladen und freigeben.</p>
      </section>
      <section className="space-y-4 border-t border-slate-200 pt-6" aria-labelledby="memory-place-heading">
        <h3 id="memory-place-heading" className="flex items-center gap-2 font-bold"><MapPin size={18} aria-hidden />Ort und Sammelbereiche</h3>
        <Label title="Ort in dieser Stadt"><select className={field} value={value.place_id ?? ''} disabled={!!record?.claim_count} onChange={e => change('place_id', e.target.value || null)}><option value="">Ort auswählen</option>{catalog.places.map(p => <option key={p.id} value={p.id}>{p.name}{p.status !== 'active' ? ' (noch nicht veröffentlicht)' : ''}</option>)}</select></Label>
        {!!record?.claim_count && <p className="text-xs leading-5 text-slate-600">Dieser Stempel wurde bereits gesammelt. Für einen anderen Ort bitte einen neuen Stempel anlegen.</p>}
        <p className="text-sm leading-6 text-slate-600">Jeder Sammelbereich muss sicher zugänglich sein. Flächen verwenden die beim verknüpften Ort hinterlegte Polygongeometrie. Die App prüft den Standort weiterhin serverseitig.</p>
        {value.zones.map((zone, index) => <fieldset key={index} className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-bold">Sammelbereich {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label title="Bezeichnung"><input className={field} value={zone.label} maxLength={180} required onChange={e => zoneChange(index, { label: e.target.value })} /></Label>
            <Label title="Kennung"><input className={field} value={zone.zone_key} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" required readOnly={existingZoneKeys.has(zone.zone_key)} onChange={e => zoneChange(index, { zone_key: e.target.value })} /></Label>
            <Label title="Art des Sammelbereichs"><select className={field} value={zone.verification_type} onChange={e => zoneChange(index, { verification_type: e.target.value as MemoryZone['verification_type'], safe_latitude: null, safe_longitude: null })}><option value="POINT_RADIUS">Sammelpunkt mit Radius</option><option value="AREA" disabled={selectedPlace?.geometry_type !== 'POLYGON'}>Fläche des verknüpften Ortes</option></select></Label>
            {zone.verification_type === 'POINT_RADIUS' ? <Label title="Radius in Metern"><input className={field} type="number" min={1} max={10000} step="any" required value={zone.unlock_radius_meters} onChange={e => zoneChange(index, { unlock_radius_meters: e.target.valueAsNumber })} /></Label> : <Label title="Randtoleranz in Metern"><input className={field} type="number" min={0} max={50} step="any" required value={zone.edge_tolerance_meters} onChange={e => zoneChange(index, { edge_tolerance_meters: e.target.valueAsNumber })} /></Label>}
            {zone.verification_type === 'POINT_RADIUS' && <>
              <Label title="Breitengrad"><input className={field} type="number" step="any" min={-90} max={90} required value={zone.safe_latitude ?? ''} onChange={e => zoneChange(index, { safe_latitude: e.target.value === '' ? null : e.target.valueAsNumber })} /></Label>
              <Label title="Längengrad"><input className={field} type="number" step="any" min={-180} max={180} required value={zone.safe_longitude ?? ''} onChange={e => zoneChange(index, { safe_longitude: e.target.value === '' ? null : e.target.valueAsNumber })} /></Label>
            </>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={zone.active} onChange={e => zoneChange(index, { active: e.target.checked })} className="size-4" />Sammelbereich aktiv</label>
            {zone.verification_type === 'POINT_RADIUS' && selectedPlace?.latitude != null && selectedPlace.longitude != null && <button type="button" className={secondary} onClick={() => zoneChange(index, { safe_latitude: selectedPlace.latitude, safe_longitude: selectedPlace.longitude })}>Koordinaten des Ortes übernehmen</button>}
            {!existingZoneKeys.has(zone.zone_key) && <button type="button" className="min-h-11 text-sm font-semibold text-red-700" onClick={() => change('zones', value.zones.filter((_, i) => i !== index))}>Neuen Bereich entfernen</button>}
          </div>
        </fieldset>)}
        <button type="button" disabled={value.zones.length >= 20} className={secondary} onClick={addZone}><Plus size={16} aria-hidden />Sammelbereich hinzufügen</button>
        <details className="rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-bold">Standortnachweis einstellen</summary><p className="mt-3 text-xs leading-5 text-slate-600">Diese Grenzwerte gelten für alle Sammelbereiche. Änderungen heben die bisherige Freigabe auf.</p><div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Label title="Max. GPS-Ungenauigkeit (m)"><input className={field} type="number" min={1} max={1000} step="any" required value={value.minimum_accuracy_meters} onChange={e => change('minimum_accuracy_meters', e.target.valueAsNumber)} /></Label>
          <Label title="Mind. Messpunkte"><input className={field} type="number" min={3} max={64} step={1} required value={value.minimum_sample_count} onChange={e => change('minimum_sample_count', e.target.valueAsNumber)} /></Label>
          <Label title="Zeitfenster (Sekunden)"><input className={field} type="number" min={10} max={900} step={1} required value={value.maximum_sample_window_seconds} onChange={e => change('maximum_sample_window_seconds', e.target.valueAsNumber)} /></Label>
        </div></details>
      </section>
      <section className="space-y-4 border-t border-slate-200 pt-6" aria-labelledby="memory-review-heading">
        <h3 id="memory-review-heading" className="font-bold">Prüfung und Freigabe</h3>
        <Label title="Interne Prüfnotiz"><textarea className={field} rows={2} maxLength={2000} value={value.review_notes} onChange={e => change('review_notes', e.target.value)} placeholder="Zugänglichkeit, Quelle und Prüfung vor Ort dokumentieren" /></Label>
        <label className="flex items-start gap-3 rounded-xl bg-blue-50 p-4 text-sm leading-6"><input className="mt-1 size-4 shrink-0" type="checkbox" checked={value.confirm_review} onChange={e => change('confirm_review', e.target.checked)} />Ich habe Ort, Stempelbild, sichere Zugänglichkeit und alle aktiven Sammelbereiche geprüft und gebe diese Konfiguration frei.</label>
        <div className="flex flex-wrap gap-3"><button className={secondary} type="submit" value="save">{pending ? 'Wird gespeichert …' : 'Speichern'}</button><button className={primary} disabled={!value.confirm_review || value.edition_type !== 'standard'} type="submit" value="approve">Freigeben und aktivieren</button></div>
        {record && record.definition.configuration_status !== 'retired' && <div className="border-t border-slate-200 pt-4">{withdraw ? <div className="rounded-xl bg-amber-50 p-4 text-sm"><p>Der Stempel wird nicht mehr zum Sammeln angeboten. Bereits gesammelte Erinnerungen bleiben bestehen. Ungespeicherte Eingaben werden verworfen.</p><div className="mt-3 flex flex-wrap gap-3"><button type="submit" value="withdraw" formNoValidate className={secondary}>Jetzt zurückziehen</button><button type="button" className={secondary} onClick={() => setWithdraw(false)}>Abbrechen</button></div></div> : <button type="button" className="min-h-11 text-sm font-semibold text-red-700" onClick={() => setWithdraw(true)}>Stempel zurückziehen</button>}</div>}
      </section>
    </fieldset>
  </form>
}
