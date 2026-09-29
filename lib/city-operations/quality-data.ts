import "server-only"

import { requireAdmin } from "../admin"
import { createAdminClient } from "../supabase/admin"
import { buildDirectoryQuality, type QualityRow } from "./quality"

type QualityFilters = { city?: string; regionCityIds?: Set<string> }
type ReadResult = { rows: QualityRow[]; complete: boolean; available: boolean }
const PAGE_SIZE = 250
const INVENTORY_CITY_LIMIT = 20

export async function loadDirectoryQuality(filters: QualityFilters = {}, now = new Date()) {
  await requireAdmin()
  const warnings: string[] = []
  const empty = () => buildDirectoryQuality([], [], [], now)
  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch {
    return { quality: empty(), cityOptions: [], scopeLabel: "Nicht verfügbar", coverage: "unavailable" as const,
      placesAvailable: false, checksAvailable: false, warnings: ["Qualitätsdaten konnten nicht geladen werden."] }
  }

  // Exact counts let us continue when the server applies a smaller page cap.
  // Both the row budget and a shared deadline bound this read-only projection.
  const signal = AbortSignal.timeout(15_000)
  async function read(table: string, select: string, label: string, limit: number, cityIds?: string[]): Promise<ReadResult> {
    const rows: QualityRow[] = []
    let total: number | null = null
    try {
      while (rows.length < limit) {
        let query = admin.from(table).select(select, { count: "exact" })
        if (cityIds) query = query.in("city_id", cityIds)
        if (table === "city_places") query = query.in("status", ["draft", "needs_review", "active"])
        if (table === "city_source_freshness_checks") query = query.order("checked_at", { ascending: false })
        query = query.order(table === "city_agent_city_controls" ? "city_id" : "id")
        const result = await query.range(rows.length, Math.min(rows.length + PAGE_SIZE, limit) - 1).abortSignal(signal)
        if (result.error || !Array.isArray(result.data)) throw new Error("quality_read_failed")
        total = result.count
        const page: unknown[] = result.data
        const records = page.filter((row): row is QualityRow => Boolean(row) && typeof row === "object" && !Array.isArray(row))
        if (records.length !== page.length) throw new Error("quality_row_invalid")
        rows.push(...records)
        if (total !== null && rows.length >= total) return { rows, complete: true, available: true }
        if (!result.data.length) {
          if (total === null) return { rows, complete: true, available: true }
          break
        }
      }
      warnings.push(`${label}: ${rows.length}${total !== null ? ` von ${total}` : ""} Datensätze geladen; Auswertung unvollständig. Bitte Ort oder Region eingrenzen.`)
      return { rows, complete: false, available: true }
    } catch {
      warnings.push(`${label} konnten nicht vollständig geladen werden. Fehlende Daten sind kein Qualitätsnachweis.`)
      return { rows, complete: false, available: false }
    }
  }

  const cities = await read("cities", "id,name,slug", "Orte", 200)
  const cityOptions = cities.rows.map((city) => ({ slug: String(city.slug), name: String(city.name) })).sort((a, b) => a.name.localeCompare(b.name, "de"))
  if (!cities.available) return { quality: empty(), cityOptions, scopeLabel: "Nicht verfügbar", coverage: "unavailable" as const, placesAvailable: false, checksAvailable: false, warnings }
  const selected = cities.rows.filter((city) => (!filters.city || city.slug === filters.city) && (!filters.regionCityIds || filters.regionCityIds.has(String(city.id))))
  const cityIds = selected.map((city) => String(city.id))
  const scopeLabel = !selected.length ? "Keine passenden Orte" : selected.length === 1 ? String(selected[0].name) : `${selected.length} Orte`
  if (!cityIds.length) return { quality: empty(), cityOptions, scopeLabel, coverage: cities.complete ? "ready" as const : "partial" as const, placesAvailable: true, checksAvailable: true, warnings }
  const [places, sources, checks, controls] = await Promise.all([
    read("city_places", "id,city_id,name,status,address,contact_phone,source_url,opening_hours,opening_hours_note,last_verified_at,expires_at", "Verzeichniseinträge", 2000, cityIds),
    read("city_agent_sources", "id,city_id,slug,url,owner_name,active,enabled,cadence,parser_config,content_scope,updated_at", "Registrierte Quellen", 1000, cityIds),
    read("city_source_freshness_checks", "id,city_id,source_id,source_revision,source_url,checked_at,window_start,proof_signature,fetch_status,http_status,comparison,source_sha256,error_code,stale_fields,unknown_fields,review_job_id", "M1-Prüfbelege", 5000, cityIds),
    read("city_agent_city_controls", "city_id,operating_mode", "Stadt-Steuerung", 200, cityIds),
  ])
  const cityMap = new Map(selected.map((city) => [city.id, city]))
  const modes = new Map(controls.rows.map((control) => [control.city_id, control.operating_mode]))
  const inventoryStates = new Map<unknown, QualityRow>()
  const inventoryCities = selected.filter((city) => sources.rows.some((source) => source.city_id === city.id &&
    source.active === true && source.enabled === true && source.cadence !== "manual" &&
    (source.parser_config as QualityRow | null)?.cadence_owner === "m1_city_freshness") && modes.get(city.id) !== "DISABLED")
  let inventoryComplete = inventoryCities.length <= INVENTORY_CITY_LIMIT
  if (!inventoryComplete) warnings.push(`Aktueller M1-Prüfstatus: höchstens ${INVENTORY_CITY_LIMIT} Orte pro Auswertung. Bitte Ort oder Region eingrenzen.`)
  // Share the read deadline and limit fan-out to four requests at a time.
  for (let offset = 0; offset < Math.min(inventoryCities.length, INVENTORY_CITY_LIMIT); offset += 4) {
    await Promise.all(inventoryCities.slice(offset, Math.min(offset + 4, INVENTORY_CITY_LIMIT)).map(async (city) => {
      try {
        const result = await admin.rpc("city_freshness_inventory", { p_city_slug: String(city.slug) }).abortSignal(signal)
        const inventory = result.data as QualityRow | null
        if (result.error || inventory?.schema_version !== 1 || inventory.city_id !== city.id || inventory.city_slug !== city.slug ||
            inventory.city_profile !== `city-${city.slug}` || inventory.enabled !== true || inventory.interval_seconds !== 259200 ||
            !Array.isArray(inventory.sources) || inventory.sources.length > 200 ||
            inventory.sources.some((row: unknown) => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("quality_inventory_failed")
        for (const state of inventory.sources as QualityRow[]) inventoryStates.set(state.id, state)
      } catch {
        inventoryComplete = false
        warnings.push(`${String(city.name)}: Aktueller M1-Prüfstatus konnte nicht geladen werden. Vorhandene Belege bestätigen keine aktuelle Fälligkeit.`)
      }
    }))
  }
  const decorate = (row: QualityRow) => ({ ...row, city_slug: cityMap.get(row.city_id)?.slug, city_name: cityMap.get(row.city_id)?.name })
  const quality = buildDirectoryQuality(places.rows.map(decorate), sources.rows.map((source) => ({ ...decorate(source),
    city_mode: modes.get(source.city_id) ?? null, freshness_state: inventoryStates.get(source.id) ?? null })), checks.rows, now)
  if (quality.counts.unknownSources > 0 && inventoryComplete) {
    inventoryComplete = false
    warnings.push("Aktueller M1-Prüfstatus nicht eindeutig belegt. Quellenrevision, Feldzustand und Prüfbeleg müssen übereinstimmen.")
  }
  return {
    quality, cityOptions, scopeLabel, coverage: inventoryComplete && [cities, places, sources, checks, controls].every((result) => result.complete) ? "ready" as const : "partial" as const,
    placesAvailable: places.available, checksAvailable: checks.available && checks.complete && inventoryComplete, warnings,
  }
}

export type DirectoryQualityData = Awaited<ReturnType<typeof loadDirectoryQuality>>
