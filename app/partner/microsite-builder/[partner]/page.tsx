import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { signOutPartner } from "../../actions"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { MicrositePanel } from "@/app/microsite-panel"
import { AdminLanguageControl, AdminLanguageProvider } from "@/app/admin-language"
import { getDashboardData } from "@/lib/admin-data"
import {
  canAccessPartner,
  filterPartnersForPortal,
  getPartnerPortalSession,
} from "@/lib/partner-portal"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type PageProps = {
  params: Promise<{ partner: string }>
}

export default async function PartnerMicrositeBuilderPage({ params }: PageProps) {
  const config = getSupabaseConfig()

  if (!config.isConfigured) {
    redirect("/partner/login")
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

  const { partner: identifier } = await params
  const dashboard = await getDashboardData(supabase)
  const visiblePartners = filterPartnersForPortal(dashboard.partners, portalSession)
  const partner = visiblePartners.find(
    (item) =>
      item.id === identifier ||
      item.slug === identifier ||
      item.subdomain === identifier ||
      item.microsite?.slug === identifier,
  )

  if (!partner || !canAccessPartner(portalSession, partner.id)) {
    notFound()
  }

  const previewIdentifier =
    partner.slug || partner.subdomain || partner.id || identifier

  return (
    <AdminLanguageProvider>
    <main className="min-h-screen overflow-x-clip bg-[#f3efe7] text-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">
              Partner Microsite Builder
            </p>
            <h1 className="mt-1 max-w-[60rem] text-xl font-extrabold leading-tight tracking-tight text-zinc-950 sm:text-2xl">
              {partner.name || "Partner"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminLanguageControl />
            <Link
              href="/partner"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-50"
            >
              Back to dashboard
            </Link>
            <Link
              href={`/partner/microsite-preview/${encodeURIComponent(previewIdentifier)}?source=builder`}
              target="_blank"
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800"
            >
              Open live preview
            </Link>
            <form action={signOutPartner}>
              <PendingSubmitButton
                pendingLabel="Signing out..."
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100"
              >
                Sign out
              </PendingSubmitButton>
            </form>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1800px] min-w-0 p-3 sm:p-5">
        <MicrositePanel
          key={`${partner.id ?? partner.name ?? "microsite"}-${partner.microsite?.draftVersion?.id ?? partner.microsite?.publishedVersion?.id ?? "new"}`}
          partner={partner}
          fullscreen
          previewBasePath="/partner/microsite-preview"
        />
      </section>
    </main>
    </AdminLanguageProvider>
  )
}
