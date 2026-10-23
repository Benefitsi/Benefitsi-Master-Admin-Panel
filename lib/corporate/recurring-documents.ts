import { createHash } from 'node:crypto'
import type { CorporateProvider } from '@/lib/stripe/corporate-provider'
import { ensure, providerUrl, type BillingIntent, type Row, type Rpc } from '@/lib/stripe/corporate-contracts'
export type ReconciliationContext = Row & { operation_id: string; company_id: string; period_id: string; period_version: string; intent: BillingIntent; documents: Row[]; document_refs: string[] }
export type DocumentStorage = { from(bucket: string): { upload(path: string, bytes: Uint8Array, options: { contentType: string; upsert: false; metadata: { sha256: string } }): Promise<{ error: { message: string } | null }>; download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }> } }
const limit = 4194304
export async function boundedBytes(response: Response, maximum = limit) {
  ensure(response.ok && response.body && Number(response.headers.get('content-length') || 0) <= maximum, 'document_transport_failed')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; ensure(size <= maximum, 'document_too_large'); chunks.push(next.value) } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  ensure(size > 0, 'document_empty'); return Buffer.concat(chunks)
}
export async function downloadOriginal(url: string, fetcher: typeof fetch = fetch) {
  const safe = providerUrl(url, 'document')
  return boundedBytes(await fetcher(safe, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/pdf' } }))
}
export function validateOriginal(bytes: Uint8Array, format: string) {
  ensure(bytes.byteLength > 0 && bytes.byteLength <= limit, 'invalid_document')
  const content = Buffer.from(bytes)
  if (format === 'pdf_original') ensure(content.subarray(0, 8).toString('ascii').startsWith('%PDF-') && content.subarray(-1024).toString('ascii').includes('%%EOF'), 'invalid_pdf_original')
  else if (format === 'xml_original') { const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes); ensure(!xml.includes('\0') && !/<!\s*(DOCTYPE|ENTITY)/i.test(xml) && /^\s*(?:<\?xml[^>]*>\s*)?</.test(xml), 'unsafe_xml_original') }
  else throw Error('structured_invoice_adapter_not_configured')
  return createHash('sha256').update(bytes).digest('hex')
}
export async function attachProviderOriginal(context: ReconciliationContext, provider: CorporateProvider, rpc: Rpc, storage: DocumentStorage | null, fetcher: typeof fetch = fetch) {
  const intent = context.intent
  if (context.documents.some(d => d.invoice_ref === intent.invoice_ref && d.format === intent.billing_profile.invoice_format)) return context
  ensure(storage && intent.billing_profile.invoice_format === 'pdf_original', 'structured_invoice_adapter_not_configured')
  const { invoice } = await provider.invoice(intent)
  if (invoice.status === 'draft') return context
  ensure(invoice.invoice_pdf, 'invoice_document_pending')
  const bytes = await downloadOriginal(invoice.invoice_pdf, fetcher), sha256 = validateOriginal(bytes, 'pdf_original')
  // Stable object identity across a lost upload/attach response; never overwrite an original.
  const digest = createHash('sha256').update(`${intent.provider_account_ref}/${invoice.id}/${sha256}`).digest('hex')
  const documentId = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`
  const path = `${context.company_id}/${documentId}.pdf`, bucket = storage.from('corporate-period-documents')
  const upload = await bucket.upload(path, bytes, { contentType: 'application/pdf', upsert: false, metadata: { sha256 } })
  if (upload.error) { const existing = await bucket.download(path); ensure(!existing.error && existing.data && existing.data.size <= limit, 'document_upload_failed'); ensure(validateOriginal(new Uint8Array(await existing.data.arrayBuffer()), 'pdf_original') === sha256, 'document_upload_conflict') }
  const attached = await rpc('attach_corporate_period_document', { p_period_id: context.period_id, p_expected_version: context.period_version, p_document_evidence: { document_id: documentId, storage_path: path, sha256, size_bytes: bytes.byteLength, format: 'pdf_original', invoice_ref: invoice.id, provider_account_ref: intent.provider_account_ref, environment: 'test', source_ref: invoice.invoice_pdf, validation_evidence_ref: null } })
  ensure(attached.status === 'attached', 'document_attachment_conflict')
  const current = await rpc('get_corporate_reconciliation_context', { p_environment: 'test', p_provider_account_ref: intent.provider_account_ref, p_reference_kind: 'invoice', p_reference: invoice.id })
  ensure(current.status === 'ok' && current.operation_id === context.operation_id, 'reconciliation_context_changed')
  return current as ReconciliationContext
}
