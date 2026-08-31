import type { ReactNode } from "react"
import Link from "next/link"
import { AdminLanguageControl, AdminLanguageProvider } from "@/app/admin-language"
import { BrandLogo } from "@/components/brand-logo"
import {
  loginPathForPortal,
  type AuthPortal,
} from "@/lib/auth-recovery"

type AuthRecoveryShellProps = {
  portal: AuthPortal
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  showBackLink?: boolean
}

export function AuthRecoveryShell({
  portal,
  eyebrow,
  title,
  description,
  children,
  showBackLink = true,
}: AuthRecoveryShellProps) {
  const isPartner = portal === "partner"

  return (
    <AdminLanguageProvider>
      <main className="min-h-screen bg-[#f7f6f1] text-[#061829]">
        <div className="fixed right-4 top-4 z-20">
          <AdminLanguageControl />
        </div>
        <div className="grid min-h-screen lg:grid-cols-[1fr_460px]">
          <section className="hidden bg-[#061829] p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <BrandLogo surface="dark" className="h-auto w-48" priority />
              <p className="mt-3 text-sm font-medium text-white/55">
                {isPartner ? "Partner Microsites" : "Admin & Partner Panel"}
              </p>
            </div>

            <div className="max-w-xl">
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-[#17d4d7]">
                Secure account recovery
              </p>
              <h1 className="max-w-lg text-5xl font-black leading-[1.05] tracking-[-0.05em]">
                Return to your Benefitsi workspace safely.
              </h1>
            </div>

            <p className="max-w-md text-sm leading-6 text-white/55">
              Recovery links are time-limited and can only be used to update the
              account that requested them.
            </p>
          </section>

          <section className="flex items-center justify-center px-5 py-10">
            <div className="w-full max-w-md rounded-2xl border border-[#061829]/10 bg-white p-6 shadow-[0_24px_70px_rgba(6,24,41,.08)] sm:p-8">
              <BrandLogo className="mb-7 h-auto w-44 lg:hidden" priority />
              <div className="mb-8">
                <p className="text-sm font-bold text-[#118cff]">{eyebrow}</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-[#061829]">
                  {title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#526170]">
                  {description}
                </p>
              </div>

              {children}

              {showBackLink ? (
                <div className="mt-6 border-t border-[#061829]/10 pt-5 text-center">
                  <Link
                    href={loginPathForPortal(portal)}
                    className="text-sm font-semibold text-[#118cff] transition hover:text-[#0872d1]"
                  >
                    Back to sign in
                  </Link>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </AdminLanguageProvider>
  )
}
