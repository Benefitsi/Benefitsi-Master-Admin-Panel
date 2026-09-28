import "server-only"

import { commercePartner } from "@/lib/commerce/partner"
import { getStripeTestClient, isStripeConnectPlatformReady, requireBookingBaseUrl } from "@/lib/stripe/config"
import { createTestMerchantAccount, createMerchantOnboardingLink, retrieveMerchantAccountStatus } from "@/lib/stripe/connect"

async function requireMerchantOwner(providerId: string) {
  const context = await commercePartner(providerId)
  if (!isStripeConnectPlatformReady()) throw new Error("Stripe Connect bleibt bis zur Verifizierung der Benefitsi UG gesperrt.")
  if (!context.provider?.test_mode) throw new Error("Live-Anbieter sind nicht freigegeben.")
  return context
}

export async function beginCommerceOnboarding(providerId: string): Promise<string> {
  const { admin, provider, session } = await requireMerchantOwner(providerId)
  if (!provider) throw new Error("Anbieter fehlt.")
  const stripe = getStripeTestClient()
  let accountId = provider.stripe_account_id
  if (!accountId) {
    accountId = await createTestMerchantAccount(stripe, {
      providerId, displayName: provider.display_name, supportEmail: provider.support_email,
    })
    const saved = await admin.from("booking_providers").update({
      stripe_account_id: accountId, stripe_charge_model: "direct_merchant",
      onboarding_status: "onboarding_started", charges_enabled: false,
      payouts_enabled: false, details_submitted: false, updated_at: new Date().toISOString(),
    }).eq("id", providerId).eq("test_mode", true).is("stripe_account_id", null).select("id").maybeSingle()
    if (saved.error) throw new Error("Händlerkonto konnte nicht gespeichert werden.")
    if (!saved.data) {
      // A concurrent owner request may already have saved the same idempotent account.
      const current = await admin.from("booking_providers").select("stripe_account_id").eq("id", providerId).eq("test_mode", true).single()
      if (current.error || current.data.stripe_account_id !== accountId) throw new Error("Händlerkonto wurde zwischenzeitlich geändert.")
    }
    await admin.from("booking_audit").insert({ provider_id: providerId,
      action: "direct_merchant_onboarding_started", actor_type: session.isAdmin ? "admin" : "provider",
      actor_id: session.user.id, actor_profile: session.user.email || "Partner",
      details: { stripe_account_id: accountId, test_mode: true },
    })
  }
  return createMerchantOnboardingLink(stripe, {
    accountId, providerId, baseUrl: requireBookingBaseUrl(), callbackPath: "/api/commerce/connect",
  })
}

export async function syncCommerceMerchant(providerId: string) {
  const { admin, provider } = await requireMerchantOwner(providerId)
  if (!provider?.stripe_account_id) throw new Error("Händlerkonto fehlt.")
  const status = await retrieveMerchantAccountStatus(getStripeTestClient(), provider.stripe_account_id)
  const saved = await admin.from("booking_providers").update({
    stripe_charge_model: "direct_merchant", onboarding_status: status.onboardingStatus,
    charges_enabled: status.chargesEnabled, payouts_enabled: status.payoutsEnabled,
    details_submitted: status.chargesEnabled, updated_at: new Date().toISOString(),
  }).eq("id", providerId).eq("stripe_account_id", status.accountId).eq("test_mode", true).select("id").single()
  if (saved.error) throw new Error("Händlerstatus konnte nicht synchronisiert werden.")
  return status
}
