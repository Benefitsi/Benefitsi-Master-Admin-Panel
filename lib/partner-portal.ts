import type { SupabaseClient } from "@supabase/supabase-js"
import type { PartnerWithDeals } from "./admin-data"
import { getAdminSession } from "./admin"
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
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type PartnerIdentity = {
  id: string
  email?: string | null
}

export async function getPartnerPortalSession(
  supabase?: SupabaseServerClient,
): Promise<PartnerPortalSession | null> {
  const client = supabase ?? (await createClient())
  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error || !user) {
    return null
  }

  const [adminSession, profile] = await Promise.all([
    getAdminSession(client),
    getPartnerProfileForIdentity(client, {
      id: user.id,
      email: user.email ?? null,
    }),
  ])
  const { partnerIds, ownedPartnerIds } = await getAccessiblePartnerIds(
    client,
    user.id,
  )

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

  return session.isAdmin || session.ownedPartnerIds.includes(partnerId)
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

  const managedIds = new Set(session.ownedPartnerIds)
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
  const identities = [userId].filter(Boolean)

  if (identities.length === 0) {
    return { partnerIds: [], ownedPartnerIds: [] }
  }

  const [ownersResult, staffResult] = await Promise.all([
    supabase.from("partners").select("id,owner_id").in("owner_id", identities),
    supabase
      .from("partner_staff")
      .select("partner_id,user_id,active")
      .in("user_id", identities),
  ])
  const partnerIds = new Set<string>()
  const ownedPartnerIds = new Set<string>()

  if (ownersResult.error) {
    console.error(
      "Partner portal owner linkage lookup failed:",
      ownersResult.error.message,
    )
  } else {
    for (const row of ownersResult.data ?? []) {
      if (typeof row.id === "string" && row.id) {
        partnerIds.add(row.id)
        ownedPartnerIds.add(row.id)
      }
    }
  }

  if (staffResult.error) {
    console.error(
      "Partner portal staff linkage lookup failed:",
      staffResult.error.message,
    )
  } else {
    for (const row of staffResult.data ?? []) {
      if (row.active !== true) {
        continue
      }

      if (typeof row.partner_id === "string" && row.partner_id) {
        partnerIds.add(row.partner_id)
      }
    }
  }

  return {
    partnerIds: Array.from(partnerIds),
    ownedPartnerIds: Array.from(ownedPartnerIds),
  }
}
