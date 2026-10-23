import type { SupabaseClient } from "@supabase/supabase-js"
import { boundedReference, loadCorporateBilling, positiveInteger } from "@/lib/corporate/annual"
import { isInvoiceDocument, isUuid, validInvoicePath, type InvoiceDocument } from "@/lib/corporate/companies"
import { isRecord, isTimestamp } from "@/lib/corporate/requests"

export type AnnualMutation = { status: "idle" | "quoted" | "activated" | "attached" | "invalid" | "conflict" | "unavailable" | "error"; message: string; updatedAt?: string; document?: InvoiceDocument }
export const annualInitial: AnnualMutation = { status: "idle", message: "" }
export const annualFailure: AnnualMutation = { status: "error", message: "Die Antwort konnte nicht bestätigt werden. Ihre Eingaben bleiben erhalten. Bitte unverändert erneut versuchen." }
const invalid: AnnualMutation = { status: "invalid", message: "Bitte Angebot, Beleg und ausdrückliche Zahlungsbestätigung prüfen." }
function failure(status: unknown): AnnualMutation {
  if (status === "invalid") return invalid
  if (status === "conflict") return { status, message: "Die Angaben wurden inzwischen geändert. Ihr Entwurf bleibt erhalten. Bitte aktuelle Angaben neu laden." }
  if (status === "unavailable") return { status, message: "Diese Aktion ist nicht mehr verfügbar. Bitte aktuelle Angaben neu laden." }
  return annualFailure
}
export function annualMustReload(state: AnnualMutation) { return state.status === "conflict" || state.status === "unavailable" }
function field(data: FormData, key: string): string | null { const value = data.get(key); return data.getAll(key).length === 1 && typeof value === "string" ? value : null }
function integer(value: string | null, maximum: number) { if (!value || !/^\d{1,10}$/.test(value)) return null; const number = Number(value); return positiveInteger(number, maximum) ? number : null }
type Client = Pick<SupabaseClient, "rpc" | "storage">
async function mutate(client: Pick<Client, "rpc">, name: string, params: Record<string, string | number>, extensionId: string, success: "quoted" | "activated"): Promise<AnnualMutation> {
  try {
    const { data, error } = await client.rpc(name, params)
    if (error || !isRecord(data)) return annualFailure
    if (data.status !== success) return failure(data.status)
    if (data.extension_id !== extensionId || !isTimestamp(data.updated_at) || (success === "activated" && typeof data.replayed !== "boolean")) return annualFailure
    return { status: success, updatedAt: data.updated_at, message: success === "quoted" ? "Erweiterungsangebot gespeichert. Annahme und Zahlung stehen noch aus; bezahlte Plätze bleiben nutzbar." : "Extern geprüfte Zahlung bestätigt. Die zusätzlichen Plätze sind für das bestehende Firmenjahr freigegeben." }
  } catch { return annualFailure }
}
export async function quoteCorporateSeatExtension(client: Pick<Client, "rpc">, data: FormData): Promise<AnnualMutation> {
  const company = field(data, "companyId"), id = field(data, "extensionId"), expected = field(data, "expectedUpdatedAt"), quantity = integer(field(data, "additionalSeats"), 10000), amount = integer(field(data, "netAmountCents"), 2147483647), reference = field(data, "invoiceReference")
  if (!isUuid(company) || !isUuid(id) || !isTimestamp(expected) || !quantity || !amount || !boundedReference(reference) || !reference.trim()) return invalid
  return mutate(client, "admin_quote_corporate_seat_extension", { p_extension_id: id, p_expected_updated_at: expected, p_additional_seats: quantity, p_net_amount_cents: amount, p_invoice_reference: reference.trim() }, id, "quoted")
}
export async function confirmCorporateSeatExtension(client: Pick<Client, "rpc">, data: FormData): Promise<AnnualMutation> {
  const company = field(data, "companyId"), id = field(data, "extensionId"), expected = field(data, "expectedUpdatedAt"), reference = field(data, "paymentReference")
  if (!isUuid(company) || !isUuid(id) || !isTimestamp(expected) || field(data, "paymentConfirmed") !== "true" || !boundedReference(reference) || !reference.trim()) return invalid
  return mutate(client, "admin_confirm_corporate_seat_extension", { p_extension_id: id, p_expected_updated_at: expected, p_payment_reference: reference.trim() }, id, "activated")
}
export const MAX_INVOICE_BYTES = 10 * 1024 * 1024
function validPdf(bytes: Uint8Array) { return bytes.length >= 8 && bytes.length <= MAX_INVOICE_BYTES && [37, 80, 68, 70, 45].every((b, i) => bytes[i] === b) }
export async function attachCorporateInvoiceDocument(client: Client, data: FormData): Promise<AnnualMutation> {
  const company = field(data, "companyId"), extension = field(data, "extensionId"), reference = field(data, "invoiceReference"), documentId = field(data, "documentId"), file = data.get("invoice")
  if (!isUuid(company) || (extension !== "" && !isUuid(extension)) || !isUuid(documentId) || !boundedReference(reference) || !reference.trim()
    || data.getAll("invoice").length !== 1 || !file || typeof file === "string" || file.type !== "application/pdf" || file.size < 8 || file.size > MAX_INVOICE_BYTES) return invalid
  const path = `${company}/${documentId}.pdf`
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!validPdf(bytes)) return invalid
    // Resolve the actual company/extension reference before uploading. Failed or
    // ambiguous retries keep this same immutable path; storage never upserts.
    const billing = await loadCorporateBilling(client, company)
    if (billing.status !== "ok") return annualFailure
    const target = extension === "" ? billing.agreement : billing.extensions.find(row => row.extension_id === extension)
    if (!target || target.invoice_reference !== reference.trim()) return failure("conflict")
    if (target.invoice_document && target.invoice_document.storage_path !== path) return failure("conflict")
    const bucket = client.storage.from("corporate-invoices")
    if (target.invoice_document) {
      const existing = await bucket.download(path)
      if (existing.error || !existing.data) return annualFailure
      const stored = new Uint8Array(await existing.data.arrayBuffer())
      if (stored.length !== bytes.length || !bytes.every((byte, index) => stored[index] === byte)) return failure("conflict")
    } else {
      const uploaded = await bucket.upload(path, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "0" })
      if (uploaded.error) {
        // A lost upload response may leave our immutable PDF in storage. Only
        // reuse it after a byte-for-byte authenticated read, never replace it.
        const existing = await bucket.download(path)
        if (existing.error || !existing.data || existing.data.size !== bytes.length) return annualFailure
        const stored = new Uint8Array(await existing.data.arrayBuffer())
        if (!bytes.every((byte, index) => stored[index] === byte)) return failure("conflict")
      }
    }
    const { data: result, error } = await client.rpc("admin_attach_corporate_invoice", { p_company_id: company, p_extension_id: extension || null, p_invoice_reference: reference.trim(), p_storage_path: path })
    if (error || !isRecord(result)) return annualFailure
    if (result.status !== "attached") return failure(result.status)
    if (typeof result.replayed !== "boolean" || !isInvoiceDocument(result.document, company, reference.trim()) || result.document.storage_path !== path) return annualFailure
    return { status: "attached", document: result.document, message: "Tatsächlicher Rechnungsbeleg unveränderlich zugeordnet. Dies bestätigt keinen Zahlungseingang." }
  } catch { return annualFailure }
}
export async function readCorporateInvoiceDocument(client: Client, companyId: string, extensionId: string | null): Promise<{ url: string } | null> {
  if (!isUuid(companyId) || (extensionId !== null && !isUuid(extensionId))) return null
  const billing = await loadCorporateBilling(client, companyId)
  if (billing.status !== "ok") return null
  const document = (extensionId === null ? billing.agreement : billing.extensions.find(row => row.extension_id === extensionId))?.invoice_document
  if (!document || !validInvoicePath(document.storage_path, companyId)) return null
  try {
    const { data, error } = await client.storage.from("corporate-invoices").createSignedUrl(document.storage_path, 60, { download: true })
    if (error || !data?.signedUrl || new URL(data.signedUrl).protocol !== "https:") return null
    return { url: data.signedUrl }
  } catch { return null }
}
