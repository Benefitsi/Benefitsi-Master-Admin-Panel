import assert from "node:assert/strict"
import test from "node:test"

import {
  getMicrositePublicDeals,
  getMicrositeStampRewards,
  getMicrositeWelcomeDeals,
  micrositeDealDetails,
  micrositeDealTypeLabel,
  micrositeDealTitle,
  micrositeStampRewardTitle,
  micrositeWelcomeTitle,
} from "../lib/microsite-content.ts"
import { isMicrositeTopDeal } from "../lib/microsite-deals.ts"

const now = Date.parse("2026-08-31T12:00:00.000Z")

test("selects all available public deals but keeps stamp and lifecycle rewards in the stamp section", () => {
  const deals = [
    { id: "two-for-one", type: "two_for_one", active: true, stock_remaining: null },
    {
      id: "fixed-discount",
      type: "discount",
      discount_type: "fixed",
      active: true,
      stock_remaining: null,
    },
    { id: "welcome", type: "welcome", active: true },
    { id: "bonus-stamp", type: "bonus_stamp", active: true },
    { id: "inactive", type: "discount", active: false },
    { id: "sold-out", type: "discount", active: true, stock_remaining: 0 },
    {
      id: "expired",
      type: "discount",
      active: true,
      valid_until: "2026-08-30T23:59:59.000Z",
    },
    {
      id: "future",
      type: "discount",
      active: true,
      valid_from: "2026-09-01T00:00:00.000Z",
    },
  ]

  assert.deepEqual(
    getMicrositePublicDeals(deals, now).map((deal) => deal.id),
    ["two-for-one", "fixed-discount"],
  )
  assert.deepEqual(
    getMicrositeWelcomeDeals(deals, now).map((deal) => deal.id),
    ["welcome"],
  )
})

test("puts only the stored two-for-one deal first and keeps the app type label for other deals", () => {
  const deals = [
    { id: "happy-hour", type: "happy_hour", active: true },
    { id: "two-for-one", type: "two_for_one", active: true },
    {
      id: "happy-hour-two-for-one",
      type: "happy_hour",
      discount_type: "2for1",
      active: true,
    },
  ]

  assert.deepEqual(
    getMicrositePublicDeals(deals).map((deal) => deal.id),
    ["two-for-one", "happy-hour", "happy-hour-two-for-one"],
  )
  assert.equal(isMicrositeTopDeal(deals[1]), true)
  assert.equal(isMicrositeTopDeal(deals[2]), false)
  assert.equal(micrositeDealTypeLabel(deals[0]), "Happy Hour")
  assert.equal(micrositeDealTypeLabel(deals[1]), "2-für-1-Deal")
})

test("formats the stored deal value and minimum spend for the microsite", () => {
  const deal = {
    type: "discount",
    discount_type: "fixed",
    discount_value: 10,
    min_spend: 50,
    customer_description: "10 € Rabatt ab 50 € Einkaufswert.",
    terms: "Nur auf einen Einkauf ab 50 €.",
  }

  assert.equal(micrositeDealTitle(deal), "10 € Rabatt ab 50 € Einkaufswert")
  assert.deepEqual(micrositeDealDetails(deal), [
    "Nur auf einen Einkauf ab 50 €.",
    "Ab 50 € Einkaufswert",
  ])
})

test("keeps every active base and premium milestone, including equal stamp targets", () => {
  const milestones = getMicrositeStampRewards([
    {
      id: "premium-10",
      required_stamps: 10,
      reward_track_target: "premium",
      active: true,
    },
    {
      id: "base-10",
      required_stamps: 10,
      reward_track_target: "base",
      active: true,
    },
    {
      id: "base-5",
      required_stamps: 5,
      reward_track_target: "base",
      active: true,
    },
    {
      id: "inactive-5",
      required_stamps: 5,
      reward_track_target: "base",
      active: false,
    },
  ])

  assert.deepEqual(
    milestones.map((milestone) => milestone.id),
    ["base-5", "base-10", "premium-10"],
  )
})

test("uses the real welcome and stamp reward values instead of generic copy", () => {
  assert.equal(
    micrositeWelcomeTitle({
      type: "welcome",
      discount_type: "bonus_stamp",
      benefit_count: 2,
    }),
    "Direkt 2 Stempel beim ersten Besuch.",
  )
  assert.equal(
    micrositeStampRewardTitle({
      reward_type: "fixed",
      discount_type: "fixed",
      discount_value: 15,
      title: null,
      reward_item: null,
    }),
    "15 € Rabatt",
  )
})
