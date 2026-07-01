import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { requireAdmin } from "@/lib/admin"
import { getDashboardData, type PartnerWithDeals } from "@/lib/admin-data"
import { resolveMicrositeConfig } from "@/lib/microsites"
import { MicrositePreviewShell } from "./preview-shell"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Microsite Preview | Benefitsi Admin",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function MicrositePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ partner: string }>
  searchParams: Promise<{ viewport?: string; source?: string }>
}) {
  const [{ partner: rawIdentifier }, query] = await Promise.all([
    params,
    searchParams,
  ])
  const identifier = decodeURIComponent(rawIdentifier)
  const { supabase } = await requireAdmin()
  const dashboard = await getDashboardData(supabase)
  const partner = findPreviewPartner(dashboard.partners, identifier)

  if (!partner) {
    notFound()
  }

  const config = resolveMicrositeConfig(
    partner.microsite?.draftVersion?.config ??
      partner.microsite?.publishedVersion?.config,
    partner,
  )

  return (
    <MicrositePreviewShell
      partner={partner}
      initialConfig={config}
      previewStorageKey={micrositePreviewStorageKey(partner)}
      useBuilderDraft={query.source === "builder"}
      isMobile={query.viewport === "mobile"}
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
