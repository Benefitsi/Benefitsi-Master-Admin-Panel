import "server-only"
import { BENEFITSI_STRIPE_SANDBOX_ACCOUNT_ID, getVerifiedStripeSandboxClient, isStripeSandboxConfigured } from "./config"

export type StripeSandboxStatus = { state: "not_configured" | "configured_unverified" | "verified"; accountId: typeof BENEFITSI_STRIPE_SANDBOX_ACCOUNT_ID }

/** Read-only projection: configuration is distinct from verified account/test-mode proof. */
export async function getStripeSandboxStatus(): Promise<StripeSandboxStatus> {
  const status = (state: StripeSandboxStatus["state"]): StripeSandboxStatus => ({ state, accountId: BENEFITSI_STRIPE_SANDBOX_ACCOUNT_ID })
  if (!isStripeSandboxConfigured()) return status("not_configured")
  try {
    await getVerifiedStripeSandboxClient()
    return status(isStripeSandboxConfigured() ? "verified" : "not_configured")
  } catch {
    // Stripe errors may contain request, account or credential details.
    return status(isStripeSandboxConfigured() ? "configured_unverified" : "not_configured")
  }
}
