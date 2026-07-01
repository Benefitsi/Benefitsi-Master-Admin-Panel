import type { SupabaseClient } from "@supabase/supabase-js"
import type { MicrositeVersion, PartnerMicrosite } from "./microsites"

export type Coordinates = {
  latitude: number | null
  longitude: number | null
}

export type StoredCoordinates = Coordinates | string | null

export type JsonRecord = Record<string, unknown> | unknown[] | string | number | boolean | null

export type Partner = {
  id?: string
  owner_id: string | null
  city_id: string | null
  name: string | null
  slug: string | null
  subdomain: string | null
  short_name: string | null
  description: string | null
  category: string[] | null
  type: string | null
  status: string | null
  is_featured: boolean | null
  stamp_target: number | null
  logo_url: string | null
  feature_card_url: string | null
  discover_card_image_url: string | null
  cover_urls: string[] | null
  loves: number | null
  pin: number | null
  created_at: string | null
  updated_at: string | null
  address: string | null
  phone: string | null
  website: string | null
  is_active: boolean | null
  coordinates: StoredCoordinates
  email: string | null
}

export type City = {
  id: string
  name: string | null
  slug?: string | null
}

export type OwnerOption = {
  id: string | null
  uid?: string | null
  email: string | null
  display_name: string | null
  is_partner?: boolean | null
}

export type Deal = {
  id?: string
  partner_id: string | null
  type: string | null
  discount_type: string | null
  premium_only: boolean | null
  benefit_category: string | null
  audience: string | null
  activation_required: boolean | null
  active: boolean | null
  discount_value: number | null
  reward_item: string | null
  benefit_count: number | null
  estimated_savings: number | null
  customer_description: string | null
  staff_instructions: string | null
  terms: string | null
  trigger_value: number | null
  expiry_days: number | null
  happy_hour_start: string | null
  happy_hour_end: string | null
  starts_at: string | null
  ends_at: string | null
  valid_from: string | null
  valid_until: string | null
  valid_weekdays: number[] | null
  max_redemptions_global: number | null
  max_redemptions_per_user: number | null
  cooldown_hours: number | null
  stock_total: number | null
  stock_remaining: number | null
  selection_expires_minutes: number | null
  priority: number | null
  min_spend: number | null
  max_discount_amount: number | null
  allow_free_trial: boolean | null
  reward_track_target: string | null
  timezone: string | null
  weekdays: string[] | null
  reserve_on_selection: boolean | null
  metadata: JsonRecord
  created_at?: string | null
  updated_at?: string | null
}

