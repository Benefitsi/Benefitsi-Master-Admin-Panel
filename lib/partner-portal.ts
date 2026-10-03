import type { SupabaseClient } from "@supabase/supabase-js"
import type { PartnerWithDeals } from "./admin-data"
import { getAdminSession, type AdminSession } from "./admin"
import { createClient } from "./supabase/server"

export type PartnerProfile = {
  id?: string | null
  uid?: string | null
  email: string | null
  display_name: string | null
  is_partner?: boolean | number | string | null
}

export type PartnerPortalSession = {
  user: {
    id: string
    email?: string
  }
  profile: PartnerProfile | null
  isAdmin: boolean
  isPartner: boolean
  partnerIds: string[]
  ownedPartnerIds: string[]
  managedPartnerIds?: string[]
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type PartnerIdentity = {
  id: string
  email?: string | null
}

export async function getPartnerPortalSession(
  supabase?: SupabaseServerClient,
  existingAdminSession?: AdminSession,
): Promise<PartnerPortalSession | null> {
  const client = supabase ?? (await createClient())
  const adminSession = existingAdminSession ?? await getAdminSession(client)
  if (!adminSession) {
    return null
  }
  const user = adminSession.user
  const [profile, { partnerIds, ownedPartnerIds, managedPartnerIds }] = await Promise.all([
    getPartnerProfileForIdentity(client, {
      id: user.id,
      email: user.email ?? null,
    }),
    getAccessiblePartnerIds(client, user.id),
  ])

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    profile,
    isAdmin: Boolean(adminSession?.isAdmin),
    isPartner: isPartnerProfile(profile) || partnerIds.length > 0,
    partnerIds,
    ownedPartnerIds,
    managedPartnerIds,
  }
}

export function isPartnerProfile(profile: PartnerProfile | null) {
  const value = profile?.is_partner

  return value === true || value === 1 || value === "true"
}

export function canAccessPartner(
  session: PartnerPortalSession,
  partnerId: string | null | undefined,
) {
  if (!partnerId) {
    return false
  }

  return session.isAdmin || session.partnerIds.includes(partnerId)
}

export function canManagePartner(
  session: PartnerPortalSession,
  partnerId: string | null | undefined,
) {
  if (!partnerId) {
    return false
  }

  return session.isAdmin || (session.managedPartnerIds ?? session.ownedPartnerIds).includes(partnerId)
}

// Match the deployed microsites/microsite_versions admin-only write policies.
// Partner linkage grants visibility, not draft approval or publication rights.
export function canEditPartnerMicrosite(
  session: PartnerPortalSession,
  partnerId: string | null | undefined,
) {
  return Boolean(partnerId && session.isAdmin)
}

export function filterPartnersForPortal(
  partners: PartnerWithDeals[],
  session: PartnerPortalSession,
) {
  if (session.isAdmin) {
    return partners
  }

  const allowedIds = new Set(session.partnerIds)
  return partners.filter((partner) => Boolean(partner.id && allowedIds.has(partner.id)))
}

export function filterPartnersForManagement(
  partners: PartnerWithDeals[],
  session: PartnerPortalSession,
) {
  if (session.isAdmin) {
    return partners
  }

  const managedIds = new Set(session.managedPartnerIds ?? session.ownedPartnerIds)
  return partners.filter((partner) => Boolean(partner.id && managedIds.has(partner.id)))
}

async function getPartnerProfileForIdentity(
  supabase: SupabaseClient,
  identity: PartnerIdentity,
) {
  const result = await supabase.from("users")
    .select("id,email,display_name,is_partner").eq("id", identity.id).maybeSingle()
  if (result.error || result.data?.id !== identity.id) return null
  return result.data as PartnerProfile
}

async function getAccessiblePartnerIds(
  supabase: SupabaseClient,
  userId: string,
) {
  const partnerIds: string[] = [], ownedPartnerIds: string[] = [], managedPartnerIds: string[] = []
  const memberships = await supabase.from("partner_memberships").select("partner_id,role,status").eq("user_id", userId).eq("status", "active").in("role", ["owner", "admin"])
  if (memberships.error) return {partnerIds, ownedPartnerIds, managedPartnerIds}
  for (const membership of memberships.data ?? []) {
    // Reconcile the membership against persisted ownership and current tariff in DB.
    if (membership.status !== "active" || !["owner", "admin"].includes(membership.role)) continue
    const {data, error} = await supabase.rpc("get_partner_entitlements", {p_partner_id: membership.partner_id})
    if (error || !data || data.partner_id !== membership.partner_id) continue
    partnerIds.push(membership.partner_id)
    if (data.role === "owner") ownedPartnerIds.push(membership.partner_id)
    if (data.role === "owner" || (data.role === "admin" && data.plan_code === "pro")) managedPartnerIds.push(membership.partner_id)
  }
  return {partnerIds, ownedPartnerIds, managedPartnerIds}
}
