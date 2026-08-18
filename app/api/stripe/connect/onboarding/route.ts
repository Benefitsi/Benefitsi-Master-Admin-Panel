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
  createTestRecipientAccount,
} from "@/lib/stripe/connect"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const { adminSession } = await requireAdmin()
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const providerId =
    typeof body?.providerId === "string" ? body.providerId.trim() : ""

  if (!UUID_PATTERN.test(providerId)) {
    return NextResponse.json({ error: "Ungültiger Anbieter." }, { status: 400 })
  }
  if (!isStripeConnectPlatformReady()) {
    return NextResponse.json(
      {
        error:
          "Stripe Connect bleibt bis zur Verifizierung der Benefitsi UG gesperrt.",
      },
      { status: 503 },
    )
  }

  try {
    const admin = createAdminClient()
    const providerResult = await admin
      .from("booking_providers")
      .select("id,display_name,support_email,stripe_account_id,test_mode")
      .eq("id", providerId)
      .maybeSingle()
    if (providerResult.error || !providerResult.data) {
      return NextResponse.json(
        { error: "Booking-Anbieter nicht gefunden." },
        { status: 404 },
      )
    }
    if (!providerResult.data.test_mode) {
      return NextResponse.json(
        { error: "Live-Anbieter sind nicht freigegeben." },
        { status: 403 },
      )
    }

    const stripe = getStripeTestClient()
    let accountId = providerResult.data.stripe_account_id
    if (!accountId) {
      accountId = await createTestRecipientAccount(stripe, {
        providerId,
        displayName: providerResult.data.display_name,
        supportEmail: providerResult.data.support_email,
      })

      const update = await admin
        .from("booking_providers")
        .update({
          stripe_account_id: accountId,
          onboarding_status: "onboarding_started",
          updated_at: new Date().toISOString(),
        })
        .eq("id", providerId)
        .eq("test_mode", true)
      if (update.error) {
        return NextResponse.json(
          { error: "Stripe-Konto konnte nicht sicher zugeordnet werden." },
          { status: 500 },
        )
      }
      await admin.from("booking_audit").insert({
        provider_id: providerId,
        action: "connect_account_created",
        actor_type: "admin",
        actor_id: adminSession.user.id,
        actor_profile:
          adminSession.profile?.display_name ||
          adminSession.user.email ||
          "Benefitsi Admin",
        details: { stripe_account_id: accountId, test_mode: true },
      })
    }

    const baseUrl = requireBookingBaseUrl()
    const onboardingUrl = await createRecipientOnboardingLink(stripe, {
      accountId,
      providerId,
      baseUrl,
    })

    return NextResponse.json({ onboardingUrl, testMode: true })
  } catch (error) {
    console.error(
      "Stripe Connect onboarding failed:",
      error instanceof Error ? error.message : "unknown error",
    )
    return NextResponse.json(
      { error: "Stripe-Test-Onboarding ist derzeit nicht verfügbar." },
      { status: 503 },
    )
  }
}
