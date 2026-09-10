import assert from "node:assert/strict"
import test from "node:test"
import {
  isMicrositeTwoForOneDeal,
  partitionMicrositePublicDeals,
} from "../lib/microsite-deals.ts"

test("shows the 2-for-1 image option only for an active matching deal", () => {
  assert.equal(
    isMicrositeTwoForOneDeal({
      active: true,
      reward_item: "2 für 1 Hauptgericht",
      stock_remaining: 20,
    }),
    true,
  )
  assert.equal(
    isMicrositeTwoForOneDeal({
      active: false,
      reward_item: "2 für 1 Hauptgericht",
      stock_remaining: 20,
    }),
    false,
  )
  assert.equal(
    isMicrositeTwoForOneDeal({
      active: true,
      reward_item: "10% Rabatt",
      stock_remaining: 20,
    }),
    false,
  )
})

test("features a real 2-for-1 deal and keeps the remaining deals separate", () => {
  const deals = [
    { id: "discount", type: "discount" },
    { id: "two-for-one", type: "two_for_one" },
    { id: "happy-hour", type: "happy_hour" },
  ]

  const result = partitionMicrositePublicDeals(deals)

  assert.equal(result.featuredDeal?.id, "two-for-one")
  assert.deepEqual(result.secondaryDeals.map((deal) => deal.id), [
    "discount",
    "happy-hour",
  ])
})

test("features another real deal when no 2-for-1 deal exists", () => {
  const deals = [
    { id: "discount", type: "discount" },
    { id: "happy-hour", type: "happy_hour" },
  ]

  const result = partitionMicrositePublicDeals(deals)

  assert.equal(result.featuredDeal?.id, "discount")
  assert.deepEqual(result.secondaryDeals.map((deal) => deal.id), ["happy-hour"])
  assert.deepEqual(partitionMicrositePublicDeals([]), {
    featuredDeal: undefined,
    secondaryDeals: [],
  })
})
