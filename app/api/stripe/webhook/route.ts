import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  getStripeTestClient,
  requireStripeWebhookSecret,
} from "@/lib/stripe/config"

const allowedBookingEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
])

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "Signatur fehlt." }, { status: 400 })
  }

  const payload = await request.text()
  let event: Stripe.Event
  try {
    event = getStripeTestClient().webhooks.constructEvent(
      payload,
      signature,
      requireStripeWebhookSecret(),
    )
  } catch {
    return NextResponse.json({ error: "Ungültige Signatur." }, { status: 400 })
  }

  if (event.livemode) {
    return NextResponse.json(
      { error: "Live-Webhooks sind nicht freigegeben." },
      { status: 403 },
    )
  }

  const payloadHash = createHash("sha256").update(payload).digest("hex")
  const admin = createAdminClient()

  if (event.type === "account.updated") {
    const account = event.data.object
    const result = await admin.rpc("apply_stripe_provider_event", {
      p_event_id: event.id,
      p_livemode: event.livemode,
      p_payload_sha256: payloadHash,
      p_stripe_account_id: account.id,
      p_charges_enabled: account.charges_enabled,
      p_payouts_enabled: account.payouts_enabled,
      p_details_submitted: account.details_submitted,
    })
    return webhookResult(result.error)
  }

  if (!allowedBookingEvents.has(event.type)) {
    return NextResponse.json({ received: true, ignored: true })
  }

  const values = await bookingEventValues(event, admin)
  if (!values.bookingId) {
    return NextResponse.json(
      { error: "Booking-Zuordnung fehlt." },
      { status: 422 },
    )
  }

  const result = await admin.rpc("apply_stripe_booking_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_livemode: event.livemode,
    p_payload_sha256: payloadHash,
    p_booking_id: values.bookingId,
    p_object_id: values.objectId,
    p_checkout_session_id: values.checkoutSessionId,
    p_payment_intent_id: values.paymentIntentId,
    p_charge_id: values.chargeId,
    p_amount_total: values.amountTotal,
    p_stripe_account_id: event.account || null,
  })

  return webhookResult(result.error)
}

async function bookingEventValues(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>,
) {
  if (event.type.startsWith("checkout.session.")) {
    const session = event.data.object as Stripe.Checkout.Session
    return {
      bookingId: session.metadata?.benefitsi_booking_id || null,
      objectId: session.id,
      checkoutSessionId: session.id,
      paymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || null,
      chargeId: null,
      amountTotal: session.amount_total,
    }
  }

  const charge = event.data.object as Stripe.Charge
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id || null
  const fromMetadata = charge.metadata?.benefitsi_booking_id || null
  if (fromMetadata) {
    return {
      bookingId: fromMetadata,
      objectId: charge.id,
      checkoutSessionId: null,
      paymentIntentId,
      chargeId: charge.id,
      amountTotal: charge.amount,
    }
  }

  const booking = paymentIntentId
    ? await admin
        .from("bookings")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle()
    : null
  return {
    bookingId: booking?.data?.id || null,
    objectId: charge.id,
    checkoutSessionId: null,
    paymentIntentId,
    chargeId: charge.id,
    amountTotal: charge.amount,
  }
}

function webhookResult(error: { message: string } | null) {
  if (error) {
    console.error("Stripe webhook processing failed:", error.message)
    return NextResponse.json(
      { error: "Webhook konnte nicht atomar verarbeitet werden." },
      { status: 500 },
    )
  }
  return NextResponse.json({ received: true })
}
