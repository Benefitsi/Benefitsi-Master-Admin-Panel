import { timingSafeEqual } from 'node:crypto'
import { webOrigin } from '@/lib/commerce/http'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBookingBaseUrl } from '@/lib/stripe/config'
import { deliverNotifications, type Notification } from '@/lib/commerce/delivery'
import {
  buildBookingEmails,
  deliverResendEmails,
  notificationDeliveryConfig,
  type DeliveryReceipt,
} from '@/lib/commerce/notification-email'

export const maxDuration = 300

export async function POST(request: Request) {
  const expected = process.env.BENEFITSI_NOTIFICATION_WORKER_SECRET || ''
  const actual = request.headers.get('authorization')?.replace(/^Bearer /, '') || ''
  if (
    process.env.BENEFITSI_COMMERCE_ENABLED !== 'true' || expected.length < 32 ||
    Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  ) return Response.json({ error: 'Nicht autorisiert.' }, { status: 401 })

  try {
    // Never consume attempts while no complete delivery provider is configured.
    const configuration = notificationDeliveryConfig(process.env)
    if (!configuration) return Response.json({ error: 'Benachrichtigungszustellung ist nicht konfiguriert.' }, { status: 503 })
    const guestOrigin = webOrigin()
    const merchantOrigin = requireBookingBaseUrl()
    const admin = createAdminClient()
    // Two sequential ten-second sends per message remain within the five-minute lease.
    const claim = await admin.rpc('commerce_claim_notifications', { p_limit: configuration.mode === 'resend' ? 10 : 20 })
    if (claim.error) throw Error('claim_failed')

    const result = await deliverNotifications((claim.data || []) as Notification[], async message => {
      if (message.event_key === 'payment.checkout_attached') return
      if (!message.provider_id || !message.booking_id || !message.event_key) throw Error('invalid_notification')
      const provider = await admin.from('booking_providers').select('display_name,support_email').eq('id', message.provider_id).single()
      const booking = await admin.from('commerce_bookings').select('public_reference').eq('id', message.booking_id).eq('provider_id', message.provider_id).single()
      if (provider.error || booking.error) throw Error('notification_source_missing')
      const secret = await admin.from('commerce_booking_secrets').select('public_token').eq('booking_id', message.booking_id).single()
      if (secret.error) throw Error('status_link_unavailable')
      const statusUrl = new URL(`/buchung/${booking.data.public_reference}`, guestOrigin)
      statusUrl.searchParams.set('token', secret.data.public_token)
      const merchantUrl = new URL('/partner/commerce', merchantOrigin)
      merchantUrl.searchParams.set('provider', message.provider_id)

      if (configuration.mode === 'resend') {
        const emails = buildBookingEmails({
          notificationId: message.id, providerId: message.provider_id, event: message.event_key,
          payload: message.payload, provider: provider.data, guestStatusUrl: statusUrl.toString(),
          merchantUrl: merchantUrl.toString(), from: configuration.from,
        })
        await deliverResendEmails(emails, {
          apiKey: configuration.apiKey,
          begin: async email => {
            const receipt = await admin.rpc('commerce_begin_notification_delivery', {
              p_notification_id: message.id, p_lease_token: message.lease_token,
              p_audience: email.audience, p_fingerprint: email.fingerprint,
            })
            if (receipt.error || !receipt.data) throw Error('email_receipt_unavailable')
            return receipt.data as DeliveryReceipt
          },
          complete: async (email, providerMessageId) => {
            const receipt = await admin.rpc('commerce_complete_notification_delivery', {
              p_notification_id: message.id, p_lease_token: message.lease_token,
              p_audience: email.audience, p_fingerprint: email.fingerprint,
              p_provider_message_id: providerMessageId,
            })
            if (receipt.error) throw Error('email_receipt_unavailable')
          },
        })
      } else {
        // A custom processor remains responsible for audience-safe delivery and deduplication.
        const response = await fetch(configuration.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${configuration.token}`, 'idempotency-key': message.id },
          body: JSON.stringify({ id: message.id, event: message.event_key, provider: provider.data, payload: message.payload, customer_status_url: statusUrl.toString(), merchant_status_url: merchantUrl.toString() }),
          redirect: 'error', signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) throw Error('delivery_failed')
      }
    }, async (id, success, lease, error) => {
      const finished = await admin.rpc('commerce_finish_notification', { p_id: id, p_success: success, p_lease_token: lease, p_error: error })
      if (finished.error) throw Error('acknowledgement_failed')
    })
    return Response.json(result)
  } catch {
    return Response.json({ error: 'Die Benachrichtigungszustellung ist derzeit nicht verfügbar.' }, { status: 503 })
  }
}
