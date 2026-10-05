import type { SupabaseClient } from "@supabase/supabase-js"
import { isRecord, isTimestamp, uuidPattern } from "@/lib/corporate/requests"

export type CorporateClient = Pick<SupabaseClient, "rpc">
export const companyStatusLabels = { preparing: "In Vorbereitung", enrolling: "Teamaufnahme freigegeben", paused: "Teamaufnahme pausiert" } as const
export type CompanyStatus = keyof typeof companyStatusLabels
export type CompanyRole = "owner" | "employee"
export const entitlementStatusLabels = { not_enabled: "Nicht freigegeben", scheduled: "Geplant", active: "Aktiv", suspended: "Gesperrt", expired: "Abgelaufen" } as const
export const companyRoleLabels = { owner: "Ansprechpartner", employee: "Mitarbeiter" } as const
export type CorporateCatalog = {
  version: string; status: "planning"; currency: "EUR"; billing_interval: "year"; tax_mode: "net_reference"; max_seats: number
  tiers: { min_seats: number; max_seats: number; unit_amount_cents: number }[]
}
export type CorporateCompany = {
  company_id: string; source_request_id: string; company_name: string; city: string; contact_name: string; contact_email: string
  seats: number; starts_on: string; ends_on: string; catalog_version: string; unit_amount_cents: number; total_amount_cents: number
  currency: "EUR"; tax_mode: "net_reference"; status: CompanyStatus; invoice_reference: string; updated_at: string
  employee_count: number; reserved_count: number; available_seats: number; entitlement_status: keyof typeof entitlementStatusLabels
  premium_enabled: boolean; premium_payment_reference: string
}
export type RosterRow = { kind: "member" | "invitation"; id: string; role: CompanyRole; email: string; updated_at: string; expires_at: string | null }
export type CompanyListResult = { status: "loaded"; companies: CorporateCompany[]; total: number; offset: number; page_size: 50 } | { status: "error"; message: string }
export type CompanyDetailResult = { status: "ok"; company: CorporateCompany; roster: RosterRow[]; roster_total: number; offset: number; page_size: 50 } | { status: "error" | "not_found" | "invalid"; message: string }
export type CompanyMutationState = {
  status: "idle" | "created" | "updated" | "issued" | "revoked" | "removed" | "invalid" | "conflict" | "not_found" | "catalog_changed" | "unavailable" | "full" | "already_member" | "already_invited" | "rate_limited" | "error"
  message: string; companyId?: string; updatedAt?: string; invitationId?: string; expiresAt?: string
}
export const mutationInitial: CompanyMutationState = { status: "idle", message: "" }
export const mutationFailure: CompanyMutationState = { status: "error", message: "Die Antwort konnte nicht bestätigt werden. Bitte unverändert erneut versuchen; Ihre Eingaben bleiben erhalten." }
const messages = {
  invalid: "Bitte die Eingaben prüfen. Die Änderung wurde abgelehnt.",
  conflict: "Diese Angaben wurden inzwischen geändert oder die Wiederholung weicht ab. Bitte neu laden und die aktuellen Angaben prüfen.",
  not_found: "Dieser Eintrag ist nicht mehr verfügbar. Bitte die Seite neu laden.",
  catalog_changed: "Der Preiskatalog wurde geändert. Bitte neu laden und das aktuelle Jahresangebot prüfen.",
  unavailable: "Die Einladung ist derzeit nicht verfügbar: Firmenaufnahme pausiert, Zeitraum beendet oder Einladung nicht mehr gültig. Bitte neu laden.",
  full: "Alle Mitarbeiterplätze sind belegt oder reserviert. Bitte die aktuelle Belegung neu laden.",
  already_member: "Diese Adresse ist dieser Rolle bereits zugeordnet. Es wurde keine Einladung erstellt.",
  already_invited: "Für diese Adresse und Rolle besteht bereits eine offene Einladung. Bei verlorenem Link diese Einladung zurücknehmen und neu erstellen.",
  rate_limited: "Zu viele neue Einladungen innerhalb einer Stunde. Bitte später erneut versuchen.",
} as const
export function domainFailure(status: unknown): CompanyMutationState {
  return typeof status === "string" && Object.hasOwn(messages, status)
    ? { status: status as keyof typeof messages, message: messages[status as keyof typeof messages] } : mutationFailure
}
export function isUuid(value: unknown): value is string { return typeof value === "string" && uuidPattern.test(value) }
export function isCompanyRole(value: unknown): value is CompanyRole { return value === "owner" || value === "employee" }
export function isCompanyStatus(value: unknown): value is CompanyStatus { return typeof value === "string" && Object.hasOwn(companyStatusLabels, value) }
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 }
export function isDate(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isTimestamp(`${value}T00:00:00Z`) }
export function parseOffset(value: string | string[] | undefined): number | null {
  if (value === undefined || value === "") return 0
  if (typeof value !== "string" || !/^\d{1,7}$/.test(value)) return null
  const offset = Number(value)
  return offset <= 1000000 ? offset : null
}
function validOffset(value: number) { return count(value) && value <= 1000000 }
export function parseCatalog(value: unknown): CorporateCatalog | null {
  if (!isRecord(value) || typeof value.version !== "string" || !value.version.trim() || value.version.length > 120
    || value.status !== "planning" || value.currency !== "EUR" || value.billing_interval !== "year" || value.tax_mode !== "net_reference"
    || !count(value.max_seats) || value.max_seats < 1 || value.max_seats > 10000 || !Array.isArray(value.tiers) || !value.tiers.length || value.tiers.length > 10000) return null
  const tiers: CorporateCatalog["tiers"] = []
  let next = 1
  for (const tier of value.tiers) {
    if (!isRecord(tier) || tier.min_seats !== next || !count(tier.max_seats) || tier.max_seats < next || tier.max_seats > value.max_seats
      || !count(tier.unit_amount_cents) || tier.unit_amount_cents < 1 || !Number.isSafeInteger(tier.unit_amount_cents * value.max_seats)) return null
    tiers.push({ min_seats: next, max_seats: tier.max_seats, unit_amount_cents: tier.unit_amount_cents })
    next = tier.max_seats + 1
  }
  if (next !== value.max_seats + 1) return null
  return { version: value.version, status: "planning", currency: "EUR", billing_interval: "year", tax_mode: "net_reference", max_seats: value.max_seats, tiers }
}
export function annualQuote(catalog: CorporateCatalog | null, seats: number) {
  if (!catalog || !Number.isInteger(seats) || seats < 1 || seats > catalog.max_seats) return null
  const tier = catalog.tiers.find(t => seats >= t.min_seats && seats <= t.max_seats)
  return tier ? { unitCents: tier.unit_amount_cents, totalCents: seats * tier.unit_amount_cents } : null
}
export function euro(cents: number) { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100) }
export function period(startsOn: string, endsOn: string) {
  const end = new Date(`${endsOn}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() - 1)
  const format = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "UTC" })
  return `${format.format(new Date(`${startsOn}T00:00:00Z`))} bis ${format.format(end)}`
}
function isCompany(value: unknown): value is CorporateCompany {
  if (!isRecord(value)) return false
  return isUuid(value.company_id) && isUuid(value.source_request_id)
    && [value.company_name, value.city, value.contact_name, value.contact_email, value.invoice_reference].every(v => typeof v === "string")
    && typeof value.catalog_version === "string" && !!value.catalog_version && isTimestamp(value.updated_at)
    && isDate(value.starts_on) && isDate(value.ends_on) && value.starts_on < value.ends_on
    && count(value.seats) && value.seats >= 1 && value.seats <= 10000 && isCompanyStatus(value.status)
    && count(value.unit_amount_cents) && value.unit_amount_cents > 0 && count(value.total_amount_cents) && value.total_amount_cents === value.seats * value.unit_amount_cents
    && count(value.employee_count) && count(value.reserved_count) && count(value.available_seats)
    && value.employee_count + value.reserved_count + value.available_seats === value.seats
    && value.currency === "EUR" && value.tax_mode === "net_reference"
    && typeof value.entitlement_status === "string" && Object.hasOwn(entitlementStatusLabels, value.entitlement_status)
    && typeof value.premium_enabled === "boolean" && typeof value.premium_payment_reference === "string"
    && [...value.premium_payment_reference].length <= 160 && !value.premium_payment_reference.includes("\0")
}
function isRosterRow(value: unknown): value is RosterRow {
  return isRecord(value) && isUuid(value.id) && isCompanyRole(value.role) && typeof value.email === "string" && isTimestamp(value.updated_at)
    && (value.kind === "member" ? value.expires_at === null : value.kind === "invitation" && isTimestamp(value.expires_at))
}
export async function loadCorporateCatalog(client: CorporateClient): Promise<CorporateCatalog | null> {
  try { const { data, error } = await client.rpc("get_corporate_benefits_catalog"); return error ? null : parseCatalog(data) } catch { return null }
}
export async function loadCorporateCompanies(client: CorporateClient, offset: number): Promise<CompanyListResult> {
  const failure: CompanyListResult = { status: "error", message: "Firmenkonten konnten nicht geladen werden. Bitte erneut laden." }
  if (!validOffset(offset)) return failure
  try {
    const { data, error } = await client.rpc("admin_list_corporate_companies", { p_offset: offset })
    if (error || !isRecord(data) || !Array.isArray(data.companies) || data.companies.length > 50 || !data.companies.every(isCompany)
      || !count(data.total) || data.total < data.companies.length || data.offset !== offset || data.page_size !== 50) return failure
    return { status: "loaded", companies: data.companies, total: data.total, offset, page_size: 50 }
  } catch { return failure }
}
export async function loadCorporateCompany(client: CorporateClient, companyId: string, offset: number): Promise<CompanyDetailResult> {
  const failure: CompanyDetailResult = { status: "error", message: "Firmenkonto konnte nicht geladen werden. Bitte erneut laden." }
  if (!isUuid(companyId) || !validOffset(offset)) return { status: "invalid", message: "Ungültiges Firmenkonto oder ungültige Seite." }
  try {
    const { data, error } = await client.rpc("get_corporate_company", { p_company_id: companyId, p_offset: offset })
    if (error || !isRecord(data)) return failure
    if (data.status === "not_found" || data.status === "invalid") return { status: data.status, message: "Dieses Firmenkonto ist nicht verfügbar. Bitte die Firmenliste neu laden." }
    if (data.status !== "ok" || !isCompany(data.company) || data.company.company_id !== companyId
      || !Array.isArray(data.roster) || data.roster.length > 50 || !data.roster.every(isRosterRow)
      || !count(data.roster_total) || data.roster_total < data.roster.length || data.offset !== offset || data.page_size !== 50) return failure
    return { status: "ok", company: data.company, roster: data.roster, roster_total: data.roster_total, offset, page_size: 50 }
  } catch { return failure }
}