export type PartnerRewardMilestone = {
  id?: string
  partner_id: string | null
  required_stamps: number | null
  reward_type: string | null
  reward_item: string | null
  discount_type: string | null
  discount_value: number | null
  estimated_savings: number | null
  title: string | null
  customer_description: string | null
  staff_instructions: string | null
  terms: string | null
  audience: string | null
  active: boolean | null
  reward_track_target: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type PartnerSocial = {
  id?: string
  partner_id: string | null
  platform: string | null
  url: string | null
  handle: string | null
  sort_order: number | null
}

export type PartnerStaff = {
  id?: string
  partner_id: string | null
  user_id: string | null
  role: string | null
  active: boolean | null
  created_at?: string | null
  updated_at?: string | null
  user_email?: string | null
  user_name?: string | null
}

export type PartnerOpeningHour = {
  id?: string
  partner_id: string | null
  weekday: number | null
  opens_at: string | null
  closes_at: string | null
  label: string | null
  is_closed: boolean | null
  sort_order: number | null
}

export type PartnerHoliday = {
  id?: string
  partner_id: string | null
  holiday_date: string | null
  label: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type MenuItem = {
  id?: string
  menu_id: string | null
  category_id: string | null
  name: string | null
  description: string | null
  price: number | string | null
  currency: string | null
  image_url: string | null
  tags: string[] | null
  allergens: string[] | null
  is_popular: boolean | null
  is_stamp_eligible: boolean | null
  sort_order: number | null
  created_at?: string | null
  updated_at?: string | null
}

export type MenuCategory = {
  id?: string
  menu_id: string | null
  name: string | null
  slug: string | null
  sort_order: number | null
  items: MenuItem[]
}

export type PartnerMenu = {
  id?: string
  partner_id: string | null
  name: string | null
  description: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
  categories: MenuCategory[]
  items: MenuItem[]
}

export type StampCardProgress = {
  user_id: string | null
  partner_id: string | null
  partner_name: string | null
  partner_slug: string | null
  lifetime_stamp_count: number | null
  completed_cards: number | null
  current_card_stamp_count: number | null
  stamps_until_card_complete: number | null
  updated_at: string | null
  user_email?: string | null
  user_name?: string | null
}

export type RedemptionAppliedBenefit = {
  id?: string
  visit_id: string | null
  redemption_id: string | null
  deal_id?: string | null
  benefit_category: string | null
  discount_type: string | null
  discount_value: number | null
  reward_item: string | null
  stamp_delta: number | null
  savings: number | null
  source_type: string | null
  metadata: JsonRecord
  created_at?: string | null
}

export type DealRedemption = {
  id?: string
  user_id: string | null
  partner_id: string | null
  deal_id: string | null
  visit_id: string | null
  redeemed_at: string | null
  deal_type: string | null
  discount_type: string | null
  discount_value: number | null
  savings: number | null
  reward_item: string | null
  created_at?: string | null
}

export type QrToken = {
  id?: string
  partner_id: string | null
  user_id?: string | null
  deal_selection_id?: string | null
  visit_id?: string | null
  redemption_id?: string | null
  token?: string | null
  qr_token?: string | null
  status?: string | null
  created_at?: string | null
  expires_at?: string | null
  redeemed_at?: string | null
  metadata?: JsonRecord
}

export type Visit = {
  id?: string
  user_id: string | null
  partner_id: string | null
  visited_at: string | null
  selected_direct_deal_id: string | null
  applied_fallback_deal_id: string | null
  base_stamp_count: number | null
  bonus_stamp_count: number | null
  total_stamp_delta: number | null
  redemption_status: string | null
  animation_payload: JsonRecord
  staff_user_id: string | null
  staff_user_name: string | null
  qr_token_id?: string | null
  idempotency_key?: string | null
  user_email?: string | null
  user_name?: string | null
  staff_user_email?: string | null
  applied_benefits: RedemptionAppliedBenefit[]
  deal_redemptions: DealRedemption[]
  qr_tokens: QrToken[]
}

export type FraudEvent = {
  id?: string
  event_type: string | null
  severity: string | null
  reason_code: string | null
  description: string | null
  user_id: string | null
  partner_id: string | null
  staff_user_id: string | null
  visit_id: string | null
  redemption_id: string | null
  qr_token_id: string | null
  created_at: string | null
  metadata: JsonRecord
  user_email?: string | null
  staff_email?: string | null
}

export type PartnerWithDeals = Partner & {
  deals: Deal[]
  holidays: PartnerHoliday[]
  socials: PartnerSocial[]
  reward_milestones: PartnerRewardMilestone[]
  staff: PartnerStaff[]
  opening_hours: PartnerOpeningHour[]
  menus: PartnerMenu[]
  stamp_progress: StampCardProgress[]
  visits: Visit[]
  fraud_events: FraudEvent[]
  microsite: PartnerMicrosite | null
  city_name?: string | null
  owner_email?: string | null
}

export type DashboardData = {
  partners: PartnerWithDeals[]
  cities: City[]
  owners: OwnerOption[]
  partnerCount: number
  dealCount: number
  errors: string[]
}

export async function getDashboardData(
  supabase: SupabaseClient,
): Promise<DashboardData> {
  const [
    partnersResult,
    dealsResult,
    citiesResult,
    ownersResult,
    holidaysResult,
    socialsResult,
    milestonesResult,
    staffResult,
    openingHoursResult,
    menusResult,
    menuCategoriesResult,
    menuItemsResult,
    progressResult,
    visitsResult,
    redemptionsResult,
    benefitsResult,
    qrTokensResult,
    micrositesResult,
    micrositeVersionsResult,
  ] = await Promise.all([
    supabase
      .from("partners")
      .select("*")
      .order("created_at", { ascending: false, nullsFirst: false }),
    supabase.from("deals").select("*"),
    supabase.from("cities").select("id,name,slug").order("name"),
    fetchOwnerOptions(supabase),
    supabase.from("partner_holidays").select("*").order("holiday_date"),
    supabase
      .from("partner_socials")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false }),
    supabase.from("partner_reward_milestones").select("*"),
    supabase.from("partner_staff").select("*"),
    supabase
      .from("partner_opening_hours")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false }),
    supabase.from("menus").select("*").order("created_at"),
    supabase
      .from("menu_categories")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false }),
    supabase
      .from("menu_items")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false }),
    supabase.from("stamp_cards_progress_view").select("*").limit(300),
    supabase
      .from("visits")
      .select("*")
      .order("visited_at", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase
      .from("deal_redemptions")
      .select("*")
      .order("redeemed_at", { ascending: false, nullsFirst: false })
      .limit(300),
    supabase
      .from("redemption_applied_benefits")
      .select("*")
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(500),
    supabase
      .from("qr_tokens")
      .select("*")
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(300),
    supabase.from("microsites").select("*"),
    supabase
      .from("microsite_versions")
      .select("*")
      .order("version_number", { ascending: false, nullsFirst: false }),
  ])

  const errors = [
    partnersResult.error?.message,
    dealsResult.error?.message,
    citiesResult.error?.message,
    ownersResult.error,
    holidaysResult.error?.message,
    socialsResult.error?.message,
    milestonesResult.error?.message,
    staffResult.error?.message,
    openingHoursResult.error?.message,
    menusResult.error?.message,
    menuCategoriesResult.error?.message,
    menuItemsResult.error?.message,
    progressResult.error?.message,
    visitsResult.error?.message,
    redemptionsResult.error?.message,
    benefitsResult.error?.message,
    qrTokensResult.error?.message,
    micrositesResult.error?.message,
    micrositeVersionsResult.error?.message,
  ].filter(Boolean) as string[]

  const partners = ((partnersResult.data ?? []) as Partner[]).map((partner) => ({
    ...partner,
    deals: [],
    holidays: [],
    socials: [],
    reward_milestones: [],
    staff: [],
    opening_hours: [],
    menus: [],
    stamp_progress: [],
    visits: [],
    fraud_events: [],
    microsite: null,
  }))
  const deals = ((dealsResult.data ?? []) as Deal[]).map(normalizeLoadedDeal)
  const cities = (citiesResult.data ?? []) as City[]
  const owners = ownersResult.data
  const holidays = (holidaysResult.data ?? []) as PartnerHoliday[]
  const socials = (socialsResult.data ?? []) as PartnerSocial[]
  const milestones =
    (milestonesResult.data ?? []) as PartnerRewardMilestone[]
  const staff = (staffResult.data ?? []) as PartnerStaff[]
  const openingHours =
    (openingHoursResult.data ?? []) as PartnerOpeningHour[]
  const menuCategories =
    (menuCategoriesResult.data ?? []) as MenuCategory[]
  const menuItems = (menuItemsResult.data ?? []) as MenuItem[]
  const menus = ((menusResult.data ?? []) as PartnerMenu[]).map((menu) => ({
    ...menu,
    categories: [],
    items: [],
  }))
  const progress = (progressResult.data ?? []) as StampCardProgress[]
  const benefits =
    (benefitsResult.data ?? []) as RedemptionAppliedBenefit[]
  const redemptions = (redemptionsResult.data ?? []) as DealRedemption[]
  const qrTokens = (qrTokensResult.data ?? []) as QrToken[]
  const visits = (visitsResult.data ?? []) as Visit[]
  const microsites = (micrositesResult.data ?? []) as Omit<
    PartnerMicrosite,
    "draftVersion" | "publishedVersion"
  >[]
  const micrositeVersions =
    (micrositeVersionsResult.data ?? []) as MicrositeVersion[]

  const cityNames = new Map(cities.map((city) => [city.id, city.name]))
  const usersById = new Map(
    owners
      .flatMap((owner) => [
        owner.id ? [owner.id, owner] as const : null,
        owner.uid ? [owner.uid, owner] as const : null,
      ])
      .filter((entry): entry is readonly [string, OwnerOption] =>
        Boolean(entry),
      ),
  )
  const ownerEmails = new Map(
    owners
      .map((owner) => [owner.id ?? owner.uid ?? "", owner.email] as const)
      .filter(([id]) => Boolean(id)),
  )

  annotateStaff(staff, usersById)
  annotateProgress(progress, usersById)
  annotateVisits(visits, usersById, benefits, redemptions, qrTokens)

  const dealsByPartner = groupByPartner(deals)
  const holidaysByPartner = groupByPartner(holidays)
  const socialsByPartner = groupByPartner(socials)
  const milestonesByPartner = groupByPartner(milestones)
  const staffByPartner = groupByPartner(staff)
  const hoursByPartner = groupByPartner(openingHours)
  const menusByPartner = groupByPartner(annotateMenus(menus, menuCategories, menuItems))
  const progressByPartner = groupByPartner(progress)
  const visitsByPartner = groupByPartner(visits)
  const micrositeByPartner = annotateMicrosites(microsites, micrositeVersions)

  const partnersWithDeals = partners.map((partner) => ({
    ...partner,
    deals: partner.id ? dealsByPartner.get(partner.id) ?? [] : [],
    holidays: partner.id ? holidaysByPartner.get(partner.id) ?? [] : [],
    socials: partner.id ? socialsByPartner.get(partner.id) ?? [] : [],
    reward_milestones: partner.id
      ? milestonesByPartner.get(partner.id) ?? []
      : [],
    staff: partner.id ? staffByPartner.get(partner.id) ?? [] : [],
    opening_hours: partner.id ? hoursByPartner.get(partner.id) ?? [] : [],
    menus: partner.id ? menusByPartner.get(partner.id) ?? [] : [],
    stamp_progress: partner.id ? progressByPartner.get(partner.id) ?? [] : [],
    visits: partner.id ? visitsByPartner.get(partner.id) ?? [] : [],
    fraud_events: [],
    microsite: partner.id ? micrositeByPartner.get(partner.id) ?? null : null,
    city_name: partner.city_id ? cityNames.get(partner.city_id) ?? null : null,
    owner_email: partner.owner_id
      ? ownerEmails.get(partner.owner_id) ?? null
      : null,
  }))

  return {
    partners: partnersWithDeals,
    cities,
    owners,
    partnerCount: partners.length,
    dealCount: deals.length,
    errors,
  }
}

