import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { normalizeBookingHold } from "@/lib/bookings/contracts"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  getStripeTestClient,
  requireBookingBaseUrl,
  requireBookingProxySecret,
} from "@/lib/stripe/config"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function POST(request: Request) {
  const providedSecret = request.headers.get("x-benefitsi-booking-secret") || ""
  let expectedSecret = ""
  try {
    expectedSecret = requireBookingProxySecret()
  } catch {
    return NextResponse.json(
      { error: "Booking-Proxy ist nicht konfiguriert." },
      { status: 503 },
    )
  }
  const provided = Buffer.from(providedSecret)
  const expected = Buffer.from(expectedSecret)
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const offerId = clean(body?.offerId, 80)
  const slotId = clean(body?.slotId, 80)
  const idempotencyKey = clean(body?.idempotencyKey, 200)
  const customerEmail = clean(body?.customerEmail, 254).toLowerCase()
  const quantity =
    typeof body?.quantity === "number" && Number.isInteger(body.quantity)
      ? body.quantity
      : 0

  if (
    !UUID_PATTERN.test(offerId) ||
    !UUID_PATTERN.test(slotId) ||
    idempotencyKey.length < 16 ||
    quantity < 1 ||
    quantity > 100 ||
    !customerEmail ||
    !validEmail(customerEmail)
  ) {
    return NextResponse.json(
      { error: "Ungültige Buchungsanfrage." },
      { status: 400 },
    )
  }

  try {
    const admin = createAdminClient()
    const holdResult = await admin.rpc("create_booking_hold", {
      p_offer_id: offerId,
      p_slot_id: slotId,
      p_quantity: quantity,
      p_idempotency_key: idempotencyKey,
      p_customer_email: customerEmail || null,
    })
    if (holdResult.error) {
      const soldOut = holdResult.error.message.includes("slot_sold_out")
      return NextResponse.json(
        {
          error: soldOut
            ? "Dieser Termin ist inzwischen ausgebucht."
            : "Die Reservierung konnte nicht angelegt werden.",
        },
        { status: soldOut ? 409 : 422 },
      )
    }

    const hold = normalizeBookingHold(holdResult.data)
    const existing = await admin
      .from("bookings")
      .select("stripe_checkout_session_id")
      .eq("id", hold.bookingId)
      .maybeSingle()

    const stripe = getStripeTestClient()
    if (existing.data?.stripe_checkout_session_id) {
      const session = await stripe.checkout.sessions.retrieve(
        existing.data.stripe_checkout_session_id,
      )
      return NextResponse.json({
        bookingReference: hold.publicReference,
        checkoutUrl: session.url,
        replayed: true,
      })
    }

    const baseUrl = requireBookingBaseUrl()
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: hold.currency,
              unit_amount: hold.totalAmount,
              product_data: {
                name: hold.offerTitle,
                description: `${quantity} Platz/Plätze · Benefitsi Buchung ${hold.publicReference}`,
              },
            },
          },
        ],
        customer_email: customerEmail || undefined,
        client_reference_id: hold.publicReference,
        metadata: {
          benefitsi_booking_id: hold.bookingId,
          benefitsi_booking_reference: hold.publicReference,
        },
        payment_intent_data: {
          application_fee_amount: hold.applicationFeeAmount,
          transfer_data: {
            destination: hold.stripeAccountId,
          },
          metadata: {
            benefitsi_booking_id: hold.bookingId,
            benefitsi_booking_reference: hold.publicReference,
          },
        },
        success_url: `${baseUrl}/bookings/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/bookings/cancelled?booking=${encodeURIComponent(hold.publicReference)}`,
        expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
      },
      {
        idempotencyKey: `benefitsi-booking-${idempotencyKey}`,
      },
    )

    const attachResult = await admin.rpc("attach_booking_checkout", {
      p_booking_id: hold.bookingId,
      p_checkout_session_id: session.id,
    })
    if (attachResult.error) {
      return NextResponse.json(
        { error: "Checkout wurde erstellt, konnte aber nicht sicher verknüpft werden." },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        bookingReference: hold.publicReference,
        checkoutUrl: session.url,
        expiresAt: hold.holdExpiresAt,
        replayed: false,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error(
      "Stripe test checkout failed:",
      error instanceof Error ? error.message : "unknown error",
    )
    return NextResponse.json(
      { error: "Stripe-Testcheckout ist derzeit nicht verfügbar." },
      { status: 503 },
    )
  }
}
