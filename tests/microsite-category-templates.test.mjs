import assert from "node:assert/strict"
import test from "node:test"
import { partnerCategoriesByType } from "../lib/partner-categories.ts"
import { categoryMicrositeThemes, categoryThemeContent } from "../lib/microsite-category-themes.ts"
import { defaultMicrositeTemplateForPartner } from "../lib/microsite-personalization.ts"
import { createDefaultMicrositeConfig, resolveMicrositeConfig } from "../lib/microsites.ts"
import { applyMicrositeTemplatePreset, micrositeTemplatePresets } from "../lib/microsite-templates.ts"
import { createMicrositeStructuredData } from "../lib/microsite-seo.ts"

const seed = { name: "Local Partner", city_name: "Landau", deals: [], reward_milestones: [], menus: [], opening_hours: [], socials: [] }

test("every configured non-food category gets a reusable, persisted category template", () => {
  for (const [type, categories] of Object.entries(partnerCategoriesByType)) {
    for (const category of categories) {
      const partner = { ...seed, type, category: [category] }
      const config = createDefaultMicrositeConfig(partner)
      if (type === "Food & Drink") {
        assert.equal(config.template, "restaurant-premium", category)
        assert.equal(config.content.menuLabel, "Speisekarte")
      } else {
        assert.ok(categoryMicrositeThemes[config.template], category)
        assert.doesNotMatch(JSON.stringify([config.hero, config.content, config.navigation, config.seo]), /Speisekarte|Gerichte|Food & Drinks|Hair & Styling|Color Services/, category)
      }
      assert.equal(resolveMicrositeConfig(JSON.parse(JSON.stringify(config)), partner).template, config.template, category)
      assert.ok(micrositeTemplatePresets.find((item) => item.id === config.template))
    }
  }
})

test("explicit type and category outrank incidental words in names and descriptions", () => {
  assert.equal(defaultMicrositeTemplateForPartner({ type: "Food & Drink", category: ["Restaurant"], name: "Cinema Pizza", description: "Near the spa and climbing gym" }), "restaurant-premium")
  assert.equal(defaultMicrositeTemplateForPartner({ type: "Services", category: ["Hotel"], name: "Spa Hotel" }), "hotel-stay")
  assert.equal(defaultMicrositeTemplateForPartner({ type: "Activities", category: ["Climbing Gym"] }), "adventure-play")
  assert.equal(defaultMicrositeTemplateForPartner({ type: "Wellness", category: ["Friseur"] }), "salon-studio")
  assert.equal(defaultMicrositeTemplateForPartner({ type: "Services", category: ["Pizza"] }), "services-local")
  assert.equal(defaultMicrositeTemplateForPartner({ type: "Activities", category: [] }), "activities-explore")
  assert.equal(defaultMicrositeTemplateForPartner({ type: "Services", category: [] }), "services-local")
})

test("the three non-food partner types use visibly distinct layout families", () => {
  const templates = [
    defaultMicrositeTemplateForPartner({ type: "Activities", category: [] }),
    defaultMicrositeTemplateForPartner({ type: "Wellness", category: [] }),
    defaultMicrositeTemplateForPartner({ type: "Services", category: [] }),
  ]
  const layouts = templates.map((template) => categoryMicrositeThemes[template].layout)

  assert.deepEqual(templates, [
    "activities-explore",
    "wellness-retreat",
    "services-local",
  ])
  assert.deepEqual(layouts, ["dynamic", "editorial", "practical"])
})

test("shared templates retain category-specific visitor guidance in both languages", () => {
  const nail = categoryThemeContent({ category: ["Nail Salon"] }, "salon-studio", "en")
  assert.equal(nail.label, "Nails & care")
  assert.match(nail.note, /materials.*removal/)
  const parking = categoryThemeContent({ category: ["Parkhaus"] }, "mobility-service", "de")
  assert.match(parking.note, /Einfahrtshöhe/)
  const escape = categoryThemeContent({ category: ["Escape Room"] }, "adventure-play", "en")
  assert.match(escape.note, /team size, language, difficulty/)
})

