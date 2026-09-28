import "server-only"

import { getStripeTestClient } from "@/lib/stripe/config"
import { retrieveMerchantAccountStatus } from "@/lib/stripe/connect"
import { buildDirectCheckout, requireConnectedAccountId, type DirectCheckoutInput } from "@/lib/stripe/direct-contracts"

function testObject<T extends { livemode: boolean }>(object: T) {
  if (object.livemode) throw new Error("Live-Zahlungsobjekt wurde technisch abgelehnt.")
  return object
}

export async function createDirectCheckout(input: DirectCheckoutInput) {
  const { params, options } = buildDirectCheckout(input)
  const stripe = getStripeTestClient()
  const merchant = await retrieveMerchantAccountStatus(stripe, input.accountId)
  if (!merchant.chargesEnabled) throw new Error("Händlerkonto ist nicht zahlungsbereit.")
  return testObject(await stripe.checkout.sessions.create(params, options))
}

export async function retrieveDirectCheckout(sessionId: string, accountId: string) {
  if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Ungültiger Testcheckout.")
  return testObject(await getStripeTestClient().checkout.sessions.retrieve(sessionId, {}, {
    stripeAccount: requireConnectedAccountId(accountId),
  }))
}

export async function expireDirectCheckout(sessionId: string, accountId: string, idempotencyKey = `expire-${sessionId}`) {
  const session = await retrieveDirectCheckout(sessionId, accountId)
  if (session.status === "expired") return session
  if (session.status !== "open") throw new Error("Ein abgeschlossener Checkout kann nicht abgebrochen werden.")
  return testObject(await getStripeTestClient().checkout.sessions.expire(sessionId, {}, {
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
  return getStripeTestClient().refunds.create({
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
  return getStripeTestClient().refunds.retrieve(refundId, {}, {
    stripeAccount: requireConnectedAccountId(accountId),
  })
}
