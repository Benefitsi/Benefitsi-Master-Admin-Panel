import { createHash } from 'node:crypto'

type Row = Record<string, unknown>
type Audience = 'guest' | 'merchant'
export type BookingEmail = {
  audience: Audience
  idempotencyKey: string
  fingerprint: string
  body: { from: string; to: string[]; subject: string; text: string; html: string }
}
export type DeliveryReceipt = { state: 'pending' | 'sent'; first_attempt_at: string; request_fingerprint: string }
function row(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_notification')
  return value as Row
}
function text(value: unknown, max = 2000) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : ''
}
function emailAddress(value: unknown) {
  if (typeof value !== 'string' || value.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value)) {
    throw new Error('invalid_notification_address')
  }
  return value
}
export function notificationSender(value: string) {
  if (/[\r\n]/.test(value)) throw new Error('invalid_notification_sender')
  const named = /^([^<>]{1,80}) <([^<>]+)>$/.exec(value)
  emailAddress(named ? named[2] : value)
  return value
}
function escape(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}
function safeUrl(value: string) {
  const url = new URL(value)
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('invalid_notification_url')
  return url
}
const states: Record<string, string> = { payment_pending: 'Zahlung noch offen', pending: 'Bestellung eingegangen', accepted: 'Bestellung angenommen', ready: 'Abholbereit', confirmed: 'Reservierung bestätigt', completed: 'Abgeschlossen', cancelled: 'Storniert', expired: 'Reservierung abgelaufen' }
const payments: Record<string, string> = { unpaid: 'Zahlung vor Ort / kostenlose Reservierung', pending: 'Onlinezahlung noch offen', paid: 'Bezahlt', failed: 'Zahlung nicht abgeschlossen', refund_pending: 'Erstattung wird bearbeitet', refunded: 'Erstattet' }
const events = new Set(['booking.created', 'booking.accept', 'booking.ready', 'booking.complete', 'booking.cancel', 'booking.mark_paid', 'payment.paid', 'payment.failed', 'payment.expired', 'payment.refunded'])

