import type { SupabaseClient } from "@supabase/supabase-js"

export const corporateStatuses = ["new", "contacted", "proposal", "closed"] as const
export type CorporateStatus = (typeof corporateStatuses)[number]
export const corporateStatusLabels: Record<CorporateStatus, string> = {
  new: "Neu", contacted: "Kontaktiert", proposal: "Angebot in Abstimmung", closed: "Abgeschlossen",
}
export const corporateInterestLabels = {
  membership: "Premium-Zugang", occasions: "Anlassgeschenke",
  team_challenges: "Team-Challenges", business_events: "Geschäftsessen & Events",
} as const
export type CorporateRequest = {
  request_id: string
  company_name: string
  contact_name: string
  email: string
  city: string
  seats: number
  interests: (keyof typeof corporateInterestLabels)[]
  catalog_version: string | null
  unit_amount_cents: number | null
  total_amount_cents: number | null
  status: CorporateStatus
  note: string
  created_at: string
  updated_at: string
}
export type CorporateListResult =
  | { status: "loaded"; requests: CorporateRequest[] }
  | { status: "error"; message: string }
export type CorporateUpdateState = {
  status: "idle" | "updated" | "invalid" | "conflict" | "not_found" | "error"
  message: string
  updatedAt?: string
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isStatus(value: unknown): value is CorporateStatus {
  return typeof value === "string" && corporateStatuses.some(status => status === value)
}
export function parseCorporateStatusFilter(value: string | string[] | undefined): CorporateStatus | null | undefined {
  if (value === undefined || value === "") return null
  return isStatus(value) ? value : undefined
}

// Validate the timestamp without converting or rounding the optimistic-lock token.
export function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!parts) return false
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return false
  const zone = parts[7]
  return zone === "Z" || (Number(zone.slice(1, 3)) <= 14 && Number(zone.slice(4)) < 60 && (Number(zone.slice(1, 3)) < 14 || Number(zone.slice(4)) === 0))
}
function isNote(value: unknown): value is string {
  return typeof value === "string" && value.length <= 4000 && [...value].length <= 2000 && !value.includes("\0")
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}
function isRequest(value: unknown): value is CorporateRequest {
  if (!isRecord(value)) return false
  const quoteValid = value.catalog_version === null
    ? value.unit_amount_cents === null && value.total_amount_cents === null
    : typeof value.catalog_version === "string" && value.catalog_version.length > 0 && isCents(value.unit_amount_cents) && isCents(value.total_amount_cents)
  return typeof value.request_id === "string" && uuidPattern.test(value.request_id)
    && [value.company_name, value.contact_name, value.email, value.city].every(item => typeof item === "string")
    && typeof value.seats === "number" && Number.isInteger(value.seats) && value.seats >= 1 && value.seats <= 10000
    && Array.isArray(value.interests) && value.interests.length <= 4
    && value.interests.every(interest => typeof interest === "string" && Object.hasOwn(corporateInterestLabels, interest))
    && isStatus(value.status) && isNote(value.note) && quoteValid
    && isTimestamp(value.created_at) && isTimestamp(value.updated_at)
}

type CorporateClient = Pick<SupabaseClient, "rpc">
export async function loadCorporateRequests(supabase: CorporateClient, status: CorporateStatus | null): Promise<CorporateListResult> {
  const failure: CorporateListResult = { status: "error", message: "Firmenanfragen konnten nicht geladen werden. Bitte erneut versuchen." }
  try {
    const { data, error } = await supabase.rpc("admin_list_corporate_benefits_requests", { p_status: status, p_limit: 50 })
    if (error || !isRecord(data) || !Array.isArray(data.requests) || data.requests.length > 50 || !data.requests.every(isRequest)) return failure
    return { status: "loaded", requests: data.requests }
  } catch {
    return failure
  }
}

export async function saveCorporateRequest(supabase: CorporateClient, formData: FormData): Promise<CorporateUpdateState> {
  const requestId = formData.get("requestId")
  const expectedUpdatedAt = formData.get("expectedUpdatedAt")
  const status = formData.get("status")
  const note = formData.get("note")
  if (["requestId", "expectedUpdatedAt", "status", "note"].some(key => formData.getAll(key).length !== 1)
    || typeof requestId !== "string" || !uuidPattern.test(requestId)
    || !isTimestamp(expectedUpdatedAt) || !isStatus(status) || !isNote(note)) {
    return { status: "invalid", message: "Bitte Anfrage, Status und Notiz prüfen. Die Notiz darf höchstens 2000 Zeichen enthalten." }
  }
  const failure: CorporateUpdateState = { status: "error", message: "Speichern fehlgeschlagen. Bitte erneut versuchen; Ihre Eingaben bleiben erhalten." }
  try {
    const { data, error } = await supabase.rpc("admin_update_corporate_benefits_request", {
      p_request_id: requestId, p_expected_updated_at: expectedUpdatedAt, p_status: status, p_note: note,
    })
    if (error || !isRecord(data)) return failure
    switch (data.status) {
      case "updated": return isTimestamp(data.updated_at)
        ? { status: "updated", updatedAt: data.updated_at, message: "Status und interne Notiz gespeichert." } : failure
      case "conflict": return { status: "conflict", message: "Diese Anfrage wurde inzwischen geändert. Seite neu laden und die aktuellen Angaben vor dem erneuten Speichern prüfen." }
      case "not_found": return { status: "not_found", message: "Diese Anfrage ist nicht mehr verfügbar. Bitte die Seite neu laden." }
      case "invalid": return { status: "invalid", message: "Die Änderung wurde abgelehnt. Bitte Status und Notiz prüfen." }
      default: return failure
    }
  } catch {
    return failure
  }
}
