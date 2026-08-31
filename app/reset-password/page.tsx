import { AuthRecoveryShell } from "@/components/auth-recovery-shell"
import { normalizeAuthPortal } from "@/lib/auth-recovery"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { cookies } from "next/headers"
import { ResetPasswordForm } from "./reset-password-form"

export const dynamic = "force-dynamic"

type ResetPasswordPageProps = {
  searchParams: Promise<{
    portal?: string
    code?: string
    error?: string
    error_description?: string
  }>
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams
  const portal = normalizeAuthPortal(params.portal)
  const cookieStore = await cookies()
  const confirmedByServer =
    cookieStore.get("benefitsi-password-recovery")?.value === "confirmed"

  return (
    <AuthRecoveryShell
      portal={portal}
      eyebrow={portal === "partner" ? "Partner account" : "Admin account"}
      title="Choose a new password"
      description="Use a strong password that you don’t use for another account."
      showBackLink={false}
    >
      <ResetPasswordForm
        portal={portal}
        code={params.code}
        authError={params.error_description ?? params.error}
        confirmedByServer={confirmedByServer}
        isConfigured={getSupabaseConfig().isConfigured}
      />
    </AuthRecoveryShell>
  )
}
