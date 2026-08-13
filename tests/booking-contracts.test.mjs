import assert from "node:assert/strict"
import test from "node:test"

import {
  bookingAlerts,
  calculateApplicationFee,
  canPublishBookingOffer,
  normalizeBookingHold,
} from "../lib/bookings/contracts.ts"

test("calculates the snapshotted Benefitsi application fee in integer cents", () => {
  assert.equal(calculateApplicationFee(10_000, 1200), 1200)
  assert.equal(calculateApplicationFee(999, 1250), 124)
  assert.throws(() => calculateApplicationFee(1000, 3001))
  assert.throws(() => calculateApplicationFee(10.5, 1200))
})

test("accepts only a complete test booking hold contract", () => {
  assert.deepEqual(
    normalizeBookingHold({
      booking_id: "booking-id",
      public_reference: "ABC123",
      offer_title: "Trifels-Führung",
      total_amount: 4500,
      application_fee_amount: 540,
      currency: "eur",
      stripe_account_id: "acct_Test123",
      state: "hold",
      replayed: false,
      hold_expires_at: "2026-08-01T10:00:00Z",
    }),
    {
      bookingId: "booking-id",
      publicReference: "ABC123",
      offerTitle: "Trifels-Führung",
      totalAmount: 4500,
      applicationFeeAmount: 540,
      currency: "eur",
      stripeAccountId: "acct_Test123",
      state: "hold",
      replayed: false,
      holdExpiresAt: "2026-08-01T10:00:00Z",
    },
  )
  assert.throws(() =>
    normalizeBookingHold({
      booking_id: "booking-id",
      public_reference: "ABC",
      total_amount: 1000,
      application_fee_amount: 1100,
      currency: "eur",
      stripe_account_id: "acct_Test123",
    }),
  )
  assert.throws(() =>
    normalizeBookingHold({
      booking_id: "booking-id",
      public_reference: "ABC",
      total_amount: 1000,
      application_fee_amount: 100,
      currency: "usd",
      stripe_account_id: "acct_Test123",
    }),
  )
})

test("offer publication needs both a clean agent review and enabled test provider", () => {
  const offer = {
    id: "offer",
    providerId: "provider",
    providerName: "Test",
    cityId: "city",
    cityName: "Annweiler",
    title: "Führung",
    slug: "fuehrung",
    description: "Beschreibung",
    currency: "eur",
    unitAmount: 2000,
    applicationFeeBps: 1200,
    status: "needs_review",
    canonicalPath: "/stadt/annweiler/buchen/fuehrung",
    reviewStage: "ready_for_human",
    reviewVerdict: "pass",
    reviewIssues: [],
    updatedAt: null,
  }
  const provider = {
    id: "provider",
    partnerId: null,
    displayName: "Test",
    supportEmail: null,
    stripeAccountId: "acct_Test123",
    onboardingStatus: "enabled",
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    testMode: true,
    updatedAt: null,
  }

  assert.equal(canPublishBookingOffer(offer, provider), true)
  assert.equal(
    canPublishBookingOffer(
      {
        ...offer,
        reviewIssues: [
          { code: "price", severity: "blocking", message: "Preis fehlt" },
        ],
      },
      provider,
    ),
    false,
  )
  assert.equal(
    canPublishBookingOffer(offer, { ...provider, testMode: false }),
    false,
  )
  assert.equal(
    canPublishBookingOffer(offer, { ...provider, chargesEnabled: false }),
    false,
  )
})

test("surfaces only actionable provider and booking alerts", () => {
  const providers = [
    {
      id: "provider",
      partnerId: null,
      displayName: "Trifels Tours",
      supportEmail: null,
      stripeAccountId: "acct_Test123",
      onboardingStatus: "restricted",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: true,
      testMode: true,
      updatedAt: null,
    },
  ]
  const booking = {
    id: "booking",
    publicReference: "ABC123",
    offerId: "offer",
    offerTitle: "Führung",
    providerId: "provider",
    providerName: "Trifels Tours",
    slotId: "slot",
    quantity: 2,
    currency: "eur",
    totalAmount: 4000,
    applicationFeeAmount: 480,
    state: "cancel_requested",
    customerEmail: null,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: "pi_test_123",
    stripeRefundId: null,
    createdAt: "2026-07-28T10:00:00Z",
  }

  assert.deepEqual(
    bookingAlerts([booking], providers).map((alert) => alert.code),
    ["provider_restricted", "refund_action_required"],
  )
})
