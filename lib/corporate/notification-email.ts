import { ensure, hash, row, withinWindow, type Row, type Rpc } from '@/lib/stripe/corporate-contracts'
import { boundedBytes } from '@/lib/corporate/recurring-documents'
export type CorporateEmailConfig = { apiKey: string; from: string; origin: string }
export type CorporateNotice = { notification_id: string; kind: string; contract_id: string; period_id: string | null; recipient_email: string; payload: Row; payload_hash: string; lease_token: string; lease_expires_at: string; first_attempt_at: string; created_at: string }
const labels: Record<string, string> = { contract_confirmation: 'Vertragsbestätigung / Contract confirmation', renewal_notice: 'Bevorstehende Verlängerung / Renewal reminder', cancellation_confirmation: 'Kündigungseingang / Cancellation confirmation', payment_action: 'Zahlungsstatus / Payment status' }
const safeEmail = (value: string) => /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value) && value.length <= 254
export function corporateEmailConfig(env: Record<string, string | undefined>): CorporateEmailConfig | null {
  if (!env.BENEFITSI_CORPORATE_NOTIFICATION_PROVIDER) return null
  ensure(env.BENEFITSI_CORPORATE_NOTIFICATION_PROVIDER === 'resend' && /^re_[A-Za-z0-9_-]+$/.test(env.RESEND_API_KEY || '') && env.BENEFITSI_CORPORATE_FROM_EMAIL && env.BENEFITSI_CORPORATE_WEB_ORIGIN, 'notification_not_configured')
  return { apiKey: env.RESEND_API_KEY!, from: env.BENEFITSI_CORPORATE_FROM_EMAIL!, origin: env.BENEFITSI_CORPORATE_WEB_ORIGIN! }
}
export function buildCorporateEmail(n: CorporateNotice, config: CorporateEmailConfig) {
  ensure(labels[n.kind] && safeEmail(n.recipient_email) && !/[\r\n]/.test(config.from), 'invalid_notification')
  const sender = /^(?:[^<>]{1,80} <)?([^<>]+)>?$/.exec(config.from); ensure(sender && safeEmail(sender[1]), 'invalid_notification_sender')
  const origin = new URL(config.origin); ensure(origin.protocol === 'https:' && origin.origin === config.origin && !origin.username && !origin.password)
  ensure(Number.isFinite(Date.parse(n.created_at)) && /^[a-f0-9-]{36}$/.test(n.notification_id), 'invalid_notification')
  const p = n.payload, lines = [labels[n.kind], '', `Erstellt / Issued: ${n.created_at}`, `Vertrag / Contract: ${n.contract_id}`]
  const show = (label: string, value: unknown) => { if (typeof value === 'string' || typeof value === 'number') lines.push(`${label}: ${String(value).replace(/[\r\n\x00-\x1f]/g, ' ').slice(0, 500)}`) }
  if (n.kind === 'renewal_notice') {
    show('Start', p.starts_on); show('Ende exklusiv / Exclusive end', p.ends_on); show('Lizenzen / Licences', p.quantity)
    ensure(Number.isSafeInteger(p.net_total_cents) && Number(p.net_total_cents) > 0)
    lines.push(`Voraussichtlich netto / Prospective net: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(p.net_total_cents) / 100)}`)
    show('Kündigungsgrenze / Cancellation boundary (exclusive)', p.cancellation_deadline)
    lines.push('Die endgültige Menge ergibt sich aus der bezahlten Kapazität zum Jahresbeginn.', 'The final quantity is the paid capacity at the annual boundary.')
  } else if (n.kind === 'cancellation_confirmation') {
    show('Eingang / Received', p.received_at); show('Vertragsende / Effective end', p.effective_end); show('Beleg / Receipt', p.receipt_id)
  } else if (n.kind === 'contract_confirmation') {
    show('Bedingungen / Terms version', p.terms_version); show('Beleg / Receipt', p.receipt_id)
    const offer = row(p.offer), annual = row(offer.annual_snapshot)
    show('Start', annual.starts_on); show('Ende exklusiv / Exclusive end', annual.ends_on)
    lines.push('Automatische jährliche Verlängerung, kündbar bis zum letzten eingeschlossenen Nutzungstag.', 'Renews annually; cancellation is possible through the last included day.')
  } else {
    show('Zahlungsstatus / Payment state', p.payment_state)
    lines.push('Bitte den aktuellen Zahlungsstatus im Firmenbereich prüfen. Eine noch laufende Bankzahlung ist nicht bestätigt.', 'Please check the current payment status in your company account. A bank payment still processing is not confirmed.')
  }
  lines.push('', `Belege und Verwaltung / Receipts and management: ${origin.origin}/account/company`, '', 'Benefitsi · Firmenzugang / Employer access')
  const body = { from: config.from, to: [n.recipient_email], subject: `Benefitsi · ${labels[n.kind]}`, text: lines.join('\n') }
  ensure(Buffer.byteLength(JSON.stringify(body)) <= 16000, 'notification_too_large')
  return { body, idempotencyKey: `corporate-${n.notification_id}`, fingerprint: hash(body) }
}
export async function sendCorporateNotification(rpc: Rpc, config: CorporateEmailConfig | null, fetcher: typeof fetch = fetch, now = Date.now) {
  if (!config) return 0
  const claim = await rpc('claim_corporate_notifications', { p_limit: 1 })
  ensure(claim.status === 'ok' && Array.isArray(claim.notifications) && claim.notifications.length <= 1)
  if (!claim.notifications.length) return 0
  const notice = claim.notifications[0] as CorporateNotice
  const args = { p_notification_id: notice.notification_id, p_lease_token: notice.lease_token, p_payload_hash: notice.payload_hash }
  const record = (result: Row) => rpc('record_corporate_notification_result', { ...args, p_result: result })
  if (!withinWindow(notice.first_attempt_at, now()) || Date.parse(notice.lease_expires_at) - now() < 12000) { await record({ type: 'requires_review', error_code: 'notification_window_expired' }); return 0 }
  try {
    const email = buildCorporateEmail(notice, config)
    const authorized = await rpc('authorize_corporate_notification', args)
    if (authorized.status !== 'authorized') return 0
    ensure(authorized.notification_id === notice.notification_id && authorized.recipient_email === notice.recipient_email && authorized.payload_hash === notice.payload_hash && hash(authorized.payload) === hash(notice.payload), 'notification_authority_changed')
    ensure(Date.parse(notice.lease_expires_at) - now() > 10000 && withinWindow(notice.first_attempt_at, now()), 'notification_window_expired')
    const response = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': email.idempotencyKey }, body: JSON.stringify(email.body), redirect: 'error', signal: AbortSignal.timeout(8000) })
    if (!response.ok) { await record(response.status === 409 ? { type: 'requires_review', error_code: 'notification_content_conflict' } : { type: 'retryable_failure', error_code: 'notification_transport_failed', retry_after_seconds: 300 }); return 0 }
    const result = row(JSON.parse((await boundedBytes(response, 8192)).toString('utf8')))
    ensure(typeof result.id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(result.id))
    await record({ type: 'sent', provider_message_ref: result.id, response_hash: hash({ id: result.id, fingerprint: email.fingerprint }) })
    return 1 // Accepted by provider. No assertion of inbox delivery.
  } catch { await record({ type: 'retryable_failure', error_code: 'notification_unconfirmed', retry_after_seconds: 300 }); return 0 }
}
