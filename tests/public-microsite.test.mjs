import assert from "node:assert/strict"
import test from "node:test"
import publicMicrositeModule from "../lib/public-microsite.ts"
import { isMicrositeTwoForOneDeal } from "../lib/microsite-deals.ts"
import { partnerSocialUrl } from "../lib/microsite-personalization.ts"

const { getPublishedMicrositePage } = publicMicrositeModule

function projectData(data, columns) {
  if (columns === "*") {
    return data
  }

  const fields = columns
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean)

  if (Array.isArray(data)) {
    return data.map((entry) => projectData(entry, columns))
  }

  if (!data || typeof data !== "object") {
    return data
  }

  return Object.fromEntries(
    fields
      .map((field) => [field, data[field]])
      .filter(([, value]) => value !== undefined),
  )
}

function createQuery(result, selections) {
  const query = {
    selectedColumns: "*",
    select(columns) {
      selections.push(columns)
      query.selectedColumns = columns
      return query
    },
    eq() {
      return query
    },
    in() {
      return query
    },
    not() {
      return query
    },
    order() {
      return query
    },
    maybeSingle() {
      return Promise.resolve({
        ...result,
        data: projectData(result.data, query.selectedColumns),
      })
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve({
        ...result,
        data: projectData(result.data, query.selectedColumns),
      }).then(onFulfilled, onRejected)
    },
  }

  return query
}

function createPublicMicrositeClient(options = {}) {
  const selections = []
  const results = {
    microsites: {
      data: {
        id: "microsite-1",
        partner_id: "partner-1",
        slug: "public-shop",
        published_version_id: "version-1",
      },
      error: null,
    },
    partners: {
      data: {
        id: "partner-1",
        name: "Public shop",
        phone: "+49 123 456789",
        owner_id: "owner-private-id",
        email: "shop@example.com",
        pin: "private-pin",
      },
      error: null,
    },
    microsite_versions: {
      data: {
        id: "version-1",
        microsite_id: "microsite-1",
        version_number: 3,
        status: "published",
        created_by: "private-author-id",
        config: {
          elementText: {
            "content.aboutHeadline": "About our shop",
            "content.appPhoneScreenshotUrl": "https://cdn.example/phone.png",
            "content.appQrCodeUrl": "https://cdn.example/partner-controlled-qr.png",
            "content.menuFeaturedItemKey": "menu-item-112",
            "content.socialFeed.enabled": "true",
            "content.socialFeed.platform": "instagram",
            "content.socialFeed.instagram.0.url":
              "https://www.instagram.com/p/valid-public-post/",
            "content.socialFeed.instagram.5.url":
              "https://www.instagram.com/reel/another-public-post/",
            "content.socialFeed.instagram.6.url":
              "https://www.instagram.com/p/not-a-supported-slot/",
            "social.instagram.url": "javascript:alert(1)",
            "social.instagram.enabled": "true",
            "builder.privateNote": "do not expose",
          },
          assets: { library: [{ url: "https://cdn.example/private.png" }] },
          builder: { versionNote: "internal launch note" },
          printables: { note: "internal printable note" },
        },
      },
      error: null,
    },
    deals: {
      data: [
        {
          id: "deal-1",
          partner_id: "partner-1",
          type: "deal",
          discount_type: "fixed",
          benefit_category: "offer",
          audience: "both",
          activation_required: true,
          active: true,
          discount_value: 10,
          reward_item: "Public deal",
          benefit_count: null,
          estimated_savings: 10,
          trigger_value: null,
          min_spend: 50,
          valid_from: null,
          valid_until: null,
          starts_at: null,
          ends_at: null,
          stock_total: null,
          stock_remaining: null,
          staff_instructions: "private staff instructions",
          metadata: { internal: true },
        },
      ],
      error: null,
    },
    partner_reward_milestones: { data: [], error: null },
    partner_socials: {
      data: [
        {
          id: "social-1",
          partner_id: "partner-1",
          platform: "instagram",
          url: "https://www.instagram.com/public-shop/",
          handle: "public-shop",
          sort_order: 0,
        },
      ],
      error: null,
    },
    partner_opening_hours: { data: [], error: null },
    menus: { data: [], error: null },
    menu_categories: { data: [], error: null },
    menu_items: { data: [], error: null },
  }

  if (options.deals) {
    results.deals.data = options.deals
  }

  if (options.socials) {
    results.partner_socials.data = options.socials
  }

  if (options.milestones) {
    results.partner_reward_milestones.data = options.milestones
  }

  return {
    client: {
      from(table) {
        return createQuery(results[table], selections)
      },
    },
    selections,
  }
}

