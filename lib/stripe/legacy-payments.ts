import "server-only"
import type Stripe from "stripe"
import { getStripeTestClient } from "@/lib/stripe/config"
import { requireConnectedAccountId, validateBookingEventObject } from "@/lib/stripe/direct-contracts"

export type LegacyPaymentSnapshot = {
  id: string
  stripe_account_id: string
  total_amount: number
  currency: string
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  stripe_refund_id?: string | null
}
type Scope = "direct" | "historical_platform"
function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id || null
}
function missing(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "resource_missing")
}
function validateIntent(intent: Stripe.PaymentIntent, booking: LegacyPaymentSnapshot, scope: Scope) {
  if (intent.livemode || (booking.stripe_payment_intent_id && intent.id !== booking.stripe_payment_intent_id) ||
      intent.metadata.benefitsi_booking_id !== booking.id || intent.metadata.benefitsi_commerce_booking_id ||
      intent.amount !== booking.total_amount || intent.currency !== booking.currency ||
      (scope === "historical_platform" && objectId(intent.transfer_data?.destination) !== booking.stripe_account_id)) {
    throw new Error("Historische Zahlung stimmt nicht mit der Buchung überein.")
  }
}
function validateSession(session: Stripe.Checkout.Session, booking: LegacyPaymentSnapshot) {
  if (session.livemode || session.mode !== "payment" || session.id !== booking.stripe_checkout_session_id ||
      session.metadata?.benefitsi_booking_id !== booking.id || session.metadata?.benefitsi_commerce_booking_id ||
      session.amount_total !== booking.total_amount || session.currency !== booking.currency ||
      (booking.stripe_payment_intent_id && objectId(session.payment_intent) !== booking.stripe_payment_intent_id)) {
    throw new Error("Historischer Checkout stimmt nicht mit der Buchung überein.")
  }
}

/** Read-only scope discovery. Never retry a mutation on another account. */
export async function retrieveLegacyCheckout(booking: LegacyPaymentSnapshot) {
  const stripe = getStripeTestClient()
  const accountId = requireConnectedAccountId(booking.stripe_account_id)
  if (!/^cs_test_[A-Za-z0-9_]+$/.test(booking.stripe_checkout_session_id || "")) throw new Error("Testcheckout fehlt.")
  let scope: Scope = "direct"
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(booking.stripe_checkout_session_id!, {}, { stripeAccount: accountId })
  } catch (error) {
    if (!missing(error)) throw error
    scope = "historical_platform"
    session = await stripe.checkout.sessions.retrieve(booking.stripe_checkout_session_id!)
  }
  validateSession(session, booking)
  const intentId = objectId(session.payment_intent)
  if (scope === "historical_platform" && intentId) {
    validateIntent(await stripe.paymentIntents.retrieve(intentId), booking, scope)
  }
  return { session, scope }
}

/** Existing legacy bookings only; every new Checkout is created by direct-payments. */
export async function refundLegacyPayment(booking: LegacyPaymentSnapshot) {
  const stripe = getStripeTestClient()
  const accountId = requireConnectedAccountId(booking.stripe_account_id)
  if (!/^pi_[A-Za-z0-9_]+$/.test(booking.stripe_payment_intent_id || "")) throw new Error("Zahlung fehlt.")
  let scope: Scope = "direct"
  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id!, {}, { stripeAccount: accountId })
  } catch (error) {
    if (!missing(error)) throw error
    scope = "historical_platform"
    intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id!)
  }
  validateIntent(intent, booking, scope)
  const options: Stripe.RequestOptions = scope === "direct" ? { stripeAccount: accountId } : {}
  const refund = booking.stripe_refund_id
    ? await stripe.refunds.retrieve(booking.stripe_refund_id, {}, options)
    : await stripe.refunds.create({
        payment_intent: intent.id, reason: "requested_by_customer",
        metadata: { benefitsi_booking_id: booking.id, environment: "test" },
      }, { ...options, idempotencyKey: `benefitsi-refund-${booking.id}` })
  if (objectId(refund.payment_intent) !== intent.id) throw new Error("Erstattung gehört zu einer anderen Zahlung.")
  return refund
}

/** Called only after signature validation and an exact legacy DB object lookup. */
export async function validateHistoricalBookingEvent(event: Stripe.Event, booking: LegacyPaymentSnapshot) {
  if (event.livemode || event.account) throw new Error("Kein historisches Plattform-Testereignis.")
  requireConnectedAccountId(booking.stripe_account_id)
  const object = event.data.object as Stripe.Checkout.Session | Stripe.Charge
  if (event.type.startsWith("checkout.session.")) validateSession(object as Stripe.Checkout.Session, booking)
  const intentId = objectId(object.payment_intent)
  if (intentId) {
    const intent = await getStripeTestClient().paymentIntents.retrieve(intentId)
    validateIntent(intent, booking, "historical_platform")
  }
  return validateBookingEventObject(event, {
    accountId: booking.stripe_account_id, totalAmount: booking.total_amount,
    currency: booking.currency, checkoutSessionId: booking.stripe_checkout_session_id,
    paymentIntentId: booking.stripe_payment_intent_id,
  })
}
