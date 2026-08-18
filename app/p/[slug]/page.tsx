import { permanentRedirect } from "next/navigation"
import { canonicalPartnerSlug } from "@/lib/partner-paths"

export const dynamic = "force-dynamic"

export default async function LegacyPublishedMicrositePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const webBaseUrl = (
    process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL?.trim() || "https://benefitsi.de"
  ).replace(/\/+$/, "")

  permanentRedirect(
    `${webBaseUrl}/partner/${encodeURIComponent(canonicalPartnerSlug(slug))}`,
  )
}
