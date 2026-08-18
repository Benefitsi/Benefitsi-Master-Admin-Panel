export const bookingStates = [
  "hold",
  "payment_pending",
  "confirmed",
  "cancel_requested",
  "refund_pending",
  "refunded",
  "cancelled",
  "expired",
  "payment_failed",
] as const

export type BookingState = (typeof bookingStates)[number]

export type BookingProvider = {
  id: string
  partnerId: string | null
  displayName: string
  supportEmail: string | null
  stripeAccountId: string | null
  onboardingStatus: string
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  testMode: boolean
  updatedAt: string | null
}

export type BookingOffer = {
  id: string
  providerId: string
  providerName: string
  cityId: string
  cityName: string
  title: string
  slug: string
  description: string
  currency: string
  unitAmount: number
  applicationFeeBps: number
  status: string
  canonicalPath: string
  reviewStage: string
  reviewVerdict: string
  reviewIssues: BookingIssue[]
  updatedAt: string | null
}

export type BookingSlot = {
  id: string
  offerId: string
  startsAt: string
  endsAt: string
  capacity: number
  status: string
}

export type BookingRecord = {
  id: string
  publicReference: string
  offerId: string
  offerTitle: string
  providerId: string
  providerName: string
  slotId: string
  quantity: number
  currency: string
  totalAmount: number
  applicationFeeAmount: number
  state: BookingState
  customerEmail: string | null
  stripeCheckoutSessionId: string | null
  stripePaymentIntentId: string | null
  stripeRefundId: string | null
  createdAt: string
}

export type BookingAuditEntry = {
  id: string
  action: string
  actorType: string
  actorProfile: string | null
  details: Record<string, unknown>
  createdAt: string
}

export type BookingAlert = {
  code: string
  severity: "blocking" | "warning" | "info"
  message: string
  bookingId?: string
}

export type BookingIssue = {
  code: string
  severity: "blocking" | "warning" | "info"
  message: string
}

export type BookingOperationsData = {
  providers: BookingProvider[]
  offers: BookingOffer[]
  slots: BookingSlot[]
  bookings: BookingRecord[]
  warnings: string[]
  migrationReady: boolean
  cities: Array<{ id: string; name: string }>
}

export type BookingHold = {
  bookingId: string
  publicReference: string
  offerTitle: string
  totalAmount: number
  applicationFeeAmount: number
  currency: "eur"
  stripeAccountId: string
  state: string
  replayed: boolean
  holdExpiresAt: string | null
}

export function calculateApplicationFee(totalAmount: number, feeBps: number) {
  if (
    !Number.isInteger(totalAmount) ||
    totalAmount < 1 ||
    !Number.isInteger(feeBps) ||
    feeBps < 0 ||
    feeBps > 3000
  ) {
    throw new Error("Ungültige Gebührenberechnung.")
  }
  return Math.floor((totalAmount * feeBps) / 10_000)
}

export function isTestConnectedAccount(value: unknown): value is string {
  return typeof value === "string" && /^acct_[A-Za-z0-9]+$/.test(value)
}

export function normalizeBookingHold(value: unknown): BookingHold {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const bookingId = text(row.booking_id)
  const publicReference = text(row.public_reference)
  const stripeAccountId = row.stripe_account_id
  const currency = text(row.currency)
  const totalAmount = integer(row.total_amount)
  const applicationFeeAmount = integer(row.application_fee_amount)

  if (
    !bookingId ||
    !publicReference ||
    !isTestConnectedAccount(stripeAccountId) ||
    currency !== "eur" ||
    totalAmount < 1 ||
    applicationFeeAmount < 0 ||
    applicationFeeAmount > totalAmount
  ) {
    throw new Error("Die Buchungsreservierung hat einen ungültigen Vertrag.")
  }

  return {
    bookingId,
    publicReference,
    offerTitle: text(row.offer_title) || "Benefitsi Erlebnis",
    totalAmount,
    applicationFeeAmount,
    currency,
    stripeAccountId,
    state: text(row.state) || "hold",
    replayed: row.replayed === true,
    holdExpiresAt: text(row.hold_expires_at) || null,
  }
}

export function normalizeBookingIssue(value: unknown): BookingIssue[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 30).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const row = item as Record<string, unknown>
    const message = text(row.message)?.slice(0, 1200)
    if (!message) return []
    const severity =
      row.severity === "blocking" || row.severity === "warning"
        ? row.severity
        : "info"
    return [
      {
        code: text(row.code)?.slice(0, 80) || "booking_review_issue",
        severity,
        message,
      },
    ]
  })
}

export function canPublishBookingOffer(offer: BookingOffer, provider: BookingProvider) {
  return (
    ["draft", "needs_review", "paused"].includes(offer.status) &&
    offer.reviewStage === "ready_for_human" &&
    offer.reviewVerdict === "pass" &&
    !offer.reviewIssues.some((issue) => issue.severity === "blocking") &&
    provider.testMode &&
    provider.onboardingStatus === "enabled" &&
    provider.chargesEnabled &&
    isTestConnectedAccount(provider.stripeAccountId)
  )
}

export function bookingAlerts(
  bookings: BookingRecord[],
  providers: BookingProvider[],
): BookingAlert[] {
  const alerts: BookingAlert[] = []
  for (const provider of providers) {
    if (
      provider.stripeAccountId &&
      (!provider.chargesEnabled || provider.onboardingStatus !== "enabled")
    ) {
      alerts.push({
        code: "provider_restricted",
        severity: "warning",
        message: `${provider.displayName}: Stripe-Onboarding ist eingeschränkt.`,
      })
    }
  }
  for (const booking of bookings) {
    if (booking.state === "cancel_requested") {
      alerts.push({
        code: "refund_action_required",
        severity: "blocking",
        message: `${booking.publicReference}: Storno bestätigt, Test-Refund muss ausgelöst werden.`,
        bookingId: booking.id,
      })
    } else if (booking.state === "payment_failed") {
      alerts.push({
        code: "payment_failed",
        severity: "warning",
        message: `${booking.publicReference}: Zahlung fehlgeschlagen.`,
        bookingId: booking.id,
      })
    } else if (booking.state === "refund_pending") {
      alerts.push({
        code: "refund_pending",
        severity: "info",
        message: `${booking.publicReference}: Stripe-Refund wartet auf Webhook-Bestätigung.`,
        bookingId: booking.id,
      })
    }
  }
  return alerts
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : -1
}
