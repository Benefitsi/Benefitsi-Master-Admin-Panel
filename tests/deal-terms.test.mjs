import assert from "node:assert/strict"
import test from "node:test"

import {
  benefitKindForDeal,
  findRetiredDealTerms,
  formatPercentDiscount,
  occasionForDeal,
  occasionTerms,
} from "../lib/deal-terms.ts"

test("maps stored deal enums to the Brand Guide 2.1 occasions", () => {
  assert.equal(occasionForDeal({ type: "welcome" }), "first_visit")
  assert.equal(occasionForDeal({ type: "comeback", trigger_key: "time_bonus" }), "quick_return")
  assert.equal(occasionForDeal({ type: "comeback", metadata: { bonus_mode: "duration_bonus" } }), "quick_return")
  assert.equal(occasionForDeal({ type: "duration_bonus" }), "quick_return")
  assert.equal(occasionForDeal({ type: "comeback", metadata: { bonus_mode: "comeback_inactive" } }), "reactivation")
  assert.equal(occasionForDeal({ type: "comeback_inactive" }), "reactivation")
  assert.equal(occasionForDeal({ type: "limited_drop" }), "deal_drop")
  assert.equal(occasionForDeal({ type: "happy_hour" }), "happy_hour")
  assert.equal(occasionForDeal({ type: "birthday" }), "birthday")
  assert.equal(occasionForDeal({ type: "two_for_one" }), null)
})

test("keeps partner and user names apart where the guide says so", () => {
  assert.equal(occasionTerms.quick_return.partnerLabel, "Schnelle Rückkehr")
  assert.equal(occasionTerms.quick_return.userLabel, "Schnell zurück")
  assert.equal(occasionTerms.reactivation.partnerLabel, "Reaktivierung")
  assert.equal(occasionTerms.reactivation.userLabel, "Wieder da")
  assert.equal(occasionTerms.first_visit.userLabel, "Erster Besuch")
  assert.equal(occasionTerms.deal_drop.premiumOnly, true)
})

test("maps reward formats to the benefit kind", () => {
  assert.equal(benefitKindForDeal({ type: "welcome", discount_type: "item" }), "free_item")
  assert.equal(benefitKindForDeal({ type: "happy_hour", discount_type: "percent" }), "discount")
  assert.equal(benefitKindForDeal({ type: "two_for_one" }), "two_for_one")
  assert.equal(benefitKindForDeal({ type: "comeback", discount_type: "bonus_stamp" }), "bonus_stamp")
})

test("writes percentages without a space", () => {
  assert.equal(formatPercentDiscount(20), "20% Rabatt")
  assert.equal(formatPercentDiscount(7.5), "7,5% Rabatt")
})

test("flags retired terms as whole words only", () => {
  assert.deepEqual(findRetiredDealTerms("Top Deal: Willkommensbonus").map(entry => entry.term), ["Top Deal", "Willkommensbonus"])
  assert.deepEqual(findRetiredDealTerms("2 für 1 Döner bei Knobi"), [])
  assert.deepEqual(findRetiredDealTerms("Treffpunkte in der Stadt"), [])
  assert.deepEqual(findRetiredDealTerms(null), [])
})