export function buildBookingEmails(input: {
  notificationId: string; providerId: string; event: string; payload: unknown
  provider: { display_name: unknown; support_email: unknown }
  guestStatusUrl: string; merchantUrl: string; from: string
}): BookingEmail[] {
  // Session attachment is an internal state update, already represented by booking.created.
  if (input.event === 'payment.checkout_attached') return []
  if (!events.has(input.event) || !/^[a-f0-9-]{36}$/i.test(input.notificationId)) throw new Error('invalid_notification_event')
  const payload = row(input.payload), booking = row(payload.booking), customer = row(payload.customer)
  const reference = text(booking.public_reference, 40)
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(reference) || booking.currency !== 'eur' || !Number.isSafeInteger(booking.total_amount) || Number(booking.total_amount) < 0) throw new Error('invalid_notification_booking')
  const guest = emailAddress(customer.email)
  const merchant = input.provider.support_email ? emailAddress(input.provider.support_email) : null
  const from = notificationSender(input.from)
  const guestUrl = safeUrl(input.guestStatusUrl), merchantUrl = safeUrl(input.merchantUrl)
  if (guestUrl.pathname !== `/buchung/${reference}` || !/^[a-f0-9]{64}$/i.test(guestUrl.searchParams.get('token') || '') || merchantUrl.pathname !== '/partner/commerce' || merchantUrl.searchParams.has('token') || merchantUrl.searchParams.get('provider') !== input.providerId) throw new Error('invalid_notification_url')
  const date = new Date(text(booking.starts_at))
  if (!Number.isFinite(date.getTime())) throw new Error('invalid_notification_time')
  const when = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
  const amount = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(booking.total_amount) / 100)
  const status = booking.payment_state === 'refund_pending' ? 'Erstattung wird bearbeitet' : (booking.state === 'ready' && booking.fulfillment_mode === 'delivery' ? 'Lieferbereit' : states[String(booking.state)])
  if (!status || !payments[String(booking.payment_state)]) throw new Error('invalid_notification_state')
  const providerName = text(input.provider.display_name, 160) || 'Dein Betrieb'
  const details = [
    `Betrieb: ${providerName}`, `Referenz: ${reference}`, `Leistung: ${text(booking.title, 160)}`,
    `Termin: ${when} Uhr (deutsche Ortszeit)`, `Anzahl: ${Number(booking.quantity) || 1}`,
    `Status: ${status}`, `Zahlung: ${payments[String(booking.payment_state)]}`, `Gesamt: ${amount}`,
  ]
  if (booking.kind === 'food_pickup') {
    const money=(value:unknown)=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(value)/100)
    details.push(`Erfüllung: ${booking.fulfillment_mode==='delivery'?'Lieferung':'Abholung'}`)
    if(Number.isSafeInteger(booking.subtotal_amount)) details.push(`Zwischensumme: ${money(booking.subtotal_amount)}`)
    if(Number.isSafeInteger(booking.delivery_fee)) details.push(`Liefergebühr: ${money(booking.delivery_fee)}`)
    if(booking.fulfillment_mode==='delivery' && booking.delivery_address) {
      const address=row(booking.delivery_address)
      details.push(`Lieferadresse: ${text(address.street,200)}, ${text(address.postal_code,5)} ${text(address.city,120)}`)
      if(text(address.details,500)) details.push(`Lieferhinweis: ${text(address.details,500)}`)
    } else if(text(booking.pickup_address,500)) details.push(`Abholadresse: ${text(booking.pickup_address,500)}`)
  }
  if (Array.isArray(booking.items)) for (const value of booking.items.slice(0, 50)) {
    const item = row(value)
    const extras = Array.isArray(item.extras) ? item.extras.map(value => text(row(value).title, 120)).filter(Boolean).join(', ') : ''
    const variant=item.variant ? text(row(item.variant).title,120) : ''
    const options=Array.isArray(item.options)?item.options.map(value=>text(row(value).title,120)).filter(Boolean).join(', '):''
    const removed=Array.isArray(item.removed_ingredients)?item.removed_ingredients.map(value=>text(row(value).title,120)).filter(Boolean).join(', '):''
    if(variant) details.push(`Größe: ${variant}`)
    if(options) details.push(`Auswahl: ${options}`)
    if(removed) details.push(`Ohne: ${removed}`)
    if(text(item.note,500)) details.push(`Gerichthinweis: ${text(item.note,500)}`)
    details.push(`${Number(item.quantity) || 1} × ${text(item.title, 160)}${extras ? ` (${extras})` : ''}`)
  }
  if (text(customer.notes, 1000)) details.push(`Hinweis: ${text(customer.notes, 1000)}`)
  if (booking.payment_state === 'pending') details.push('Die Onlinezahlung ist noch nicht bestätigt. Bitte den aktuellen Buchungsstatus prüfen.')
  return (['guest', ...(merchant ? ['merchant'] : [])] as Audience[]).map(audience => {
    const link = audience === 'guest' ? guestUrl.toString() : merchantUrl.toString()
    const greeting = audience === 'guest' ? `Hallo ${text(customer.name, 120) || 'Gast'},` : `Hallo ${providerName},`
    const lines = [greeting, '', `Neuigkeiten ${audience === 'guest' ? 'zu deiner' : 'zur'} Buchung: ${status}.`, '', ...details]
    if (audience === 'merchant') lines.push(`Gast: ${text(customer.name, 120)}`, `Kontakt: ${guest}${text(customer.phone, 40) ? ` · ${text(customer.phone, 40)}` : ''}`)
    const label = audience === 'guest' ? 'Buchungsstatus ansehen' : 'Im Partnerbereich öffnen'
    lines.push('', `${label}: ${link}`, '', audience === 'guest' ? 'Dieser persönliche Link ermöglicht Zugriff auf deine Buchung. Bitte nicht weitergeben.' : 'Zum Öffnen ist dein Partnerzugang erforderlich.', '', 'Benefitsi · Automatische Buchungsnachricht')
    const body = {
      from, to: [audience === 'guest' ? guest : merchant!], subject: `Benefitsi · ${status} · ${reference}`,
      text: lines.join('\n'),
      html: `<!doctype html><html lang="de"><body style="font-family:Arial,sans-serif;color:#061829;line-height:1.6"><main style="max-width:600px;margin:auto;padding:24px"><h1 style="font-size:24px">${escape(status)}</h1>${lines.filter(line => !line.includes(link)).map(line => line ? `<p>${escape(line).replace(/\n/g, '<br>')}</p>` : '').join('')}<p><a href="${escape(link)}" style="color:#087cd9">${escape(label)}</a></p></main></body></html>`,
    }
    return { audience, body, idempotencyKey: `benefitsi-booking-${input.notificationId}-${audience}`, fingerprint: createHash('sha256').update(JSON.stringify(body)).digest('hex') }
  })
}