async function fetchOwnerOptions(supabase: SupabaseClient): Promise<{
  data: OwnerOption[]
  error?: string
}> {
  const attempts = [
    "id,uid,email,display_name,is_partner",
    "id,email,display_name,is_partner",
    "id,email,display_name",
  ]

  for (const columns of attempts) {
    const result = await supabase
      .from("users")
      .select(columns)
      .order("email", { ascending: true, nullsFirst: false })

    if (!result.error) {
      return { data: (result.data ?? []) as unknown as OwnerOption[] }
    }

    const message = result.error.message.toLowerCase()

    if (
      !message.includes("column") &&
      !message.includes("schema cache") &&
      !message.includes("does not exist")
    ) {
      return { data: [], error: result.error.message }
    }
  }

  return {
    data: [],
    error: "Unable to load owner options from the users table.",
  }
}

function groupByPartner<T extends { partner_id: string | null }>(rows: T[]) {
  const grouped = new Map<string, T[]>()

  for (const row of rows) {
    if (!row.partner_id) {
      continue
    }

    grouped.set(row.partner_id, [...(grouped.get(row.partner_id) ?? []), row])
  }

  return grouped
}

function normalizeLoadedDeal(deal: Deal): Deal {
  const storedWeekdays = Array.isArray(deal.weekdays)
    ? (deal.weekdays as unknown[])
    : []
  const numericWeekdays = storedWeekdays.filter(
    (weekday): weekday is number =>
      typeof weekday === "number" && Number.isInteger(weekday),
  )
  const stringWeekdays = storedWeekdays.filter(
    (weekday): weekday is string => typeof weekday === "string" && Boolean(weekday),
  )

  return {
    ...deal,
    valid_weekdays:
      Array.isArray(deal.valid_weekdays) && deal.valid_weekdays.length > 0
        ? deal.valid_weekdays
        : numericWeekdays.length > 0
          ? numericWeekdays
          : deal.valid_weekdays ?? null,
    weekdays: stringWeekdays.length > 0 ? stringWeekdays : null,
  }
}

