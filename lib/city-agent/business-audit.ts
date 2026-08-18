import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { freshnessState, type FreshnessState } from "./freshness"

type AdminClient = ReturnType<typeof createAdminClient>
type Row = Record<string, unknown>

export type CityBusinessScope = "IN_CITY" | "NEARBY" | "REGIONAL" | "UNKNOWN"

export type CityBusinessAuditRecord = {
  id: string
  name: string
  slug: string | null
  status: string | null
  isActive: boolean
  cityId: string | null
  locationCity: string | null
  postalCode: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  website: string | null
  phone: string | null
  openingHoursCount: number
  scope: CityBusinessScope
  distanceKm: number | null
  lastVerifiedAt: string | null
  freshnessState: FreshnessState
  missingFields: string[]
}

export type CityBusinessAudit = {
  cityId: string
  cityName: string
  checked: number
  current: number
  due: number
  stale: number
  unknown: number
  scopeCounts: Record<CityBusinessScope, number>
  records: CityBusinessAuditRecord[]
  dataGaps: Array<{ businessId: string; name: string; fields: string[]; scope: CityBusinessScope }>
}

const NEARBY_RADIUS_KM = 25
const REGIONAL_RADIUS_KM = 75

function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((value): value is Row => Boolean(value) && typeof value === "object" && !Array.isArray(value))
    : []
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function boolean(value: unknown) {
  return value === true
}

function normalizeLocation(value: string | null) {
  return (value ?? "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function distanceKm(latitude: number | null, longitude: number | null, cityLatitude: number | null, cityLongitude: number | null) {
  if ([latitude, longitude, cityLatitude, cityLongitude].some((value) => value == null)) return null
  const earthRadius = 6371
  const toRadians = (value: number) => (value * Math.PI) / 180
  const deltaLatitude = toRadians((latitude as number) - (cityLatitude as number))
  const deltaLongitude = toRadians((longitude as number) - (cityLongitude as number))
  const startLatitude = toRadians(cityLatitude as number)
  const endLatitude = toRadians(latitude as number)
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.sin(deltaLongitude / 2) ** 2 * Math.cos(startLatitude) * Math.cos(endLatitude)
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)))
}

function isActivePartner(row: Row) {
  const status = text(row.status)?.toLowerCase()
  return boolean(row.is_active) && status !== "inactive" && status !== "archived" && status !== "suspended"
}

function scopeFor(input: {
  cityId: string
  cityName: string
  partnerCityId: string | null
  locationCity: string | null
  distance: number | null
}) : CityBusinessScope {
  const cityName = normalizeLocation(input.cityName)
  const locationCity = normalizeLocation(input.locationCity)
  if (locationCity && (locationCity === cityName || locationCity.startsWith(`${cityName} `) || cityName.startsWith(`${locationCity} `))) return "IN_CITY"
  if (input.partnerCityId === input.cityId && !locationCity) return "IN_CITY"
  if (input.distance != null && input.distance <= NEARBY_RADIUS_KM) return "NEARBY"
  if (input.distance != null && input.distance <= REGIONAL_RADIUS_KM) return "REGIONAL"
  return "UNKNOWN"
}

function incrementState(result: CityBusinessAudit, state: FreshnessState) {
  result.checked += 1
  result[state.toLowerCase() as "current" | "due" | "stale" | "unknown"] += 1
}

/**
 * Reads the existing partner model as the Business Agent's source of truth.
 * It intentionally does not create or infer a city_businesses table/entity.
 */
