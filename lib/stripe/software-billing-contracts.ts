import type Stripe from "stripe"

export function validateSoftwarePrice(price: Stripe.Price, expectedId: string) {
  if (!/^price_[A-Za-z0-9_]+$/.test(expectedId) || price.id !== expectedId || price.livemode ||
      !price.active || price.currency !== "eur" || price.type !== "recurring" ||
      !Number.isSafeInteger(price.unit_amount) || (price.unit_amount || 0) < 1 ||
      price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 ||
      price.recurring.usage_type !== "licensed") {
    throw new Error("Softwarepreis muss ein aktiver monatlicher EUR-Testpreis sein.")
  }
  return price
}

export function buildSoftwareSubscription(input: {
  providerId: string; customerId: string; priceId: string; origin: string
}): Stripe.Checkout.SessionCreateParams {
  if (!input.providerId || !/^cus_[A-Za-z0-9]+$/.test(input.customerId) || !/^price_[A-Za-z0-9_]+$/.test(input.priceId)) {
    throw new Error("Ungültiger Software-Abrechnungsvertrag.")
  }
  const origin = new URL(input.origin)
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) {
    throw new Error("Ungültige Abrechnungs-Basis-URL.")
  }
  const destination = `${origin.origin}/partner/commerce?provider=${encodeURIComponent(input.providerId)}`
  const metadata = { benefitsi_billing_provider_id: input.providerId, environment: "test", billing_purpose: "monthly_software" }
  return {
    mode: "subscription", customer: input.customerId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    payment_method_types: ["card"],
    metadata, subscription_data: { metadata },
    success_url: `${destination}&billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${destination}&billing=cancelled`,
  }
}
