import assert from "node:assert/strict"
import test from "node:test"

import {
  benefitTaxonomyLabel,
  formatBenefitTitle,
} from "../lib/benefit-taxonomy.ts"

test("formats every reward format as a concrete German public title", () => {
  assert.equal(
    formatBenefitTitle({ type: "two_for_one", reward_item: "Pizza" }, "de"),
    "2 für 1 Pizza",
  )
  assert.equal(
    formatBenefitTitle({ type: "discount", discount_type: "percent", discount_value: 10 }, "de"),
    "10 % Rabatt",
  )
  assert.equal(
    formatBenefitTitle({ type: "free_item", reward_item: "Ayran" }, "de"),
    "Gratis Ayran",
  )
  assert.equal(
    formatBenefitTitle({ type: "bonus_stamp", benefit_count: 2 }, "de"),
    "+2 Bonusstempel",
  )
})

test("does not invent a default item for a two-for-one benefit", () => {
  assert.equal(formatBenefitTitle({ type: "two_for_one" }, "de"), "2 für 1")
  assert.doesNotMatch(formatBenefitTitle({ type: "two_for_one" }, "de"), /döner/i)
})

test("separates welcome and comeback deals from automatic stamp bonuses", () => {
  assert.equal(
    benefitTaxonomyLabel({ type: "welcome", discount_type: "percent" }, "de"),
    "Willkommensdeal",
  )
  assert.equal(
    formatBenefitTitle({ type: "welcome", discount_type: "bonus_stamp", benefit_count: 1 }, "de"),
    "Willkommensbonus: +1 Bonusstempel",
  )
  assert.equal(
    benefitTaxonomyLabel({ type: "comeback", discount_type: "percent" }, "de"),
    "Comeback-Deal",
  )
  assert.equal(
    formatBenefitTitle({ type: "comeback", discount_type: "bonus_stamp", benefit_count: 1 }, "de"),
    "Comeback-Bonus: +1 Bonusstempel",
  )
})

test("uses explicit taxonomy dimensions before readable legacy enum values", () => {
  const input = {
    type: "limited_drop",
    discount_type: "percent",
    reward_format: "discount",
    trigger: "comeback",
    campaign_type: "happy_hour",
    activation_mode: "direct_selectable",
    audience: "both",
    discount_value: 20,
  }

  assert.equal(benefitTaxonomyLabel(input, "de"), "Comeback-Deal")
  assert.equal(formatBenefitTitle(input, "de"), "Comeback-Deal: 20 % Rabatt")
  assert.equal(benefitTaxonomyLabel({ type: "limited_drop" }, "de"), "Deal Drop")
})

test("never renders banned public titles and falls back to a concrete title", () => {
  for (const public_title of [
    "Top Deal Pizza",
    "Top-Vorteil",
    "Hauptdeal",
    "Daily Deal",
    "Reward",
    "Gratis-Reward",
  ]) {
    const title = formatBenefitTitle({
      type: "discount",
      discount_type: "percent",
      discount_value: 15,
      public_title,
    }, "de")

    assert.equal(title, "15 % Rabatt")
  }
})

test("keeps allowed explicit public titles while normalizing legacy two-for-one spelling", () => {
  assert.equal(
    formatBenefitTitle({ type: "two_for_one", public_title: "2-for-1 Pasta" }, "de"),
    "2 für 1 Pasta",
  )
  assert.equal(
    formatBenefitTitle({ type: "discount", public_title: "Mittagsrabatt" }, "de"),
    "Mittagsrabatt",
  )
})

test("replaces generic campaign and lifecycle titles with the concrete reward", () => {
  for (const public_title of [
    "Happy Hour",
    "Deal Drop",
    "Rabatt",
    "Gratisartikel",
    "Willkommensdeal",
    "Comeback-Bonus",
  ]) {
    const title = formatBenefitTitle({
      type: "discount",
      discount_type: "percent",
      discount_value: 15,
      public_title,
    }, "de")

    assert.equal(title, "15 % Rabatt")
  }
})

test("uses the canonical automatic fallback label before generic reward labels", () => {
  const input = {
    type: "welcome",
    reward_format: "discount",
    discount_type: "percent",
    discount_value: 10,
    activation_mode: "automatic_fallback",
  }

  assert.equal(benefitTaxonomyLabel(input, "de"), "Dauerrabatt")
  assert.equal(benefitTaxonomyLabel(input, "en"), "Permanent discount")
  assert.equal(formatBenefitTitle(input, "de"), "10 % Rabatt")
})

test("removes forbidden variants from every public title source and generated title", () => {
  assert.equal(
    formatBenefitTitle({
      type: "two_for_one",
      reward_item: "Top Deal Pizza",
      display_title: "Top–Vorteil",
    }, "de"),
    "2 für 1",
  )
  assert.equal(
    formatBenefitTitle({
      type: "free_item",
      reward_item: "Gratis-Reward Ayran",
    }, "de"),
    "Gratisartikel",
  )
})

test("strips legacy two-for-one decorations from reward items before formatting", () => {
  assert.equal(
    formatBenefitTitle({ type: "two_for_one", reward_item: "2 für 1 Hauptgericht" }, "de"),
    "2 für 1 Hauptgericht",
  )
  assert.equal(
    formatBenefitTitle({ type: "two_for_one", reward_item: "2-für-1 Pizza" }, "de"),
    "2 für 1 Pizza",
  )
})

test("rejects decorated generic public titles without rejecting specific partner titles", () => {
  for (const public_title of [
    "Happy Hour!",
    "Happy Hour Angebot",
    "Deal Drop Aktion",
    "Rabatt!",
  ]) {
    assert.equal(
      formatBenefitTitle({
        type: "discount",
        discount_type: "percent",
        discount_value: 15,
        public_title,
      }, "de"),
      "15 % Rabatt",
    )
  }

  assert.equal(
    formatBenefitTitle({ type: "discount", public_title: "Mittagsrabatt" }, "de"),
    "Mittagsrabatt",
  )
})

test("returns a single lifecycle label when no concrete reward is configured", () => {
  assert.equal(formatBenefitTitle({ type: "welcome" }, "de"), "Willkommensdeal")
  assert.equal(formatBenefitTitle({ type: "comeback" }, "de"), "Comeback-Deal")
})

test("rejects separator and two-for-one generic decorations while keeping item titles", () => {
  for (const public_title of [
    "Happy-Hour-Vorteil",
    "2 für 1 Vorteil",
    "2-for-1 Deal",
  ]) {
    assert.equal(
      formatBenefitTitle({
        type: "two_for_one",
        reward_item: "Pizza",
        public_title,
      }, "de"),
      "2 für 1 Pizza",
    )
  }

  assert.equal(
    formatBenefitTitle({
      type: "two_for_one",
      reward_item: "Pizza",
      public_title: "2 für 1 Pizza",
    }, "de"),
    "2 für 1 Pizza",
  )
})
