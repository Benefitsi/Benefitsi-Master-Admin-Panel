import "server-only"

import { getBookingStripeClient } from "@/lib/stripe/booking-client"
import { retrieveMerchantAccountStatus } from "@/lib/stripe/connect"
import { buildDirectCheckout, requireConnectedAccountId, type DirectCheckoutInput } from "@/lib/stripe/direct-contracts"

function testObject<T extends { livemode: boolean }>(object: T) {
  if (object.livemode !== false) throw new Error("Live-Zahlungsobjekt oder unbestätigter Testmodus wurde technisch abgelehnt.")
  return object
}

export async function createDirectCheckout(input: DirectCheckoutInput) {
  const { params, options } = buildDirectCheckout(input)
  const stripe = await getBookingStripeClient(input.accountId)
  const merchant = await retrieveMerchantAccountStatus(stripe, input.accountId)
  if (!merchant.chargesEnabled) throw new Error("Händlerkonto ist nicht zahlungsbereit.")
  return testObject(await stripe.checkout.sessions.create(params, options))
}

export async function retrieveDirectCheckout(sessionId: string, accountId: string) {
  if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Ungültiger Testcheckout.")
  const stripe = await getBookingStripeClient(accountId)
  return testObject(await stripe.checkout.sessions.retrieve(sessionId, {}, {
    stripeAccount: requireConnectedAccountId(accountId),
  }))
}

export async function expireDirectCheckout(sessionId: string, accountId: string, idempotencyKey = `expire-${sessionId}`) {
  const session = await retrieveDirectCheckout(sessionId, accountId)
  if (session.status === "expired") return session
  if (session.status !== "open") throw new Error("Ein abgeschlossener Checkout kann nicht abgebrochen werden.")
  const stripe = await getBookingStripeClient(accountId)
  return testObject(await stripe.checkout.sessions.expire(sessionId, {}, {
    stripeAccount: requireConnectedAccountId(accountId), idempotencyKey,
  }))
}

export async function refundDirectPayment(input: {
  paymentIntentId: string; accountId: string; bookingId: string; idempotencyKey: string
  bookingSystem?: "commerce" | "legacy"
}) {
  if (!/^pi_[A-Za-z0-9_]+$/.test(input.paymentIntentId) || input.idempotencyKey.length < 16) {
    throw new Error("Ungültige Händlererstattung.")
  }
  const stripe = await getBookingStripeClient(input.accountId)
  return stripe.refunds.create({
    payment_intent: input.paymentIntentId,
    reason: "requested_by_customer",
    metadata: {
      [input.bookingSystem === "legacy" ? "benefitsi_booking_id" : "benefitsi_commerce_booking_id"]: input.bookingId,
      environment: "test",
    },
  }, { stripeAccount: requireConnectedAccountId(input.accountId), idempotencyKey: input.idempotencyKey })
}

export async function retrieveDirectRefund(refundId: string, accountId: string) {
  if (!/^re_[A-Za-z0-9_]+$/.test(refundId)) throw new Error("Ungültige Erstattung.")
  const stripe = await getBookingStripeClient(accountId)
  return stripe.refunds.retrieve(refundId, {}, {
    stripeAccount: requireConnectedAccountId(accountId),
  })
}
