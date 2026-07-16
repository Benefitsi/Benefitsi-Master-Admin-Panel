import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { signOutPartner } from "./actions"
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
    (!portalSession.isAdmin &&
      (!portalSession.isPartner || portalSession.partnerIds.length === 0))
  ) {
    redirect("/partner/login")
  }

  const dashboard = await getDashboardData(supabase)
  const partners = filterPartnersForPortal(dashboard.partners, portalSession)
  const userName =
    portalSession.profile?.display_name ||
    portalSession.profile?.email ||
    portalSession.user.email ||
    "Partner"

  return (
    <main className="min-h-screen bg-[#f6f7f4] text-zinc-950">
      <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-md border border-zinc-200 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/Benefitsi_Icon_FullColor_RGB_512.png"
              alt="Benefitsi Logo"
              width={32}
              height={32}
            />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-800">
                Benefitsi
              </p>
              <p className="text-xs text-zinc-500">Partner dashboard</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="max-w-full truncate text-sm text-zinc-600">{userName}</p>
            <form action={signOutPartner}>
              <PendingSubmitButton
                pendingLabel="Signing out..."
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 sm:w-auto"
              >
                Sign out
              </PendingSubmitButton>
            </form>
          </div>
        </header>

        <section className="mt-6 rounded-md border border-zinc-200 bg-white p-5">
          <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
            Your partner microsites
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Open a microsite builder below to update your live page content.
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

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {partners.map((partner) => {
            const builderIdentifier =
              partner.slug || partner.subdomain || partner.id || "partner"
            const previewIdentifier =
              partner.slug || partner.subdomain || partner.id || "partner"

            return (
              <article
                key={partner.id || builderIdentifier}
                className="rounded-md border border-zinc-200 bg-white p-5"
              >
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-teal-700">
                  Partner
                </p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-950">
                  {partner.name || partner.short_name || "Unnamed partner"}
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  {partner.city_name || partner.address || "No location set"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/partner/microsite-builder/${encodeURIComponent(builderIdentifier)}`}
                    className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                  >
                    Edit microsite
                  </Link>
                  <Link
                    href={`/partner/microsite-preview/${encodeURIComponent(previewIdentifier)}`}
                    target="_blank"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Open preview
                  </Link>
                </div>
              </article>
            )
          })}
        </section>

        {partners.length === 0 ? (
          <section className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No partner shop is linked to this account yet.
          </section>
        ) : null}
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
