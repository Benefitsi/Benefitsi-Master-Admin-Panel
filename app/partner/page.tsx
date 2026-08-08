import Link from "next/link"
import { redirect } from "next/navigation"
import { signOutPartner } from "./actions"
import { PartnerWorkspace } from "@/app/partner-admin"
import { BrandLogo } from "@/components/brand-logo"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { getDashboardData } from "@/lib/admin-data"
import {
  filterPartnersForPortal,
  getPartnerPortalSession,
} from "@/lib/partner-portal"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function PartnerDashboardPage() {
  const config = getSupabaseConfig()

  if (!config.isConfigured) {
    return <SetupRequired />
  }

  const supabase = await createClient()
  const portalSession = await getPartnerPortalSession(supabase)

  if (
    !portalSession ||
    (!portalSession.isAdmin && portalSession.ownedPartnerIds.length === 0)
  ) {
    redirect("/login")
  }

  const dashboard = await getDashboardData(supabase)
  const partners = filterPartnersForPortal(dashboard.partners, portalSession)
  const userName =
    portalSession.profile?.display_name ||
    portalSession.profile?.email ||
    portalSession.user.email ||
    "Partner"

  return (
    <main className="min-h-screen bg-[#f7f6f1] text-[#061829]">
      <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-[#061829]/10 bg-white px-5 py-5 shadow-[0_18px_48px_rgba(6,24,41,.05)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandLogo className="h-auto w-44" priority />
            <p className="mt-2 text-xs font-medium text-[#526170]">Partner Dashboard</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {portalSession.isAdmin ? (
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#061829]/15 bg-white px-3 text-sm font-bold text-[#061829] transition hover:border-[#118cff]/40 hover:bg-[#f3f8ff]"
              >
                Admin panel
              </Link>
            ) : null}
            <p className="max-w-full truncate text-sm text-zinc-600">{userName}</p>
            <form action={signOutPartner}>
              <PendingSubmitButton
                pendingLabel="Signing out..."
                className="h-10 w-full rounded-xl border border-[#061829]/15 bg-white px-4 text-sm font-bold text-[#061829] transition hover:border-[#118cff]/40 hover:bg-[#f3f8ff] sm:w-auto"
              >
                Sign out
              </PendingSubmitButton>
            </form>
          </div>
        </header>

        <section className="mt-6 rounded-2xl border border-[#061829]/10 bg-white p-5">
          <h1 className="text-2xl font-black tracking-[-0.035em] text-[#061829]">
            Your partner microsites
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Update your partner profile, offers, menu, opening hours, and microsite. Only shops owned by your account are shown.
          </p>
        </section>

        {dashboard.errors.length > 0 ? (
          <section className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Supabase returned warnings</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {dashboard.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {partners.length > 0 ? (
          <section className="mt-6">
            <PartnerWorkspace
              partners={partners}
              cities={dashboard.cities}
              owners={[]}
              initialMode="view"
              initialPartnerId={partners[0]?.id ?? ""}
              portalMode
            />
          </section>
        ) : (
          <section className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No partner shop is linked to this account yet.
          </section>
        )}
      </div>
    </main>
  )
}

function SetupRequired() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f4] px-5 text-zinc-950">
      <section className="w-full max-w-xl rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-teal-700">Benefitsi Partner Dashboard</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          Supabase env setup required
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Create `.env.local` from `.env.example`, then add your Supabase
          publishable key.
        </p>
      </section>
    </main>
  )
}
