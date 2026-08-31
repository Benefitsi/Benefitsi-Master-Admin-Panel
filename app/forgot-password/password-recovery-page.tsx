import { AuthRecoveryShell } from "@/components/auth-recovery-shell"
import { getSupabaseConfig } from "@/lib/supabase/config"
import type { AuthPortal } from "@/lib/auth-recovery"
import { RecoveryRequestForm } from "./recovery-request-form"

export function PasswordRecoveryPage({ portal }: { portal: AuthPortal }) {
  const isPartner = portal === "partner"

  return (
    <AuthRecoveryShell
      portal={portal}
      eyebrow={isPartner ? "Partner account" : "Admin account"}
      title="Forgot your password?"
      description="Enter your account email and we’ll send you a secure link to choose a new password."
    >
      <RecoveryRequestForm
        portal={portal}
        isConfigured={getSupabaseConfig().isConfigured}
      />
    </AuthRecoveryShell>
  )
}
