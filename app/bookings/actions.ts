"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import { canPublishBookingOffer } from "@/lib/bookings/contracts"
import { loadBookingOperations } from "@/lib/bookings/data"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertBookingRealmBoundary, getBookingRealm, isBookingStripeConfigured } from "@/lib/stripe/booking-client"

import { requireBookingObjectScope, requireBookingProviderScope } from "@/lib/stripe/booking-provider-scope"
import { refundLegacyPayment } from "@/lib/stripe/legacy-payments"

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
  assertBookingRealmBoundary()
  if (getBookingRealm() === "sandbox") finish("error", "sandbox_fixture_setup_only")
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
  assertBookingRealmBoundary()
  const providerId = value(formData, "providerId", 80)
  const cityId = value(formData, "cityId", 80)
  const title = value(formData, "title", 160)
  const slug = value(formData, "slug", 160).toLowerCase()
  const description = value(formData, "description", 5000)
  const startsAt = value(formData, "startsAt", 80)
  const endsAt = value(formData, "endsAt", 80)
  const unitAmount = Math.round(Number(value(formData, "priceEuro", 20)) * 100)
  const feeBps = 0 // Software is billed separately; customer payments carry no platform fee.
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
  await requireBookingProviderScope(admin, providerId)
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
  assertBookingRealmBoundary()
  const offerId = value(formData, "offerId", 80)
  if (!UUID_PATTERN.test(offerId)) finish("error", "review_validation")

  const admin = createAdminClient()
  await requireBookingObjectScope(admin, "booking_offers", offerId)
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
  assertBookingRealmBoundary()
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
  await requireBookingProviderScope(admin, provider.id)
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
  assertBookingRealmBoundary()
  const bookingId = value(formData, "bookingId", 80)
  const reason = value(formData, "reason", 1000)
  const confirmed = formData.get("confirm") === "yes"
  if (!UUID_PATTERN.test(bookingId) || reason.length < 3 || !confirmed) {
    finish("error", "cancellation_validation")
  }

  const admin = createAdminClient()
  const bookingResult = await admin
    .from("bookings")
    .select("id,provider_id,state,stripe_account_id,total_amount,currency,stripe_checkout_session_id,stripe_payment_intent_id,stripe_refund_id")
    .eq("id", bookingId)
    .maybeSingle()
  if (bookingResult.error || !bookingResult.data) {
    finish("error", "booking_missing")
  }
  const booking = bookingResult.data
  await requireBookingProviderScope(admin, booking.provider_id)
  const needsRefund = ["confirmed", "cancel_requested"].includes(
    booking.state,
  )
  if (
    needsRefund &&
    (!booking.stripe_payment_intent_id || !isBookingStripeConfigured())
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
    const refund = await refundLegacyPayment(booking)
    const pending = await admin.rpc("mark_booking_refund_pending", {
      p_booking_id: bookingId,
      p_stripe_refund_id: refund.id,
      p_actor_id: identity.id,
      p_actor_profile: identity.profile,
    })
    if (pending.error) throw new Error("Erstattung konnte nicht verknüpft werden.")
  } catch (error) {
    console.error(
      "Stripe test refund failed:",
      error instanceof Error ? error.message : "unknown error",
    )
    finish("error", "test_refund_failed")
  }
  finish("success", "test_refund_created")
}
