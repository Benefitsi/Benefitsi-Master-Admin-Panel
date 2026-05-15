import type { SupabaseClient } from "@supabase/supabase-js"

export type Coordinates = {
  latitude: number | null
  longitude: number | null
}

export type StoredCoordinates = Coordinates | string | null

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
  is_restaurant: boolean | null
  logo_url: string | null
  feature_card_url: string | null
  cover_urls: string[] | null
  loves: number | null
  stamp_target: number | null
  reward_text_primary: string | null
  reward_text_secondary: string | null
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
  discount_value: number | null
  premium_only: boolean | null
  active: boolean | null
  happy_hour_start: string | null
  happy_hour_end: string | null
  trigger_value: number | null
  expiry_days: number | null
  twoforone_usage_limit: number | null
  twoforone_trial_limit: number | null
  reward_item: string | null
  benefit_count: number | null
  estimated_savings: number | null
  created_at?: string | null
  updated_at?: string | null
}

export type PartnerWithDeals = Partner & {
  deals: Deal[]
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
  const [partnersResult, dealsResult, citiesResult, ownersResult] =
    await Promise.all([
    supabase
      .from("partners")
      .select("*")
      .order("created_at", { ascending: false, nullsFirst: false }),
    supabase.from("deals").select("*"),
    supabase.from("cities").select("id,name,slug").order("name"),
    fetchOwnerOptions(supabase),
  ])

  const errors = [
    partnersResult.error?.message,
    dealsResult.error?.message,
    citiesResult.error?.message,
    ownersResult.error,
  ].filter(Boolean) as string[]

  const partners = ((partnersResult.data ?? []) as Partner[]).map((partner) => ({
    ...partner,
    deals: [],
  }))
  const deals = (dealsResult.data ?? []) as Deal[]
  const cities = (citiesResult.data ?? []) as City[]
  const owners = ownersResult.data
  const cityNames = new Map(cities.map((city) => [city.id, city.name]))
  const ownerEmails = new Map(
    owners
      .map((owner) => [owner.id ?? owner.uid ?? "", owner.email] as const)
      .filter(([id]) => Boolean(id)),
  )
  const dealsByPartner = new Map<string, Deal[]>()

  for (const deal of deals) {
    if (!deal.partner_id) {
      continue
    }

    const existing = dealsByPartner.get(deal.partner_id) ?? []
    existing.push(deal)
    dealsByPartner.set(deal.partner_id, existing)
  }

  const partnersWithDeals = partners.map((partner) => ({
    ...partner,
    deals: partner.id ? dealsByPartner.get(partner.id) ?? [] : [],
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
