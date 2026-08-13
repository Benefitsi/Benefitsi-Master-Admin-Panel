import type Stripe from "stripe"

type RecipientAccountInput = {
  providerId: string
  displayName: string
  supportEmail: string | null
}

type RecipientOnboardingLinkInput = {
  accountId: string
  providerId: string
  baseUrl: string
}

export type RecipientAccountStatus = {
  accountId: string
  testMode: true
  transfersEnabled: boolean
  payoutsEnabled: boolean
  onboardingStatus: "enabled" | "onboarding_started"
}

export async function createTestRecipientAccount(
  stripe: Stripe,
  input: RecipientAccountInput,
) {
  const account = await stripe.v2.core.accounts.create({
    contact_email: input.supportEmail || undefined,
    display_name: input.displayName,
    dashboard: "express",
    defaults: {
      currency: "eur",
      locales: ["de-DE"],
      profile: {
        doing_business_as: input.displayName,
        product_description:
          "Lokale Erlebnisse und buchbare Angebote über Benefitsi",
      },
      responsibilities: {
        fees_collector: "application",
        losses_collector: "application",
      },
    },
    identity: {
      country: "DE",
      entity_type: "company",
      business_details: {
        registered_name: input.displayName,
      },
    },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { requested: true },
          },
        },
      },
    },
    metadata: {
      benefitsi_provider_id: input.providerId,
      environment: "test",
    },
    include: ["configuration.recipient", "requirements"],
  })

  if (account.livemode) {
    throw new Error("Live-Connect-Konto wurde technisch abgelehnt.")
  }
  return account.id
}

export async function createRecipientOnboardingLink(
  stripe: Stripe,
  input: RecipientOnboardingLinkInput,
) {
  const refreshUrl = new URL(
    `/api/stripe/connect/status?mode=refresh&provider=${input.providerId}`,
    input.baseUrl,
  ).toString()
  const returnUrl = new URL(
    `/api/stripe/connect/status?mode=return&provider=${input.providerId}`,
    input.baseUrl,
  ).toString()
  const link = await stripe.v2.core.accountLinks.create({
    account: input.accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["recipient"],
        refresh_url: refreshUrl,
        return_url: returnUrl,
        collection_options: {
          fields: "eventually_due",
          future_requirements: "include",
        },
      },
    },
  })

  if (link.livemode) {
    throw new Error("Live-Onboarding-Link wurde technisch abgelehnt.")
  }
  return link.url
}

export async function retrieveRecipientAccountStatus(
  stripe: Stripe,
  accountId: string,
): Promise<RecipientAccountStatus> {
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.recipient", "requirements"],
  })
  if (account.livemode) {
    throw new Error("Live-Connect-Konto wurde technisch abgelehnt.")
  }

  const stripeBalance =
    account.configuration?.recipient?.capabilities?.stripe_balance
  const transfersEnabled =
    stripeBalance?.stripe_transfers?.status === "active"
  const payoutsEnabled = stripeBalance?.payouts?.status === "active"

  return {
    accountId: account.id,
    testMode: true,
    transfersEnabled,
    payoutsEnabled,
    onboardingStatus: transfersEnabled ? "enabled" : "onboarding_started",
  }
}