test("published microsites return a narrow, safe public DTO", async () => {
  const { client, selections } = createPublicMicrositeClient()
  const page = await getPublishedMicrositePage(client, "public-shop")

  assert.ok(page)
  assert.equal(page.partner.owner_id, null)
  assert.equal(page.partner.pin, null)
  assert.equal(page.partner.microsite.publishedVersion.created_by, null)
  assert.equal(page.partner.deals[0].staff_instructions, null)
  assert.equal(page.partner.deals[0].metadata, null)
  assert.equal(page.partner.socials.length, 1)
  assert.equal(page.partner.socials[0].platform, "instagram")
  assert.equal(
    page.partner.socials[0].url,
    "https://www.instagram.com/public-shop/",
  )
  assert.equal(page.config.assets.library.length, 0)
  assert.equal(page.config.builder.versionNote, "")
  assert.equal(page.config.printables.note, "")
  assert.equal(page.config.elementText["content.aboutHeadline"], "About our shop")
  assert.equal(
    page.config.elementText["content.appPhoneScreenshotUrl"],
    "https://cdn.example/phone.png",
  )
  assert.equal(page.config.elementText["content.appQrCodeUrl"], undefined)
  assert.equal(
    page.config.elementText["content.menuFeaturedItemKey"],
    "menu-item-112",
  )
  assert.equal(page.config.elementText["content.socialFeed.enabled"], "true")
  assert.equal(page.config.elementText["content.socialFeed.platform"], "instagram")
  assert.equal(
    page.config.elementText["content.socialFeed.instagram.0.url"],
    "https://www.instagram.com/p/valid-public-post/",
  )
  assert.equal(
    page.config.elementText["content.socialFeed.instagram.5.url"],
    "https://www.instagram.com/reel/another-public-post/",
  )
  assert.equal(
    page.config.elementText["content.socialFeed.instagram.6.url"],
    undefined,
  )
  assert.equal(page.config.elementText["social.instagram.url"], undefined)
  assert.equal(page.config.elementText["builder.privateNote"], undefined)
  assert.equal(selections.includes("*"), false)
})

test("public microsites keep the deal eligibility fields needed by the renderer", async () => {
  const baseDeal = {
    partner_id: "partner-1",
    type: "benefit",
    discount_type: "2for1",
    benefit_category: "offer",
    active: true,
    reward_item: "2 für 1 Hauptgericht",
    customer_description: "Ein Hauptgericht gratis",
    terms: "Einmal pro Besuch",
    benefit_count: 1,
    trigger_value: 1,
    valid_from: null,
    valid_until: null,
    starts_at: null,
    ends_at: null,
    stock_total: null,
    stock_remaining: null,
    metadata: null,
  }
  const { client, selections } = createPublicMicrositeClient({
    deals: [
      { ...baseDeal, id: "sold-out", stock_remaining: 0 },
      { ...baseDeal, id: "expired", valid_until: "2000-01-01T00:00:00.000Z" },
      { ...baseDeal, id: "future", valid_from: "2999-01-01T00:00:00.000Z" },
      { ...baseDeal, id: "eligible", stock_remaining: 10 },
    ],
  })

  const page = await getPublishedMicrositePage(client, "public-shop")

  assert.ok(page)
  assert.match(
    selections.find((selection) => selection.includes("stock_remaining")) ?? "",
    /valid_from/,
  )
  assert.deepEqual(
    page.partner.deals.map((deal) => isMicrositeTwoForOneDeal(deal)),
    [false, false, false, true],
  )
})

