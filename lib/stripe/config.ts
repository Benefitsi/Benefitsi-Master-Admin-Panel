import "server-only"

import Stripe from "stripe"

let stripeClient: Stripe | null = null
let stripeClientSecret: string | null = null

export const BENEFITSI_STRIPE_SANDBOX_ACCOUNT_ID = "acct_1T3ZuLH0Ev7iKGq0"
const TEST_SECRET_PATTERN = /^(?:sk|rk)_test_[A-Za-z0-9_]{1,500}$/
type SandboxPolicy = { secret: string; accountId: string }
type SandboxVerification = SandboxPolicy & { promise: Promise<Stripe> }
let sandboxVerification: SandboxVerification | null = null

function sandboxPolicy(): SandboxPolicy | null {
  const secret = process.env.STRIPE_SANDBOX_SECRET_KEY?.trim()
  const accountId = process.env.BENEFITSI_STRIPE_EXPECTED_ACCOUNT_ID?.trim()
  if (process.env.BENEFITSI_STRIPE_SANDBOX_READY?.trim() !== "true" ||
      accountId !== BENEFITSI_STRIPE_SANDBOX_ACCOUNT_ID || !secret || !TEST_SECRET_PATTERN.test(secret)) return null
  return { secret, accountId }
}

/** Configuration alone never proves the connected account or permits a mutation. */
export function isStripeSandboxConfigured() { return sandboxPolicy() !== null }

/**
 * Callers must await this boundary before Connect, Checkout or refund mutations.
 * This uses only the dedicated sandbox key, never the existing primary key.
 * The verification key needs own Account read (GET /v1/account) and Balance read.
 * Mutation keys additionally need only their used resource permissions: Accounts
 * v2 and Account Links for onboarding; Checkout/PaymentIntents/Refunds for payments.
 * Thin event retrieval needs Events read; destination management stays separate.
 * Preserve connected-account scoping and provider allowlists in the caller.
 */
export async function getVerifiedStripeSandboxClient(): Promise<Stripe> {
  const policy = sandboxPolicy()
  if (!policy) {
    sandboxVerification = null
    throw new Error("Die freigegebene Stripe-Sandbox ist nicht vollständig konfiguriert.")
  }
  if (sandboxVerification?.secret === policy.secret && sandboxVerification.accountId === policy.accountId) return sandboxVerification.promise
  const client = new Stripe(policy.secret, {
    appInfo: { name: "Benefitsi Sandbox", version: "0.1.0-test" },
    maxNetworkRetries: 0,
    timeout: 10_000,
  })
  const verification: SandboxVerification = { ...policy, promise: Promise.resolve(client) }
  sandboxVerification = verification
  verification.promise = (async () => {
    let account
    try { account = await client.accounts.retrieveCurrent() }
    catch { throw new Error("Die Stripe-Sandbox-Kontoidentität konnte nicht bestätigt werden.") }
    if (!account || account.object !== "account" || account.id !== policy.accountId) throw new Error("Der Stripe-Zugang gehört nicht zur freigegebenen Sandbox.")
    let balance
    try { balance = await client.balance.retrieve() }
    catch { throw new Error("Der Stripe-Sandbox-Testmodus konnte nicht bestätigt werden.") }
    if (!balance || balance.object !== "balance" || balance.livemode !== false) throw new Error("Der Stripe-Zugang bestätigt keinen sicheren Testmodus.")
    const current = sandboxPolicy()
    if (!current || current.secret !== policy.secret || current.accountId !== policy.accountId || sandboxVerification !== verification) {
      throw new Error("Die Stripe-Sandbox-Konfiguration wurde während der Bestätigung geändert.")
    }
    return client
  })().catch(error => {
    if (sandboxVerification === verification) sandboxVerification = null
    throw error
  })
  return verification.promise
}

export function requireStripeTestSecret() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secret || !TEST_SECRET_PATTERN.test(secret)) {
    throw new Error(
      "Stripe ist nicht im Testmodus konfiguriert. Es werden ausschließlich sk_test_- oder rk_test_-Keys akzeptiert.",
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

export function verifyBookingWebhook(payload: string, signature: string) {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_LEGACY_WEBHOOK_SECRET]
    .map(value => value?.trim()).filter((value): value is string => Boolean(value?.startsWith("whsec_")))
  for (const secret of new Set(secrets)) {
    try { return getStripeTestClient().webhooks.constructEvent(payload, signature, secret) } catch { /* Try the other configured booking endpoint. */ }
  }
  throw new Error("Ungültige Booking-Webhook-Signatur.")
}

export function getStripeTestClient() {
  // Revalidate before any cached return: rotation must never bypass the live-key guard.
  const secret = requireStripeTestSecret()
  if (!stripeClient || stripeClientSecret !== secret) {
    stripeClient = new Stripe(secret, {
      appInfo: {
        name: "Benefitsi Booking",
        version: "0.1.0-test",
      },
    })
    stripeClientSecret = secret
  }
  return stripeClient
}

export function isStripeTestConfigured() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim()
  return Boolean(secret && TEST_SECRET_PATTERN.test(secret))
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

// Merchant callbacks must return to the host that owns the partner session.
export function requirePartnerBaseUrl() {
  const url = new URL(process.env.BENEFITSI_PARTNER_BASE_URL?.trim() || "https://partner.benefitsi.de")
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")) {
    throw new Error("Die Partner-Basis-URL muss HTTPS verwenden.")
  }
  return url.origin
}
