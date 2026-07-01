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
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type PartnerIdentity = {
  id: string
  email?: string | null
}

type PartnerProfileSelectAttempt = {
  columns: string
  idColumns: Array<"id" | "uid">
  includesPartnerFlag: boolean
}

const PARTNER_PROFILE_SELECT_ATTEMPTS: PartnerProfileSelectAttempt[] = [
  {
    columns: "id,uid,email,display_name,is_partner",
    idColumns: ["id", "uid"],
    includesPartnerFlag: true,
  },
  {
    columns: "id,email,display_name,is_partner",
    idColumns: ["id"],
    includesPartnerFlag: true,
  },
  {
    columns: "uid,email,display_name,is_partner",
    idColumns: ["uid"],
    includesPartnerFlag: true,
  },
  {
    columns: "id,uid,email,display_name",
    idColumns: ["id", "uid"],
    includesPartnerFlag: false,
  },
]

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
  const partnerIds = await getAccessiblePartnerIds(client, user.id, profile)

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    profile,
    isAdmin: Boolean(adminSession?.isAdmin),
    isPartner: isPartnerProfile(profile),
    partnerIds,
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

async function getPartnerProfileForIdentity(
  supabase: SupabaseClient,
  identity: PartnerIdentity,
) {
  const email = identity.email?.trim()

  if (email) {
    for (const attempt of PARTNER_PROFILE_SELECT_ATTEMPTS) {
      let query = supabase
        .from("users")
        .select(attempt.columns)
        .ilike("email", email)
        .limit(1)

      if (attempt.includesPartnerFlag) {
        query = query.order("is_partner", {
          ascending: false,
          nullsFirst: false,
        })
      }

      const result = await query.maybeSingle()

      if (!result.error) {
        if (result.data) {
          return result.data as unknown as PartnerProfile
        }

        continue
      }

      if (!isSchemaError(result.error.message)) {
        console.error("Partner lookup by email failed:", result.error.message)
        break
      }
    }
  }

  for (const attempt of PARTNER_PROFILE_SELECT_ATTEMPTS) {
    for (const column of attempt.idColumns) {
      const result = await supabase
        .from("users")
        .select(attempt.columns)
        .eq(column, identity.id)
        .limit(1)
        .maybeSingle()

      if (!result.error) {
        if (result.data) {
          return result.data as unknown as PartnerProfile
        }

        continue
      }

      if (!isSchemaError(result.error.message)) {
        console.error(`Partner lookup by ${column} failed:`, result.error.message)
      }
    }
  }

  return null
}

async function getAccessiblePartnerIds(
  supabase: SupabaseClient,
  userId: string,
  profile: PartnerProfile | null,
) {
  const identities = Array.from(
    new Set(
      [userId, profile?.id ?? "", profile?.uid ?? ""].filter((value) => Boolean(value)),
    ),
  )

  if (identities.length === 0) {
    return []
  }

  const [ownersResult, staffResult] = await Promise.all([
    supabase.from("partners").select("id,owner_id").in("owner_id", identities),
    supabase
      .from("partner_staff")
      .select("partner_id,user_id,active")
      .in("user_id", identities),
  ])
  const partnerIds = new Set<string>()

  if (ownersResult.error) {
    console.error(
      "Partner portal owner linkage lookup failed:",
      ownersResult.error.message,
    )
  } else {
    for (const row of ownersResult.data ?? []) {
      if (typeof row.id === "string" && row.id) {
        partnerIds.add(row.id)
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
      if (row.active === false) {
        continue
      }

      if (typeof row.partner_id === "string" && row.partner_id) {
        partnerIds.add(row.partner_id)
      }
    }
  }

  return Array.from(partnerIds)
}

function isSchemaError(message: string) {
  const normalized = message.toLowerCase()

  return (
    normalized.includes("column") ||
    normalized.includes("schema cache") ||
    normalized.includes("does not exist")
  )
}
