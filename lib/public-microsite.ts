import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  Deal,
  MenuCategory,
  MenuItem,
  PartnerMenu,
  Partner,
  PartnerOpeningHour,
  PartnerRewardMilestone,
  PartnerSocial,
  PartnerWithDeals,
} from "./admin-data"
import {
  resolveMicrositeConfig,
  type MicrositeConfig,
  type MicrositeVersion,
  type PartnerMicrosite,
} from "./microsites"
import { normalizePublicHttpUrl } from "./microsite-personalization"

export type PublishedMicrositePage = {
  partner: PartnerWithDeals
  config: MicrositeConfig
}

const PUBLIC_DEAL_COLUMNS =
  "id,partner_id,type,discount_type,premium_only,benefit_category,audience,activation_required,active,discount_value,reward_item,benefit_count,estimated_savings,customer_description,terms,trigger_value,expiry_days,happy_hour_start,happy_hour_end,starts_at,ends_at,valid_from,valid_until,valid_weekdays,min_spend,stock_total,stock_remaining,metadata"

export async function getPublishedMicrositePage(
  supabase: SupabaseClient,
  slug: string,
): Promise<PublishedMicrositePage | null> {
  const micrositeResult = await supabase
    .from("microsites")
    .select(
      "id,partner_id,slug,subdomain,canonical_url,published_version_id,created_at,updated_at",
    )
    .eq("slug", slug)
    .not("published_version_id", "is", null)
    .maybeSingle()

  if (micrositeResult.error || !micrositeResult.data) {
    return null
  }

  const microsite = {
    ...micrositeResult.data,
    status: "published",
  } as Omit<PartnerMicrosite, "draftVersion" | "publishedVersion">
  const [
    partnerResult,
    versionResult,
    dealsResult,
    milestonesResult,
    socialsResult,
    hoursResult,
    menusResult,
  ] = await Promise.all([
      supabase
        .from("partners")
        .select(
          "id,name,slug,subdomain,short_name,description,category,type,logo_url,feature_card_url,discover_card_image_url,cover_urls,address,phone,website,is_active,coordinates,email",
        )
        .eq("id", microsite.partner_id)
        .maybeSingle(),
      supabase
        .from("microsite_versions")
        .select("id,microsite_id,version_number,config,status,created_at")
        .eq("id", microsite.published_version_id)
        .eq("microsite_id", microsite.id)
        .eq("status", "published")
        .maybeSingle(),
      supabase
        .from("deals")
        .select(PUBLIC_DEAL_COLUMNS)
        .eq("partner_id", microsite.partner_id)
        .eq("active", true),
      supabase
        .from("partner_reward_milestones")
        .select(
          "id,partner_id,required_stamps,reward_type,reward_item,discount_type,discount_value,estimated_savings,title,customer_description,terms,audience,active,reward_track_target",
        )
        .eq("partner_id", microsite.partner_id)
        .eq("active", true),
      supabase
        .from("partner_socials")
        .select("id,partner_id,platform,url,handle,sort_order")
        .eq("partner_id", microsite.partner_id)
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase
        .from("partner_opening_hours")
        .select("id,partner_id,weekday,opens_at,closes_at,label,is_closed,sort_order")
        .eq("partner_id", microsite.partner_id)
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase
        .from("menus")
        .select("id,partner_id,name,description,status,created_at,updated_at")
        .eq("partner_id", microsite.partner_id)
        .eq("status", "published")
        .order("created_at"),
    ])

  if (
    partnerResult.error ||
    versionResult.error ||
    !partnerResult.data ||
    !versionResult.data
  ) {
    return null
  }

  const menus = (menusResult.data ?? []) as PartnerMenu[]
  const menuIds = menus.map((menu) => menu.id).filter((id): id is string => Boolean(id))
  const [menuCategoriesResult, menuItemsResult] = await Promise.all([
    menuIds.length > 0
      ? supabase
          .from("menu_categories")
          .select("id,menu_id,name,slug,image_url,sort_order")
          .in("menu_id", menuIds)
          .order("sort_order", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [], error: null }),
    menuIds.length > 0
      ? supabase
          .from("menu_items")
          .select(
            "id,menu_id,category_id,name,description,price,currency,image_url,tags,allergens,addons,is_popular,is_stamp_eligible,sort_order,created_at,updated_at",
          )
          .in("menu_id", menuIds)
          .order("sort_order", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [], error: null }),
  ])

  if (menuCategoriesResult.error || menuItemsResult.error) {
    return null
  }

  const partner: Partner = {
    ...(partnerResult.data as Partner),
    owner_id: null,
    city_id: null,
    status: "published",
    is_featured: null,
    stamp_target: null,
    loves: null,
    pin: null,
    created_at: null,
    updated_at: null,
  }
  const version: MicrositeVersion = {
    ...(versionResult.data as MicrositeVersion),
    created_by: null,
  }
  const annotatedPartner: PartnerWithDeals = {
    ...partner,
    deals: (dealsResult.data ?? []) as Deal[],
    holidays: [],
    socials: (socialsResult.data ?? []) as PartnerSocial[],
    reward_milestones:
      (milestonesResult.data ?? []) as PartnerRewardMilestone[],
    staff: [],
    opening_hours: (hoursResult.data ?? []) as PartnerOpeningHour[],
    menus: annotateMenus(
      menus.map((menu) => ({
        ...menu,
        categories: [],
        items: [],
      })),
      (menuCategoriesResult.data ?? []) as MenuCategory[],
      (menuItemsResult.data ?? []) as MenuItem[],
    ),
    stamp_progress: [],
    visits: [],
    fraud_events: [],
    microsite: {
      ...microsite,
      draftVersion: null,
      publishedVersion: version,
    },
    city_name: null,
    owner_email: null,
  }

  const config = sanitizeMicrositeConfig(
    resolveMicrositeConfig(version.config, annotatedPartner),
  )

  return {
    partner: sanitizePartnerForPublicMicrosite(annotatedPartner, config),
    config,
  }
}

