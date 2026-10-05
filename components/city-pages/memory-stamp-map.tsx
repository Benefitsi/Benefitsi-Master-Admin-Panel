'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import { LocateFixed, Map as MapIcon } from 'lucide-react'
import { memoryMapPreview, type MemoryMapPlace } from '@/lib/city-pages/memory-stamp-map'
import type { MemoryZone } from '@/lib/city-pages/memory-stamps'
import styles from './memory-stamp-map.module.css'

type Runtime = { L: typeof Leaflet; map: Leaflet.Map; layers: Leaflet.FeatureGroup }
const coordinates = (point: [number, number]) => `${point[0]}, ${point[1]}`
const metres = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })} m`
// Leaflet treats strings as HTML. All editor-supplied text must remain literal.
function textLabel(text: string) { const label = document.createElement('span'); label.textContent = text; return label }

export function MemoryStampMap({ zones, place }: { zones: MemoryZone[]; place?: MemoryMapPlace }) {
  const container = useRef<HTMLDivElement>(null)
  const initializedMap = useRef<Leaflet.Map | null>(null)
  const fit = useRef<() => void>(() => {})
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [failed, setFailed] = useState(false)
  const [tileError, setTileError] = useState(false)
  const preview = useMemo(() => memoryMapPreview(zones, place), [zones, place])
  const hasLocation = !!preview.place || !!preview.circles.length || !!preview.areas.length

  useEffect(() => {
    let cancelled = false
    let map: Leaflet.Map | undefined
    let resize: ResizeObserver | undefined
    import('leaflet').then(L => {
      if (cancelled || !container.current) return
      map = L.map(container.current, { scrollWheelZoom: false, zoomControl: false, attributionControl: true, zoomAnimation: false, fadeAnimation: false })
      L.control.zoom({ zoomInTitle: 'Vergrößern', zoomOutTitle: 'Verkleinern' }).addTo(map)
      L.control.scale({ imperial: false }).addTo(map)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).on('tileerror', () => { if (!cancelled) setTileError(true) }).addTo(map)
      const layers = L.featureGroup().addTo(map)
      setRuntime({ L, map, layers })
      resize = new ResizeObserver(() => { map?.invalidateSize({ pan: false }); fit.current() })
      resize.observe(container.current)
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; resize?.disconnect(); map?.remove() }
  }, [])

  useEffect(() => {
    if (!runtime) return
    const { L, map, layers } = runtime
    layers.clearLayers()
    const firstPoint = preview.circles[0]?.center ?? preview.areas[0]?.rings[0][0] ?? preview.place?.center
    if (!firstPoint) { fit.current = () => {}; return }
    // Circle bounds need Leaflet's initial projection. No invented fallback
    // coordinate: wait for an actual collection area or the linked place.
    if (initializedMap.current !== map) {
      map.setView(firstPoint, 14, { animate: false })
      initializedMap.current = map
    }
    for (const zone of preview.circles) {
      const color = zone.active ? '#0b75d9' : '#64748b'
      const description = `${zone.number}. ${zone.label}: ${metres(zone.radius)} Radius${zone.active ? '' : ' (inaktiv)'}`
      L.circle(zone.center, { radius: zone.radius, color, weight: 2, fillOpacity: zone.active ? 0.13 : 0.04, dashArray: zone.active ? undefined : '6 6' }).bindTooltip(textLabel(description)).addTo(layers)
      L.circleMarker(zone.center, { radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
        .bindTooltip(textLabel(String(zone.number)), { permanent: true, direction: 'center', className: styles.number })
        .bindPopup(textLabel(`${description}. Mittelpunkt: ${coordinates(zone.center)}`)).addTo(layers)
    }
    for (const zone of preview.areas) {
      L.polygon(zone.rings, { color: zone.active ? '#0b75d9' : '#64748b', weight: 2, fillOpacity: zone.active ? 0.13 : 0.04, dashArray: zone.active ? undefined : '6 6' })
        .bindTooltip(textLabel(`${zone.number}. ${zone.label}: Fläche, ${metres(zone.edgeTolerance)} Randtoleranz${zone.active ? '' : ' (inaktiv)'}`)).addTo(layers)
    }
    if (preview.place) {
      L.circleMarker(preview.place.center, { radius: 7, color: '#fff', weight: 2, fillColor: '#c25c0a', fillOpacity: 1 })
        .bindTooltip(textLabel(preview.place.name))
        .bindPopup(textLabel(`${preview.place.name}. Koordinaten des Ortes: ${coordinates(preview.place.center)}`)).addTo(layers)
    }
    fit.current = () => { const bounds = layers.getBounds(); if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17, animate: false }) }
    fit.current()
  }, [runtime, preview])

  return <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Karte der Sammelbereiche">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
      <div><h4 className="flex items-center gap-2 text-sm font-bold"><MapIcon size={17} aria-hidden />Sammelbereiche auf der Karte</h4><p className="mt-1 max-w-xl text-xs leading-5 text-slate-600">Die Vorschau folgt deinen Eingaben. Änderungen am Sammelbereich gelten erst nach deiner Freigabe.</p></div>
      <button type="button" disabled={!runtime || !hasLocation || failed} onClick={() => fit.current()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-50"><LocateFixed size={16} aria-hidden />Alle Bereiche zeigen</button>
    </div>
    <div className="relative isolate">
      <div ref={container} className={styles.map} role="region" aria-label="Interaktive Karte mit Sammelpunkten und Radien" />
      {(!runtime || !hasLocation || failed) && <p role="status" className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-50 p-6 text-center text-sm text-slate-600">{failed ? 'Die Karte konnte nicht geladen werden. Koordinaten und Radius kannst du weiterhin unten bearbeiten.' : !hasLocation ? 'Wähle einen Ort oder gib gültige Koordinaten für einen Sammelbereich ein.' : 'Karte wird geladen …'}</p>}
    </div>
    <div className="space-y-3 border-t border-slate-200 p-4 text-xs leading-5">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-slate-600"><span><span className="mr-1 inline-block size-2 rounded-full bg-[#0b75d9]" />Aktiver Sammelbereich</span><span><span className="mr-1 inline-block size-2 rounded-full bg-slate-500" />Inaktiv</span><span><span className="mr-1 inline-block size-2 rounded-full bg-[#c25c0a]" />Verknüpfter Ort</span></div>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Koordinaten und Radien">
        {preview.circles.map(zone => <li key={zone.number} className="rounded-lg bg-slate-50 px-3 py-2"><p className="font-semibold text-slate-900">{zone.number}. {zone.label}{!zone.active && ' (inaktiv)'}</p><p>Radius: <strong>{metres(zone.radius)}</strong></p><p className="break-all font-mono text-[11px] text-slate-600">Breite, Länge: {coordinates(zone.center)}</p></li>)}
        {preview.areas.map(zone => <li key={zone.number} className="rounded-lg bg-slate-50 px-3 py-2"><p className="font-semibold text-slate-900">{zone.number}. {zone.label}{!zone.active && ' (inaktiv)'}</p><p>Flächengrenze des Ortes. Zusätzliche Randtoleranz: <strong>{metres(zone.edgeTolerance)}</strong> (nicht eingezeichnet).</p></li>)}
      </ul>
      {preview.place && <p className="break-words text-slate-600">Ort: <strong>{preview.place.name}</strong> <span className="break-all font-mono text-[11px]">({coordinates(preview.place.center)})</span></p>}
      {!!preview.issues.length && <ul className="space-y-1 text-amber-800" aria-live="polite">{preview.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
      {tileError && <p className="text-amber-800" role="status">Der Kartenhintergrund konnte nicht vollständig geladen werden. Die eingezeichneten Sammelbereiche und Koordinaten bleiben sichtbar.</p>}
    </div>
  </section>
}
