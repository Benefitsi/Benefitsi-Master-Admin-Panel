import { createServerClient } from "@supabase/ssr"
import { sessionCookieOptions } from "@/lib/portal-routing"
import { cookies, headers } from "next/headers"
import { requireSupabaseConfig } from "./config"
import { createBoundedSupabaseFetch } from "./bounded-fetch"

export async function createClient() {
  const cookieStore = await cookies()
  const cookieOptions = sessionCookieOptions((await headers()).get("host") ?? "localhost")
  const { url, publishableKey } = requireSupabaseConfig()

  return createServerClient(url, publishableKey, {
    global: { fetch: createBoundedSupabaseFetch() },
    cookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Server Components cannot set cookies directly. Proxy refreshes sessions.
        }
      },
    },
  })
}
