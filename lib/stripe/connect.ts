import type Stripe from "stripe"

type MerchantAccountInput = {
  providerId: string
  displayName: string
  supportEmail: string | null
}

type MerchantOnboardingLinkInput = {
  accountId: string
  providerId: string
  baseUrl: string
  callbackPath?: "/api/stripe/connect/status" | "/api/commerce/connect"
}

export type MerchantAccountStatus = {
  accountId: string
  testMode: true
  chargesEnabled: boolean
  payoutsEnabled: boolean
  onboardingStatus: "enabled" | "onboarding_started"
}

export async function createTestMerchantAccount(stripe: Stripe, input: MerchantAccountInput) {
  const account = await stripe.v2.core.accounts.create({
    contact_email: input.supportEmail || undefined,
    display_name: input.displayName,
    dashboard: "full",
    defaults: {
      currency: "eur",
      locales: ["de-DE"],
      profile: {
        doing_business_as: input.displayName,
        product_description: "Restaurantbestellungen, Reservierungen und Termine",
      },
      responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
    },
    // Legal entity details belong in Stripe-hosted onboarding; do not invent them.
    identity: { country: "DE" },
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    metadata: { benefitsi_provider_id: input.providerId, environment: "test", payment_model: "direct_merchant" },
    include: ["configuration.merchant", "defaults", "requirements"],
  }, { idempotencyKey: `benefitsi-merchant-${input.providerId}` })
  if (account.livemode) throw new Error("Live-Connect-Konto wurde technisch abgelehnt.")
  return account.id
}

export async function createMerchantOnboardingLink(stripe: Stripe, input: MerchantOnboardingLinkInput) {
  // Existing recipient/platform-liability accounts must never be silently reused.
  await retrieveMerchantAccountStatus(stripe, input.accountId)
  const callbackPath = input.callbackPath || "/api/stripe/connect/status"
  const refreshUrl = new URL(`${callbackPath}?mode=refresh&provider=${input.providerId}`, input.baseUrl).toString()
  const returnUrl = new URL(`${callbackPath}?mode=return&provider=${input.providerId}`, input.baseUrl).toString()
  const link = await stripe.v2.core.accountLinks.create({
    account: input.accountId,
    use_case: { type: "account_onboarding", account_onboarding: {
      configurations: ["merchant"], refresh_url: refreshUrl, return_url: returnUrl,
      collection_options: { fields: "eventually_due", future_requirements: "include" },
    } },
  })
  if (link.livemode) throw new Error("Live-Onboarding-Link wurde technisch abgelehnt.")
  return link.url
}

export async function retrieveMerchantAccountStatus(stripe: Stripe, accountId: string): Promise<MerchantAccountStatus> {
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant", "defaults", "requirements"],
  })
  if (account.livemode) throw new Error("Live-Connect-Konto wurde technisch abgelehnt.")
  const responsibilities = account.defaults?.responsibilities
  if (account.id !== accountId || account.dashboard !== "full" || !account.configuration?.merchant ||
      responsibilities?.fees_collector !== "stripe" || responsibilities?.losses_collector !== "stripe") {
    throw new Error("Dieses Stripe-Konto unterstützt das freigegebene Händler-Zahlungsmodell nicht. Eine neue Händleranbindung ist erforderlich.")
  }
  const capabilities = account.configuration.merchant.capabilities
  const chargesEnabled = capabilities?.card_payments?.status === "active"
  const payoutsEnabled = capabilities?.stripe_balance?.payouts?.status === "active"
  return { accountId: account.id, testMode: true, chargesEnabled, payoutsEnabled,
    onboardingStatus: chargesEnabled ? "enabled" : "onboarding_started" }
}
