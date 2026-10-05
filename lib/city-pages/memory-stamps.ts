export type MemoryZone = {
  zone_key: string; label: string; verification_type: 'POINT_RADIUS' | 'AREA'
  safe_latitude: number | null; safe_longitude: number | null
  unlock_radius_meters: number; edge_tolerance_meters: number; active: boolean
}
export const memoryEditions = ['standard', 'first_edition', 'special_edition', 'limited_edition', 'seasonal_edition', 'event_edition'] as const
export type MemoryStampInput = {
  citySlug: string; id: string | null; revision: string | null; operation: 'save' | 'approve' | 'withdraw'
  slug: string; memory_code: string; title: string; short_title: string; description: string; criteria: string
  place_id: string | null; edition_type: string; sort_order: number; artwork_asset_id: string | null
  minimum_accuracy_meters: number; minimum_sample_count: number; maximum_sample_window_seconds: number
  zones: MemoryZone[]; review_notes: string; confirm_review: boolean
}
export type MemoryStampRecord = {
  definition: { id: string; city_id: string; slug: string; memory_code: string; title: string; short_title: string | null; description: string; criteria: string; place_id: string | null; edition_type: string; sort_order: number; active: boolean; configuration_status: string; verification_method: string }
  config: { minimum_accuracy_meters: number; minimum_sample_count: number; maximum_sample_window_seconds: number; review_notes: string | null; human_approved: boolean; approved_at: string | null; verification_type: 'POINT_RADIUS' | 'AREA'; safe_latitude: number | null; safe_longitude: number | null; unlock_radius_meters: number; edge_tolerance_meters: number } | null
  zones: MemoryZone[]; artwork_asset_id: string | null; revision: string; claim_count: number
}
export type MemoryCatalog = {
  city: { id: string; slug: string; name: string }
  stamps: MemoryStampRecord[]
  places: { id: string; name: string; status: string; geometry_type: string; latitude: number | null; longitude: number | null; geometry_geojson?: unknown }[]
  assets: { id: string; title: string | null; alt_text: string | null; public_url: string }[]
}
export type MemorySaveResult = { ok: true; id: string; refresh: 'ok' | 'not_configured' | 'failed' } | { ok: false; message: string }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const obj = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
const number = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const optionalId = (v: unknown) => v === null || (typeof v === 'string' && uuid.test(v))

type MemoryWithdrawalInput = Pick<MemoryStampInput, 'citySlug' | 'id' | 'revision' | 'slug' | 'memory_code'> & { operation: 'withdraw' }