function annotateMenus(
  menus: PartnerMenu[],
  categories: MenuCategory[],
  items: MenuItem[],
) {
  const categoriesByMenu = new Map<string, MenuCategory[]>()
  const itemsByMenu = new Map<string, MenuItem[]>()
  const itemsByCategory = new Map<string, MenuItem[]>()

  for (const item of items) {
    if (item.menu_id) {
      itemsByMenu.set(item.menu_id, [
        ...(itemsByMenu.get(item.menu_id) ?? []),
        item,
      ])
    }

    if (item.category_id) {
      itemsByCategory.set(item.category_id, [
        ...(itemsByCategory.get(item.category_id) ?? []),
        item,
      ])
    }
  }

  for (const category of categories) {
    const annotatedCategory = {
      ...category,
      items: category.id ? itemsByCategory.get(category.id) ?? [] : [],
    }

    if (!category.menu_id) {
      continue
    }

    categoriesByMenu.set(category.menu_id, [
      ...(categoriesByMenu.get(category.menu_id) ?? []),
      annotatedCategory,
    ])
  }

  return menus.map((menu) => ({
    ...menu,
    categories: menu.id ? categoriesByMenu.get(menu.id) ?? [] : [],
    items: menu.id ? itemsByMenu.get(menu.id) ?? [] : [],
  }))
}

