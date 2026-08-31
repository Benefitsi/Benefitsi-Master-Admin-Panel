import type { EmailOtpType } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import {
  normalizeAuthPortal,
  safeRecoveryRedirect,
} from "@/lib/auth-recovery"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null
  const code = request.nextUrl.searchParams.get("code")
  const next = safeRecoveryRedirect(request.nextUrl.searchParams.get("next"))
  const redirectTo = new URL(next, request.url)
  const supabase = await createClient()

  if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })

    if (!error) {
      return createRecoveryRedirect(redirectTo)
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return createRecoveryRedirect(redirectTo)
    }
  }

  const portal = normalizeAuthPortal(redirectTo.searchParams.get("portal"))
  const errorUrl = new URL("/auth/auth-code-error", request.url)
  errorUrl.searchParams.set("portal", portal)
  return NextResponse.redirect(errorUrl)
}

function createRecoveryRedirect(url: URL) {
  const response = NextResponse.redirect(url)
  response.cookies.set("benefitsi-password-recovery", "confirmed", {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/reset-password",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
  return response
}
