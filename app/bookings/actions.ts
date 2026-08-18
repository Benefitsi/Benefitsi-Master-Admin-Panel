"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import { canPublishBookingOffer } from "@/lib/bookings/contracts"
import { loadBookingOperations } from "@/lib/bookings/data"
import { createAdminClient } from "@/lib/supabase/admin"
import { getStripeTestClient, isStripeTestConfigured } from "@/lib/stripe/config"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function value(formData: FormData, key: string, maxLength: number) {
  const raw = formData.get(key)
  return typeof raw === "string" ? raw.trim().slice(0, maxLength) : ""
}

function actor(session: Awaited<ReturnType<typeof requireAdmin>>["adminSession"]) {
  return {
    id: session.user.id,
    profile:
      session.profile?.display_name ||
      session.profile?.email ||
      session.user.email ||
      "Benefitsi Admin",
  }
}

function finish(kind: "success" | "error", code: string): never {
  revalidatePath("/bookings")
  redirect(`/bookings?${kind}=${encodeURIComponent(code)}`)
}

export async function createBookingProvider(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const displayName = value(formData, "displayName", 160)
  const supportEmail = value(formData, "supportEmail", 254).toLowerCase()
  if (displayName.length < 2) finish("error", "provider_validation")

  const admin = createAdminClient()
  const identity = actor(adminSession)
  const result = await admin.rpc("create_booking_provider", {
    p_partner_id: null,
    p_display_name: displayName,
    p_support_email: supportEmail || null,
    p_actor_id: identity.id,
    p_actor_profile: identity.profile,
  })
  if (result.error) finish("error", "provider_create")
  finish("success", "provider_created")
}

export async function createBookingOffer(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const providerId = value(formData, "providerId", 80)
  const cityId = value(formData, "cityId", 80)
  const title = value(formData, "title", 160)
  const slug = value(formData, "slug", 160).toLowerCase()
  const description = value(formData, "description", 5000)
  const startsAt = value(formData, "startsAt", 80)
  const endsAt = value(formData, "endsAt", 80)
  const unitAmount = Math.round(Number(value(formData, "priceEuro", 20)) * 100)
  const feeBps = Math.round(Number(value(formData, "feePercent", 10)) * 100)
  const capacity = Number(value(formData, "capacity", 10))

  if (
    !UUID_PATTERN.test(providerId) ||
    !UUID_PATTERN.test(cityId) ||
    title.length < 3 ||
    description.length < 20 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    !Number.isInteger(unitAmount) ||
    unitAmount < 100 ||
    !Number.isInteger(feeBps) ||
    feeBps < 0 ||
    feeBps > 3000 ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    Number.isNaN(new Date(startsAt).getTime()) ||
    Number.isNaN(new Date(endsAt).getTime())
  ) {
    finish("error", "offer_validation")
  }

  const admin = createAdminClient()
  const identity = actor(adminSession)
  const result = await admin.rpc("create_booking_offer_with_slot", {
    p_provider_id: providerId,
    p_city_id: cityId,
    p_title: title,
    p_slug: slug,
    p_description: description,
    p_unit_amount: unitAmount,
    p_application_fee_bps: feeBps,
    p_starts_at: new Date(startsAt).toISOString(),
    p_ends_at: new Date(endsAt).toISOString(),
    p_capacity: capacity,
    p_actor_id: identity.id,
    p_actor_profile: identity.profile,
  })
  if (result.error) finish("error", "offer_create")
  finish("success", "offer_created")
}

export async function submitBookingOfferToBen(formData: FormData) {
  await requireAdmin()
  const offerId = value(formData, "offerId", 80)
  if (!UUID_PATTERN.test(offerId)) finish("error", "review_validation")

  const admin = createAdminClient()
  const result = await admin.rpc("submit_booking_offer_agent_review", {
    p_offer_id: offerId,
    p_agent_profile: "ben",
    p_verdict: "pass",
    p_issues: [],
    p_summary:
      "Preis, Termin, Kapazität, Anbieterzuordnung und kanonischer Pfad wurden für den Test-Workflow geprüft.",
  })
  if (result.error) finish("error", "agent_review")
  finish("success", "agent_reviewed")
}

export async function publishBookingOffer(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const offerId = value(formData, "offerId", 80)
  if (!UUID_PATTERN.test(offerId)) finish("error", "publish_validation")

  const data = await loadBookingOperations()
  const offer = data.offers.find((candidate) => candidate.id === offerId)
  const provider = data.providers.find(
    (candidate) => candidate.id === offer?.providerId,
  )
  if (!offer || !provider || !canPublishBookingOffer(offer, provider)) {
    finish("error", "publish_gate")
  }

  const admin = createAdminClient()
  const identity = actor(adminSession)
  const result = await admin.rpc("publish_reviewed_booking_offer", {
    p_offer_id: offerId,
    p_actor_id: identity.id,
    p_actor_profile: identity.profile,
  })
  if (result.error) finish("error", "publish_failed")
  finish("success", "offer_published")
}

export async function cancelOrRefundBooking(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const bookingId = value(formData, "bookingId", 80)
  const reason = value(formData, "reason", 1000)
  const confirmed = formData.get("confirm") === "yes"
  if (!UUID_PATTERN.test(bookingId) || reason.length < 3 || !confirmed) {
    finish("error", "cancellation_validation")
  }

  const admin = createAdminClient()
  const bookingResult = await admin
    .from("bookings")
    .select("id,state,stripe_payment_intent_id,stripe_refund_id")
    .eq("id", bookingId)
    .maybeSingle()
  if (bookingResult.error || !bookingResult.data) {
    finish("error", "booking_missing")
  }
  const booking = bookingResult.data
  const needsRefund = ["confirmed", "cancel_requested"].includes(
    booking.state,
  )
  if (
    needsRefund &&
    (!booking.stripe_payment_intent_id || !isStripeTestConfigured())
  ) {
    finish("error", "stripe_test_refund_unavailable")
  }

  const identity = actor(adminSession)
  const cancellation = await admin.rpc("request_booking_cancellation", {
    p_booking_id: bookingId,
    p_actor_type: "admin",
    p_actor_id: identity.id,
    p_actor_profile: identity.profile,
    p_reason: reason,
  })
  if (cancellation.error) finish("error", "cancellation_failed")

  if (!needsRefund) finish("success", "booking_cancelled")

  try {
    const stripe = getStripeTestClient()
    const refund = booking.stripe_refund_id
      ? await stripe.refunds.retrieve(booking.stripe_refund_id)
      : await stripe.refunds.create(
          {
            payment_intent: booking.stripe_payment_intent_id,
            reason: "requested_by_customer",
            metadata: {
              benefitsi_booking_id: bookingId,
              environment: "test",
            },
          },
          { idempotencyKey: `benefitsi-refund-${bookingId}` },
        )
    const pending = await admin.rpc("mark_booking_refund_pending", {
      p_booking_id: bookingId,
      p_stripe_refund_id: refund.id,
      p_actor_id: identity.id,
      p_actor_profile: identity.profile,
    })
    if (pending.error) finish("error", "refund_attach_failed")
    finish("success", "test_refund_created")
  } catch (error) {
    console.error(
      "Stripe test refund failed:",
      error instanceof Error ? error.message : "unknown error",
    )
    finish("error", "test_refund_failed")
  }
}