export async function auditCityBusinesses(admin: AdminClient, cityId: string, now = new Date()): Promise<CityBusinessAudit> {
  const cityResult = await admin.from("cities").select("id,name,latitude,longitude").eq("id", cityId).maybeSingle()
  if (cityResult.error || !cityResult.data) {
    throw new Error(`Business-Audit: Stadt konnte nicht geladen werden: ${cityResult.error?.message ?? "nicht gefunden"}`)
  }
  const city = cityResult.data as Row
  const cityName = text(city.name) ?? "Unbekannte Stadt"
  const cityLatitude = number(city.latitude)
  const cityLongitude = number(city.longitude)

  const partnersResult = await admin
    .from("partners")
    .select("id,name,slug,status,is_active,city_id,website,phone,updated_at")
    .eq("is_active", true)
    .limit(1000)
  if (partnersResult.error) throw new Error(`Business-Audit: Partner konnten nicht geladen werden: ${partnersResult.error.message}`)

  const partnerRows = rows(partnersResult.data).filter(isActivePartner)
  const partnerIds = partnerRows.map((row) => text(row.id)).filter((id): id is string => Boolean(id))
  const [locationsResult, hoursResult] = await Promise.all([
    partnerIds.length
      ? admin.from("partner_locations").select("partner_id,street,postal_code,city,address,latitude,longitude,website,phone,is_primary,updated_at").in("partner_id", partnerIds).order("is_primary", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    partnerIds.length
      ? admin.from("partner_opening_hours").select("partner_id").in("partner_id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (locationsResult.error) throw new Error(`Business-Audit: Standorte konnten nicht geladen werden: ${locationsResult.error.message}`)
  if (hoursResult.error) throw new Error(`Business-Audit: Öffnungszeiten konnten nicht geladen werden: ${hoursResult.error.message}`)

  const locationByPartner = new Map<string, Row>()
  for (const location of rows(locationsResult.data)) {
    const partnerId = text(location.partner_id)
    if (partnerId && !locationByPartner.has(partnerId)) locationByPartner.set(partnerId, location)
  }
  const hoursByPartner = new Map<string, number>()
  for (const hour of rows(hoursResult.data)) {
    const partnerId = text(hour.partner_id)
    if (partnerId) hoursByPartner.set(partnerId, (hoursByPartner.get(partnerId) ?? 0) + 1)
  }

  const result: CityBusinessAudit = {
    cityId,
    cityName,
    checked: 0,
    current: 0,
    due: 0,
    stale: 0,
    unknown: 0,
    scopeCounts: { IN_CITY: 0, NEARBY: 0, REGIONAL: 0, UNKNOWN: 0 },
    records: [],
    dataGaps: [],
  }

  for (const partner of partnerRows) {
    const id = text(partner.id)
    if (!id) continue
    const location = locationByPartner.get(id) ?? {}
    const partnerLatitude = number(location.latitude)
    const partnerLongitude = number(location.longitude)
    const distance = distanceKm(partnerLatitude, partnerLongitude, cityLatitude, cityLongitude)
    const locationCity = text(location.city)
    const scope = scopeFor({ cityId, cityName, partnerCityId: text(partner.city_id), locationCity, distance })
    // Only the city's catchment and actual nearby/regional records belong in
    // this baseline. Unknown records remain visible as a data-quality signal,
    // but are not silently presented as local businesses.
    if (scope === "UNKNOWN" && text(partner.city_id) !== cityId) continue

    const lastVerifiedAt = [text(location.updated_at), text(partner.updated_at)].filter(Boolean).sort().at(-1) ?? null
    const state = freshnessState({ lastVerifiedAt, ttlDays: 30, now })
    const website = text(location.website) ?? text(partner.website)
    const phone = text(location.phone) ?? text(partner.phone)
    const missingFields = [
      !locationCity && "location",
      !(partnerLatitude != null && partnerLongitude != null) && "coordinates",
      !website && "website",
      !phone && "phone",
      !hoursByPartner.get(id) && "opening_hours",
    ].filter((field): field is string => Boolean(field))
    const record: CityBusinessAuditRecord = {
      id,
      name: text(partner.name) ?? "Unbenannter Partner",
      slug: text(partner.slug),
      status: text(partner.status),
      isActive: boolean(partner.is_active),
      cityId: text(partner.city_id),
      locationCity,
      postalCode: text(location.postal_code),
      address: text(location.address) ?? text(location.street),
      latitude: partnerLatitude,
      longitude: partnerLongitude,
      website,
      phone,
      openingHoursCount: hoursByPartner.get(id) ?? 0,
      scope,
      distanceKm: distance == null ? null : Math.round(distance * 100) / 100,
      lastVerifiedAt,
      freshnessState: state,
      missingFields,
    }
    result.records.push(record)
    result.scopeCounts[scope] += 1
    incrementState(result, state)
    if (missingFields.length) result.dataGaps.push({ businessId: id, name: record.name, fields: missingFields, scope })
  }

  return result
}
