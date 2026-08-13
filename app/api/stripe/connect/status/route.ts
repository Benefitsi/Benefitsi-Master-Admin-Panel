import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  getStripeTestClient,
  isStripeConnectPlatformReady,
  requireBookingBaseUrl,
} from "@/lib/stripe/config"
import {
  createRecipientOnboardingLink,
  retrieveRecipientAccountStatus,
} from "@/lib/stripe/connect"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const { adminSession } = await requireAdmin()
  const url = new URL(request.url)
  const providerId = url.searchParams.get("provider")?.trim() || ""
  const mode = url.searchParams.get("mode")
  const baseUrl = requireBookingBaseUrl()

  if (!UUID_PATTERN.test(providerId) || !["refresh", "return"].includes(mode || "")) {
    return NextResponse.redirect(
      new URL("/bookings?error=connect_callback_invalid", baseUrl),
    )
  }
  if (!isStripeConnectPlatformReady()) {
    return NextResponse.redirect(
      new URL("/bookings?error=connect_platform_not_ready", baseUrl),
    )
  }

  const admin = createAdminClient()
  const providerResult = await admin
    .from("booking_providers")
    .select("id,stripe_account_id,test_mode")
    .eq("id", providerId)
    .maybeSingle()
  const provider = providerResult.data
  if (
    providerResult.error ||
    !provider ||
    !provider.test_mode ||
    !provider.stripe_account_id
  ) {
    return NextResponse.redirect(
      new URL("/bookings?error=connect_provider_missing", baseUrl),
    )
  }

  try {
    const stripe = getStripeTestClient()
    const status = await retrieveRecipientAccountStatus(
      stripe,
      provider.stripe_account_id,
    )
    const update = await admin
      .from("booking_providers")
      .update({
        onboarding_status: status.onboardingStatus,
        charges_enabled: status.transfersEnabled,
        payouts_enabled: status.payoutsEnabled,
        details_submitted: status.transfersEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", providerId)
      .eq("stripe_account_id", status.accountId)
      .eq("test_mode", true)
    if (update.error) throw update.error

    await admin.from("booking_audit").insert({
      provider_id: providerId,
      action: "connect_status_synchronized",
      actor_type: "admin",
      actor_id: adminSession.user.id,
      actor_profile:
        adminSession.profile?.display_name ||
        adminSession.user.email ||
        "Benefitsi Admin",
      details: {
        stripe_account_id: status.accountId,
        onboarding_status: status.onboardingStatus,
        transfers_enabled: status.transfersEnabled,
        payouts_enabled: status.payoutsEnabled,
        test_mode: true,
      },
    })

    if (mode === "refresh") {
      const onboardingUrl = await createRecipientOnboardingLink(stripe, {
        accountId: status.accountId,
        providerId,
        baseUrl,
      })
      return NextResponse.redirect(onboardingUrl)
    }

    return NextResponse.redirect(
      new URL(
        `/bookings?connect=returned&provider=${providerId}`,
        baseUrl,
      ),
    )
  } catch (error) {
    console.error(
      "Stripe Connect status sync failed:",
      error instanceof Error ? error.message : "unknown error",
    )
    return NextResponse.redirect(
      new URL("/bookings?error=connect_status_unavailable", baseUrl),
    )
  }
}
