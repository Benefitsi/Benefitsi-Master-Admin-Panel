import "server-only"

import type Stripe from "stripe"
import {
  getStripeTestClient,
  getVerifiedStripeSandboxClient,
  isStripeConnectPlatformReady,
  isStripeSandboxConfigured,
  isStripeTestConfigured,
  verifyBookingWebhook,
} from "@/lib/stripe/config"
import { requireConnectedAccountId } from "@/lib/stripe/direct-contracts"

const STAGING_DATABASE_URL = "https://klfaqrrbigjtcgrslkkl.supabase.co"
const PROVIDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MERCHANT_ID = /^acct_[A-Za-z0-9]+$/

export function getBookingRealm(): "sandbox" | "legacy" {
  const realm = process.env.BENEFITSI_STRIPE_BOOKING_REALM
  if (realm === undefined || realm === "legacy") return "legacy"
  if (realm === "sandbox") return "sandbox"
  throw new Error("Der Stripe-Buchungsbereich ist nicht freigegeben.")
}

/** Must also run before any database hold, booking or webhook mutation. */
export function assertBookingRealmBoundary(): void {
  if (getBookingRealm() === "sandbox" &&
      (process.env.VERCEL_ENV !== "preview" || process.env.NEXT_PUBLIC_SUPABASE_URL !== STAGING_DATABASE_URL)) {
    throw new Error("Sandbox-Buchungen benötigen die isolierte Testumgebung.")
  }
}

function explicitIds(value: string | undefined, pattern: RegExp): Set<string> {
  const ids = value?.split(",").map(id => id.trim()) || []
  if (!ids.length || ids.some(id => !pattern.test(id))) {
    throw new Error("Die Sandbox-Anbieter und Händler müssen ausdrücklich freigegeben sein.")
  }
  return new Set(ids)
}

function sandboxScope() {
  assertBookingRealmBoundary()
  if (getBookingRealm() !== "sandbox" || !isStripeSandboxConfigured()) {
    throw new Error("Die Stripe-Buchungssandbox ist nicht freigegeben.")
  }
  return {
    providers: explicitIds(process.env.BENEFITSI_STRIPE_SANDBOX_PROVIDER_IDS, PROVIDER_ID),
    merchants: explicitIds(process.env.BENEFITSI_STRIPE_SANDBOX_MERCHANT_IDS, MERCHANT_ID),
  }
}

/** Payment operations can reconcile existing legacy bookings before new Connect onboarding is enabled. */
export function isBookingStripeConfigured(): boolean {
  try {
    assertBookingRealmBoundary()
    if (getBookingRealm() === "legacy") return isStripeTestConfigured()
    sandboxScope()
    return true
  } catch { return false }
}

/** Local configuration only; this does not claim that Stripe identity was verified. */
export function isBookingConnectConfigured(): boolean {
  try {
    assertBookingRealmBoundary()
    if (getBookingRealm() === "legacy") return isStripeTestConfigured() && isStripeConnectPlatformReady()
    sandboxScope()
    return true
  } catch { return false }
}

/** Inputs must come from the authenticated provider's persisted assignment. */
export function isBookingProviderAllowed(providerId: string, accountId: string | null | undefined, testMode: boolean): boolean {
  try {
    assertBookingRealmBoundary()
    if (testMode !== true) return false
    if (getBookingRealm() === "legacy") return true
    const scope = sandboxScope()
    return scope.providers.has(providerId) && typeof accountId === "string" && scope.merchants.has(accountId)
  } catch { return false }
}

function requireSandboxMerchant(accountId: string) {
  const scope = sandboxScope()
  if (!scope.merchants.has(accountId)) throw new Error("Das Sandbox-Händlerkonto ist nicht freigegeben.")
}

export async function getBookingStripeClient(accountId: string): Promise<Stripe> {
  assertBookingRealmBoundary()
  requireConnectedAccountId(accountId)
  if (getBookingRealm() === "legacy") return getStripeTestClient()
  requireSandboxMerchant(accountId)
  const stripe = await getVerifiedStripeSandboxClient()
  requireSandboxMerchant(accountId)
  return stripe
}

export async function getBookingConnectClient(input: {
  providerId: string
  testMode: boolean
  accountId: string | null | undefined
}): Promise<Stripe> {
  assertBookingRealmBoundary()
  if (getBookingRealm() === "legacy") return getStripeTestClient()
  // A sandbox account must already exist and be assigned. Never create an
  // arbitrary merchant account through this boundary.
  if (!isBookingProviderAllowed(input.providerId, input.accountId, input.testMode) || !input.accountId) {
    throw new Error("Die vorbereitete Sandbox-Händlerzuordnung ist nicht freigegeben.")
  }
  const stripe = await getBookingStripeClient(input.accountId)
  if (!isBookingProviderAllowed(input.providerId, input.accountId, input.testMode) || getBookingRealm() !== "sandbox") {
    throw new Error("Die Sandbox-Händlerzuordnung wurde während der Prüfung geändert.")
  }
  return stripe
}

export async function verifyBookingPaymentWebhook(payload: string, signature: string): Promise<Stripe.Event> {
  assertBookingRealmBoundary()
  if (getBookingRealm() === "legacy") return verifyBookingWebhook(payload, signature)
  sandboxScope()
  const secret = process.env.STRIPE_SANDBOX_WEBHOOK_SECRET?.trim()
  if (!secret || !/^whsec_[A-Za-z0-9_]+$/.test(secret)) throw new Error("Der Sandbox-Webhook ist nicht konfiguriert.")
  const stripe = await getVerifiedStripeSandboxClient()
  let event: Stripe.Event
  try { event = stripe.webhooks.constructEvent(payload, signature, secret) }
  catch { throw new Error("Ungültige Sandbox-Booking-Webhook-Signatur.") }
  const scope = sandboxScope()
  if (process.env.STRIPE_SANDBOX_WEBHOOK_SECRET?.trim() !== secret || event.livemode !== false ||
      typeof event.account !== "string" || !scope.merchants.has(event.account)) {
    throw new Error("Das Stripe-Ereignis gehört nicht zum freigegebenen Sandbox-Händlerkonto.")
  }
  return event
}
