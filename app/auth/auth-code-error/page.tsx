import { AuthRecoveryShell } from "@/components/auth-recovery-shell"
import {
  forgotPasswordPathForPortal,
  normalizeAuthPortal,
} from "@/lib/auth-recovery"
import Link from "next/link"

type AuthCodeErrorPageProps = {
  searchParams: Promise<{ portal?: string }>
}

export default async function AuthCodeErrorPage({ searchParams }: AuthCodeErrorPageProps) {
  const portal = normalizeAuthPortal((await searchParams).portal)

  return (
    <AuthRecoveryShell
      portal={portal}
      eyebrow="Account recovery"
      title="That link can’t be used"
      description="The recovery link is invalid, expired, or has already been used."
    >
      <Link
        href={forgotPasswordPathForPortal(portal)}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#17d4d7_0%,#118cff_100%)] px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(17,140,255,.2)] transition hover:-translate-y-px"
      >
        Request a new recovery link
      </Link>
    </AuthRecoveryShell>
  )
}