test("public microsites expose the admin-backed deal and stamp reward fields", async () => {
  const { client, selections } = createPublicMicrositeClient({
    deals: [
      {
        id: "discount-1",
        partner_id: "partner-1",
        type: "discount",
        discount_type: "fixed",
        benefit_category: "direct_selectable",
        audience: "both",
        activation_required: true,
        active: true,
        discount_value: 10,
        reward_item: null,
        benefit_count: null,
        estimated_savings: 10,
        customer_description: "10 € Rabatt ab 50 € Einkaufswert.",
        terms: "Nur auf einen Einkauf ab 50 €.",
        trigger_value: null,
        min_spend: 50,
        valid_from: null,
        valid_until: null,
        starts_at: null,
        ends_at: null,
        stock_total: null,
        stock_remaining: null,
        metadata: null,
      },
      {
        id: "welcome-1",
        partner_id: "partner-1",
        type: "welcome",
        discount_type: "bonus_stamp",
        benefit_category: "automatic_background",
        audience: "both",
        activation_required: false,
        active: true,
        discount_value: null,
        reward_item: null,
        benefit_count: 2,
        estimated_savings: null,
        customer_description: "Willkommensbonus: +2 Stempel beim ersten Besuch.",
        terms: "Einmal pro Nutzerkonto.",
        trigger_value: null,
        min_spend: null,
        valid_from: null,
        valid_until: null,
        starts_at: null,
        ends_at: null,
        stock_total: null,
        stock_remaining: null,
        metadata: null,
      },
    ],
    milestones: [
      {
        id: "milestone-base",
        partner_id: "partner-1",
        required_stamps: 10,
        reward_type: "item",
        discount_type: "item",
        discount_value: null,
        estimated_savings: 8,
        title: "Gratis Döner",
        reward_item: "Döner",
        customer_description: "Sammle 10 Stempel und erhalte einen Döner.",
        terms: "Nach Erreichen des Stempelziels.",
        audience: "both",
        reward_track_target: "base",
        active: true,
      },
      {
        id: "milestone-premium",
        partner_id: "partner-1",
        required_stamps: 10,
        reward_type: "fixed",
        discount_type: "fixed",
        discount_value: 15,
        estimated_savings: 15,
        title: "15 € Rabatt",
        reward_item: null,
        customer_description: "Premium: 15 € Rabatt bei 10 Stempeln.",
        terms: "Nur für Premium-Mitglieder.",
        audience: "premium",
        reward_track_target: "premium",
        active: true,
      },
    ],
  })

  const page = await getPublishedMicrositePage(client, "public-shop")

  assert.ok(page)
  const dealSelection = selections.find((selection) => selection.includes("min_spend"))
  const milestoneSelection = selections.find((selection) => selection.includes("reward_type"))
  assert.match(dealSelection ?? "", /audience/)
  assert.match(dealSelection ?? "", /activation_required/)
  assert.match(milestoneSelection ?? "", /discount_value/)
  assert.match(milestoneSelection ?? "", /reward_track_target/)
  assert.equal(page.partner.deals[0].min_spend, 50)
  assert.equal(page.partner.deals[1].benefit_count, 2)
  assert.equal(page.partner.reward_milestones[0].reward_type, "item")
  assert.equal(page.partner.reward_milestones[0].reward_track_target, "base")
  assert.equal(page.partner.reward_milestones[1].discount_value, 15)
  assert.equal(page.partner.reward_milestones[1].reward_track_target, "premium")
})

test("public microsites sanitize unsafe social URLs and derive WhatsApp safely", async () => {
  const { client } = createPublicMicrositeClient({
    socials: [
      {
        id: "social-whatsapp",
        partner_id: "partner-1",
        platform: "whatsapp",
        url: "javascript:alert(1)",
        handle: "public-shop",
        sort_order: 0,
      },
      {
        id: "social-facebook",
        partner_id: "partner-1",
        platform: "facebook",
        url: "data:text/html,<script>alert(1)</script>",
        handle: "public-shop",
        sort_order: 1,
      },
      {
        id: "social-instagram",
        partner_id: "partner-1",
        platform: "instagram",
        url: "https://www.instagram.com/public-shop/",
        handle: "public-shop",
        sort_order: 2,
      },
    ],
  })

  const page = await getPublishedMicrositePage(client, "public-shop")

  assert.ok(page)
  assert.equal(
    page.partner.socials.find((social) => social.platform === "whatsapp")?.url,
    null,
  )
  assert.equal(
    page.partner.socials.find((social) => social.platform === "facebook")?.url,
    null,
  )
  assert.equal(
    partnerSocialUrl(page.partner, "whatsapp"),
    "https://wa.me/49123456789",
  )
  assert.equal(partnerSocialUrl(page.partner, "facebook"), "")
  assert.equal(
    partnerSocialUrl(page.partner, "instagram"),
    "https://www.instagram.com/public-shop/",
  )
})
