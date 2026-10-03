import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseConfig } from "./config"
import { loginPathForRequest } from "../auth-recovery"
import { portalRoute, sessionCookieOptions } from "@/lib/portal-routing"
import { createBoundedSupabaseFetch } from "@/lib/supabase/bounded-fetch"

export async function updateSession(request: NextRequest) {
  const requestHost = request.headers.get("host") ?? request.nextUrl.host
  const policy = portalRoute(requestHost, request.nextUrl.pathname, request.method)
  const noStore = { "Cache-Control": "private, no-store" }
  if (policy.kind === "deny") return NextResponse.json({error:"Forbidden"}, {status:403,headers:noStore})
  if (policy.kind === "redirect") {
    // Never forward auth codes/tokens or arbitrary query strings across origins.
    return NextResponse.redirect(policy.url, {status:307,headers:noStore})
  }
  if (policy.kind === "machine") return NextResponse.next({request,headers:noStore})
  // Only assets already admitted by the route policy can skip session refresh.
  if (policy.kind === "public" && ['GET','HEAD'].includes(request.method)
    && !request.nextUrl.pathname.startsWith('/p/')
    && /\.(?:svg|png|jpg|ico|js|txt|xml)$/.test(request.nextUrl.pathname)) {
    return NextResponse.next({request,headers:noStore})
  }
  const config = getSupabaseConfig()
  if (!config.isConfigured) {
    return policy.kind === "public" ? NextResponse.next({request,headers:noStore})
      : NextResponse.json({error:"Authentication unavailable"},{status:503,headers:noStore})
  }
  let response = NextResponse.next({request,headers:noStore})
  const supabase = createServerClient(config.url, config.publishableKey, {
    global: { fetch: createBoundedSupabaseFetch() },
    cookieOptions: sessionCookieOptions(requestHost),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({name,value}) => request.cookies.set(name,value))
        response = NextResponse.next({request,headers:noStore})
        cookiesToSet.forEach(({name,value,options}) => response.cookies.set(name,value,options))
        if (cacheHeaders) Object.entries(cacheHeaders).forEach(([name,value]) => response.headers.set(name,value))
      },
    },
  })
  function finish(next: NextResponse) {
    response.cookies.getAll().forEach(cookie => next.cookies.set(cookie))
    next.headers.set("Cache-Control","private, no-store")
    return next
  }
  let user
  try {
    const {data,error} = await supabase.auth.getUser()
    user = error ? null : data.user
  } catch {
    return policy.kind === "public" ? response
      : finish(NextResponse.json({error:"Authentication unavailable"},{status:503}))
  }
  if (policy.kind === "public") return response
  if (!user) {
    if (request.nextUrl.pathname.startsWith('/api/') || !['GET','HEAD'].includes(request.method)) {
      return finish(NextResponse.json({error:"Unauthorized"},{status:401}))
    }
    const url = request.nextUrl.clone()
    url.pathname = loginPathForRequest(request.nextUrl.pathname)
    url.search = ''
    return finish(NextResponse.redirect(url))
  }
  if (policy.kind === "admin") {
    let result
    try {
      result = await supabase.from('users').select('id,is_admin').eq('id',user.id).maybeSingle()
    } catch {
      return finish(NextResponse.json({error:"Authentication unavailable"},{status:503}))
    }
    if (result.error || result.data?.id !== user.id || result.data?.is_admin !== true) {
      return finish(NextResponse.json({error:"Forbidden"},{status:403}))
    }
  }
  // Partner pages/actions perform their own membership and ownership checks.
  return response
}