export function parseMemoryStampInput(value: unknown): { ok: true; input: MemoryStampInput | MemoryWithdrawalInput } | { ok: false; message: string } {
  const fail = (message: string) => ({ ok: false as const, message })
  const v = obj(value)
  if (!v || typeof v.citySlug !== 'string' || v.citySlug.length > 120 || !slugPattern.test(v.citySlug)) return fail('Die Stadtzuordnung ist ungültig.')
  if (!optionalId(v.id) || (v.id === null ? v.revision !== null : typeof v.revision !== 'string' || !/^[a-f0-9]{32}$/.test(v.revision))) return fail('Bitte die Seite neu laden. Die Bearbeitungsversion oder Zuordnung fehlt.')
  if (!['save', 'approve', 'withdraw'].includes(String(v.operation))) return fail('Diese Aktion wird nicht unterstützt.')
  if (v.operation === 'withdraw') {
    if (!v.id || typeof v.slug !== 'string' || typeof v.memory_code !== 'string') return fail('Zum Zurückziehen fehlt die Stempelzuordnung.')
    return { ok: true, input: { citySlug: v.citySlug, id: v.id as string, revision: v.revision as string, slug: v.slug, memory_code: v.memory_code, operation: 'withdraw' } }
  }
  if (!optionalId(v.place_id) || !optionalId(v.artwork_asset_id)) return fail('Bitte Ort und Stempelbild prüfen.')
  const strings: Record<string, string> = {}
  for (const [key, max] of Object.entries({ title: 180, short_title: 80, description: 4000, criteria: 2000, slug: 120, memory_code: 40, review_notes: 2000 })) {
    if (typeof v[key] !== 'string' || v[key].length > max) return fail('Bitte Textlängen und Pflichtfelder prüfen.')
    strings[key] = v[key].trim()
  }
  if (!strings.title || !strings.description || !strings.criteria || !slugPattern.test(strings.slug) || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(strings.memory_code)) return fail('Name, Beschreibung, Sammelhinweis, stabiler Pfad und Stempelcode sind erforderlich.')
  if (!memoryEditions.includes(v.edition_type as typeof memoryEditions[number]) || !number(v.sort_order, 0, 100000) || !Number.isInteger(v.sort_order)) return fail('Bitte Edition und Reihenfolge prüfen.')
  if (!number(v.minimum_accuracy_meters, 1, 1000) || !number(v.minimum_sample_count, 3, 64) || !Number.isInteger(v.minimum_sample_count) || !number(v.maximum_sample_window_seconds, 10, 900) || !Number.isInteger(v.maximum_sample_window_seconds)) return fail('Der Standortnachweis benötigt mindestens drei Messpunkte und gültige Grenzwerte.')
  if (!Array.isArray(v.zones) || v.zones.length > 20) return fail('Bitte höchstens 20 Sammelbereiche angeben.')
  const zones: MemoryZone[] = []
  for (const entry of v.zones) {
    const z = obj(entry)
    if (!z || typeof z.zone_key !== 'string' || z.zone_key.length > 80 || !slugPattern.test(z.zone_key) || typeof z.label !== 'string' || !z.label.trim() || z.label.length > 180 || typeof z.active !== 'boolean' || !number(z.unlock_radius_meters, 1, 10000) || !number(z.edge_tolerance_meters, 0, 50)) return fail('Bitte Bezeichnung, Radius und Toleranz der Sammelbereiche prüfen.')
    if (z.verification_type !== 'POINT_RADIUS' && z.verification_type !== 'AREA') return fail('Bitte einen gültigen Sammelbereich wählen.')
    if (z.verification_type === 'AREA' ? z.safe_latitude !== null || z.safe_longitude !== null : z.verification_type !== 'POINT_RADIUS' || !number(z.safe_latitude, -90, 90) || !number(z.safe_longitude, -180, 180)) return fail('Für einen Sammelpunkt sind gültige Koordinaten erforderlich. Flächen verwenden die Geometrie des Ortes.')
    if (zones.some(zone => zone.zone_key === z.zone_key)) return fail('Jeder Sammelbereich braucht eine eindeutige Kennung.')
    zones.push({ zone_key: z.zone_key, label: z.label.trim(), verification_type: z.verification_type, safe_latitude: z.safe_latitude as number | null, safe_longitude: z.safe_longitude as number | null, unlock_radius_meters: z.unlock_radius_meters as number, edge_tolerance_meters: z.edge_tolerance_meters as number, active: z.active })
  }
  if (v.operation === 'approve' && v.edition_type !== 'standard') return fail('Die App unterstützt aktuell das Sammeln der Standard-Edition. Andere Editionen bitte als Entwurf belassen.')
  if (v.operation === 'approve' && (v.confirm_review !== true || !v.place_id || !v.artwork_asset_id || !zones.some(z => z.active))) return fail('Zur Freigabe sind ein Ort, ein veröffentlichtes Stempelbild, ein aktiver Sammelbereich und deine ausdrückliche Prüfung nötig.')
  return { ok: true, input: { citySlug: v.citySlug, id: v.id as string | null, revision: v.revision as string | null, operation: v.operation as MemoryStampInput['operation'], ...strings, place_id: v.place_id as string | null, edition_type: v.edition_type as string, sort_order: v.sort_order as number, artwork_asset_id: v.artwork_asset_id as string | null, minimum_accuracy_meters: v.minimum_accuracy_meters as number, minimum_sample_count: v.minimum_sample_count as number, maximum_sample_window_seconds: v.maximum_sample_window_seconds as number, zones, confirm_review: v.confirm_review === true } as MemoryStampInput }
}

export function memoryErrorMessage(message = '') {
  const errors: Record<string, string> = {
    memory_unsupported_collection: 'Diese Edition oder Prüfmethode kann derzeit nicht zum Sammeln freigegeben werden.',
    memory_admin_required: 'Für diese Änderung ist ein Admin-Konto erforderlich.',
    memory_conflict: 'Dieser Stempel wurde inzwischen geändert. Bitte neu laden und deine Änderungen erneut prüfen.',
    memory_not_found: 'Dieser Stempel gehört nicht zur gewählten Stadt oder ist nicht mehr verfügbar.',
    memory_place_city: 'Bitte einen Ort aus dieser Stadt auswählen.',
    memory_place_inactive: 'Der verknüpfte Ort muss vor der Stempelfreigabe veröffentlicht sein.',
    memory_artwork: 'Bitte ein veröffentlichtes Stempelbild aus der Mediathek dieser Stadt auswählen.',
    memory_review_required: 'Bitte die Sammelorte und Bedingungen vor der Freigabe ausdrücklich bestätigen.',
    memory_identity_immutable: 'Stadt, Stempelcode und Pfad bleiben stabil, damit bestehende Erinnerungen erhalten bleiben.',
    memory_place_claimed: 'Für diesen Stempel gibt es bereits Erinnerungen. Ein anderer Ort braucht einen neuen Stempel.',
    memory_area_geometry: 'Der gewählte Ort hat keine gültige Polygonfläche. Pflege diese zuerst beim Ort oder wähle einen Sammelpunkt.',
    memory_zones: 'Zur Freigabe wird mindestens ein aktiver Sammelbereich benötigt.',
    memory_zone_shape: 'Bitte die Koordinaten und den Typ aller Sammelbereiche prüfen.',
    memory_thresholds: 'Bitte Genauigkeit, Messpunktzahl und Zeitfenster des Standortnachweises prüfen.',
    memory_zone_missing: 'Bestehende Sammelbereiche bitte deaktivieren, statt sie aus dem Formular zu entfernen.',
  }
  return Object.entries(errors).find(([code]) => message.includes(code))?.[1] ?? (message.includes('duplicate key') ? 'Stempelcode oder Pfad ist in dieser Stadt bereits vergeben.' : 'Der Stempel konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten. Bitte erneut versuchen.')
}
