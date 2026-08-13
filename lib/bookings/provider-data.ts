import "server-only"

import { redirect } from "next/navigation"
import { getPartnerPortalSession } from "@/lib/partner-portal"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

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

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export async function requireProviderBookingContext() {
  const sessionClient = await createClient()
  const session = await getPartnerPortalSession(sessionClient)
  if (
    !session ||
    (!session.isAdmin &&
      (!session.isPartner || session.partnerIds.length === 0))
  ) {
    redirect("/partner/login")
  }

  const admin = createAdminClient()
  let providerQuery = admin
    .from("booking_providers")
    .select(
      "id,partner_id,display_name,onboarding_status,charges_enabled,payouts_enabled",
    )
  if (!session.isAdmin) {
    providerQuery = providerQuery.in("partner_id", session.partnerIds)
  }
  const providerResult = await providerQuery
  if (providerResult.error) {
    throw new Error("Booking-Anbieter konnten nicht geladen werden.")
  }
  const providers = rows(providerResult.data).map((provider) => ({
    id: String(provider.id ?? ""),
    partnerId: text(provider.partner_id),
    displayName: text(provider.display_name) || "Anbieter",
    onboardingStatus: text(provider.onboarding_status) || "not_started",
    chargesEnabled: provider.charges_enabled === true,
    payoutsEnabled: provider.payouts_enabled === true,
  }))
  const providerIds = providers.map((provider) => provider.id)
  if (providerIds.length === 0) {
    return { session, admin, providers, offers: [], bookings: [] }
  }

  const [offerResult, bookingResult] = await Promise.all([
    admin
      .from("booking_offers")
      .select("id,provider_id,title,status,unit_amount,application_fee_bps")
      .in("provider_id", providerIds)
      .order("updated_at", { ascending: false }),
    admin
      .from("bookings")
      .select(
        "id,public_reference,provider_id,offer_id,quantity,total_amount,application_fee_amount,state,created_at",
      )
      .in("provider_id", providerIds)
      .order("created_at", { ascending: false })
      .limit(250),
  ])
  if (offerResult.error || bookingResult.error) {
    throw new Error("Provider-Buchungen konnten nicht geladen werden.")
  }
  const offers = rows(offerResult.data).map((offer) => ({
    id: String(offer.id ?? ""),
    providerId: String(offer.provider_id ?? ""),
    title: text(offer.title) || "Angebot",
    status: text(offer.status) || "draft",
    unitAmount: number(offer.unit_amount),
    applicationFeeBps: number(offer.application_fee_bps),
  }))
  const offerNames = new Map(offers.map((offer) => [offer.id, offer.title]))
  const bookings = rows(bookingResult.data).map((booking) => ({
    id: String(booking.id ?? ""),
    publicReference: text(booking.public_reference) || "",
    providerId: String(booking.provider_id ?? ""),
    offerId: String(booking.offer_id ?? ""),
    offerTitle: offerNames.get(String(booking.offer_id)) || "Angebot",
    quantity: number(booking.quantity),
    totalAmount: number(booking.total_amount),
    applicationFeeAmount: number(booking.application_fee_amount),
    state: text(booking.state) || "unknown",
    createdAt: text(booking.created_at) || "",
  }))
  return { session, admin, providers, offers, bookings }
}

export async function requireProviderBooking(bookingId: string) {
  const context = await requireProviderBookingContext()
  const booking = context.bookings.find((candidate) => candidate.id === bookingId)
  if (!booking) {
    throw new Error("Buchung gehört nicht zu diesem Partnerzugang.")
  }
  return { ...context, booking }
}