function sanitizePartnerForPublicMicrosite(
  partner: PartnerWithDeals,
  config: MicrositeConfig,
): PartnerWithDeals {
  return {
    ...partner,
    owner_id: null,
    owner_email: null,
    deals: partner.deals.map((deal) => ({
      ...deal,
      metadata: null,
      staff_instructions: null,
    })),
    reward_milestones: partner.reward_milestones.map((milestone) => ({
      ...milestone,
      staff_instructions: null,
    })),
    socials: partner.socials.map((social) => ({
      ...social,
      url: normalizePublicHttpUrl(social.url) || null,
    })),
    staff: [],
    stamp_progress: [],
    visits: [],
    fraud_events: [],
    microsite: partner.microsite
      ? {
          ...partner.microsite,
          draftVersion: null,
          publishedVersion: partner.microsite.publishedVersion
            ? {
                ...partner.microsite.publishedVersion,
                created_by: null,
                config,
              }
            : null,
        }
      : null,
  }
}

function sanitizeMicrositeConfig(config: MicrositeConfig): MicrositeConfig {
  return {
    ...config,
    assets: { library: [] },
    builder: {
      mobileQaDone: false,
      desktopQaDone: false,
      assetReviewDone: false,
      partnerDataReviewDone: false,
      seoReviewDone: false,
      publishReviewDone: false,
      lastQaAt: "",
      versionNote: "",
    },
    printables: {
      ...config.printables,
      headline: "",
      subheadline: "",
      cta: "",
      note: "",
    },
    elementText: sanitizePublicElementText(config.elementText),
  }
}

const PUBLIC_ELEMENT_TEXT_KEYS = new Set([
  "branding.logo",
  "branding.partnerBadgeUrl",
  "contact.logo",
  "content.aboutHeadline",
  "branding.partnerName",
  "content.aboutHeroImageUrl",
  "content.aboutIngredientImageUrl",
  "content.aboutLabel",
  "content.aboutLocationImageUrl",
  "content.aboutPrepImageUrl",
  "content.aboutSignature",
  "content.aboutSlogan",
  "content.aboutText",
  "content.aboutTextSecond",
  "content.aboutThanks",
  "content.quoteText",
  "content.quoteAttribution",
  "content.appButtonLabel",
  "content.appDownloadUrl",
  "content.appHeadline",
  "content.appKicker",
  "content.appKicker.icon",
  "content.appPhoneScreenshotUrl",
  "content.appQrLabel",
  "content.appQrText",
  "content.appText",
  "content.appVisual.0",
  "content.appVisual.1",
  "content.appVisual.2",
  "content.contactHeadline",
  "content.contactLabel",
  "content.contactLocationIcon",
  "content.contactMap",
  "content.contactOpening",
  "content.contactSlogan",
  "content.contactSocialText",
  "content.ecosystemHeadline",
  "content.ecosystemKicker",
  "content.ecosystemText",
  "content.faqHeadline",
  "content.faqLabel",
  "content.faqText",
  "content.footerText",
  "content.socialFeed.enabled",
  "content.socialFeed.platform",
  "content.socialFeedHeadline",
  "content.socialFeedKicker",
  "content.menuDescription",
  "content.menuFeaturedItemKey",
  "content.menuHeadline",
  "content.menuLabel",
  "deals.description",
  "deals.benefit.0.icon",
  "deals.benefit.0.text",
  "deals.benefit.0.title",
  "deals.benefit.1.icon",
  "deals.benefit.1.text",
  "deals.benefit.1.title",
  "deals.headline",
  "deals.illustrationUrl",
  "deals.label",
  "deals.slogan",
  "deals.topDealButtonLabel",
  "deals.topDealDescription",
  "deals.topDealHeadline",
  "deals.topDealImageUrl",
  "deals.topDealLabel",
  "footer.benefitsiLogo",
  "hero.backgroundImageUrl",
  "hero.badgeText",
  "hero.headline",
  "hero.locationIcon",
  "hero.openingIcon",
  "hero.slogan",
  "navigation.group",
  "stamps.description",
  "stamps.headline",
  "stamps.label",
  "stamps.slogan",
  "stamps.welcomeBonus.icon",
  "stamps.welcomeBonus.text",
  "stamps.welcomeBonus.title",
])

