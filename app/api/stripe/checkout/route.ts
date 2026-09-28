import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { normalizeBookingHold } from "@/lib/bookings/contracts"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  requireBookingBaseUrl,
  requireBookingProxySecret,
} from "@/lib/stripe/config"

import { createDirectCheckout, retrieveDirectCheckout } from "@/lib/stripe/direct-payments"
import { retrieveLegacyCheckout } from "@/lib/stripe/legacy-payments"

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
      .select("id,state,offer_id,slot_id,quantity,customer_email,hold_expires_at,stripe_account_id,total_amount,currency,stripe_checkout_session_id,stripe_payment_intent_id")
      .eq("id", hold.bookingId)
      .maybeSingle()

    if (existing.error || !existing.data) throw new Error("Buchung konnte nicht sicher geladen werden.")
    const booking = existing.data
    if (booking.offer_id !== offerId || booking.slot_id !== slotId || booking.quantity !== quantity ||
        booking.customer_email !== customerEmail) {
      return NextResponse.json({ error: "Dieser Wiederholungsschlüssel gehört zu einer anderen Anfrage." }, { status: 409 })
    }
    if (!["hold", "payment_pending"].includes(booking.state)) {
      return NextResponse.json({ error: "Diese Buchung ist nicht mehr zahlbar." }, { status: 409 })
    }

    if (booking.stripe_checkout_session_id) {
      const { session } = await retrieveLegacyCheckout(booking)
      if (session.status !== "open" || !session.url) {
        return NextResponse.json({ error: "Dieser Checkout ist bereits abgeschlossen oder abgelaufen." }, { status: 409 })
      }
      return NextResponse.json({
        bookingReference: hold.publicReference,
        checkoutUrl: session.url,
        replayed: true,
      })
    }

    const expiresAt = booking.hold_expires_at
    if (hold.applicationFeeAmount !== 0 || !expiresAt) {
      return NextResponse.json({ error: "Die Buchung benötigt den provisionsfreien Händler-Zahlungsvertrag." }, { status: 409 })
    }
    const baseUrl = requireBookingBaseUrl()
    const session = await createDirectCheckout({
      bookingId: hold.bookingId,
      reference: hold.publicReference,
      accountId: hold.stripeAccountId,
      totalAmount: hold.totalAmount,
      currency: hold.currency,
      email: booking.customer_email,
      expiresAt,
      // The hold RPC omits offer_title on replay; use an immutable reference.
      title: `Buchung ${hold.publicReference}`,
      bookingSystem: "legacy",
      successUrl: `${baseUrl}/bookings/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/bookings/cancelled?booking=${encodeURIComponent(hold.publicReference)}`,
      idempotencyKey: `benefitsi-booking-${idempotencyKey}`,
      idempotentReplay: hold.replayed,
    })

    // Stripe can replay an old create response; verify its current state.
    const currentSession = await retrieveDirectCheckout(session.id, hold.stripeAccountId)
    if (currentSession.status !== "open" || !currentSession.url) {
      return NextResponse.json({ error: "Dieser Checkout ist bereits abgeschlossen oder abgelaufen." }, { status: 409 })
    }

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
        checkoutUrl: currentSession.url,
        expiresAt,
        replayed: hold.replayed,
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
