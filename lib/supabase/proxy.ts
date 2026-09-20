import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseConfig } from "./config"
import { loginPathForRequest } from "../auth-recovery"

export async function updateSession(request: NextRequest) {
  const config = getSupabaseConfig()

  if (!config.isConfigured) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  const { data } = await supabase.auth.getClaims()

  const user = data?.claims
  const pathname = request.nextUrl.pathname
  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/partner/login") ||
    pathname === "/forgot-password" ||
    pathname === "/partner/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/auth/confirm" ||
    pathname === "/auth/auth-code-error" ||
    // Automation endpoints authenticate themselves with CRON_SECRET. Keeping
    // them outside the browser-session gate lets Vercel/local cron reach the
    // route; the route-level timingSafeEqual check remains mandatory.
    pathname.startsWith("/api/automation/") ||
    pathname === "/p" ||
    // Knowledge ingestion authenticates with its source-bound token at the
    // route boundary; it must not depend on a browser cookie/session.
    pathname.startsWith("/api/internal/knowledge/sync") ||
    pathname.startsWith("/p/") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = loginPathForRequest(pathname)
    url.search = ""
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie),
    )
    for (const name of ["cache-control", "expires", "pragma"]) {
      const value = supabaseResponse.headers.get(name)
      if (value) redirectResponse.headers.set(name, value)
    }
    redirectResponse.headers.set("Cache-Control", "private, no-store")
    return redirectResponse
  }

  return supabaseResponse
}
