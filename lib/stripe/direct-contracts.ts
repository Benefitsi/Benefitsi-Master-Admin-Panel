import type Stripe from "stripe"

export type DirectCheckoutInput = {
  bookingId: string
  reference: string
  accountId: string
  totalAmount: number
  currency: string
  email: string
  expiresAt: string | number
  successUrl: string
  cancelUrl: string
  idempotencyKey: string
  /** Only set from a persisted booking replay, never from client input. */
  idempotentReplay?: boolean
  bookingSystem?: "commerce" | "legacy"
  title?: string
}

export function requireConnectedAccountId(accountId: string) {
  if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) {
    throw new Error("Ein gültiges Stripe-Händlerkonto ist erforderlich.")
  }
  return accountId
}

function requireReturnUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("Stripe-Rücksprungziele müssen HTTPS oder lokales HTTP verwenden.")
  }
  return value
}

export function buildDirectCheckout(input: DirectCheckoutInput, now = Date.now()) {
  requireConnectedAccountId(input.accountId)
  const expiresAt = typeof input.expiresAt === "number"
    ? input.expiresAt
    : Math.floor(Date.parse(input.expiresAt) / 1000)
  if (!Number.isSafeInteger(input.totalAmount) || input.totalAmount < 1 ||
      input.currency !== "eur" || !input.bookingId || !input.reference ||
      input.idempotencyKey.length < 16 || input.idempotencyKey.length > 200 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
      !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000) ||
      (!input.idempotentReplay && expiresAt < Math.floor(now / 1000) + 30 * 60) ||
      expiresAt > Math.floor(now / 1000) + 24 * 60 * 60) {
    throw new Error("Ungültiger Händler-Checkout oder abgelaufene Reservierung.")
  }
  const metadata = {
    [input.bookingSystem === "legacy" ? "benefitsi_booking_id" : "benefitsi_commerce_booking_id"]: input.bookingId,
    benefitsi_booking_reference: input.reference,
    environment: "test",
  }
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    // Immediate card confirmation keeps short capacity holds deterministic.
    payment_method_types: ["card"],
    line_items: [{ quantity: 1, price_data: {
      currency: input.currency,
      unit_amount: input.totalAmount,
      product_data: { name: input.title || `Buchung ${input.reference}` },
    } }],
    customer_email: input.email,
    client_reference_id: input.reference,
    metadata,
    payment_intent_data: { metadata },
    success_url: requireReturnUrl(input.successUrl),
    cancel_url: requireReturnUrl(input.cancelUrl),
    expires_at: expiresAt,
  }
  // A replay sends exactly the original parameters/key. If creation never reached
  // Stripe, Stripe's own >=30 minute rule rejects it; we never extend the hold.
  const options: Stripe.RequestOptions = {
    stripeAccount: input.accountId,
    idempotencyKey: input.idempotencyKey,
  }
  return { params, options }
}

export type DirectBookingSnapshot = {
  accountId: string
  totalAmount: number
  currency: string
  checkoutSessionId: string | null
  paymentIntentId: string | null
}

export function validateDirectBookingEvent(event: Stripe.Event, booking: DirectBookingSnapshot) {
  requireConnectedAccountId(booking.accountId)
  if (event.livemode || !event.account || event.account !== booking.accountId) {
    throw new Error("Stripe-Ereignis gehört nicht zum Test-Händlerkonto.")
  }
  if (event.type.startsWith("checkout.session.")) {
    const session = event.data.object as Stripe.Checkout.Session
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id
    if (session.livemode || session.id !== booking.checkoutSessionId ||
        session.currency !== booking.currency || session.amount_total !== booking.totalAmount ||
        (booking.paymentIntentId && paymentIntentId && paymentIntentId !== booking.paymentIntentId)) {
      throw new Error("Stripe-Checkout stimmt nicht mit der Buchung überein.")
    }
    if (event.type === "checkout.session.expired") return "expired" as const
    if (event.type === "checkout.session.async_payment_failed") return "failed" as const
    if (session.payment_status === "paid" && !/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId || "")) {
      throw new Error("Bezahlter Checkout benötigt eine eindeutige Zahlungszuordnung.")
    }
    return session.payment_status === "paid" ? "paid" as const : "pending" as const
  }
  const charge = event.data.object as Stripe.Charge
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id
  if (event.type !== "charge.refunded" || charge.livemode ||
      !booking.paymentIntentId || paymentIntentId !== booking.paymentIntentId ||
      charge.currency !== booking.currency || charge.amount !== booking.totalAmount) {
    throw new Error("Stripe-Erstattung stimmt nicht mit der Buchung überein.")
  }
  return charge.refunded && charge.amount_refunded === booking.totalAmount
    ? "refunded" as const : "partial_refund" as const
}
