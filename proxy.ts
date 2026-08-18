import { NextResponse, type NextRequest } from "next/server"
import { canonicalPartnerSlug } from "@/lib/partner-paths"
import { updateSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/p/")) {
    const slug = request.nextUrl.pathname.slice(3).split("/")[0]
    if (slug) {
      const webBaseUrl = (
        process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL?.trim() ||
        "https://benefitsi.de"
      ).replace(/\/+$/, "")
      return NextResponse.redirect(
        `${webBaseUrl}/partner/${encodeURIComponent(canonicalPartnerSlug(slug))}`,
        301,
      )
    }
  }

  return updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
