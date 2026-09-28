import { headers } from "next/headers"
import { isPartnerHost } from "@/lib/portal-routing"
import { createClient as createAuthClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getSupabaseConfig } from "@/lib/supabase/config"

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

const ADMIN_COLUMNS = "id,email,display_name,is_admin"

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
    isAdmin: !isPartnerHost((await headers()).get("host") ?? "") && isAdminProfile(profile),
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

export async function verifyAdminPassword(
  adminSession: AdminSession,
  password: string,
) {
  const email = adminSession.user.email?.trim()
  const config = getSupabaseConfig()

  if (!email || !password || !config.isConfigured) {
    return false
  }

  const verifier = createAuthClient(config.url, config.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  const { data, error } = await verifier.auth.signInWithPassword({
    email,
    password,
  })

  return !error && data.user?.id === adminSession.user.id
}

export function isAdminProfile(profile: AdminProfile | null) {
  return profile?.is_admin === true
}

export async function getAdminProfileForIdentity(
  supabase: SupabaseServerClient,
  identity: AdminIdentity,
) {
  // The canonical profile ID is the auth UID. Email and legacy uid fields
  // are display/compatibility data, never alternate authorization identities.
  const result = await supabase.from("users").select(ADMIN_COLUMNS)
    .eq("id", identity.id).maybeSingle()
  if (result.error || result.data?.id !== identity.id) return null
  return result.data as AdminProfile
}
