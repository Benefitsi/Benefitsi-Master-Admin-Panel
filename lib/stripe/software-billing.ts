import "server-only"

import type Stripe from "stripe"
import { createHash } from "node:crypto"
import { commercePartner } from "@/lib/commerce/partner"
import { createAdminClient } from "@/lib/supabase/admin"
import { getStripeTestClient, requireBookingBaseUrl } from "@/lib/stripe/config"
import { buildSoftwareSubscription, validateSoftwarePrice } from "@/lib/stripe/software-billing-contracts"

export function isSoftwareBillingConfigured() {
  return /^price_[A-Za-z0-9_]+$/.test(process.env.BENEFITSI_SOFTWARE_PRICE_ID?.trim() || "")
}

function expectedOrigin(origin: string) {
  const configured = requireBookingBaseUrl()
  if (new URL(origin).origin !== configured) throw new Error("Ungültige Abrechnungs-Basis-URL.")
  return configured
}

export async function createSoftwareSubscription(providerId: string, ownerEmail: string, origin: string): Promise<string> {
  const { admin, provider, session } = await commercePartner(providerId)
  if (!provider?.test_mode) throw new Error("Software-Abrechnung bleibt im Testmodus.")
  const baseUrl = expectedOrigin(origin)
  const priceId = process.env.BENEFITSI_SOFTWARE_PRICE_ID?.trim() || ""
  if (!isSoftwareBillingConfigured()) throw new Error("Monatlicher Softwarepreis fehlt.")
  const stripe = getStripeTestClient()
  validateSoftwarePrice(await stripe.prices.retrieve(priceId), priceId)
  const existing = await admin.from("commerce_billing_customers").select("*").eq("provider_id", providerId).maybeSingle()
  if (existing.error) throw new Error("Software-Abrechnungsschema fehlt.")
  let billing = existing.data
  if (!billing) {
    const customer = await stripe.customers.create({
      email: session.user.email || ownerEmail || undefined,
      name: provider.display_name,
      metadata: { benefitsi_billing_provider_id: providerId, environment: "test" },
    }, { idempotencyKey: `benefitsi-software-customer-${providerId}` })
    if (customer.livemode) throw new Error("Live-Abrechnung abgelehnt.")
    const saved = await admin.from("commerce_billing_customers").upsert({
      provider_id: providerId, stripe_customer_id: customer.id, test_mode: true,
    }, { onConflict: "provider_id", ignoreDuplicates: true })
    if (saved.error) throw new Error("Abrechnungskunde konnte nicht gespeichert werden.")
    const persisted = await admin.from("commerce_billing_customers").select("*").eq("provider_id", providerId).single()
    if (persisted.error) throw new Error("Abrechnungskunde konnte nicht geladen werden.")
    billing = persisted.data
  }
  if (!billing.test_mode) throw new Error("Live-Abrechnung abgelehnt.")
  if (billing.stripe_subscription_id) {
    const subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id)
    if (subscription.livemode || !["canceled", "incomplete_expired"].includes(subscription.status)) {
      throw new Error("Ein Software-Abonnement besteht bereits. Bitte Abrechnung verwalten.")
    }
  }
  if (billing.stripe_checkout_session_id) {
    const checkout = await stripe.checkout.sessions.retrieve(billing.stripe_checkout_session_id)
    if (checkout.livemode || checkout.customer !== billing.stripe_customer_id) throw new Error("Abrechnungskunde stimmt nicht überein.")
    if (checkout.status === "open" && checkout.url) return checkout.url
    if (checkout.status === "complete" && !billing.stripe_subscription_id) {
      throw new Error("Software-Abonnement wird noch bestätigt.")
    }
  }
  const checkout = await stripe.checkout.sessions.create(buildSoftwareSubscription({
    providerId, customerId: billing.stripe_customer_id, priceId, origin: baseUrl,
  }), { idempotencyKey: `benefitsi-software-${providerId}-${priceId}-${billing.stripe_checkout_session_id || "initial"}` })
  if (checkout.livemode || !checkout.url) throw new Error("Software-Testcheckout konnte nicht erstellt werden.")
  const attached = await admin.from("commerce_billing_customers").update({
    stripe_checkout_session_id: checkout.id, updated_at: new Date().toISOString(),
  }).eq("provider_id", providerId).eq("stripe_customer_id", billing.stripe_customer_id).eq("test_mode", true)
  if (attached.error) throw new Error("Abrechnungscheckout konnte nicht gespeichert werden.")
  return checkout.url
}