export async function deliverResendEmails(emails: BookingEmail[], dependencies: {
  apiKey: string
  begin: (email: BookingEmail) => Promise<DeliveryReceipt>
  complete: (email: BookingEmail, providerMessageId: string) => Promise<void>
  fetcher?: typeof fetch
  now?: number
}) {
  if (!/^re_[A-Za-z0-9_-]+$/.test(dependencies.apiKey)) throw new Error('email_delivery_not_configured')
  for (const email of emails) {
    const receipt = await dependencies.begin(email)
    if (receipt.state === 'sent') continue
    if (receipt.request_fingerprint !== email.fingerprint) throw new Error('email_delivery_content_changed')
    const age = (dependencies.now ?? Date.now()) - Date.parse(receipt.first_attempt_at)
    if (!Number.isFinite(age) || age < -60_000 || age >= 23 * 60 * 60 * 1000) throw new Error('email_delivery_requires_reconciliation')
    let response: Response
    try {
      response = await (dependencies.fetcher || fetch)('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${dependencies.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': email.idempotencyKey },
        body: JSON.stringify(email.body), redirect: 'error', signal: AbortSignal.timeout(10_000),
      })
    } catch { throw new Error('email_delivery_failed') }
    if (!response.ok) throw new Error('email_delivery_failed')
    const result = await response.json().catch(() => null) as { id?: unknown } | null
    if (!result || typeof result.id !== 'string' || !result.id || result.id.length > 200 || /[\r\n]/.test(result.id)) throw new Error('email_delivery_failed')
    await dependencies.complete(email, result.id)
  }
}

export function notificationDeliveryConfig(env: Record<string, string | undefined>) {
  const mode = env.BENEFITSI_NOTIFICATION_PROVIDER?.trim()
  const apiKey = env.RESEND_API_KEY?.trim(), from = env.BENEFITSI_BOOKING_FROM_EMAIL?.trim()
  if (mode === 'resend' || (!mode && apiKey && from)) {
    if (!apiKey || !/^re_[A-Za-z0-9_-]+$/.test(apiKey) || !from) throw new Error('email_delivery_not_configured')
    return { mode: 'resend' as const, apiKey, from: notificationSender(from) }
  }
  const endpoint = env.BENEFITSI_NOTIFICATION_DELIVERY_URL, token = env.BENEFITSI_NOTIFICATION_DELIVERY_TOKEN
  if (mode === 'adapter' || (!mode && endpoint && token)) {
    if (!endpoint || !token) throw new Error('notification_adapter_not_configured')
    const url = safeUrl(endpoint)
    if (url.protocol !== 'https:') throw new Error('notification_adapter_not_configured')
    return { mode: 'adapter' as const, url, token }
  }
  if (mode) throw new Error('notification_provider_not_configured')
  return null
}