function annotateMicrosites(
  microsites: Omit<PartnerMicrosite, "draftVersion" | "publishedVersion">[],
  versions: MicrositeVersion[],
) {
  const versionsByMicrosite = new Map<string, MicrositeVersion[]>()
  const grouped = new Map<string, PartnerMicrosite>()

  for (const version of versions) {
    versionsByMicrosite.set(version.microsite_id, [
      ...(versionsByMicrosite.get(version.microsite_id) ?? []),
      version,
    ])
  }

  for (const microsite of microsites) {
    const micrositeVersions = versionsByMicrosite.get(microsite.id) ?? []
    const publishedVersion =
      micrositeVersions.find(
        (version) => version.id === microsite.published_version_id,
      ) ?? null
    const draftVersion =
      micrositeVersions.find((version) => version.status === "draft") ?? null

    grouped.set(microsite.partner_id, {
      ...microsite,
      draftVersion,
      publishedVersion,
    })
  }

  return grouped
}

function annotateStaff(
  staff: PartnerStaff[],
  usersById: Map<string, OwnerOption>,
) {
  for (const member of staff) {
    const user = member.user_id ? usersById.get(member.user_id) : null
    member.user_email = user?.email ?? null
    member.user_name = user?.display_name ?? null
  }
}

function annotateProgress(
  progress: StampCardProgress[],
  usersById: Map<string, OwnerOption>,
) {
  for (const row of progress) {
    const user = row.user_id ? usersById.get(row.user_id) : null
    row.user_email = user?.email ?? null
    row.user_name = user?.display_name ?? null
  }
}

function annotateVisits(
  visits: Visit[],
  usersById: Map<string, OwnerOption>,
  benefits: RedemptionAppliedBenefit[],
  redemptions: DealRedemption[],
  qrTokens: QrToken[],
) {
  const benefitsByVisit = groupByVisit(benefits)
  const redemptionsByVisit = groupByVisit(redemptions)
  const qrTokensByVisit = groupQrTokensByVisit(qrTokens)

  for (const visit of visits) {
    const user = visit.user_id ? usersById.get(visit.user_id) : null
    const staff = visit.staff_user_id ? usersById.get(visit.staff_user_id) : null
    visit.user_email = user?.email ?? null
    visit.user_name = user?.display_name ?? null
    visit.staff_user_name = visit.staff_user_name || staff?.display_name || null
    visit.staff_user_email = staff?.email ?? null
    visit.applied_benefits = visit.id ? benefitsByVisit.get(visit.id) ?? [] : []
    visit.deal_redemptions = visit.id
      ? redemptionsByVisit.get(visit.id) ?? []
      : []
    visit.qr_tokens = visit.id ? qrTokensByVisit.get(visit.id) ?? [] : []
  }
}

function groupByVisit<T extends { visit_id: string | null }>(rows: T[]) {
  const grouped = new Map<string, T[]>()

  for (const row of rows) {
    if (!row.visit_id) {
      continue
    }

    grouped.set(row.visit_id, [...(grouped.get(row.visit_id) ?? []), row])
  }

  return grouped
}

function groupQrTokensByVisit(rows: QrToken[]) {
  const grouped = new Map<string, QrToken[]>()

  for (const row of rows) {
    const visitId = row.visit_id

    if (!visitId) {
      continue
    }

    grouped.set(visitId, [...(grouped.get(visitId) ?? []), row])
  }

  return grouped
}
