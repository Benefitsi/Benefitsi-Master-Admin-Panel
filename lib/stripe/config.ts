import "server-only"

import Stripe from "stripe"

let stripeClient: Stripe | null = null

export function requireStripeTestSecret() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secret || !secret.startsWith("sk_test_")) {
    throw new Error(
      "Stripe ist nicht im Testmodus konfiguriert. Es wird ausschließlich ein sk_test_-Key akzeptiert.",
    )
  }
  return secret
}

export function requireStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret || !secret.startsWith("whsec_")) {
    throw new Error("Der Stripe-Webhook-Secret fehlt oder ist ungültig.")
  }
  return secret
}

export function getStripeTestClient() {
  if (!stripeClient) {
    stripeClient = new Stripe(requireStripeTestSecret(), {
      appInfo: {
        name: "Benefitsi Booking",
        version: "0.1.0-test",
      },
    })
  }
  return stripeClient
}

export function isStripeTestConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim().startsWith("sk_test_"))
}

export function isStripeConnectPlatformReady() {
  return (
    process.env.BENEFITSI_STRIPE_CONNECT_PLATFORM_READY?.trim().toLowerCase() ===
    "true"
  )
}

export function requireBookingBaseUrl() {
  const configured = process.env.BENEFITSI_BOOKING_BASE_URL?.trim()
  if (!configured) {
    if (process.env.NODE_ENV !== "production") return "http://localhost:3011"
    throw new Error("BENEFITSI_BOOKING_BASE_URL fehlt.")
  }

  const url = new URL(configured)
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("Die Booking-Basis-URL muss HTTPS verwenden.")
  }
  return url.origin
}

export function requireBookingProxySecret() {
  const secret = process.env.BENEFITSI_BOOKING_PROXY_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error("Der interne Booking-Proxy-Secret fehlt.")
  }
  return secret
}
