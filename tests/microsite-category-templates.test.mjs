import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { partnerCategoriesByType } from "../lib/partner-categories.ts"
import { categoryMicrositeThemes, categoryThemeContent } from "../lib/microsite-category-themes.ts"
import { defaultMicrositeTemplateForPartner } from "../lib/microsite-personalization.ts"
import { createDefaultMicrositeConfig, resolveMicrositeConfig } from "../lib/microsites.ts"
import { applyMicrositeTemplatePreset, micrositeTemplatePresets } from "../lib/microsite-templates.ts"
import { createMicrositeStructuredData } from "../lib/microsite-seo.ts"

const categoryTypeCss = fs.readFileSync(new URL("../components/microsite/category-type-microsites.module.css", import.meta.url), "utf8")
const categoryTemplateSource = fs.readFileSync(new URL("../components/microsite/category-premium-microsite.tsx", import.meta.url), "utf8")
const restaurantTemplateSource = fs.readFileSync(new URL("../components/microsite/restaurant-premium-microsite.tsx", import.meta.url), "utf8")
const rendererSource = fs.readFileSync(new URL("../components/microsite/microsite-renderer.tsx", import.meta.url), "utf8")
const builderSource = fs.readFileSync(new URL("../app/microsite-panel.tsx", import.meta.url), "utf8")
const micrositeActionsSource = fs.readFileSync(new URL("../app/microsite-actions.ts", import.meta.url), "utf8")

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

