import { loadMicrositeCommerceActions } from "@/lib/commerce/microsite"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { getDashboardData, getPartnerCapabilityFlags, type PartnerWithDeals } from "@/lib/admin-data"
import {
  canAccessPartner,
  canManagePartner,
  filterPartnersForPortal,
  getPartnerPortalSession,
} from "@/lib/partner-portal"
import { resolveMicrositeConfig } from "@/lib/microsites"
import { micrositeVersions } from "@/lib/microsite-workflow"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { MicrositePreviewShell } from "@/app/microsite-preview/[partner]/preview-shell"
import { MicrositeCapabilitiesNotice } from "@/components/microsite-capabilities-notice"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Partner-Mikroseite · Vorschau | Benefitsi",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function PartnerMicrositePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ partner: string }>
  searchParams: Promise<{ viewport?: string; source?: string; mode?: string }>
}) {
  const config = getSupabaseConfig()

  if (!config.isConfigured) {
    redirect("/partner/login")
  }

  const [{ partner: rawIdentifier }, query] = await Promise.all([
    params,
    searchParams,
  ])
  const identifier = decodeURIComponent(rawIdentifier)
  const supabase = await createClient()
  const portalSession = await getPartnerPortalSession(supabase)

  if (
    !portalSession ||
    (!portalSession.isAdmin && portalSession.partnerIds.length === 0)
  ) {
    redirect("/partner/login")
  }

  const dashboard = await getDashboardData(supabase, {includeActivity: false})
  const selectedPartner = findPreviewPartner(
    filterPartnersForPortal(dashboard.partners, portalSession),
    identifier,
  )

  if (!selectedPartner?.id || !canAccessPartner(portalSession, selectedPartner.id)) {
    notFound()
  }

  if (!canManagePartner(portalSession, selectedPartner.id)) {
    return (
      <main className="min-h-screen bg-[#f7f6f1] px-5 py-12 text-[#061829]">
        <section className="mx-auto max-w-xl rounded-2xl border border-[#061829]/10 bg-white p-6">
          <h1 className="text-xl font-bold">Interne Vorschau nicht verfügbar</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Die interne Microsite-Vorschau ist nur mit dem Inhaberzugang oder
            für das Benefitsi-Team verfügbar.
          </p>
          <Link
            href="/partner"
            className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-sky-800 px-4 py-2 text-sm font-medium text-white hover:bg-sky-900"
          >
            Zurück zum Partner-Dashboard
          </Link>
        </section>
      </main>
    )
  }

  const capabilities = await getPartnerCapabilityFlags(supabase, selectedPartner.id).catch(() => null)
  const partner = { ...selectedPartner, ...capabilities }
  const previewSource = query.source === "published" ? "published" : query.source === "builder" ? "builder" : "saved"
  const versions = micrositeVersions(partner.microsite)
  const version = previewSource === "published" ? versions.published : versions.editable
  if (previewSource === "published" && !version) notFound()
  const configValue = resolveMicrositeConfig(version?.config, partner)

  return (
    <>
    {!capabilities && <MicrositeCapabilitiesNotice />}
    <MicrositePreviewShell
      commerceActions={await loadMicrositeCommerceActions(partner.id)}
      partner={partner}
      initialConfig={configValue}
      previewStorageKey={micrositePreviewStorageKey(partner)}
      useBuilderDraft={query.source === "builder"}
      previewSource={previewSource}
      previewMode={query.mode === "dark" ? "dark" : query.mode === "light" ? "light" : undefined}
      isMobile={query.viewport === "mobile"}
      previewBasePath="/partner/microsite-preview"
    />
    </>
  )
}

function findPreviewPartner(partners: PartnerWithDeals[], identifier: string) {
  const normalizedIdentifier = slugify(identifier)

  return (
    partners.find((partner) => {
      const candidates = [
        partner.id,
        partner.slug,
        partner.subdomain,
        partner.microsite?.slug,
        partner.short_name,
        partner.name,
      ]

      return candidates.some((candidate) => {
        const normalizedCandidate = slugify(candidate || "")

        return (
          normalizedCandidate === normalizedIdentifier ||
          normalizedCandidate.startsWith(`${normalizedIdentifier}-`)
        )
      })
    }) ?? null
  )
}

function micrositePreviewStorageKey(partner: PartnerWithDeals) {
  return `benefitsi:microsite-preview:${partner.id || partner.slug || "partner"}`
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}
