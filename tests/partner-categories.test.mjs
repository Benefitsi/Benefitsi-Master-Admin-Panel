import assert from "node:assert/strict"
import test from "node:test"
import {
  getPartnerCategoriesForType,
  normalizePartnerCategoriesForType,
  isPartnerCategoryAllowedForType,
  partnerTypeOptions,
} from "../lib/partner-categories.ts"

test("partner types and category dropdown values are alphabetical", () => {
  const labels = partnerTypeOptions.map((option) => option.label)
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, "en")))

  for (const type of partnerTypeOptions) {
    const categories = getPartnerCategoriesForType(type.value)
    assert.deepEqual(
      categories,
      [...categories].sort((a, b) => a.localeCompare(b, "en")),
    )
  }
})

test("food partner categories use canonical English labels", () => {
  const foodCategories = getPartnerCategoriesForType("Food & Drink")

  assert(foodCategories.includes("Doner Kebab"))
  assert(foodCategories.includes("Snack Bar"))
  assert(foodCategories.includes("Soup"))
  assert.equal(foodCategories.includes("Döner"), false)
  assert.equal(foodCategories.includes("Imbiss"), false)
})

test("category normalization maps German aliases to English and deduplicates", () => {
  const normalized = normalizePartnerCategoriesForType("Food & Drink", [
    "Döner",
    "Doner",
    "Imbiss",
    "Suppe",
    "Pizza",
  ])

  assert.deepEqual(normalized, ["Doner Kebab", "Snack Bar", "Soup", "Pizza"])
})

test("category validation enforces partner-type mapping", () => {
  assert.equal(
    isPartnerCategoryAllowedForType("Services", "Döner"),
    false,
  )
  assert.equal(
    isPartnerCategoryAllowedForType("Services", "Parkhaus"),
    true,
  )
  assert.equal(
    isPartnerCategoryAllowedForType("Activities", "Kino"),
    true,
  )
})
