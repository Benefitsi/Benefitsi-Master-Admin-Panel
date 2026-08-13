import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  bookingStates,
  normalizeBookingIssue,
  type BookingOffer,
  type BookingOperationsData,
  type BookingAuditEntry,
  type BookingProvider,
  type BookingRecord,
  type BookingSlot,
  type BookingState,
} from "./contracts"

type Row = Record<string, unknown>

function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Row =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : []
}

function text(value: unknown) {
  return typeof value === "string" ? value : null
}

function bool(value: unknown) {
  return value === true
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function state(value: unknown): BookingState {
  return bookingStates.includes(value as BookingState)
    ? (value as BookingState)
    : "payment_failed"
}

export async function loadBookingOperations(): Promise<BookingOperationsData> {
  const admin = createAdminClient()
  const warnings: string[] = []
  const [providersResult, offersResult, reviewsResult, slotsResult, bookingsResult, citiesResult] =
    await Promise.all([
      admin.from("booking_providers").select("*").order("updated_at", { ascending: false }),
      admin.from("booking_offers").select("*").order("updated_at", { ascending: false }),
      admin.from("booking_offer_reviews").select("*"),
      admin.from("booking_slots").select("*").order("starts_at"),
      admin.from("bookings").select("*").order("created_at", { ascending: false }).limit(250),
      admin.from("cities").select("id,name"),
    ])

  const migrationReady =
    !providersResult.error &&
    !offersResult.error &&
    !reviewsResult.error &&
    !slotsResult.error &&
    !bookingsResult.error

  if (!migrationReady) {
    warnings.push(
      "Das Booking-Schema ist noch nicht angewendet. Testbuchungen und Stripe-Aktionen bleiben deaktiviert.",
    )
  }

  const cityNames = new Map(
    rows(citiesResult.data).map((city) => [
      String(city.id ?? ""),
      text(city.name) || "Unbekannte Stadt",
    ]),
  )
  const providerRows = rows(providersResult.data)
  const providers: BookingProvider[] = providerRows.map((provider) => ({
    id: String(provider.id ?? ""),
    partnerId: text(provider.partner_id),
    displayName: text(provider.display_name) || "Unbenannter Anbieter",
    supportEmail: text(provider.support_email),
    stripeAccountId: text(provider.stripe_account_id),
    onboardingStatus: text(provider.onboarding_status) || "not_started",
    chargesEnabled: bool(provider.charges_enabled),
    payoutsEnabled: bool(provider.payouts_enabled),
    detailsSubmitted: bool(provider.details_submitted),
    testMode: bool(provider.test_mode),
    updatedAt: text(provider.updated_at),
  }))
  const providerNames = new Map(
    providers.map((provider) => [provider.id, provider.displayName]),
  )
  const reviewMap = new Map(
    rows(reviewsResult.data).map((review) => [String(review.offer_id), review]),
  )
  const offers: BookingOffer[] = rows(offersResult.data).map((offer) => {
    const review = reviewMap.get(String(offer.id)) ?? {}
    return {
      id: String(offer.id ?? ""),
      providerId: String(offer.provider_id ?? ""),
      providerName:
        providerNames.get(String(offer.provider_id)) || "Unbekannter Anbieter",
      cityId: String(offer.city_id ?? ""),
      cityName: cityNames.get(String(offer.city_id)) || "Unbekannte Stadt",
      title: text(offer.title) || "Ohne Titel",
      slug: text(offer.slug) || "",
      description: text(offer.description) || "",
      currency: text(offer.currency) || "eur",
      unitAmount: number(offer.unit_amount),
      applicationFeeBps: number(offer.application_fee_bps),
      status: text(offer.status) || "draft",
      canonicalPath: text(offer.canonical_path) || "",
      reviewStage: text(review.stage) || "agent_draft",
      reviewVerdict: text(review.verdict) || "unreviewed",
      reviewIssues: normalizeBookingIssue(review.issues),
      updatedAt: text(offer.updated_at),
    }
  })
  const offerNames = new Map(offers.map((offer) => [offer.id, offer.title]))
  const slots: BookingSlot[] = rows(slotsResult.data).map((slot) => ({
    id: String(slot.id ?? ""),
    offerId: String(slot.offer_id ?? ""),
    startsAt: text(slot.starts_at) || "",
    endsAt: text(slot.ends_at) || "",
    capacity: number(slot.capacity),
    status: text(slot.status) || "archived",
  }))
  const bookings: BookingRecord[] = rows(bookingsResult.data).map((booking) => ({
    id: String(booking.id ?? ""),
    publicReference: text(booking.public_reference) || "",
    offerId: String(booking.offer_id ?? ""),
    offerTitle: offerNames.get(String(booking.offer_id)) || "Unbekanntes Angebot",
    providerId: String(booking.provider_id ?? ""),
    providerName:
      providerNames.get(String(booking.provider_id)) || "Unbekannter Anbieter",
    slotId: String(booking.slot_id ?? ""),
    quantity: number(booking.quantity),
    currency: text(booking.currency) || "eur",
    totalAmount: number(booking.total_amount),
    applicationFeeAmount: number(booking.application_fee_amount),
    state: state(booking.state),
    customerEmail: text(booking.customer_email),
    stripeCheckoutSessionId: text(booking.stripe_checkout_session_id),
    stripePaymentIntentId: text(booking.stripe_payment_intent_id),
    stripeRefundId: text(booking.stripe_refund_id),
    createdAt: text(booking.created_at) || "",
  }))

  return {
    providers,
    offers,
    slots,
    bookings,
    warnings,
    migrationReady,
    cities: rows(citiesResult.data).map((city) => ({
      id: String(city.id ?? ""),
      name: text(city.name) || "Unbekannte Stadt",
    })),
  }
}

export async function loadBookingDetail(bookingId: string) {
  const data = await loadBookingOperations()
  const booking = data.bookings.find((candidate) => candidate.id === bookingId) ?? null
  if (!booking) return { booking: null, audit: [] as BookingAuditEntry[], data }

  const admin = createAdminClient()
  const auditResult = await admin
    .from("booking_audit")
    .select("id,action,actor_type,actor_profile,details,created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(100)
  if (auditResult.error) {
    data.warnings.push("Der Booking-Audit konnte nicht vollständig geladen werden.")
  }
  const audit: BookingAuditEntry[] = rows(auditResult.data).map((entry) => ({
    id: String(entry.id ?? ""),
    action: text(entry.action) || "unknown",
    actorType: text(entry.actor_type) || "unknown",
    actorProfile: text(entry.actor_profile),
    details:
      entry.details && typeof entry.details === "object" && !Array.isArray(entry.details)
        ? (entry.details as Record<string, unknown>)
        : {},
    createdAt: text(entry.created_at) || "",
  }))
  return { booking, audit, data }
}
