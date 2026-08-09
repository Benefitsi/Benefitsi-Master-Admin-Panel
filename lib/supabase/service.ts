import "server-only"

import { createClient } from "@supabase/supabase-js"
import { requireSupabaseConfig } from "./config"

export function createServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY for server-only microsite reads.",
    )
  }

  const { url } = requireSupabaseConfig()

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}
