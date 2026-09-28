import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { getStripeTestClient, requireStripeWebhookSecret } from "@/lib/stripe/config"
import { settleCommercePayment } from "@/lib/stripe/commerce-event"
import { settleCancellation } from "@/lib/commerce/service"
import { validateDirectBookingEvent } from "@/lib/stripe/direct-contracts"

const allowedBookingEvents = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired", "charge.refunded",
])

type BookingSnapshot = {
  id: string
  stripe_account_id: string
  total_amount: number
  currency: string
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature")
  if (!signature) return NextResponse.json({ error: "Signatur fehlt." }, { status: 400 })
  const payload = await request.text()
  let event: Stripe.Event
  try {
    event = getStripeTestClient().webhooks.constructEvent(payload, signature, requireStripeWebhookSecret())
  } catch {
    return NextResponse.json({ error: "Ungültige Signatur." }, { status: 400 })
  }
  if (event.livemode) return NextResponse.json({ error: "Live-Webhooks sind nicht freigegeben." }, { status: 403 })
  if (!event.account || !/^acct_[A-Za-z0-9]+$/.test(event.account)) {
    return NextResponse.json({ error: "Connected-Account-Zuordnung fehlt." }, { status: 400 })
  }

  try {
    const payloadHash = createHash("sha256").update(payload).digest("hex")
    const admin = createAdminClient()
    if (event.type === "account.updated") {
      const account = event.data.object
      if (account.id !== event.account) return NextResponse.json({ error: "Händlerkonto stimmt nicht überein." }, { status: 400 })
      const compatible = account.controller?.fees?.payer === "account" &&
        account.controller?.losses?.payments === "stripe" &&
        account.controller?.stripe_dashboard?.type === "full"
      const result = await admin.rpc("apply_stripe_provider_event", {
        p_event_id: event.id, p_livemode: false, p_payload_sha256: payloadHash,
        p_stripe_account_id: account.id,
        p_charges_enabled: compatible && account.charges_enabled,
        p_payouts_enabled: compatible && account.payouts_enabled,
        p_details_submitted: compatible && account.details_submitted,
      })
      return webhookResult(result.error)
    }
    if (!allowedBookingEvents.has(event.type)) return NextResponse.json({ received: true, ignored: true })

    const object = event.data.object as Stripe.Checkout.Session | Stripe.Charge
    const paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id || null
    const metadata = object.metadata
    let commerce = Boolean(metadata?.benefitsi_commerce_booking_id)
    const bookingId = metadata?.benefitsi_commerce_booking_id || metadata?.benefitsi_booking_id
    const fields = "id,stripe_account_id,total_amount,currency,stripe_checkout_session_id,stripe_payment_intent_id"
    let booking: BookingSnapshot | null = null
    if (bookingId) {
      const result = await admin.from(commerce ? "commerce_bookings" : "bookings")
        .select(fields).eq("id", bookingId).eq("stripe_account_id", event.account).maybeSingle()
      if (result.error) return webhookResult(result.error)
      booking = result.data
    } else if (paymentIntentId) {
      // Refund metadata can be absent; the persisted merchant + payment identify the owner.
      const result = await admin.from("commerce_bookings").select(fields)
        .eq("stripe_payment_intent_id", paymentIntentId).eq("stripe_account_id", event.account).maybeSingle()
      if (result.error) return webhookResult(result.error)
      booking = result.data
      commerce = Boolean(booking)
      if (!booking) {
        const legacy = await admin.from("bookings").select(fields)
          .eq("stripe_payment_intent_id", paymentIntentId).eq("stripe_account_id", event.account).maybeSingle()
        if (legacy.error) return webhookResult(legacy.error)
        booking = legacy.data
      }
    }
    if (!booking) {
      // The connected account can accept unrelated payments through its own Dashboard.
      return NextResponse.json({ received: true, ignored: true })
    }
    const disposition = validateDirectBookingEvent(event, {
      accountId: booking.stripe_account_id, totalAmount: booking.total_amount,
      currency: booking.currency, checkoutSessionId: booking.stripe_checkout_session_id,
      paymentIntentId: booking.stripe_payment_intent_id,
    })
    if (disposition === "pending" || disposition === "partial_refund") {
      return NextResponse.json({ received: true, pending: true })
    }
    const isSession = event.type.startsWith("checkout.session.")
    const sessionId = isSession ? object.id : booking.stripe_checkout_session_id
    const refundId = !isSession ? (object as Stripe.Charge).refunds?.data.find((refund) => refund.status === "succeeded")?.id || null : null
    if (commerce) {
      const result = await admin.rpc("commerce_apply_payment", { p_event: {
        event_id: event.id, type: disposition, booking_id: booking.id,
        account_id: event.account, session_id: sessionId, payment_intent_id: paymentIntentId,
        refund_id: refundId, amount_total: booking.total_amount, currency: booking.currency, livemode: false,
      } })
      if (result.error) return webhookResult(result.error)
      await settleCommercePayment(result.data, (id) => settleCancellation(admin, id))
      return webhookResult(null)
    }
    const result = await admin.rpc("apply_stripe_booking_event", {
      p_event_id: event.id,
      p_event_type: event.type === "checkout.session.async_payment_succeeded" ? "checkout.session.completed" : event.type,
      p_livemode: false, p_payload_sha256: payloadHash, p_booking_id: booking.id,
      p_object_id: object.id, p_checkout_session_id: isSession ? sessionId : null,
      p_payment_intent_id: paymentIntentId, p_charge_id: isSession ? null : object.id,
      p_amount_total: booking.total_amount, p_stripe_account_id: event.account,
    })
    return webhookResult(result.error)
  } catch {
    // Fail closed and allow delivery retry for transient DB/attachment races.
    return NextResponse.json({ error: "Webhook konnte nicht sicher verarbeitet werden." }, { status: 500 })
  }
}

function webhookResult(error: { message: string } | null) {
  if (error) return NextResponse.json({ error: "Webhook konnte nicht atomar verarbeitet werden." }, { status: 500 })
  return NextResponse.json({ received: true })
}
