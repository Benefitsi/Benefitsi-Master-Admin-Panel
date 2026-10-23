import type { CorporateClient, CorporateCompany, InvoiceDocument } from "@/lib/corporate/companies"
import { isDate, isInvoiceDocument, isUuid, parseCorporateCompany } from "@/lib/corporate/companies"
import { isRecord, isTimestamp } from "@/lib/corporate/requests"

export type CorporateExtension = {
  extension_id: string; company_id: string; requested_by: string; additional_seats: number
  status: "requested" | "quoted" | "accepted" | "activated"; net_amount_cents: number | null; currency: "EUR"
  starts_on: string | null; ends_on: string; invoice_reference: string; invoice_document: InvoiceDocument | null
  payment_reference: string; accepted_at: string | null; accepted_by: string | null
  accepted_snapshot: Record<string, unknown> | null; activated_at: string | null; created_at: string; updated_at: string
}
export type CorporateBilling = { status: "ok"; agreement: CorporateCompany; extensions: CorporateExtension[] } | { status: "error"; message: string }
export const billingFailure: CorporateBilling = { status: "error", message: "Abrechnung konnte nicht bestätigt werden. Bitte aktuelle Angaben neu laden." }
export const extensionStatusLabels = { requested: "Angefragt", quoted: "Angebot offen", accepted: "Angebot angenommen · Zahlung offen", activated: "Zahlung bestätigt · Plätze freigegeben" } as const
export function boundedReference(value: unknown): value is string { return typeof value === "string" && value.length <= 640 && [...value.trim()].length <= 160 && !/[\u0000-\u001f\u007f]/.test(value) }
export function positiveInteger(value: unknown, maximum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum }
function parseExtension(value: unknown, company: CorporateCompany): CorporateExtension | null {
  if (!isRecord(value) || !isUuid(value.extension_id) || value.company_id !== company.company_id || !isUuid(value.requested_by)
    || !positiveInteger(value.additional_seats, 10000) || value.currency !== "EUR" || value.ends_on !== company.ends_on
    || typeof value.status !== "string" || !Object.hasOwn(extensionStatusLabels, value.status)
    || !isTimestamp(value.created_at) || !isTimestamp(value.updated_at) || !boundedReference(value.invoice_reference) || !boundedReference(value.payment_reference)) return null
  const quoted = value.status !== "requested", accepted = value.status === "accepted" || value.status === "activated"
  if (quoted ? !positiveInteger(value.net_amount_cents, 2147483647) || !isDate(value.starts_on) || value.starts_on >= company.ends_on || !value.invoice_reference.trim()
    : value.net_amount_cents !== null || value.starts_on !== null || value.invoice_reference !== "") return null
  if (accepted ? !isTimestamp(value.accepted_at) || !isUuid(value.accepted_by) || !isRecord(value.accepted_snapshot)
    : value.accepted_at !== null || value.accepted_by !== null || value.accepted_snapshot !== null) return null
  if (value.status === "activated" ? !isTimestamp(value.activated_at) || !value.payment_reference.trim() || !value.invoice_document
    : value.activated_at !== null || value.payment_reference !== "") return null
  if (value.invoice_document !== null && !isInvoiceDocument(value.invoice_document, company.company_id, value.invoice_reference)) return null
  return value as CorporateExtension
}
export async function loadCorporateBilling(client: CorporateClient, companyId: string): Promise<CorporateBilling> {
  if (!isUuid(companyId)) return billingFailure
  try {
    const { data, error } = await client.rpc("get_corporate_billing", { p_company_id: companyId })
    if (error || !isRecord(data) || data.status !== "ok" || !Array.isArray(data.extensions)) return billingFailure
    const agreement = parseCorporateCompany(data.agreement)
    if (!agreement || agreement.company_id !== companyId) return billingFailure
    const extensions = data.extensions.map(value => parseExtension(value, agreement))
    if (extensions.some(value => !value) || new Set(extensions.map(value => value!.extension_id)).size !== extensions.length) return billingFailure
    return { status: "ok", agreement, extensions: extensions as CorporateExtension[] }
  } catch { return billingFailure }
}