test("saved food versions stay food, even for a partner with another category", () => {
  const partner = { ...seed, type: "Wellness", category: ["Spa"] }
  const saved = { ...createDefaultMicrositeConfig({ ...seed, type: "Food & Drink" }), template: "restaurant-premium" }
  const resolved = resolveMicrositeConfig(saved, partner)
  assert.equal(resolved.template, "restaurant-premium")
  assert.deepEqual(resolved.hero, saved.hero)
  assert.deepEqual(resolved.content, saved.content)
  assert.deepEqual(resolved.navigation, saved.navigation)
})

test("switching templates changes defaults but keeps partner edits and the original config", () => {
  const partner = { ...seed, type: "Wellness", category: ["Nail Salon"] }
  const food = createDefaultMicrositeConfig(partner, "restaurant-premium")
  food.hero.backgroundImageUrl = "https://example.com/partner.jpg"
  food.content.aboutText = "Our personal studio story."
  food.elementText = { "hero.headline": "Your custom headline" }
  food.elementStyles = { "hero.headline": { fontSize: 62 } }
  const before = structuredClone(food)
  const salon = applyMicrositeTemplatePreset(food, "salon-studio", partner)
  assert.equal(salon.content.menuLabel, "Nägel & Pflege")
  assert.equal(salon.navigation.links.find((link) => link.anchor === "speisekarte").label, "Nägel & Pflege")
  assert.doesNotMatch(salon.seo.description, /Speisekarte/)
  assert.equal(salon.content.aboutText, food.content.aboutText)
  assert.equal(salon.hero.backgroundImageUrl, food.hero.backgroundImageUrl)
  assert.deepEqual(salon.elementStyles, food.elementStyles)
  assert.deepEqual(salon.elementText, food.elementText)
  assert.deepEqual(food, before)
  assert.deepEqual(resolveMicrositeConfig(JSON.parse(JSON.stringify(salon)), partner).navigation, salon.navigation)
  const restored = applyMicrositeTemplatePreset(salon, "restaurant-premium", partner)
  assert.equal(restored.content.menuLabel, "Speisekarte")
  assert.equal(restored.content.aboutText, food.content.aboutText)
})

test("all template IDs survive a round trip and support English defaults", () => {
  const partner = { ...seed, type: "Services", category: [] }
  for (const template of Object.keys(categoryMicrositeThemes)) {
    const config = createDefaultMicrositeConfig(partner, template, "en")
    const resolved = resolveMicrositeConfig(JSON.parse(JSON.stringify(config)), partner)
    assert.equal(resolved.template, template)
    assert.equal(resolved.content.menuLabel, categoryThemeContent(partner, template, "en").label)
    assert.equal(resolved.hero.primaryButtonLabel, "View benefits")
    assert.equal(resolved.navigation.links.at(-1).label, "Contact")
  }
})

test("non-food structured data uses the business category and service catalog, not a restaurant menu", () => {
  for (const [category, type, schema] of [["Hotel", "Services", "Hotel"], ["Cinema", "Activities", "MovieTheater"], ["Gym", "Activities", "ExerciseGym"], ["Car Wash", "Services", "AutoWash"]]) {
    const partner = { ...seed, type, category: [category], menus: [{ categories: [], items: [{ name: "Partner offering", price: 20 }] }] }
    const config = createDefaultMicrositeConfig(partner)
    const json = createMicrositeStructuredData({ partner, config, slug: "local-partner" })
    const graph = json["@graph"]
    const business = graph.find((item) => item["@type"] === schema)
    assert.ok(business, category)
    assert.equal(business.hasMenu, undefined)
    assert.equal(business.hasOfferCatalog.name, config.content.menuLabel)
    assert.equal(graph.some((item) => item["@type"] === "Menu"), false)
  }
})