const PUBLIC_ELEMENT_TEXT_PATTERNS = [
  /^navigation\.[a-z0-9-]+$/,
  /^social\.(instagram|facebook|tiktok|youtube|whatsapp|website|google|linkedin)\.(enabled|iconUrl|label|url)$/,
  /^hero\.services\.\d+\.(label|icon|description)$/,
  /^deals\.topDealBullets\.\d+(\.icon)?$/,
  /^stamps\.(number|reward)\.\d+\.(label|image|icon)$/,
  /^content\.aboutValue\.[0-3](\.icon)?$/,
  /^content\.appBenefit\.[0-2](\.icon)?$/,
  /^content\.contact\.(address|phone|opening)(\.icon)?$/,
  /^content\.faq\.[0-5]\.(question|answer)$/,
  /^content\.socialFeed\.(instagram|tiktok)\.[0-5]\.url$/,
  /^content\.menuItem\.[a-z0-9_-]+\.(imageUrl|showImage)$/,
  /^footer\.trust\.[0-2]\.(label|icon)$/,
]

function sanitizePublicElementText(elementText: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(elementText).filter(([key, value]) => {
      if (
        !PUBLIC_ELEMENT_TEXT_KEYS.has(key) &&
        !PUBLIC_ELEMENT_TEXT_PATTERNS.some((pattern) => pattern.test(key))
      ) {
        return false
      }

      if (isVisibilityKey(key)) {
        return value === "true" || value === "false"
      }

      if (isPublicLinkKey(key)) {
        return isSafePublicLink(value)
      }

      if (isPublicAssetKey(key)) {
        return isSafePublicAsset(value)
      }

      return true
    }),
  )
}

function isPublicLinkKey(key: string) {
  return key === "content.appDownloadUrl" || key === "content.contactMap" || key.endsWith(".url")
}

function isPublicAssetKey(key: string) {
  return (
    key.endsWith("Url") ||
    key.endsWith(".iconUrl") ||
    key === "branding.logo" ||
    key === "contact.logo" ||
    key === "content.contactLocationIcon" ||
    key === "content.appKicker.icon" ||
    key === "footer.benefitsiLogo"
  )
}

function isVisibilityKey(key: string) {
  return (
    (key.startsWith("social.") && key.endsWith(".enabled")) ||
    key === "content.socialFeed.enabled" ||
    (key.startsWith("content.menuItem.") && key.endsWith(".showImage"))
  )
}

function isSafePublicLink(value: string) {
  const trimmed = value.trim()

  return (
    /^(mailto:|tel:|\/|#)/i.test(trimmed) ||
    Boolean(normalizePublicHttpUrl(trimmed))
  )
}

function isSafePublicAsset(value: string) {
  return /^(https?:\/\/|\/)/i.test(value.trim())
}

function annotateMenus(
  menus: PartnerMenu[],
  categories: MenuCategory[],
  items: MenuItem[],
) {
  const menuIds = new Set(menus.map((menu) => menu.id).filter(Boolean))
  const categoriesByMenu = new Map<string, MenuCategory[]>()
  const itemsByMenu = new Map<string, MenuItem[]>()
  const itemsByCategory = new Map<string, MenuItem[]>()

  for (const item of items) {
    if (!item.menu_id || !menuIds.has(item.menu_id)) {
      continue
    }

    itemsByMenu.set(item.menu_id, [
      ...(itemsByMenu.get(item.menu_id) ?? []),
      item,
    ])

    if (item.category_id) {
      itemsByCategory.set(item.category_id, [
        ...(itemsByCategory.get(item.category_id) ?? []),
        item,
      ])
    }
  }

  for (const category of categories) {
    if (!category.menu_id || !menuIds.has(category.menu_id)) {
      continue
    }

    categoriesByMenu.set(category.menu_id, [
      ...(categoriesByMenu.get(category.menu_id) ?? []),
      {
        ...category,
        items: category.id ? itemsByCategory.get(category.id) ?? [] : [],
      },
    ])
  }

  return menus.map((menu) => ({
    ...menu,
    categories: menu.id ? categoriesByMenu.get(menu.id) ?? [] : [],
    items: menu.id ? itemsByMenu.get(menu.id) ?? [] : [],
  }))
}
