import "server-only"

import { createClient } from "@supabase/supabase-js"

function requireAdminConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase Admin-Verbindung ist nicht konfiguriert.")
  }

  if (
    serviceRoleKey.startsWith("sb_publishable_") ||
    serviceRoleKey === process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    serviceRoleKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error("Für Admin-Zugriffe ist ein separater Service-Role-Key erforderlich.")
  }

  return { url, serviceRoleKey }
}

export function createAdminClient() {
  const { url, serviceRoleKey } = requireAdminConfiguration()

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
