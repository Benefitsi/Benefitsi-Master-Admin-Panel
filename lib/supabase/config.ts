export type SupabaseConfig = {
  url: string
  publishableKey: string
  isConfigured: true
} | {
  url: string | undefined
  publishableKey: string | undefined
  isConfigured: false
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !publishableKey) {
    return {
      url,
      publishableKey,
      isConfigured: false,
    }
  }

  return {
    url,
    publishableKey,
    isConfigured: true,
  }
}

export function requireSupabaseConfig() {
  const config = getSupabaseConfig()

  if (!config.isConfigured) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variables.",
    )
  }

  return config
}