export async function createSoftwareBillingPortal(providerId: string, origin: string) {
  const { admin } = await commercePartner(providerId)
  const baseUrl = expectedOrigin(origin)
  const configuration = process.env.BENEFITSI_SOFTWARE_PORTAL_CONFIGURATION_ID?.trim()
  if (!configuration || !/^bpc_[A-Za-z0-9]+$/.test(configuration)) throw new Error("Abrechnungsportal ist noch nicht konfiguriert.")
  const billing = await admin.from("commerce_billing_customers").select("stripe_customer_id,test_mode").eq("provider_id", providerId).single()
  if (billing.error || !billing.data.test_mode) throw new Error("Test-Abrechnungskunde fehlt.")
  const stripe = getStripeTestClient()
  const portalConfig = await stripe.billingPortal.configurations.retrieve(configuration)
  if (portalConfig.livemode || !portalConfig.active) throw new Error("Test-Abrechnungsportal ist nicht aktiv.")
  const portal = await stripe.billingPortal.sessions.create({
    customer: billing.data.stripe_customer_id, configuration,
    return_url: `${baseUrl}/partner/commerce?provider=${encodeURIComponent(providerId)}`,
  })
  return portal.url
}

export async function applySoftwareBillingEvent(event: Stripe.Event) {
  if (event.livemode || event.account) throw new Error("Software-Abrechnung verlangt ein Plattform-Testereignis.")
  if (!["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) return { ignored: true }
  let subscriptionId: string | null = null
  if (event.type === "checkout.session.completed") {
    const checkout = event.data.object as Stripe.Checkout.Session
    if (checkout.mode !== "subscription" || !checkout.metadata?.benefitsi_billing_provider_id) return { ignored: true }
    subscriptionId = typeof checkout.subscription === "string" ? checkout.subscription : checkout.subscription?.id || null
  } else {
    const subscription = event.data.object as Stripe.Subscription
    if (!subscription.metadata.benefitsi_billing_provider_id) return { ignored: true }
    subscriptionId = subscription.id
  }
  if (!subscriptionId) throw new Error("Abonnement-Zuordnung fehlt.")
  // Re-read current state: delayed webhook delivery must not restore an older status.
  const subscription = await getStripeTestClient().subscriptions.retrieve(subscriptionId)
  if (subscription.livemode) throw new Error("Live-Abonnement abgelehnt.")
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
  const providerId = subscription.metadata.benefitsi_billing_provider_id
  const admin = createAdminClient()
  const customer = await admin.from("commerce_billing_customers").select("provider_id,stripe_subscription_id").eq("stripe_customer_id", customerId).eq("provider_id", providerId).eq("test_mode", true).maybeSingle()
  if (customer.error) throw new Error("Abrechnungskunde konnte nicht geladen werden.")
  if (!customer.data) return { ignored: true }
  const result = await admin.rpc("commerce_apply_billing_event", { p_event: {
    event_id: event.id, customer_id: customerId, subscription_id: subscription.id,
    provider_id: providerId, status: subscription.status, livemode: false,
    event_created: event.created,
    source_fingerprint: createHash("sha256").update(JSON.stringify({
      id: event.id, type: event.type, created: event.created, data: event.data,
    })).digest("hex"),
  } })
  if (result.error) throw new Error("Abonnementstatus konnte nicht gespeichert werden.")
  return { received: true }
}
