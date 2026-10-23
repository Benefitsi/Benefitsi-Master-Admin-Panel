import { createHash } from 'node:crypto'
import { berlinDateTime } from '@/lib/commerce/time'

export type Row = Record<string, unknown>
export type Rpc = (name: string, args: Row) => Promise<Row>
export type Recipient = { legal_name: string; address_line1: string; address_line2: string | null; postal_code: string; city: string; country: 'DE'; tax_id: { type: string; value: string } | null; confirmed: true }
export type BillingProfile = { environment: 'test'; provider_account_ref: string; billing_identity_ref: string; tax_profile_ref: string; operator_name: string; operator_address: string; operator_email: string; tax_mode: 'explicit_rate' | 'explicit_exempt'; tax_basis_points: number; tax_country: 'DE'; invoice_format: 'pdf_original' | 'xml_original' | 'zugferd_original'; invoice_format_evidence_ref: string; release_evidence_ref: string; released: true; return_origin: string; recovery_enabled?: boolean }
export type BillingIntent = { operation_id: string; company_id: string; contract_id: string; period_id: string | null; environment: 'test'; provider_account_ref: string; customer_ref: string | null; invoice_ref: string | null; setup_session_ref: string | null; payment_method_ref: string | null; starts_on: string; ends_on: string; timezone: 'Europe/Berlin'; quantity: number; unit_net_cents: number; net_total_cents: number; currency: 'EUR'; terms_hash: string; offer_hash: string; payload_hash: string; expected_version: string; recipient_id: string; recipient_hash: string; recipient_snapshot: Recipient; billing_profile: BillingProfile; tax_profile_ref: string; billing_identity_ref: string; return_origin: string }
export type Operation = { operation_id: string; setup_request_id: string | null; root_operation_id: string | null; next_operation_id: string | null; kind: 'setup_customer' | 'setup_session' | 'verify_setup' | 'create_invoice' | 'finalize_invoice' | 'collect_invoice' | 'sync_payment' | 'enable_invoice_recovery' | 'cancel_invoice'; period_id: string | null; contract_id: string; payload_hash: string; expected_version: string; lease_token: string; lease_expires_at: string; first_attempt_at: string; provider_object_ref: string | null; intent: BillingIntent }
export type CollectionState = 'not_attempted' | 'processing' | 'requires_action' | 'failed' | 'succeeded'
export function ensure(value: unknown, code = 'provider_evidence_mismatch'): asserts value { if (!value) throw new Error(code) }
export function row(value: unknown): Row { ensure(value && typeof value === 'object' && !Array.isArray(value), 'invalid'); return value as Row }
export function ref(value: unknown): string | null { return typeof value === 'string' ? value : value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' ? value.id : null }
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function providerUrl(value: unknown, kind: 'checkout' | 'invoice' | 'document') {
  ensure(typeof value === 'string' && value.length <= 4096, 'unsafe_provider_url')
  const url = new URL(value)
  const hosts = kind === 'checkout' ? ['checkout.stripe.com'] : kind === 'invoice' ? ['invoice.stripe.com'] : ['pay.stripe.com', 'invoice.stripe.com', 'files.stripe.com']
  ensure(url.protocol === 'https:' && !url.username && !url.password && !url.port && hosts.includes(url.hostname), 'unsafe_provider_url')
  return url.href
}
export function metadata(intent: BillingIntent, period = true) {
  return { benefitsi_scope: 'corporate_annual', company_id: intent.company_id, contract_id: intent.contract_id, ...(period ? { period_id: intent.period_id!, recipient_hash: intent.recipient_hash, terms_hash: intent.terms_hash } : {}) }
}
export function assertMetadata(value: Record<string, string> | null, intent: BillingIntent, period = true) {
  ensure(value && Object.entries(metadata(intent, period)).every(([k, v]) => value[k] === v))
}
export function recipientAddress(r: Recipient) { return { line1: r.address_line1, line2: r.address_line2 || '', city: r.city, postal_code: r.postal_code, country: r.country } }
export function assertRecipient(name: unknown, address: unknown, intent: BillingIntent) {
  const a = row(address), r = intent.recipient_snapshot
  ensure(name === r.legal_name && a.line1 === r.address_line1 && (a.line2 || null) === r.address_line2 && a.city === r.city && a.postal_code === r.postal_code && a.country === r.country)
}
export function periodSeconds(intent: BillingIntent) { return { start: Date.parse(berlinDateTime(`${intent.starts_on}T00:00`)) / 1000, end: Date.parse(berlinDateTime(`${intent.ends_on}T00:00`)) / 1000 - 1 } }
export function assertProfile(intent: BillingIntent, account: string, origin: string) {
  const p = intent.billing_profile, r = intent.recipient_snapshot
  ensure(intent.environment === 'test' && intent.provider_account_ref === account && p.environment === 'test' && p.provider_account_ref === account, 'provider_account_mismatch')
  ensure(p.released === true && p.operator_name && p.operator_address && p.operator_email && p.billing_identity_ref && p.tax_profile_ref && p.release_evidence_ref && p.invoice_format_evidence_ref && p.tax_country === 'DE' && p.return_origin === origin && intent.return_origin === origin, 'billing_not_configured')
  ensure(intent.billing_identity_ref === p.billing_identity_ref && intent.tax_profile_ref === p.tax_profile_ref && r.confirmed === true && r.country === 'DE' && r.legal_name && r.address_line1 && /^\d{5}$/.test(r.postal_code) && r.city && /^[a-f0-9]{64}$/.test(intent.recipient_hash), 'billing_not_configured')
  ensure((p.tax_mode === 'explicit_exempt' && p.tax_basis_points === 0) || (p.tax_mode === 'explicit_rate' && /^txr_/.test(p.tax_profile_ref) && Number.isInteger(p.tax_basis_points) && p.tax_basis_points > 0 && p.tax_basis_points <= 10000), 'billing_not_configured')
}
export function withinWindow(first: string, now: number) { const age = now - Date.parse(first); return Number.isFinite(age) && age >= -60_000 && age < 23 * 3600_000 }
