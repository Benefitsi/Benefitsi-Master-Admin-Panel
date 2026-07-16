import Image from "next/image"
import { redirect } from "next/navigation"
import { signOutPartner } from "../actions"
import { PartnerLoginForm } from "./login-form"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { getPartnerPortalSession } from "@/lib/partner-portal"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function PartnerLoginPage() {
  const config = getSupabaseConfig()

  if (config.isConfigured) {
    const supabase = await createClient()
    const portalSession = await getPartnerPortalSession(supabase)

    if (
      portalSession &&
      (portalSession.isAdmin ||
        (portalSession.isPartner && portalSession.partnerIds.length > 0))
    ) {
      redirect("/partner")
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f4] text-zinc-950">
      <div className="grid min-h-screen lg:grid-cols-[1fr_460px]">
        <section className="hidden bg-zinc-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-white text-sm font-bold text-zinc-950">
              <Image
                src="/Benefitsi_Icon_FullColor_RGB_512.png"
                alt="Benefitsi Logo"
                width={35}
                height={35}
              />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-200">
                Benefitsi
              </p>
              <p className="text-sm text-zinc-400">Partner Microsites</p>
            </div>
          </div>

          <div className="max-w-xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.16em] text-amber-300">
              Partner self-service
            </p>
            <h1 className="max-w-lg text-5xl font-semibold leading-tight tracking-normal">
              Edit your microsite content without affecting other partners.
            </h1>
          </div>

          <div className="grid grid-cols-4">
            {[["", "Only your assigned partner shop is accessible"]].map(
              ([value, label]) => (
                <div
                  key={label}
                  className="rounded-md border border-white/10 bg-white/5 p-4"
                >
                  <p className="text-2xl font-semibold text-white">{value}</p>
                  <p className="mt-1 text-sm text-zinc-400">{label}</p>
                </div>
              ),
            )}
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10">
          <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-8">
              <div className="mb-6 grid size-11 place-items-center rounded-md bg-teal-100 text-base font-bold text-teal-900 lg:hidden">
                B
              </div>
              <p className="text-sm font-medium text-teal-700">Benefitsi</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal text-zinc-950">
                Partner sign in
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Use your linked Supabase account to access your microsite dashboard.
              </p>
            </div>

            {config.isConfigured ? <NonPartnerSessionNotice /> : null}
            <PartnerLoginForm isConfigured={config.isConfigured} />
          </div>
        </section>
      </div>
    </main>
  )
}

async function NonPartnerSessionNotice() {
  const supabase = await createClient()
  const portalSession = await getPartnerPortalSession(supabase)

  if (
    !portalSession ||
    portalSession.isAdmin ||
    (portalSession.isPartner && portalSession.partnerIds.length > 0)
  ) {
    return null
  }

  return (
    <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-medium">The current account is not linked to a partner shop.</p>
      <form action={signOutPartner} className="mt-2">
        <PendingSubmitButton
          pendingLabel="Signing out..."
          className="h-9 rounded-md bg-amber-900 px-3 text-xs font-semibold text-white transition hover:bg-amber-950"
        >
          Sign out of this account
        </PendingSubmitButton>
      </form>
    </div>
  )
}
