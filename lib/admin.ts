import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export type AdminProfile = {
  id?: string | null
  uid?: string | null
  email: string | null
  display_name: string | null
  is_admin: boolean | number | string | null
}

export type AdminSession = {
  user: {
    id: string
    email?: string
  }
  profile: AdminProfile | null
  isAdmin: boolean
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const ADMIN_COLUMNS = "email,display_name,is_admin"

export type AdminIdentity = {
  id: string
  email?: string | null
}

export async function getAdminSession(
  supabase?: SupabaseServerClient,
): Promise<AdminSession | null> {
  const client = supabase ?? (await createClient())
  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error || !user) {
    return null
  }

  const profile = await getAdminProfileForIdentity(client, user)

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    profile,
    isAdmin: isAdminProfile(profile),
  }
}

export async function requireAdmin() {
  const supabase = await createClient()
  const adminSession = await getAdminSession(supabase)

  if (!adminSession?.isAdmin) {
    redirect("/login")
  }

  return {
    supabase,
    adminSession,
  }
}

export function isAdminProfile(profile: AdminProfile | null) {
  const value = profile?.is_admin

  return value === true || value === 1 || value === "true"
}

export async function getAdminProfileForIdentity(
  supabase: SupabaseServerClient,
  identity: AdminIdentity,
) {
  const email = identity.email?.trim()

  if (email) {
    const byEmail = await supabase
      .from("users")
      .select(ADMIN_COLUMNS)
      .ilike("email", email)
      .order("is_admin", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (byEmail.error) {
      console.error("Admin lookup by email failed:", byEmail.error.message)
    }

    if (byEmail.data) {
      return byEmail.data as AdminProfile
    }
  }

  return await getAdminProfileByOptionalUserIdColumn(supabase, identity.id)
}

async function getAdminProfileByOptionalUserIdColumn(
  supabase: SupabaseServerClient,
  userId: string,
) {
  for (const column of ["uid", "id"]) {
    const result = await supabase
      .from("users")
      .select(ADMIN_COLUMNS)
      .eq(column, userId)
      .limit(1)
      .maybeSingle()

    if (result.error) {
      console.error(`Admin lookup by ${column} failed:`, result.error.message)
      continue
    }

    if (result.data) {
      return result.data as AdminProfile
    }
  }

  return null
}
