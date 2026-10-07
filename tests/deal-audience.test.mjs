import assert from "node:assert/strict"
import test from "node:test"
import { defaultDealAudience, partnerAudienceError } from "../lib/deal-audience.ts"
test("canonical and legacy campaign fields independently require Premium", () => {
  for (const value of [
    { type: "welcome", trigger_key: "visit" }, { trigger_key: "duration_bonus" }, { type: "2for1" },
    { reward_format: "2for1" }, { discount_type: "two_for_one" }, { campaign_type: "limited_drop" },
    { type: "comeback", metadata: { bonus_mode: "duration_bonus" } }, { type: "birthday" }, { trigger_key: "streak" },
  ]) assert.equal(defaultDealAudience(value), "premium", JSON.stringify(value))
  for (const value of [{ type: "discount" }, { type: "happy_hour", discount_type: "item" }, { type: "free_item" }, { type: "bonus_stamp" }]) assert.equal(defaultDealAudience(value), "both")
})
test("a partner cannot lower an already Premium ordinary benefit or carry an exception to a different campaign", () => {
  assert.ok(partnerAudienceError({ type: "discount", audience: "both", premium_only: false }, { type: "discount", audience: "premium", premium_only: true }))
  assert.ok(partnerAudienceError({ type: "welcome", audience: "free", premium_only: false }, { type: "streak", audience: "free", premium_only: false }))
  assert.equal(partnerAudienceError({ type: "welcome", audience: "free", premium_only: false }, { type: "welcome", audience: "free", premium_only: false }), null)
})
