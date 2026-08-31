import { PasswordRecoveryPage } from "./password-recovery-page"

export const dynamic = "force-dynamic"

export default function ForgotPasswordPage() {
  return <PasswordRecoveryPage portal="admin" />
}