test("every non-food hero has its own visual treatment and respects reduced motion", () => {
  for (const template of Object.keys(categoryMicrositeThemes)) {
    assert.ok(categoryTypeCss.includes(`data-template="${template}"`), template)
  }
  assert.match(categoryTypeCss, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(categoryTypeCss, /@media \(prefers-reduced-motion: no-preference\)/)
  assert.match(categoryTypeCss, /\.heroVisual:hover > img, \.heroVisual:focus-within > img/)
  assert.match(categoryTypeCss, /data-family="activities"/)
  assert.match(categoryTypeCss, /data-family="wellness"/)
  assert.match(categoryTypeCss, /data-family="services"/)
})

test("wellness gets an editorial hero rather than the shared category hero", () => {
  assert.match(categoryTemplateSource, /function WellnessHero/)
  assert.match(categoryTemplateSource, /wellnessHeroIndex/)
  assert.match(categoryTemplateSource, /wellnessHeroLabel/)
  assert.match(categoryTypeCss, /\.wellnessHeroMedia/)
  assert.match(categoryTypeCss, /\.wellnessHeroDetail/)
  assert.match(categoryTypeCss, /\.activitiesHeroStage/)
  assert.match(categoryTypeCss, /\.servicesHeroBrief/)
})

test("wellness uses an angular editorial composition, never a window motif", () => {
  assert.match(categoryTypeCss, /\.wellnessHeroMeasure/)
  assert.match(categoryTypeCss, /\.wellnessHeroLabel/)
  assert.match(categoryTypeCss, /clip-path: polygon/)
  assert.doesNotMatch(categoryTemplateSource, /wellnessHeroHalo|wellnessHeroPebble|wellnessHeroSeal/)
  assert.doesNotMatch(categoryTypeCss, /wellnessHeroHalo|wellnessHeroPebble|wellnessHeroSeal/)
  assert.doesNotMatch(categoryTypeCss, /border-radius: 48% 48%/)
})

test("salon, cinema and the remaining activity partners take separate interactive paths", () => {
  assert.match(categoryTemplateSource, /template === "salon-studio" \? <SalonTemplate/)
  assert.match(categoryTemplateSource, /template === "cinema-showcase" \? <CinemaTemplate/)
  assert.match(categoryTemplateSource, /template !== "cinema-showcase" \? <ActivitiesTemplate/)
  assert.match(categoryTemplateSource, /function SalonHero/)
  assert.match(categoryTemplateSource, /function CinemaHero/)
  assert.match(categoryTemplateSource, /function SalonServiceBook/)
  assert.match(categoryTemplateSource, /function CinemaProgramme/)
  assert.match(categoryTypeCss, /\.salonHeroLookbook/)
  assert.match(categoryTypeCss, /\.cinemaHeroScreen/)
  assert.match(categoryTypeCss, /@keyframes salonSwatchShift/)
  assert.match(categoryTypeCss, /@keyframes cinemaMarquee/)
})

test("the cinema programme remains responsive grid content rather than an overlapping hero control", () => {
  assert.match(categoryTypeCss, /\.cinemaProgrammeGrid \{ display: grid/)
  assert.match(categoryTypeCss, /\.cinemaFilmFeature \{ display: grid/)
  assert.match(categoryTypeCss, /\.salonServiceFeature, \.cinemaFilmFeature \{ grid-template-columns: 1fr/)
  assert.doesNotMatch(categoryTypeCss, /\.cinemaHeroScreen \{[^}]*position: absolute/)
})

test("mock benefits are opt-in builder previews and leave the restaurant template alone", () => {
  const config = createDefaultMicrositeConfig({ ...seed, type: "Wellness", category: ["Spa"] })
  assert.equal(config.builder.mockDealsPreview, false)
  assert.match(categoryTemplateSource, /function mockDealsFor/)
  assert.match(categoryTemplateSource, /Builder-Vorschau · wird nicht veröffentlicht/)
  assert.match(builderSource, /mockDealsPreview/)
  assert.match(rendererSource, /showMockDeals/)
  assert.match(rendererSource, /config\.template !== "restaurant-premium"/)
  assert.doesNotMatch(restaurantTemplateSource, /mockDealsFor/)
})

test("non-food templates explain stamp rewards and give an active 2-for-1 deal its own priority treatment", () => {
  assert.match(categoryTemplateSource, /isMicrositeTwoForOneDeal/)
  assert.match(categoryTemplateSource, /function TwoForOneHighlight/)
  assert.match(categoryTemplateSource, /function StampRewardsPanel/)
  assert.match(categoryTemplateSource, /Collect stamps in the Benefitsi app/)
  assert.match(categoryTemplateSource, /Sammle Stempel in der Benefitsi App/)
  assert.match(categoryTypeCss, /\.twoForOneHighlight/)
  assert.match(categoryTypeCss, /\.stampRewards/)
  assert.match(categoryTypeCss, /--category-on-secondary/)
  assert.doesNotMatch(restaurantTemplateSource, /twoForOneHighlight|className=\{styles\.stampRewards\}/)
})

test("non-food templates expose every partner-selected image slot to the builder", () => {
  for (const slot of [
    'editable("branding.logo", "image"',
    'editable("hero.backgroundImageUrl", "image"',
    'editable("content.aboutHeroImageUrl", "image"',
    'editable(active.micrositeImageId, "image"',
  ]) {
    assert.match(categoryTemplateSource, new RegExp(slot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), slot)
  }

  const partner = { ...seed, type: "Services", category: [] }
  const config = createDefaultMicrositeConfig(partner, "services-local")
  config.branding.logoUrl = "https://example.com/custom-logo.svg"
  config.elementText["content.aboutHeroImageUrl"] = "https://example.com/custom-story.jpg"
  const resolved = resolveMicrositeConfig(config, partner)
  assert.equal(resolved.branding.logoUrl, config.branding.logoUrl)
  assert.equal(resolved.elementText["content.aboutHeroImageUrl"], config.elementText["content.aboutHeroImageUrl"])
})

test("media settings match every rendered category image slot", () => {
  assert.match(categoryTemplateSource, /micrositeShowImage !== false/)
  assert.match(categoryTemplateSource, /content\.wellnessHeroDetailImageUrl/)
  assert.match(builderSource, /name="wellness_hero_detail_image_url"/)
  assert.match(builderSource, /content\.wellnessHeroDetailImageUrl/)
  assert.match(micrositeActionsSource, /content\.wellnessHeroDetailImageUrl/)
  assert.match(builderSource, /value=\{config\.branding\.logoUrl \|\| partner\.logo_url \|\| ""\}/)
})

test("the original food story card images remain selectable and uploadable", () => {
  for (const slot of ["content.aboutIngredientImageUrl", "content.aboutLocationImageUrl"]) {
    assert.match(restaurantTemplateSource, new RegExp(`editableId=\"${slot}\"`), slot)
    assert.match(restaurantTemplateSource, new RegExp(`editable\\(\"${slot}\", \\"image\\"`), slot)
  }

  for (const uploadField of ["about_ingredient_file", "about_location_file"]) {
    assert.match(fs.readFileSync(new URL("../app/microsite-panel.tsx", import.meta.url), "utf8"), new RegExp(uploadField), uploadField)
  }
})

test("the media panel shows the effective food-template images and groups menu media there", () => {
  for (const value of [
    "foodAboutHeroImage",
    "foodAboutIngredientImage",
    "foodAboutLocationImage",
    "foodAboutPrepImage",
  ]) {
    assert.match(builderSource, new RegExp(`const ${value}`), value)
    assert.match(builderSource, new RegExp(`${value}\\}`), value)
  }
  assert.match(builderSource, /ConfigSection title="Speisekartenbilder"/)
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
