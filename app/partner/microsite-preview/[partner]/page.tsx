import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { getDashboardData, type PartnerWithDeals } from "@/lib/admin-data"
import {
  canAccessPartner,
  filterPartnersForPortal,
  getPartnerPortalSession,
} from "@/lib/partner-portal"
import { resolveMicrositeConfig } from "@/lib/microsites"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { MicrositePreviewShell } from "@/app/microsite-preview/[partner]/preview-shell"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Partner Microsite Preview | Benefitsi",
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
  searchParams: Promise<{ viewport?: string; source?: string }>
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
    (!portalSession.isAdmin &&
      (!portalSession.isPartner || portalSession.partnerIds.length === 0))
  ) {
    redirect("/partner/login")
  }

  const dashboard = await getDashboardData(supabase)
  const partner = findPreviewPartner(
    filterPartnersForPortal(dashboard.partners, portalSession),
    identifier,
  )

  if (!partner || !canAccessPartner(portalSession, partner.id)) {
    notFound()
  }

  const configValue = resolveMicrositeConfig(
    partner.microsite?.draftVersion?.config ??
      partner.microsite?.publishedVersion?.config,
    partner,
  )

  return (
    <MicrositePreviewShell
      partner={partner}
      initialConfig={configValue}
      previewStorageKey={micrositePreviewStorageKey(partner)}
      useBuilderDraft={query.source === "builder"}
      isMobile={query.viewport === "mobile"}
      previewBasePath="/partner/microsite-preview"
    />
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
