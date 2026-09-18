export type AuthPortal = "admin" | "partner"

export function normalizeAuthPortal(value: unknown): AuthPortal {
  return value === "partner" ? "partner" : "admin"
}

export function loginPathForPortal(portal: AuthPortal) {
  return portal === "partner" ? "/partner/login" : "/login"
}

export function forgotPasswordPathForPortal(portal: AuthPortal) {
  return portal === "partner" ? "/partner/forgot-password" : "/forgot-password"
}

export function resetPasswordPathForPortal(portal: AuthPortal) {
  return `/reset-password?portal=${portal}`
}

export function recoveryCallbackUrl(origin: string, portal: AuthPortal) {
  const sourceOrigin = new URL(origin)
  if (sourceOrigin.hostname === "admin.benefitsi.de") {
    return "https://benefitsi.de/"
  }

  const callbackUrl = new URL("/auth/confirm", sourceOrigin.origin)
  callbackUrl.searchParams.set("next", resetPasswordPathForPortal(portal))
  return callbackUrl.toString()
}

export function safeRecoveryRedirect(value: string | null | undefined) {
  if (!value) {
    return resetPasswordPathForPortal("admin")
  }

  try {
    const url = new URL(value, "https://auth.benefitsi.invalid")

    if (url.pathname !== "/reset-password") {
      return resetPasswordPathForPortal("admin")
    }

    return resetPasswordPathForPortal(
      normalizeAuthPortal(url.searchParams.get("portal")),
    )
  } catch {
    return resetPasswordPathForPortal("admin")
  }
}
