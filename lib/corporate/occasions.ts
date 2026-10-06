import type { SupabaseClient } from "@supabase/supabase-js"
import { isRecord, isTimestamp } from "@/lib/corporate/requests"

export type OccasionKind = "birthday" | "anniversary"
export type OccasionProgram = { kind: OccasionKind; enabled: boolean; offer_id: string | null; anniversary_interval: 1 | 5; updated_at: string | null }
export type OccasionOffer = { offer_id: string; partner_id: string; partner_name: string; deal_id: string; title: string; description: string | null; terms: string | null; enabled: boolean; updated_at: string; available: boolean; reapproval_required: boolean; authorization_reference?: string }
export type OccasionMember = { user_id: string; membership_id: string; name: string | null; email: string; employment_started_on: string | null; updated_at: string | null; birthday_enabled: boolean; birthday_month: number | null; birthday_day: number | null; next_birthday_on: string | null; next_anniversary_on: string | null }
export type OccasionSettings = { status: "ok"; company_id: string; can_approve_offers: boolean; programs: OccasionProgram[]; offers: OccasionOffer[]; members: OccasionMember[]; next_offset: number | null }
export type OccasionPreview = { status: "ok"; company_id: string; deal_id: string; partner_id: string; partner_name: string; title: string; description: string | null; terms: string | null; preview_hash: string }
export type OccasionMutation = { status: "idle" | "updated" | "invalid" | "not_found" | "unavailable" | "conflict" | "error"; message: string; updatedAt?: string }
export type OccasionRead = OccasionSettings | { status: "error"; message: string }
export type OccasionPreviewRead = { status: "ok"; preview: OccasionPreview } | { status: "error" | "not_found" | "unavailable"; message: string }
type Client = Pick<SupabaseClient, "rpc">
export const occasionFailure: OccasionMutation = { status: "error", message: "Die Änderung konnte nicht bestätigt werden. Ihre Eingaben bleiben erhalten. Bitte den Serverstand neu laden." }
const invalid: OccasionMutation = { status: "invalid", message: "Bitte Kennungen, Auswahl, Referenz und Datum prüfen." }
export function occasionUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) }
export function occasionDate(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isTimestamp(`${value}T00:00:00Z`) }
export function berlinToday(): string { const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); return `${p.find(v => v.type === "year")!.value}-${p.find(v => v.type === "month")!.value}-${p.find(v => v.type === "day")!.value}` }
export function occasionReference(value: unknown): value is string { return typeof value === "string" && [...value].length >= 1 && [...value].length <= 160 && value.trim().length > 0 && !/[\u0000-\u001f\u007f-\u009f]/.test(value) }
const text = (v: unknown): v is string => typeof v === "string"
const nullableText = (v: unknown): v is string | null => v === null || text(v)
const nullableId = (v: unknown): v is string | null => v === null || occasionUuid(v)
const version = (v: unknown): v is string | null => v === null || isTimestamp(v)
const date = (v: unknown): v is string | null => v === null || occasionDate(v)
const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v)
const offsetValid = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 1000000 && v % 50 === 0
function requireValue(condition: unknown): asserts condition { if (!condition) throw new Error("Invalid occasion response") }
function unique(values: string[]) { return new Set(values).size === values.length }
export function parseOccasionSettings(value: unknown, companyId: string): OccasionSettings {
  requireValue(occasionUuid(companyId) && isRecord(value) && value.status === "ok" && value.company_id === companyId && typeof value.can_approve_offers === "boolean" && Array.isArray(value.programs) && value.programs.length === 2 && Array.isArray(value.offers) && value.offers.length <= 30 && Array.isArray(value.members) && value.members.length <= 50 && (value.next_offset === null || offsetValid(value.next_offset)))
  const programs = value.programs.map((p: unknown): OccasionProgram => {
    requireValue(isRecord(p) && (p.kind === "birthday" || p.kind === "anniversary") && typeof p.enabled === "boolean" && nullableId(p.offer_id) && (p.anniversary_interval === 1 || p.anniversary_interval === 5) && (p.kind !== "birthday" || p.anniversary_interval === 1) && version(p.updated_at) && (!p.enabled || p.offer_id !== null))
    return { kind: p.kind, enabled: p.enabled, offer_id: p.offer_id, anniversary_interval: p.anniversary_interval, updated_at: p.updated_at }
  })
  requireValue(unique(programs.map(p => p.kind)))
  const offers = value.offers.map((o: unknown): OccasionOffer => {
    requireValue(isRecord(o) && occasionUuid(o.offer_id) && occasionUuid(o.partner_id) && occasionUuid(o.deal_id) && text(o.partner_name) && text(o.title) && nullableText(o.description) && nullableText(o.terms) && typeof o.enabled === "boolean" && typeof o.available === "boolean" && typeof o.reapproval_required === "boolean" && isTimestamp(o.updated_at) && (o.authorization_reference === undefined || (value.can_approve_offers && occasionReference(o.authorization_reference))))
    return { offer_id: o.offer_id, partner_id: o.partner_id, deal_id: o.deal_id, partner_name: o.partner_name, title: o.title, description: o.description, terms: o.terms, enabled: o.enabled, available: o.available, reapproval_required: o.reapproval_required, updated_at: o.updated_at, ...(o.authorization_reference === undefined ? {} : { authorization_reference: o.authorization_reference }) }
  })
  requireValue(unique(offers.map(o => o.offer_id)) && unique(offers.map(o => o.deal_id)) && programs.every(p => p.offer_id === null || offers.some(o => o.offer_id === p.offer_id)))
  const memberKeys = ["user_id", "membership_id", "name", "email", "employment_started_on", "updated_at", "birthday_enabled", "birthday_month", "birthday_day", "next_birthday_on", "next_anniversary_on"]
  const members = value.members.map((m: unknown): OccasionMember => {
    requireValue(isRecord(m) && Object.keys(m).every(k => memberKeys.includes(k)) && occasionUuid(m.user_id) && occasionUuid(m.membership_id) && nullableText(m.name) && text(m.email) && date(m.employment_started_on) && (m.employment_started_on === null || m.employment_started_on >= "1900-01-01") && version(m.updated_at) && typeof m.birthday_enabled === "boolean" && date(m.next_birthday_on) && date(m.next_anniversary_on))
    requireValue(m.birthday_month === null && m.birthday_day === null ? m.next_birthday_on === null : m.birthday_enabled && typeof m.birthday_month === "number" && typeof m.birthday_day === "number" && occasionDate(`2000-${String(m.birthday_month).padStart(2, "0")}-${String(m.birthday_day).padStart(2, "0")}`))
    requireValue(m.birthday_enabled || m.next_birthday_on === null)
    return Object.fromEntries(memberKeys.map(k => [k, m[k]])) as OccasionMember
  })
  requireValue(unique(members.map(m => m.user_id)) && unique(members.map(m => m.membership_id)))
  return { status: "ok", company_id: companyId, can_approve_offers: value.can_approve_offers, programs, offers, members, next_offset: value.next_offset }
}
export function parseOccasionPreview(value: unknown, companyId: string, dealId: string): OccasionPreview {
  requireValue(occasionUuid(companyId) && occasionUuid(dealId) && isRecord(value) && value.status === "ok" && value.company_id === companyId && value.deal_id === dealId && occasionUuid(value.partner_id) && text(value.partner_name) && text(value.title) && nullableText(value.description) && nullableText(value.terms) && hash(value.preview_hash))
  return { status: "ok", company_id: companyId, deal_id: dealId, partner_id: value.partner_id, partner_name: value.partner_name, title: value.title, description: value.description, terms: value.terms, preview_hash: value.preview_hash }
}
export async function loadOccasionSettings(client: Client, companyId: string, offset: number): Promise<OccasionRead> {
  const failure: OccasionRead = { status: "error", message: "Anlassvorteile konnten nicht geladen werden. Bitte den Serverstand neu laden." }
  if (!occasionUuid(companyId) || !offsetValid(offset)) return failure
  try { const { data, error } = await client.rpc("get_corporate_occasion_settings", { p_company_id: companyId, p_offset: offset }); if (error) return failure; const result = parseOccasionSettings(data, companyId); return result.next_offset !== null && result.next_offset !== offset + 50 ? failure : result } catch { return failure }
}
function fields(data: FormData, keys: string[]) { return keys.every(k => data.getAll(k).length === 1 && typeof data.get(k) === "string") }
function expected(data: FormData) { const v = data.get("expectedUpdatedAt"); return v === "" ? null : v }
function baseValid(data: FormData) { return fields(data, ["companyId", "expectedUpdatedAt"]) && occasionUuid(data.get("companyId")) && version(expected(data)) }
export async function previewOccasionOffer(client: Client, data: FormData): Promise<OccasionPreviewRead> {
  const failure: OccasionPreviewRead = { status: "error", message: "Die Angebotsvorschau konnte nicht geladen werden. Bitte erneut prüfen." }
  if (!fields(data, ["companyId", "dealId"]) || !occasionUuid(data.get("companyId")) || !occasionUuid(data.get("dealId"))) return failure
  const companyId = data.get("companyId") as string, dealId = data.get("dealId") as string
  try { const { data: result, error } = await client.rpc("admin_preview_corporate_occasion_offer", { p_company_id: companyId, p_deal_id: dealId }); if (error) return failure; if (isRecord(result) && (result.status === "not_found" || result.status === "unavailable")) return { status: result.status, message: "Dieses Angebot ist für Anlassvorteile nicht verfügbar. Bitte die Vereinbarung und das aktive einfache Partnerangebot prüfen." }; return { status: "ok", preview: parseOccasionPreview(result, companyId, dealId) } } catch { return failure }
}
async function mutate(client: Client, name: string, args: Record<string, unknown>): Promise<OccasionMutation> {
  try {
    const { data, error } = await client.rpc(name, args)
    if (error || !isRecord(data)) return occasionFailure
    if (data.status === "updated") return isTimestamp(data.updated_at) ? { status: "updated", updatedAt: data.updated_at, message: "Gespeichert. Der aktuelle Serverstand wird geladen." } : occasionFailure
    if (data.status === "conflict") return { status: "conflict", message: "Der Serverstand oder das Partnerangebot wurde inzwischen geändert. Ihre Eingaben bleiben erhalten. Bitte den Serverstand neu laden und erneut prüfen." }
    if (data.status === "invalid") return invalid
    if (data.status === "not_found" || data.status === "unavailable") return { status: data.status, message: "Firma, Person oder Angebot ist nicht mehr verfügbar. Bitte den Serverstand neu laden." }
    return occasionFailure
  } catch { return occasionFailure }
}
export async function approveOccasionOffer(client: Client, data: FormData): Promise<OccasionMutation> {
  const enabled = data.get("enabled"), reference = data.get("authorizationReference"), previewHash = data.get("previewHash")
  if (!baseValid(data) || !fields(data, ["dealId", "enabled", "authorizationReference", "previewHash", "confirmed"]) || !occasionUuid(data.get("dealId")) || data.get("confirmed") !== "true" || (enabled !== "true" && enabled !== "false") || !occasionReference(reference) || (enabled === "true" ? !hash(previewHash) : previewHash !== "")) return invalid
  return mutate(client, "admin_set_corporate_occasion_offer", { p_company_id: data.get("companyId"), p_deal_id: data.get("dealId"), p_enabled: enabled === "true", p_authorization_reference: reference, p_expected_updated_at: expected(data), p_expected_preview_hash: enabled === "true" ? previewHash : null })
}
export async function saveOccasionProgram(client: Client, data: FormData): Promise<OccasionMutation> {
  const kind = data.get("kind"), enabled = data.get("enabled"), offer = data.get("offerId"), interval = data.get("anniversaryInterval")
  if (!baseValid(data) || !fields(data, ["kind", "enabled", "offerId", "anniversaryInterval"]) || (kind !== "birthday" && kind !== "anniversary") || (enabled !== "true" && enabled !== "false") || (offer !== "" && !occasionUuid(offer)) || (enabled === "true" && offer === "") || (interval !== "1" && interval !== "5") || (kind === "birthday" && interval !== "1")) return invalid
  return mutate(client, "set_corporate_occasion_program", { p_company_id: data.get("companyId"), p_kind: kind, p_enabled: enabled === "true", p_offer_id: offer === "" ? null : offer, p_anniversary_interval: Number(interval), p_expected_updated_at: expected(data) })
}
export async function saveMemberOccasion(client: Client, data: FormData): Promise<OccasionMutation> {
  const employment = data.get("employmentStartedOn")
  if (!baseValid(data) || !fields(data, ["userId", "employmentStartedOn"]) || !occasionUuid(data.get("userId")) || (employment !== "" && (!occasionDate(employment) || employment < "1900-01-01" || employment > berlinToday()))) return invalid
  return mutate(client, "set_corporate_member_occasion", { p_company_id: data.get("companyId"), p_user_id: data.get("userId"), p_employment_started_on: employment === "" ? null : employment, p_expected_updated_at: expected(data) })
}
