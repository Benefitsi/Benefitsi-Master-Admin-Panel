'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import { Check, LocateFixed, Map as MapIcon, Pentagon, Undo2, X } from 'lucide-react'
import { memoryMapPreview, type MemoryMapPlace } from '@/lib/city-pages/memory-stamp-map'
import type { MemoryZone } from '@/lib/city-pages/memory-stamps'
import { maximumMemoryVertices, memoryPolygonFromVertices, type MemoryMapPoint, type MemoryPolygon } from '@/lib/city-pages/memory-polygon'
import styles from './memory-stamp-map.module.css'

type Runtime = { L: typeof Leaflet; map: Leaflet.Map; layers: Leaflet.FeatureGroup }
const coordinates = (point: [number, number]) => `${point[0]}, ${point[1]}`
const metres = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })} m`
// Leaflet treats strings as HTML. All editor-supplied text must remain literal.
function textLabel(text: string) { const label = document.createElement('span'); label.textContent = text; return label }

type Drawing = { key: string; vertices: MemoryMapPoint[] }
type Props = { zones: MemoryZone[]; place?: MemoryMapPlace; disabled?: boolean; onAreaChange?: (key: string, geometry: MemoryPolygon) => void; onDrawingChange?: (active: boolean) => void }
const control = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold disabled:opacity-50'

export function MemoryStampMap({ zones, place, disabled = false, onAreaChange, onDrawingChange }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const initializedMap = useRef<Leaflet.Map | null>(null)
  const fit = useRef<() => void>(() => {})
  const drawingActive = useRef(false)
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [failed, setFailed] = useState(false)
  const [tileError, setTileError] = useState(false)
  const [selectedKey, setSelectedKey] = useState(zones[0]?.zone_key ?? '')
  const [drawing, setDrawing] = useState<Drawing | null>(null)
  const [drawingError, setDrawingError] = useState('')
  const selectedZone = zones.find(zone => zone.zone_key === selectedKey) ?? zones[0]
  const preview = useMemo(() => memoryMapPreview(zones, place), [zones, place])
  const hasLocation = !!preview.place || !!preview.circles.length || !!preview.areas.length
  const hasSeparatePlace = !!preview.place && !preview.circles.some(zone => zone.center[0] === preview.place?.center[0] && zone.center[1] === preview.place?.center[1])

  function startDrawing() {
    if (!selectedZone || disabled) return
    setDrawing({ key: selectedZone.zone_key, vertices: [] })
    setDrawingError('')
    onDrawingChange?.(true)
  }
  const cancelDrawing = useCallback(() => {
    setDrawing(null); setDrawingError(''); onDrawingChange?.(false)
  }, [onDrawingChange])
  const finishDrawing = useCallback(() => {
    if (!drawing || disabled) return
    const geometry = memoryPolygonFromVertices(drawing.vertices)
    if (!geometry) { setDrawingError('Setze mindestens drei Eckpunkte. Kanten dürfen sich nicht kreuzen oder berühren.'); return }
    onAreaChange?.(drawing.key, geometry)
    cancelDrawing()
  }, [drawing, disabled, onAreaChange, cancelDrawing])
  const addPoint = useCallback((point: MemoryMapPoint) => {
    if (!drawing || disabled) return
    if (drawing.vertices.length >= maximumMemoryVertices) { setDrawingError('Maximal 100 Eckpunkte. Du kannst Punkte verschieben oder den letzten zurücknehmen.'); return }
    if (Math.abs(point[0]) > 85.05112878) { setDrawingError('Dieser Punkt liegt außerhalb des darstellbaren Kartenbereichs.'); return }
    setDrawing({ ...drawing, vertices: [...drawing.vertices, point] }); setDrawingError('')
  }, [drawing, disabled])

  useEffect(() => { drawingActive.current = drawing !== null }, [drawing])

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
    if (preview.place && hasSeparatePlace) {
      L.circleMarker(preview.place.center, { radius: 7, color: '#fff', weight: 2, fillColor: '#c25c0a', fillOpacity: 1 })
        .bindTooltip(textLabel(preview.place.name))
        .bindPopup(textLabel(`${preview.place.name}. Koordinaten des Ortes: ${coordinates(preview.place.center)}`)).addTo(layers)
    }
    fit.current = () => { const bounds = layers.getBounds(); if (!drawingActive.current && bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17, animate: false }) }
    fit.current()
  }, [runtime, preview, hasSeparatePlace])

  useEffect(() => {
    if (!runtime || !drawing || disabled) return
    const { L, map } = runtime
    const draft = L.featureGroup().addTo(map)
    const path = { color: '#157347', weight: 3, dashArray: '7 5', fillOpacity: 0.16, interactive: false }
    if (drawing.vertices.length >= 3) L.polygon(drawing.vertices, path).addTo(draft)
    else if (drawing.vertices.length === 2) L.polyline(drawing.vertices, path).addTo(draft)
    drawing.vertices.forEach((point, index) => {
      const label = index === 0 ? 'Eckpunkt 1 – Fläche schließen' : `Eckpunkt ${index + 1} verschieben`
      const marker = L.marker(point, { draggable: true, keyboard: true, title: label, bubblingMouseEvents: false,
        icon: L.divIcon({ html: textLabel(String(index + 1)), className: styles.vertex, iconSize: [28, 28], iconAnchor: [14, 14] }),
      }).addTo(draft)
      marker.getElement()?.setAttribute('aria-label', label)
      if (index === 0) marker.on('click', finishDrawing)
      marker.on('dragend', () => {
        const position = marker.getLatLng().wrap()
        setDrawing(current => current && ({ ...current, vertices: current.vertices.map((p, i) => i === index ? [position.lat, position.lng] : p) }))
        setDrawingError('')
      })
    })
    const click = (event: Leaflet.LeafletMouseEvent) => { const point = event.latlng.wrap(); addPoint([point.lat, point.lng]) }
    const doubleClick = map.doubleClickZoom.enabled()
    map.doubleClickZoom.disable()
    map.on('click', click)
    return () => { map.off('click', click); draft.remove(); if (doubleClick) map.doubleClickZoom.enable() }
  }, [runtime, drawing, disabled, addPoint, finishDrawing])

  return <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Karte der Sammelbereiche">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
      <div><h4 className="flex items-center gap-2 text-sm font-bold"><MapIcon size={17} aria-hidden />Sammelbereiche auf der Karte</h4><p className="mt-1 max-w-xl text-xs leading-5 text-slate-600">Die Vorschau folgt deinen Eingaben. Änderungen am Sammelbereich gelten erst nach deiner Freigabe.</p></div>
      <button type="button" disabled={!runtime || !hasLocation || failed || !!drawing || disabled} onClick={() => fit.current()} className={control}><LocateFixed size={16} aria-hidden />Alle Bereiche zeigen</button>
    </div>
    {onAreaChange && <div className="space-y-3 border-b border-slate-200 bg-slate-50 p-4">
      {!drawing ? <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-xs font-semibold">Sammelbereich<select aria-label="Sammelbereich zum Zeichnen" className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={selectedZone?.zone_key ?? ''} disabled={disabled || !zones.length} onChange={event => setSelectedKey(event.target.value)}>{!zones.length && <option value="">Zuerst einen Sammelbereich hinzufügen</option>}{zones.map((zone, index) => <option key={zone.zone_key} value={zone.zone_key}>{index + 1}. {zone.label}</option>)}</select></label>
        <button type="button" className={control} disabled={disabled || !runtime || !hasLocation || !selectedZone || failed} onClick={startDrawing}><Pentagon size={17} aria-hidden />Freie Fläche zeichnen</button>
      </div> : <>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Eckpunkte auf der Karte setzen</p><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900" role="status">{drawing.vertices.length} Eckpunkte</span></div>
        <p className="text-xs text-slate-600">Zum Schließen den ersten Punkt anklicken oder die Fläche übernehmen. Punkte lassen sich verschieben.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={control} disabled={disabled || drawing.vertices.length < 3} onClick={finishDrawing}><Check size={16} aria-hidden />Fläche übernehmen</button>
          <button type="button" className={control} disabled={disabled || !drawing.vertices.length} onClick={() => { setDrawing({ ...drawing, vertices: drawing.vertices.slice(0, -1) }); setDrawingError('') }}><Undo2 size={16} aria-hidden />Letzten Punkt zurück</button>
          <button type="button" className={control} disabled={disabled} onClick={cancelDrawing}><X size={16} aria-hidden />Abbrechen</button>
        </div>
        <button type="button" className="min-h-8 text-xs font-semibold underline underline-offset-4 disabled:opacity-50" disabled={disabled || !runtime} onClick={() => { const point = runtime?.map.getCenter().wrap(); if (point) addPoint([point.lat, point.lng]) }}>Punkt in Kartenmitte setzen</button>
        {drawingError && <p role="alert" className="text-sm text-red-800">{drawingError}</p>}
      </>}
    </div>}
    <div className="relative isolate">
      <div ref={container} className={`${styles.map} ${drawing ? styles.drawing : ''}`} role="region" aria-label="Interaktive Karte mit Sammelpunkten und Flächen" onKeyDown={event => { if (event.key === 'Escape' && drawing) { event.preventDefault(); cancelDrawing() } }} />
      {(!runtime || !hasLocation || failed) && <p role="status" className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-50 p-6 text-center text-sm text-slate-600">{failed ? 'Die Karte konnte nicht geladen werden. Ort und Radius kannst du weiterhin unten bearbeiten.' : !hasLocation ? 'Wähle einen Ort mit gültigen Koordinaten für den Sammelbereich.' : 'Karte wird geladen …'}</p>}
    </div>
    <div className="space-y-3 border-t border-slate-200 p-4 text-xs leading-5">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-slate-600"><span><span className="mr-1 inline-block size-2 rounded-full bg-[#0b75d9]" />Aktiver Sammelbereich</span><span><span className="mr-1 inline-block size-2 rounded-full bg-slate-500" />Inaktiv</span>{hasSeparatePlace && <span><span className="mr-1 inline-block size-2 rounded-full bg-[#c25c0a]" />Verknüpfter Ort</span>}</div>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Koordinaten und Radien">
        {preview.circles.map(zone => <li key={zone.number} className="rounded-lg bg-slate-50 px-3 py-2"><p className="font-semibold text-slate-900">{zone.number}. {zone.label}{!zone.active && ' (inaktiv)'}</p><p>Radius: <strong>{metres(zone.radius)}</strong></p><p className="break-all font-mono text-[11px] text-slate-600">Breite, Länge: {coordinates(zone.center)}</p></li>)}
        {preview.areas.map(zone => <li key={zone.number} className="rounded-lg bg-slate-50 px-3 py-2"><p className="font-semibold text-slate-900">{zone.number}. {zone.label}{!zone.active && ' (inaktiv)'}</p><p>{zone.custom ? `Freie Fläche · ${zone.rings[0].length - 1} Eckpunkte.` : 'Flächengrenze des Ortes.'} Randtoleranz: <strong>{metres(zone.edgeTolerance)}</strong> (nicht eingezeichnet).</p></li>)}
      </ul>
      {preview.place && <p className="break-words text-slate-600">Ort: <strong>{preview.place.name}</strong> <span className="break-all font-mono text-[11px]">({coordinates(preview.place.center)})</span></p>}
      {!!preview.issues.length && <ul className="space-y-1 text-amber-800" aria-live="polite">{preview.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
      {tileError && <p className="text-amber-800" role="status">Der Kartenhintergrund konnte nicht vollständig geladen werden. Die eingezeichneten Sammelbereiche und Koordinaten bleiben sichtbar.</p>}
    </div>
  </section>
}
