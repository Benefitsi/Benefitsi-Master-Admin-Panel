import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  Deal,
  MenuCategory,
  MenuItem,
  PartnerMenu,
  Partner,
  PartnerOpeningHour,
  PartnerRewardMilestone,
  PartnerWithDeals,
} from "./admin-data"
import {
  resolveMicrositeConfig,
  type MicrositeConfig,
  type MicrositeVersion,
  type PartnerMicrosite,
} from "./microsites"

export type PublishedMicrositePage = {
  partner: PartnerWithDeals
  config: MicrositeConfig
}

export async function getPublishedMicrositePage(
  supabase: SupabaseClient,
  slug: string,
): Promise<PublishedMicrositePage | null> {
  const micrositeResult = await supabase
    .from("microsites")
    .select("*")
    .eq("slug", slug)
    .not("published_version_id", "is", null)
    .maybeSingle()

  if (micrositeResult.error || !micrositeResult.data) {
    return null
  }

  const microsite = micrositeResult.data as Omit<
    PartnerMicrosite,
    "draftVersion" | "publishedVersion"
  >
  const [
    partnerResult,
    versionResult,
    dealsResult,
    milestonesResult,
    hoursResult,
    menusResult,
    menuCategoriesResult,
    menuItemsResult,
  ] = await Promise.all([
      supabase
        .from("partners")
        .select("*")
        .eq("id", microsite.partner_id)
        .maybeSingle(),
      supabase
        .from("microsite_versions")
        .select("*")
        .eq("id", microsite.published_version_id)
        .eq("status", "published")
        .maybeSingle(),
      supabase
        .from("deals")
        .select("*")
        .eq("partner_id", microsite.partner_id)
        .eq("active", true),
      supabase
        .from("partner_reward_milestones")
        .select("*")
        .eq("partner_id", microsite.partner_id)
        .eq("active", true),
      supabase
        .from("partner_opening_hours")
        .select("*")
        .eq("partner_id", microsite.partner_id)
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase
        .from("menus")
        .select("*")
        .eq("partner_id", microsite.partner_id)
        .eq("status", "published")
        .order("created_at"),
      supabase
        .from("menu_categories")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase
        .from("menu_items")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false }),
    ])

  if (
    partnerResult.error ||
    versionResult.error ||
    !partnerResult.data ||
    !versionResult.data
  ) {
    return null
  }

  const partner = partnerResult.data as Partner
  const version = versionResult.data as MicrositeVersion
  const annotatedPartner: PartnerWithDeals = {
    ...partner,
    deals: (dealsResult.data ?? []) as Deal[],
    holidays: [],
    socials: [],
    reward_milestones:
      (milestonesResult.data ?? []) as PartnerRewardMilestone[],
    staff: [],
    opening_hours: (hoursResult.data ?? []) as PartnerOpeningHour[],
    menus: annotateMenus(
      ((menusResult.data ?? []) as PartnerMenu[]).map((menu) => ({
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

  return {
    partner: annotatedPartner,
    config: resolveMicrositeConfig(version.config, annotatedPartner),
  }
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
